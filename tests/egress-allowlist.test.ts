import { describe, it, expect, afterEach } from "vitest";
import http from "node:http";
import net from "node:net";
import {
  DEFAULT_EGRESS_ALLOW,
  EGRESS_PROXY_PORT,
  forwardableHeaders,
  hostMatches,
  isAllowed,
  isForbiddenAddress,
  isPlausibleHostname,
  parseAuthority,
  startEgressProxy,
} from "../src/core/execution/egress-proxy.js";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import {
  buildDockerRunArgs,
  buildEgressProxyRunArgs,
  egressProxyModulePath,
  makeDockerBackend,
} from "../src/core/execution/docker-backend.js";
import { egressConfigSchema } from "../src/core/execution/execution-backend-schema.js";

// The egress allowlist's security property is the NETWORK TOPOLOGY (an
// `--internal` network with no gateway, whose only peer is the proxy), not the
// HTTP(S)_PROXY env vars. These tests pin both halves: the matcher can't be
// tricked, and the container argv actually builds that topology.

describe("host matching cannot be widened by accident", () => {
  it("matches an exact host and nothing adjacent", () => {
    expect(hostMatches("api.anthropic.com", "api.anthropic.com")).toBe(true);
    expect(hostMatches("api.anthropic.com", "anthropic.com")).toBe(false);
    expect(hostMatches("evil-anthropic.com", "anthropic.com")).toBe(false);
  });

  it("only a dot-prefixed entry covers subdomains", () => {
    expect(hostMatches("api.anthropic.com", ".anthropic.com")).toBe(true);
    expect(hostMatches("anthropic.com", ".anthropic.com")).toBe(true);
    // The classic suffix-matching hole: a lookalike domain ending in the same
    // characters must NOT pass.
    expect(hostMatches("notanthropic.com", ".anthropic.com")).toBe(false);
    expect(hostMatches("evil.com", ".anthropic.com")).toBe(false);
  });

  it("is case-insensitive and ignores surrounding whitespace", () => {
    expect(hostMatches("API.Anthropic.COM", " api.anthropic.com ")).toBe(true);
  });

  it("never matches on an empty entry or empty host", () => {
    expect(hostMatches("", "api.anthropic.com")).toBe(false);
    expect(hostMatches("api.anthropic.com", "")).toBe(false);
    expect(isAllowed("api.anthropic.com", [])).toBe(false);
  });

  it("ships the model API hosts a run needs to work at all", () => {
    expect(isAllowed("api.anthropic.com", DEFAULT_EGRESS_ALLOW)).toBe(true);
    expect(isAllowed("api.openai.com", DEFAULT_EGRESS_ALLOW)).toBe(true);
    expect(isAllowed("attacker.example.com", DEFAULT_EGRESS_ALLOW)).toBe(false);
  });
});

describe("the allowlist decision cannot be re-routed at the far end", () => {
  // The allowlist decides on the absolute-URI authority; the ORIGIN routes on
  // Host. Relaying a client-supplied Host turns any allowlisted host that sits
  // behind shared CDN infrastructure into an exfiltration path, while the audit
  // log records an allowed request.
  it("overwrites a client-supplied Host with the authority that was approved", () => {
    const out = forwardableHeaders(
      { host: "attacker.example", "user-agent": "x" },
      "api.anthropic.com",
    );
    expect(out.host).toBe("api.anthropic.com");
    expect(out["user-agent"]).toBe("x");
  });

  it("never relays the proxy's own credentials or hop-by-hop headers", () => {
    const out = forwardableHeaders(
      {
        "proxy-authorization": "Bearer secret",
        "proxy-connection": "keep-alive",
        connection: "close",
        te: "trailers",
        upgrade: "websocket",
        "transfer-encoding": "chunked",
        accept: "*/*",
      },
      "api.anthropic.com",
    );
    expect(out["proxy-authorization"]).toBeUndefined();
    expect(out["proxy-connection"]).toBeUndefined();
    expect(out.connection).toBeUndefined();
    expect(out.te).toBeUndefined();
    expect(out.upgrade).toBeUndefined();
    expect(out["transfer-encoding"]).toBeUndefined();
    expect(out.accept).toBe("*/*");
  });
});

