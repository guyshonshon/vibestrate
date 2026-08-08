import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { startServer, type StartedServer } from "../src/server/server.js";

/**
 * The bearer gate must be scoped by the route the router RESOLVED, not by a
 * prefix test on the raw request URL. The router percent-decodes path segments
 * and accepts an absolute-form request target, so several URLs that never
 * literally start with "/api/" still reach an `/api/...` handler.
 *
 * Every request here goes over a raw socket: `fetch` normalises the target and
 * cannot send an absolute-form request line at all, so it would silently fail
 * to exercise the very shapes under test.
 */

const TOKEN = "test-token-value";

/** Request targets that the router resolves to the `/api/health` handler even
 *  though only the last one starts with the literal "/api/". */
const API_HEALTH_TARGETS = [
  "/api/health",
  "/%61pi/health",
  "/ap%69/health",
  "/%61%70%69/health",
  "/%61pi/%68ealth",
  "/api/%68ealth",
  "http://127.0.0.1/api/health",
  "/api/v1/health",
];

type RawResponse = { status: number; body: string };

function rawGet(port: number, target: string, token?: string): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, "127.0.0.1", () => {
      socket.write(
        `GET ${target} HTTP/1.1\r\n` +
          `Host: 127.0.0.1\r\n` +
          (token ? `Authorization: Bearer ${token}\r\n` : "") +
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

// A real VIBESTRATE_API_TOKEN in the developer's environment would otherwise
// turn the gate on for the "no token configured" case and invert its result.
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

async function boot(apiToken?: string): Promise<StartedServer> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-auth-scope-"));
  roots.push(root);
  server = await startServer({
    projectRoot: root,
    port: 0,
    host: "127.0.0.1",
    apiToken,
    withScheduler: false,
  });
  return server;
}

describe("bearer gate scoping", () => {
  it("rejects every request form that resolves to an API handler", async () => {
    const s = await boot(TOKEN);
    for (const target of API_HEALTH_TARGETS) {
      const res = await rawGet(s.port, target);
      expect(res.status, `unauthenticated ${target} must be refused`).toBe(401);
    }
  });

  // The control for the test above. Without it a 401 could just mean "that URL
  // reaches nothing" - this proves each form really does resolve to the
  // `/api/health` handler, so skipping the gate would have served real data.
  it("serves those same forms once the token is presented", async () => {
    const s = await boot(TOKEN);
    for (const target of API_HEALTH_TARGETS) {
      const res = await rawGet(s.port, target, TOKEN);
      expect(res.status, `${target} should route to the API handler`).toBe(200);
      expect(JSON.parse(res.body)).toMatchObject({ ok: true });
    }
  });

  it("refuses a wrong token", async () => {
    const s = await boot(TOKEN);
    expect((await rawGet(s.port, "/api/health", "not-the-token")).status).toBe(401);
  });

  // An unmatched API path must not fall through to the open static handler:
  // that would let an unauthenticated caller map the API by telling a 404
  // apart from a 401.
  it("gates unmatched paths inside the API namespace", async () => {
    const s = await boot(TOKEN);
    expect((await rawGet(s.port, "/api/no-such-endpoint")).status).toBe(401);
    expect((await rawGet(s.port, "/%61pi/no-such-endpoint")).status).toBe(401);
    expect((await rawGet(s.port, "/api/no-such-endpoint", TOKEN)).status).toBe(404);
  });

  it("leaves non-API routes open when a token is configured", async () => {
    const s = await boot(TOKEN);
    expect((await rawGet(s.port, "/favicon.svg")).status).toBe(200);
    expect((await rawGet(s.port, "/favicon.ico")).status).toBe(200);
  });

  it("stays open for a loopback client when no token is configured", async () => {
    const s = await boot();
    for (const target of API_HEALTH_TARGETS) {
      const res = await rawGet(s.port, target);
      expect(res.status, `${target} should be open without a configured token`).toBe(200);
    }
    expect((await rawGet(s.port, "/favicon.svg")).status).toBe(200);
  });
});
