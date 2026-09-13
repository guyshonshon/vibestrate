import { describe, it, expect, afterEach } from "vitest";
import http from "node:http";
import net from "node:net";
import zlib from "node:zlib";
import {
  fetchGuardedText,
  fetchPinnedTo,
  guardedTransportFor,
  type PinnedFetchFactory,
} from "../src/core/guarded-fetch.js";
import { publishFlow } from "../src/flows/hub/hub-client.js";
import type { FetchImpl } from "../src/flows/runtime/flow-portability.js";

/**
 * The SSRF guard resolves a name and checks the address it got. If the request
 * is then made BY NAME, the connection resolves a second time and a rebind puts
 * it somewhere the check never saw: the check only moved the lookup, it did not
 * constrain it. So the check hands back the transport, pinned to the address
 * that passed, and these tests hold that shape in place.
 */

describe("a pinned transport reaches the address, and the host by name", () => {
  let server: http.Server | null = null;
  afterEach(() => {
    server?.close();
    server = null;
  });

  function startOrigin(
    handle: (req: http.IncomingMessage, res: http.ServerResponse) => void,
  ): Promise<number> {
    server = http.createServer(handle);
    return new Promise((resolve) => {
      server!.listen(0, "127.0.0.1", () => {
        const addr = server!.address();
        resolve(typeof addr === "object" && addr ? addr.port : 0);
      });
    });
  }

  const fresh = () => new AbortController().signal;

  it("connects to the pinned address for a name that does not resolve at all", async () => {
    // `.invalid` never resolves (RFC 6761). Nothing but pinning could reach the
    // server below, which is what makes this a test of pinning and not of DNS.
    const seen: { host?: string; url?: string }[] = [];
    const port = await startOrigin((req, res) => {
      seen.push({ host: req.headers.host, url: req.url });
      res.writeHead(200, { "content-type": "text/plain", "x-from": "origin" });
      res.end("pinned ok");
    });
    const res = await fetchPinnedTo("127.0.0.1")(`http://nothing-here.invalid:${port}/flow.yml`, {
      signal: fresh(),
      redirect: "manual",
    });
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("pinned ok");
    expect(res.headers.get("x-from")).toBe("origin");
    // The origin still sees the name: it routes on Host, and a certificate
    // would be checked against it.
    expect(seen[0]?.host).toBe(`nothing-here.invalid:${port}`);
    expect(seen[0]?.url).toBe("/flow.yml");
  });

  it("hands a redirect back instead of following it", async () => {
    const port = await startOrigin((_req, res) => {
      res.writeHead(302, { location: "http://127.0.0.1:1/next" });
      res.end();
    });
    const res = await fetchPinnedTo("127.0.0.1")(`http://nothing-here.invalid:${port}/a`, {
      signal: fresh(),
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("http://127.0.0.1:1/next");
  });

  it("fails as an abort when its signal is aborted", async () => {
    const port = await startOrigin(() => {
      /* never answers */
    });
    const controller = new AbortController();
    const pending = fetchPinnedTo("127.0.0.1")(`http://nothing-here.invalid:${port}/slow`, {
      signal: controller.signal,
      redirect: "manual",
    });
    controller.abort();
    // The caller reports a timeout by reading err.name, so the name is contract.
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("the check hands back the transport, so a name cannot be re-resolved", () => {
  it("refuses a host that resolves into private space, in the caller's words", async () => {
    const transport = await guardedTransportFor({
      hostname: "rebind.example",
      what: "publish to",
      resolveHost: async () => ["127.0.0.1"],
    });
    expect(transport.ok).toBe(false);
    if (!transport.ok) {
      expect(transport.reason).toContain("publish to");
      expect(transport.reason).toContain("private/loopback");
    }
  });

  it("pins the transport to the address the check approved", async () => {
    const pinned: string[] = [];
    const transport = await guardedTransportFor({
      hostname: "ok.example",
      resolveHost: async () => ["93.184.216.34", "93.184.216.35"],
      pinnedFetchFor: (addresses) => {
        pinned.push(addresses.join(","));
        return (async () => ({
          ok: true,
          status: 200,
          headers: { get: () => null },
          text: async () => "",
        })) as never;
      },
    });
    expect(transport.ok).toBe(true);
    // BOTH approved addresses, not just the first: every one passed the same
    // check, and keeping them is the failover the platform would have had.
    expect(pinned).toEqual(["93.184.216.34,93.184.216.35"]);
  });
});

describe("every hop connects to the address its own check approved", () => {
  /** A scripted origin, keyed by URL, that records what it was asked for. */
  function scripted(script: Record<string, { status: number; location?: string; body?: string }>) {
    const asked: string[] = [];
    const impl: FetchImpl = async (url: string) => {
      asked.push(url);
      const hit = script[url] ?? { status: 404 };
      return {
        ok: hit.status >= 200 && hit.status < 300,
        status: hit.status,
        headers: { get: (n: string) => (n.toLowerCase() === "location" ? (hit.location ?? null) : null) },
        text: async () => hit.body ?? "",
      };
    };
    return { impl, asked };
  }

  it("pins the first hop and the redirect target to their own addresses", async () => {
    const pinned: string[] = [];
    // Which address actually SERVED each hop, not just which were pinned: a
    // first-hop pin carried into the second hop is the same rebind gap, and it
    // would still have called the factory twice.
    const served: string[] = [];
    const { impl, asked } = scripted({
      "https://first.example/flow.yml": { status: 302, location: "https://second.example/real.yml" },
      "https://second.example/real.yml": { status: 200, body: "id: pinned" },
    });
    const res = await fetchGuardedText({
      url: "https://first.example/flow.yml",
      resolveHost: async (host) => (host === "first.example" ? ["93.184.216.34"] : ["93.184.216.35"]),
      pinnedFetchFor: (addresses) => {
        const address = addresses.join(",");
        pinned.push(address);
        return (async (url: string, init: never) => {
          served.push(`${address} ${url}`);
          return impl(url, init);
        }) as never;
      },
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.text).toBe("id: pinned");
    expect(asked).toEqual([
      "https://first.example/flow.yml",
      "https://second.example/real.yml",
    ]);
    expect(pinned).toEqual(["93.184.216.34", "93.184.216.35"]);
    expect(served).toEqual([
      "93.184.216.34 https://first.example/flow.yml",
      "93.184.216.35 https://second.example/real.yml",
    ]);
  });

  it("pins the hub publish POST to the address its check approved", async () => {
    const pinned: string[] = [];
    let sawAuthorization = "";
    const res = await publishFlow({
      ref: "guy@x-flow:1.0.0",
      content: "id: x\nname: X\nsteps: []\n",
      token: "ghp_fake_token_for_the_test",
      resolveHost: async () => ["93.184.216.34"],
      pinnedFetchFor: (addresses) => {
        pinned.push(addresses.join(","));
        return (async (_url: string, init: { headers?: Record<string, string> }) => {
          sawAuthorization = init.headers?.authorization ?? "";
          return {
            ok: true,
            // The hub answers a publish with 201; 200 is an error path there.
            status: 201,
            headers: { get: () => null },
            text: async () => JSON.stringify({ ok: true, ref: "guy@x-flow:1.0.0" }),
          };
        }) as never;
      },
    });
    expect(pinned).toEqual(["93.184.216.34"]);
    expect(sawAuthorization).toContain("Bearer ");
    expect(res.ok, `publish failed: ${res.ok ? "" : res.reason}`).toBe(true);
  });
});

describe("the real transport, driven through the funnel", () => {
  // The tests above stop at the seam and assert which addresses were pinned.
  // These run the REAL transport against a local origin, because everything
  // fetch used to do here (decoding, size limits, headers, the BOM) now lives in
  // that function, and a test that stops at the seam cannot see any of it.
  let server: http.Server | null = null;
  const autoSelectFamily = net.getDefaultAutoSelectFamily?.();
  afterEach(() => {
    server?.close();
    server = null;
    // One test turns this on; tests in this file run in a shuffled order, so put
    // it back rather than leaving it set for whichever runs next.
    if (autoSelectFamily !== undefined) net.setDefaultAutoSelectFamily?.(autoSelectFamily);
  });

  function startOrigin(
    handle: (req: http.IncomingMessage, res: http.ServerResponse) => void,
  ): Promise<number> {
    server = http.createServer((req, res) => {
      res.on("error", () => {});
      handle(req, res);
    });
    return new Promise((resolve) => {
      server!.listen(0, "127.0.0.1", () => {
        const addr = server!.address();
        resolve(typeof addr === "object" && addr ? addr.port : 0);
      });
    });
  }

  /** The funnel still runs its own check; only where the socket lands changes.
   *  `opts` carries the caller's byte limit, so that is exercised for real. */
  const pinToLocal: PinnedFetchFactory = (_addresses, opts) => fetchPinnedTo("127.0.0.1", opts);
  const publicAddress = async () => ["93.184.216.34"];

  it("decodes a body the origin compressed anyway", async () => {
    // Object storage serves `content-encoding: gzip` whatever it was asked for.
    // Undecoded, those bytes reach a YAML parser as binary.
    const port = await startOrigin((_req, res) => {
      res.writeHead(200, { "content-type": "text/yaml", "content-encoding": "gzip" });
      res.end(zlib.gzipSync(Buffer.from("id: compressed\n", "utf8")));
    });
    const got = await fetchGuardedText({
      url: `http://origin.example:${port}/flow.yml`,
      resolveHost: publicAddress,
      pinnedFetchFor: pinToLocal,
    });
    expect(got.ok, got.ok ? "" : got.reason).toBe(true);
    if (got.ok) expect(got.text).toBe("id: compressed\n");
  });

  it("refuses an over-limit body instead of returning a truncated one", async () => {
    const port = await startOrigin((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("a".repeat(200 * 1024));
    });
    const got = await fetchGuardedText({
      url: `http://origin.example:${port}/big`,
      maxBytes: 64 * 1024,
      resolveHost: publicAddress,
      pinnedFetchFor: pinToLocal,
    });
    expect(got.ok, "a truncated body came back as success").toBe(false);
    if (!got.ok) expect(got.reason).toContain("exceeded");
  });

  it("cuts the origin off at the limit instead of reading the whole body", async () => {
    // The refusal alone proves nothing here: the caller's own post-read check
    // would also refuse an oversize body, after holding all of it. What the
    // transport adds is stopping EARLY, and the only place that shows is at the
    // origin, in how much it got to send.
    const total = 8 * 1024 * 1024;
    const chunk = Buffer.alloc(64 * 1024, 0x61);
    let written = 0;
    const port = await startOrigin((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain", "content-length": String(total) });
      const pump = () => {
        while (written < total) {
          const more = res.write(chunk);
          written += chunk.length;
          if (!more) return;
        }
        res.end();
      };
      res.on("drain", pump);
      pump();
    });
    const got = await fetchGuardedText({
      url: `http://origin.example:${port}/big`,
      // Above the declared length, so the caller's content-length check cannot
      // be what refuses this: only the streaming count can.
      maxBytes: 64 * 1024,
      timeoutMs: 10_000,
      resolveHost: publicAddress,
      pinnedFetchFor: pinToLocal,
    });
    expect(got.ok).toBe(false);
    // Half the body, not a tight margin: how much lands before the cut depends
    // on socket buffers and scheduling, while removing the streaming count lets
    // the origin send ALL of it, which this still catches.
    expect(written, "the origin sent its whole body before anything stopped it").toBeLessThan(
      total / 2,
    );
  });

  it("refuses an over-limit body that was small on the wire", async () => {
    // 300 KB of YAML compresses to a few KB, so the declared length sails under
    // the limit and only the decoded stream is over it. Cutting the request
    // without settling here is how a truncated document reads as a whole one:
    // `end` still fires, and what arrived parses.
    const plain = Buffer.from(`id: big\n${"s".repeat(300 * 1024)}`, "utf8");
    const port = await startOrigin((_req, res) => {
      res.writeHead(200, { "content-type": "text/yaml", "content-encoding": "gzip" });
      res.end(zlib.gzipSync(plain));
    });
    const got = await fetchGuardedText({
      url: `http://origin.example:${port}/big.yml`,
      maxBytes: 64 * 1024,
      resolveHost: publicAddress,
      pinnedFetchFor: pinToLocal,
    });
    expect(got.ok, "a truncated body came back as success").toBe(false);
    if (!got.ok) expect(got.reason).toContain("exceeded");
  });

  it("refuses a body that expands past the limit inside the decoder", async () => {
    // Tiny on the wire, enormous decoded. A per-chunk count never sees it: one
    // compressed chunk expands in full inside the transform.
    const bomb = zlib.gzipSync(Buffer.alloc(8 * 1024 * 1024, 0x61));
    const port = await startOrigin((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain", "content-encoding": "gzip" });
      res.end(bomb);
    });
    const got = await fetchGuardedText({
      url: `http://origin.example:${port}/bomb`,
      maxBytes: 64 * 1024,
      resolveHost: publicAddress,
      pinnedFetchFor: pinToLocal,
    });
    expect(got.ok, "a decompression bomb came back as success").toBe(false);
    if (!got.ok) expect(got.reason).toContain("exceeded");
  });

  it("refuses more than one content-encoding rather than chaining decoders", async () => {
    // Node joins repeated headers with ", ". A decoder per entry is a chain of
    // streams whose errors the far end chooses the timing of, and there is no
    // amount of bytes here worth that: one coding is decoded, a list is refused.
    const twice = zlib.gzipSync(zlib.gzipSync(Buffer.from("id: twice\n", "utf8")));
    const port = await startOrigin((_req, res) => {
      res.writeHead(200, { "content-type": "text/yaml", "content-encoding": "gzip, gzip" });
      res.end(twice);
    });
    const got = await fetchGuardedText({
      url: `http://origin.example:${port}/twice.yml`,
      resolveHost: publicAddress,
      pinnedFetchFor: pinToLocal,
    });
    expect(got.ok).toBe(false);
    if (!got.ok) expect(got.reason).toContain("more than one content-encoding");
  });

  it("survives a body that does not match the encoding it declared", async () => {
    // The decoder errors on the first chunk. With no listener attached to it,
    // that error is uncaught and ONE header from a remote server ends the
    // process that fetched it, where the caller's try/catch never sees a thing.
    const port = await startOrigin((req, res) => {
      if (req.url === "/lying") {
        res.writeHead(200, { "content-type": "text/yaml", "content-encoding": "gzip" });
        res.end("not gzip at all");
        return;
      }
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("still here");
    });
    const got = await fetchGuardedText({
      url: `http://origin.example:${port}/lying`,
      resolveHost: publicAddress,
      pinnedFetchFor: pinToLocal,
    });
    expect(got.ok).toBe(false);
    // Still serving: a process that died could not answer this one.
    const after = await fetchGuardedText({
      url: `http://origin.example:${port}/alive`,
      resolveHost: publicAddress,
      pinnedFetchFor: pinToLocal,
    });
    expect(after.ok, after.ok ? "" : after.reason).toBe(true);
    if (after.ok) expect(after.text).toBe("still here");
  });

  it("refuses a coding it cannot decode rather than passing the bytes on", async () => {
    const port = await startOrigin((_req, res) => {
      res.writeHead(200, { "content-type": "text/yaml", "content-encoding": "zstd" });
      res.end(Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0x00]));
    });
    const got = await fetchGuardedText({
      url: `http://origin.example:${port}/x.yml`,
      resolveHost: publicAddress,
      pinnedFetchFor: pinToLocal,
    });
    expect(got.ok).toBe(false);
    if (!got.ok) expect(got.reason).toContain("cannot decode");
  });

  it("still decodes a gzip body whose trailer the origin cut off", async () => {
    // Common enough that fetch tolerates it; something that imported yesterday
    // should not start failing today.
    const full = zlib.gzipSync(Buffer.from("id: truncated-trailer\n", "utf8"));
    const port = await startOrigin((_req, res) => {
      res.writeHead(200, { "content-type": "text/yaml", "content-encoding": "gzip" });
      res.end(full.subarray(0, full.length - 4));
    });
    const got = await fetchGuardedText({
      url: `http://origin.example:${port}/cut.yml`,
      resolveHost: publicAddress,
      pinnedFetchFor: pinToLocal,
    });
    expect(got.ok, got.ok ? "" : got.reason).toBe(true);
    if (got.ok) expect(got.text).toBe("id: truncated-trailer\n");
  });

  it("reaches an origin through a name the resolver would never answer for", async () => {
    // The pin's whole claim, stated where it is observable: `.invalid` never
    // resolves (RFC 6761), so a second lookup could not reach this origin. The
    // request arriving at all IS the proof that no second lookup happened.
    const port = await startOrigin((req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end(`host: ${req.headers.host ?? ""}`);
    });
    const got = await fetchGuardedText({
      url: `http://never-resolved.invalid:${port}/x`,
      resolveHost: publicAddress,
      pinnedFetchFor: pinToLocal,
    });
    expect(got.ok, got.ok ? "" : got.reason).toBe(true);
    if (got.ok) expect(got.text).toBe(`host: never-resolved.invalid:${port}`);
  });

  it("identifies itself and asks for something, the way fetch did", async () => {
    let seen: http.IncomingHttpHeaders = {};
    const port = await startOrigin((req, res) => {
      seen = req.headers;
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
    });
    await fetchGuardedText({
      url: `http://origin.example:${port}/x`,
      resolveHost: publicAddress,
      pinnedFetchFor: pinToLocal,
    });
    // An empty User-Agent is a bot signal to every CDN worth fetching through.
    expect(String(seen["user-agent"] ?? "")).toMatch(/^vibestrate\//);
    expect(seen.accept).toBe("*/*");
    // Only codings this can decode: asking for `deflate` invites the raw,
    // headerless spelling of it, which is refused on arrival.
    expect(seen["accept-encoding"]).toBe("gzip, br");
    expect(String(seen.host)).toBe(`origin.example:${port}`);
  });

  it("drops a byte order mark, which JSON.parse does not forgive", async () => {
    const port = await startOrigin((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      // Built, not pasted: an invisible byte in the source is one a formatter
      // can drop, and this test would still pass with nothing left to strip.
      res.end(String.fromCharCode(0xfeff) + JSON.stringify({ ok: true }));
    });
    const got = await fetchGuardedText({
      url: `http://origin.example:${port}/x.json`,
      resolveHost: publicAddress,
      pinnedFetchFor: pinToLocal,
    });
    expect(got.ok, got.ok ? "" : got.reason).toBe(true);
    if (got.ok) expect(() => JSON.parse(got.text) as unknown).not.toThrow();
  });

  it("follows a redirect over the real transport, re-pinned per hop", async () => {
    const port = await startOrigin((req, res) => {
      if (req.url === "/first") {
        res.writeHead(302, { location: `http://second.example:${port}/second` });
        res.end();
        return;
      }
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("id: second-hop");
    });
    const pinned: string[] = [];
    const got = await fetchGuardedText({
      url: `http://first.example:${port}/first`,
      resolveHost: async (host) =>
        host === "first.example" ? ["93.184.216.34"] : ["93.184.216.35"],
      pinnedFetchFor: (addresses, opts) => {
        pinned.push(addresses.join(","));
        return fetchPinnedTo("127.0.0.1", opts);
      },
    });
    expect(got.ok, got.ok ? "" : got.reason).toBe(true);
    if (got.ok) expect(got.text).toBe("id: second-hop");
    expect(pinned).toEqual(["93.184.216.34", "93.184.216.35"]);
  });

  it("opens its own connection per request, so pooling cannot skip the pin", async () => {
    // A keep-alive socket is keyed by host and port ALONE, so a reused one never
    // consults `lookup` and the next request's pin would not apply at all. Two
    // requests, two connections: that is the shape of not sharing.
    let connections = 0;
    const port = await startOrigin((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
    });
    server!.on("connection", () => (connections += 1));
    const init = { signal: new AbortController().signal, redirect: "manual" as const };
    const url = `http://origin.example:${port}/x`;
    await (await fetchPinnedTo("127.0.0.1")(url, init)).text();
    await (await fetchPinnedTo("127.0.0.1")(url, init)).text();
    expect(connections).toBe(2);
  });

  it("uses a second approved address when the first refuses the connection", async () => {
    // Every address in the set passed the same check, so keeping them all costs
    // nothing and preserves the failover the platform would have had. That
    // failover IS Happy Eyeballs: with autoSelectFamily off, node asks for one
    // address and there is nothing to fall back to, so pin the setting rather
    // than inheriting whatever the runner was started with.
    net.setDefaultAutoSelectFamily?.(true);
    const port = await startOrigin((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("failed over");
    });
    const res = await fetchPinnedTo(["127.0.0.2", "127.0.0.1"])(
      `http://origin.example:${port}/x`,
      { signal: new AbortController().signal, redirect: "manual" },
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("failed over");
  });
});