describe("an allowlisted name cannot point somewhere private", () => {
  it("refuses loopback, link-local, cloud metadata, and RFC1918", () => {
    for (const ip of [
      "127.0.0.1",
      "169.254.169.254", // cloud metadata
      "10.1.2.3",
      "172.17.0.1", // the docker bridge gateway = the host
      "192.168.1.1",
      "100.64.0.1", // CGNAT
      "0.0.0.0",
      "224.0.0.1",
      "::1",
      "fd00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
    ]) {
      expect(isForbiddenAddress(ip), ip).toBe(true);
    }
  });

  it("allows ordinary public addresses", () => {
    for (const ip of ["160.79.104.10", "8.8.8.8", "172.32.0.1", "2606:4700::1"]) {
      expect(isForbiddenAddress(ip), ip).toBe(false);
    }
  });

  it("rejects a hostname that smuggles userinfo or non-DNS characters", () => {
    expect(isPlausibleHostname("api.anthropic.com")).toBe(true);
    // Would match `.anthropic.com` by suffix; must never reach the resolver.
    expect(isPlausibleHostname("evil.com@api.anthropic.com")).toBe(false);
    expect(isPlausibleHostname("api.anthropic.com/../x")).toBe(false);
    expect(isPlausibleHostname("аpi.anthropic.com")).toBe(false); // cyrillic а
    expect(isPlausibleHostname("")).toBe(false);
  });
});

describe("CONNECT authority parsing", () => {
  it("splits host and port, defaulting the port", () => {
    expect(parseAuthority("api.anthropic.com:443", 443)).toEqual({
      host: "api.anthropic.com",
      port: 443,
    });
    expect(parseAuthority("api.anthropic.com", 443)).toEqual({
      host: "api.anthropic.com",
      port: 443,
    });
  });

  it("handles IPv6 literals without splitting on their colons", () => {
    expect(parseAuthority("[::1]:8080", 443)).toEqual({ host: "::1", port: 8080 });
    expect(parseAuthority("[2001:db8::1]", 443)).toEqual({
      host: "2001:db8::1",
      port: 443,
    });
  });

  it("rejects garbage rather than guessing", () => {
    expect(parseAuthority("", 443)).toBeNull();
    expect(parseAuthority("host:notaport", 443)).toBeNull();
    expect(parseAuthority(":443", 443)).toBeNull();
  });
});

