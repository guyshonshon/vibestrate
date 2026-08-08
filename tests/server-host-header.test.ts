import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { startServer, type StartedServer } from "../src/server/server.js";

/**
 * DNS rebinding is the one browser attack the Origin allow-list cannot see. A
 * page on `attacker.example` whose DNS is rebound to 127.0.0.1 reaches this
 * server on the real loopback socket, and the browser treats the request as
 * same-origin - so a simple GET carries NO `Origin` header and `Sec-Fetch-Site`
 * says `same-origin`. Both existing guards pass. Only the `Host` header still
 * names the attacker.
 *
 * Every request goes over a raw socket: `fetch` will not let us forge `Host`.
 */

const TOKEN = "test-token-value";

type RawResponse = { status: number; body: string };

function rawGet(
  port: number,
  target: string,
  hostHeader: string | null,
  opts: { token?: string; httpVersion?: string } = {},
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, "127.0.0.1", () => {
      socket.write(
        `GET ${target} HTTP/${opts.httpVersion ?? "1.1"}\r\n` +
          (hostHeader === null ? "" : `Host: ${hostHeader}\r\n`) +
          (opts.token ? `Authorization: Bearer ${opts.token}\r\n` : "") +
          `Connection: close\r\n\r\n`,
      );
    });
    let buf = "";
    socket.setTimeout(5000, () => socket.destroy(new Error("raw request timed out")));
    socket.on("data", (d) => (buf += d.toString()));
    socket.on("error", reject);
    socket.on("close", () => {
      const statusLine = buf.split("\r\n")[0] ?? "";
      const status = Number(statusLine.split(" ")[1]);
      resolve({ status, body: buf.split("\r\n\r\n").slice(1).join("\r\n\r\n") });
    });
  });
}

let server: StartedServer | null = null;
const roots: string[] = [];

beforeEach(() => {
  vi.stubEnv("VIBESTRATE_API_TOKEN", "");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  if (server) await server.close();
  server = null;
  while (roots.length) {
    await fs.rm(roots.pop()!, { recursive: true, force: true }).catch(() => undefined);
  }
});

async function boot(host: string, apiToken?: string): Promise<StartedServer> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-host-hdr-"));
  roots.push(root);
  server = await startServer({
    projectRoot: root,
    port: 0,
    host,
    apiToken,
    withScheduler: false,
  });
  return server;
}

describe("Host header validation (DNS rebinding)", () => {
  it("serves every hostname a real local client can present", async () => {
    const s = await boot("127.0.0.1");
    // The port is appended the way a browser or curl would send it, to prove the
    // check strips the port and does not choke on the colon in an IPv6 literal.
    const allowed = [
      "127.0.0.1",
      `127.0.0.1:${s.port}`,
      "localhost",
      `localhost:${s.port}`,
      `[::1]:${s.port}`,
      "[::1]",
      `[::ffff:127.0.0.1]:${s.port}`,
      `LOCALHOST:${s.port}`,
      // The rooted-FQDN form of the same name.
      `localhost.:${s.port}`,
      "127.0.0.1.",
    ];
    for (const h of allowed) {
      const res = await rawGet(s.port, "/api/health", h);
      expect(res.status, `Host: ${h} must be served`).toBe(200);
      expect(JSON.parse(res.body)).toMatchObject({ ok: true });
    }
  });

  it("refuses a rebound hostname on a plain GET, which no other guard catches", async () => {
    const s = await boot("127.0.0.1");
    // Exactly what a rebound page sends: attacker hostname, and because the
    // browser thinks it is same-origin, no Origin header at all.
    const refused = [
      `attacker.example:${s.port}`,
      "attacker.example",
      "evil.localhost.attacker.example",
      `evil.com@127.0.0.1:${s.port}`,
      "127.0.0.1.attacker.example",
      "",
      // RFC 6761 reserves *.localhost for loopback and browsers honour it, but
      // the Origin allow-list only accepts bare `localhost` - so allowing this
      // here would serve the dashboard shell and then 403 every API call it
      // makes. The two checks have to agree, and the narrower one wins.
      `app.localhost:${s.port}`,
    ];
    for (const h of refused) {
      const res = await rawGet(s.port, "/api/health", h);
      expect(res.status, `Host: ${h} must be refused`).toBe(403);
    }
  });

  it("refuses a request that omits Host entirely", async () => {
    const s = await boot("127.0.0.1");
    // HTTP/1.1 without Host is rejected by Node before our hook; HTTP/1.0 is
    // allowed through with no Host, and must fail closed here.
    const res = await rawGet(s.port, "/api/health", null, { httpVersion: "1.0" });
    expect(res.status).not.toBe(200);
  });

  it("does not enforce Host on a non-loopback bind, where the token is the control", async () => {
    // The regression this pins: comparing the Host against the BIND address.
    // `--host 0.0.0.0` is a documented mode (docs/content/architecture/http-api.md),
    // and 0.0.0.0 is a wildcard that no client ever sends as a Host - so a
    // bind-address comparison would 403 the entire LAN dashboard, static assets
    // included.
    const s = await boot("0.0.0.0", TOKEN);
    const res = await rawGet(s.port, "/api/health", "192.168.1.5:4317", { token: TOKEN });
    expect(res.status, "a LAN Host with a valid token must be served").toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ ok: true });
  });

  it("still requires the bearer token on a non-loopback bind", async () => {
    const s = await boot("0.0.0.0", TOKEN);
    const res = await rawGet(s.port, "/api/health", "192.168.1.5:4317");
    expect(res.status).toBe(401);
  });
});
