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
import {
  buildDockerRunArgs,
  buildEgressProxyRunArgs,
  egressProxyModulePath,
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