describe("the proxy refuses what is not allowlisted", () => {
  let server: http.Server | null = null;
  afterEach(() => {
    server?.close();
    server = null;
  });

  function listen(allow: string[]): Promise<number> {
    server = startEgressProxy({ allow, port: 0, log: () => {} });
    return new Promise((resolve) => {
      server!.on("listening", () => {
        const addr = server!.address();
        resolve(typeof addr === "object" && addr ? addr.port : 0);
      });
    });
  }

  it("403s a CONNECT to a host outside the allowlist", async () => {
    const port = await listen(["api.anthropic.com"]);
    const status = await new Promise<string>((resolve, reject) => {
      const req = http.request({
        port,
        method: "CONNECT",
        path: "attacker.example.com:443",
      });
      req.on("connect", (res) => resolve(`connected:${res.statusCode}`));
      // A refusal is written straight to the socket, so it arrives as data.
      req.on("response", (res) => resolve(`response:${res.statusCode}`));
      req.on("socket", (s) => {
        s.on("data", (b: Buffer) => resolve(b.toString().split("\r\n")[0] ?? ""));
      });
      req.on("error", reject);
      req.end();
    });
    expect(status).toMatch(/403/);
  });

  it("403s a CONNECT to an allowed host on a non-web port (generic TCP tunnel)", async () => {
    const port = await listen([".anthropic.com"]);
    const first = await new Promise<string>((resolve, reject) => {
      const req = http.request({
        port,
        method: "CONNECT",
        path: "api.anthropic.com:22",
      });
      req.on("connect", (res) => resolve(`connected:${res.statusCode}`));
      req.on("socket", (s) => {
        s.on("data", (b: Buffer) => resolve(b.toString().split("\r\n")[0] ?? ""));
      });
      req.on("error", reject);
      req.end();
    });
    expect(first).toMatch(/403/);
  });

  it("survives a client that resets the connection on being refused", async () => {
    // Regression: the refusal path had no socket 'error' listener, so a client
    // that reset after reading the 403 raised an unhandled event and killed the
    // proxy process. Refusals are the COMMON case, so the first blocked host
    // took egress down for the rest of the run.
    const port = await listen(["api.anthropic.com"]);
    for (let i = 0; i < 3; i += 1) {
      await new Promise<void>((resolve) => {
        // A RAW socket, not http.request: the http client parses the 403 as a
        // response and closes cleanly, which never reproduces this. We need to
        // read the refusal off the wire and then RST, the way curl does.
        const s = net.connect(port, "127.0.0.1", () => {
          s.write("CONNECT attacker.example.com:443 HTTP/1.1\r\nHost: attacker.example.com:443\r\n\r\n");
        });
        s.on("data", () => {
          // resetAndDestroy sends a TCP RST; a plain destroy() only FINs and
          // leaves the server with nothing to raise. That difference IS the bug.
          s.resetAndDestroy();
          setTimeout(resolve, 25);
        });
        s.on("error", () => resolve());
      });
    }
    await new Promise((r) => setTimeout(r, 50));
    // Without the socket 'error' listener in the refusal path, the ECONNRESET
    // above is an unhandled event: vitest reports it and this file fails.
    // Still serving: a proxy that died would never answer this.
    const code = await new Promise<number>((resolve, reject) => {
      const req = http.request(
        { port, method: "GET", path: "http://blocked.example.com/" },
        (res) => resolve(res.statusCode ?? 0),
      );
      req.on("error", reject);
      req.end();
    });
    expect(code).toBe(403);
    expect(server!.listening).toBe(true);
  });

  it("403s a plain-HTTP proxy request to a host outside the allowlist", async () => {
    const port = await listen(["api.anthropic.com"]);
    const code = await new Promise<number>((resolve, reject) => {
      const req = http.request(
        { port, method: "GET", path: "http://attacker.example.com/steal" },
        (res) => resolve(res.statusCode ?? 0),
      );
      req.on("error", reject);
      req.end();
    });
    expect(code).toBe(403);
  });
});

describe("a CONNECT never holds a socket that nothing will reap", () => {
  // The resolver is injected: a test that reaches real DNS fails offline and
  // hangs when the network is slow.
  let server: http.Server | null = null;
  afterEach(() => {
    server?.close();
    server = null;
  });

  function listen(opts: Omit<Parameters<typeof startEgressProxy>[0], "port">): Promise<number> {
    server = startEgressProxy({ ...opts, port: 0 });
    return new Promise((resolve) => {
      server!.on("listening", () => {
        const addr = server!.address();
        resolve(typeof addr === "object" && addr ? addr.port : 0);
      });
    });
  }

  /** Send one CONNECT over a raw socket and resolve with everything the proxy
   *  wrote before ending its side, or `null` if it had not ended it within
   *  `withinMs`. Raw, because an http client parses a refusal as a response and
   *  drops the body, which is the part that has to be true. */
  function connectRaw(
    port: number,
    target: string,
    opts: { withinMs: number; allowHalfOpen?: boolean },
  ): Promise<{ text: string | null; socket: net.Socket }> {
    return new Promise((resolve) => {
      let text = "";
      const socket = net.connect(
        { port, host: "127.0.0.1", allowHalfOpen: opts.allowHalfOpen ?? false },
        () => socket.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`),
      );
      const timer = setTimeout(() => resolve({ text: null, socket }), opts.withinMs);
      socket.on("data", (b: Buffer) => (text += b.toString()));
      socket.on("end", () => {
        clearTimeout(timer);
        resolve({ text, socket });
      });
      socket.on("error", () => {
        clearTimeout(timer);
        resolve({ text: null, socket });
      });
    });
  }

  /** Poll the proxy's open connections until there are `want` of them or
   *  `withinMs` passes, and return the last count seen. */
  async function connectionsSettleTo(want: number, withinMs: number): Promise<number> {
    const until = Date.now() + withinMs;
    for (;;) {
      const n = await new Promise<number>((r) => server!.getConnections((_e, c) => r(c)));
      if (n === want || Date.now() >= until) return n;
      await new Promise((r) => setTimeout(r, 20));
    }
  }

  /** A resolver the test answers by hand, plus a promise that settles once the
   *  proxy has asked it: a barrier, so nothing below races a timer. */
  function heldResolver() {
    let markAsked!: () => void;
    const asked = new Promise<void>((r) => (markAsked = r));
    let settle!: (addrs: string[]) => void;
    const resolveHost = () => {
      markAsked();
      return new Promise<string[]>((r) => (settle = r));
    };
    return { resolveHost, asked, answer: (addrs: string[]) => settle(addrs) };
  }

  /** An error shaped like the ones dns.lookup rejects with. */
  const dnsError = (code: string) => Object.assign(new Error(`getaddrinfo ${code}`), { code });

  /** What a confined run is told when an allowlisted host is refused after
   *  resolving it: ONE body for every reason. Telling "does not exist" apart
   *  from "points into private space" would let the run enumerate internal
   *  names under an allowlisted suffix. The reason goes to the log only. */
  const REFUSED_LISTED =
    "HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain\r\n\r\n" +
    "egress proxy: api.anthropic.com:443 is in this run's egress allowlist, but was refused: " +
    "the egress proxy's log says why.\n";

  type Row = {
    name: string;
    resolveHost: (hostname: string) => Promise<string[]>;
    why: string;
  };
  it.each<Row>([
    {
      name: "never answers",
      // What a stuck resolver looks like. `dns.lookup` takes no signal, so this
      // client used to wait on a socket nothing would ever reap.
      resolveHost: () => new Promise<string[]>(() => {}),
      why: "resolution timed out",
    },
    {
      name: "says the name does not exist",
      resolveHost: () => Promise.reject(dnsError("ENOTFOUND")),
      why: "unresolvable",
    },
    {
      name: "fails for another reason",
      // SERVFAIL from Docker's embedded DNS arrives as EAI_AGAIN: a resolver in
      // trouble, not a name that does not exist, and the log must not say it is.
      resolveHost: () => Promise.reject(dnsError("EAI_AGAIN")),
      why: "resolution failed (EAI_AGAIN)",
    },
    {
      name: "answers with no address",
      resolveHost: async () => [],
      why: "unresolvable",
    },
    {
      name: "answers with a name instead of an address",
      // net.connect would resolve a name AGAIN, after the private-address check:
      // the very gap that resolving before dialling exists to close.
      resolveHost: async () => ["metadata.internal.invalid"],
      why: "unresolvable",
    },
    {
      name: "answers with the cloud metadata address",
      resolveHost: async () => ["169.254.169.254"],
      why: "resolves to 169.254.169.254",
    },
  ])("refuses an allowlisted host whose resolver $name, and logs why", async ({ resolveHost, why }) => {
    const logs: string[] = [];
    const port = await listen({
      allow: ["api.anthropic.com"],
      log: (line) => logs.push(line),
      resolveHost,
      resolveTimeoutMs: 50,
    });
    const { text, socket } = await connectRaw(port, "api.anthropic.com:443", { withinMs: 5_000 });
    socket.destroy();
    expect(text, "the proxy never finished answering the CONNECT").not.toBeNull();
    // Identical for every row: never "add it to the allowlist" for a host that
    // is listed, never an internal address, never the reason.
    expect(text).toBe(REFUSED_LISTED);
    expect(logs).toEqual([`egress DENY connect api.anthropic.com:443 (${why})`]);
  });

  it.each([
    {
      target: "attacker.example.com:443",
      body: "egress proxy: attacker.example.com:443 is not in this run's egress allowlist.\n",
    },
    {
      // Listed, but a CONNECT to an arbitrary port is a generic TCP tunnel. That
      // is the rule that refuses it, and adding the host again would not help.
      target: "api.anthropic.com:22",
      body: "egress proxy: api.anthropic.com:22 is not tunnelled: only ports 80 and 443 are.\n",
    },
  ])("refuses $target before resolving it, naming the rule that refused it", async ({ target, body }) => {
    const logs: string[] = [];
    let asked = 0;
    const port = await listen({
      allow: ["api.anthropic.com"],
      log: (line) => logs.push(line),
      resolveHost: async () => {
        asked += 1;
        return ["160.79.104.10"];
      },
    });
    const { text, socket } = await connectRaw(port, target, { withinMs: 5_000 });
    socket.destroy();
    expect(text).toBe(`HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain\r\n\r\n${body}`);
    expect(logs).toEqual([`egress DENY connect ${target} (not allowed)`]);
    expect(asked).toBe(0);
  });

  it("dials nothing for a client that left while its name was resolving", async () => {
    const logs: string[] = [];
    const held = heldResolver();
    const port = await listen({
      allow: ["api.anthropic.com"],
      log: (line) => logs.push(line),
      resolveHost: held.resolveHost,
    });
    const socket = net.connect({ port, host: "127.0.0.1" }, () =>
      socket.write("CONNECT api.anthropic.com:443 HTTP/1.1\r\nHost: api.anthropic.com:443\r\n\r\n"),
    );
    socket.on("error", () => {});
    await held.asked;
    socket.resetAndDestroy();
    expect(await connectionsSettleTo(0, 5_000)).toBe(0);
    // A documentation address (TEST-NET-1): public to the address check and
    // routed nowhere, so even a wrongly dialled tunnel reaches nothing.
    held.answer(["192.0.2.1"]);
    await new Promise((r) => setImmediate(r));
    expect(logs.filter((line) => line.startsWith("egress ALLOW"))).toEqual([]);
  });

  it("dials nothing when a good answer arrives after the deadline", async () => {
    const logs: string[] = [];
    const held = heldResolver();
    const port = await listen({
      allow: ["api.anthropic.com"],
      log: (line) => logs.push(line),
      resolveHost: held.resolveHost,
      resolveTimeoutMs: 50,
    });
    // The client stays connected, so only the deadline, not a closed socket,
    // stands between the late answer and a dial.
    const { text, socket } = await connectRaw(port, "api.anthropic.com:443", {
      withinMs: 5_000,
      allowHalfOpen: true,
    });
    expect(text).toBe(REFUSED_LISTED);
    held.answer(["192.0.2.1"]);
    await new Promise((r) => setImmediate(r));
    socket.destroy();
    expect(logs).toEqual(["egress DENY connect api.anthropic.com:443 (resolution timed out)"]);
  });

  it("reaps an idle client while its name is still resolving", async () => {
    // The idle timeout is armed when the CONNECT arrives, so it covers the wait
    // for a name too, not only a tunnel that was already dialled.
    const held = heldResolver();
    const port = await listen({
      allow: ["api.anthropic.com"],
      log: () => {},
      resolveHost: held.resolveHost,
      resolveTimeoutMs: 60_000,
      idleTimeoutMs: 100,
    });
    const socket = net.connect({ port, host: "127.0.0.1" }, () =>
      socket.write("CONNECT api.anthropic.com:443 HTTP/1.1\r\nHost: api.anthropic.com:443\r\n\r\n"),
    );
    socket.on("error", () => {});
    await held.asked;
    try {
      expect(await connectionsSettleTo(0, 5_000)).toBe(0);
    } finally {
      socket.destroy();
      held.answer([]);
    }
  });

  it("reaps a refused connection even while its client keeps sending bytes", async () => {
    // Every byte resets an idle timeout, so a refused client that never closed
    // and kept trickling held its socket as long as it liked. A refused
    // connection gets a fixed deadline that activity does not move.
    const port = await listen({ allow: ["api.anthropic.com"], log: () => {}, idleTimeoutMs: 150 });
    const { text, socket } = await connectRaw(port, "attacker.example.com:443", {
      withinMs: 5_000,
      allowHalfOpen: true,
    });
    expect(text).toMatch(/^HTTP\/1\.1 403 /);
    const drip = setInterval(() => socket.write("x"), 30);
    try {
      expect(await connectionsSettleTo(0, 5_000)).toBe(0);
    } finally {
      clearInterval(drip);
      socket.destroy();
    }
  });

  it("reaps a refused connection whose client never closes its side", async () => {
    // A refusal is end(): the 403, then a FIN. An http.Server socket is
    // allowHalfOpen, so it stays open until the client closes too, and one that
    // never did held it forever: the idle timeout was armed only once a tunnel
    // was being dialled, after every refusal had already happened.
    const port = await listen({ allow: ["api.anthropic.com"], log: () => {}, idleTimeoutMs: 100 });
    const { text, socket } = await connectRaw(port, "attacker.example.com:443", {
      withinMs: 5_000,
      allowHalfOpen: true,
    });
    expect(text).toMatch(/^HTTP\/1\.1 403 /);
    expect(await connectionsSettleTo(0, 5_000)).toBe(0);
    socket.destroy();
  });
});

describe("the proxy module runs as one file with nothing beside it", () => {
  it("imports only node builtins", async () => {
    // dist/egress-proxy.js is bind-mounted ALONE into a container that has a
    // node runtime and nothing else. tsup inlines a local import only while
    // `splitting` stays off, and never inlines an npm package, so any specifier
    // that is not a builtin is one config change or one transitive dependency
    // away from a proxy that cannot start, and with it no confined run can
    // reach anything. It is why flow-portability imports the resolver deadline
    // from the proxy, never the other way round.
    const src = await fs.readFile(
      new URL("../src/core/execution/egress-proxy.ts", import.meta.url),
      "utf8",
    );
    const specifiers = [
      ...src.matchAll(/\bfrom\s*["']([^"']+)["']|\bimport\s*\(?\s*["']([^"']+)["']/g),
    ].map((m) => m[1] ?? m[2]);
    expect(specifiers.length).toBeGreaterThan(0);
    expect(specifiers.filter((s) => !s?.startsWith("node:"))).toEqual([]);
  });
});

describe("the container argv builds the isolating topology", () => {
  const base = {
    containerName: "vibestrate-r1",
    image: "node:22-bookworm-slim",
    worktreePath: "/tmp/wt",
    roFileMounts: [],
    readonlyRoot: true,
    pidsLimit: 512,
  };

  it("open egress (the default) adds no network flag and no proxy env", () => {
    const args = buildDockerRunArgs(base);
    expect(args).not.toContain("--network");
    expect(args.join(" ")).not.toContain("HTTPS_PROXY");
  });

  it("allowlist egress puts the RUN container on the internal network, never bridge", () => {
    const args = buildDockerRunArgs({
      ...base,
      egress: { networkName: "vibestrate-egress-r1", proxyUrl: "http://p:8888" },
    });
    const netIdx = args.indexOf("--network");
    expect(netIdx).toBeGreaterThan(-1);
    expect(args[netIdx + 1]).toBe("vibestrate-egress-r1");
    // `--network none` would also cut off the proxy, leaving the run with no
    // egress at all; bridge would defeat the whole point.
    expect(args[netIdx + 1]).not.toBe("none");
    expect(args).not.toContain("bridge");
  });

  it("advertises the proxy to compliant clients, in both env spellings", () => {
    const args = buildDockerRunArgs({
      ...base,
      egress: { networkName: "n", proxyUrl: "http://p:8888" },
    });
    const joined = args.join(" ");
    for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"]) {
      expect(joined).toContain(`${key}=http://p:8888`);
    }
    expect(joined).toContain("NO_PROXY=localhost,127.0.0.1,::1");
  });

  it("the proxy container joins the same internal network and is hardened", () => {
    const args = buildEgressProxyRunArgs({
      containerName: "vibestrate-proxy-r1",
      image: "node:22-bookworm-slim",
      networkName: "vibestrate-egress-r1",
      proxyModulePath: "/host/egress-proxy.js",
      allow: ["api.anthropic.com", ".example.com"],
      pidsLimit: 512,
    });
    const netIdx = args.indexOf("--network");
    expect(args[netIdx + 1]).toBe("vibestrate-egress-r1");
    expect(args).toContain("--cap-drop=ALL");
    expect(args).toContain("--security-opt=no-new-privileges");
    expect(args).toContain("--read-only");
    // The allowlist crosses as one env var; the module is mounted read-only.
    expect(args.join(" ")).toContain(
      "VIBESTRATE_EGRESS_ALLOW=api.anthropic.com,.example.com",
    );
    expect(args.join(" ")).toContain("/host/egress-proxy.js:");
    expect(args.join(" ")).toContain(":ro");
  });
});

describe("the proxy module is resolvable as a real file to bind-mount", () => {
  it("probes both install layouts rather than assuming one", async () => {
    // The CLI ships as a single bundled dist/index.js, so a naive
    // `./egress-proxy.js` next to the SOURCE module resolves to a file that
    // does not exist in a published install. Both layouts must be tried.
    const { tried } = await egressProxyModulePath();
    expect(tried.length).toBeGreaterThanOrEqual(2);
    expect(tried.every((p) => p.endsWith("egress-proxy.js"))).toBe(true);
    expect(tried.some((p) => p.includes(`${path.sep}dist${path.sep}`))).toBe(true);
  });
});

describe("the isolated network keeps the host out of reach", () => {
  /** Drive prepareRun with a fake docker so the argv is asserted anywhere,
   *  including CI with no daemon. */
  async function captureDockerArgs() {
    const calls: string[][] = [];
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-net-"));
    await execa("git", ["init", "-q", "-b", "main"], { cwd: projectRoot });
    await execa("git", ["config", "user.email", "e@x.com"], { cwd: projectRoot });
    await execa("git", ["config", "user.name", "e"], { cwd: projectRoot });
    await fs.writeFile(path.join(projectRoot, "README.md"), "# t\n");
    await execa("git", ["add", "-A"], { cwd: projectRoot });
    await execa("git", ["commit", "-qm", "init"], { cwd: projectRoot });

    const backend = makeDockerBackend({
      image: "node:22-slim",
      onUnavailable: "fail",
      readonlyRoot: false,
      pidsLimit: 512,
      egress: { mode: "allowlist", allow: [] },
      available: async () => true,
      exec: async (_file, args) => {
        calls.push(args);
        return { exitCode: 0, stdout: "fake-id", stderr: "" };
      },
    });
    await backend.prepareRun({
      projectRoot,
      runId: "t1",
      branchPrefix: "vibestrate",
      worktreeDir: path.join(projectRoot, ".vibestrate", "worktrees"),
      mainBranch: "main",
    });
    await fs.rm(projectRoot, { recursive: true, force: true }).catch(() => {});
    return calls;
  }

  it("creates the network with the host address inhibited", async () => {
    // `--internal` filters FORWARDed traffic, but the host keeps an address on
    // the bridge and packets to it traverse INPUT instead - so a database or dev
    // server bound to 0.0.0.0 stayed reachable from inside the "confined"
    // container. inhibit_ipv4 removes that address entirely.
    const calls = await captureDockerArgs();
    const create = calls.find((a) => a[0] === "network" && a[1] === "create");
    expect(create, "the run network must be created").toBeDefined();
    expect(create).toContain("--internal");
    expect(create).toContain("com.docker.network.bridge.inhibit_ipv4=true");
  });

  it("puts the proxy on the internal network and bridges only the proxy", async () => {
    const calls = await captureDockerArgs();
    const connect = calls.find((a) => a[0] === "network" && a[1] === "connect");
    expect(connect, "only the proxy gets an outbound network").toBeDefined();
    expect(connect).toContain("bridge");
    const runContainer = calls.find(
      (a) => a[0] === "run" && a.includes("--name") && a.includes("vibestrate-t1"),
    );
    expect(runContainer).toBeDefined();
    expect(runContainer, "the run container must never join bridge").not.toContain("bridge");
  });
});

describe("egress config defaults keep today's behavior", () => {
  it("defaults to open, so enabling the container backend changes nothing", () => {
    const parsed = egressConfigSchema.parse({});
    expect(parsed.mode).toBe("open");
    expect(parsed.allow).toEqual([]);
  });

  it("accepts an allowlist mode with extra hosts", () => {
    const parsed = egressConfigSchema.parse({
      mode: "allowlist",
      allow: ["registry.npmjs.org"],
    });
    expect(parsed.mode).toBe("allowlist");
    expect(parsed.allow).toEqual(["registry.npmjs.org"]);
  });

  it("exposes a stable proxy port for the container URL", () => {
    expect(EGRESS_PROXY_PORT).toBe(8888);
  });
});
