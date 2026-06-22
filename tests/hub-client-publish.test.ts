import { describe, it, expect, vi } from "vitest";
import { publishFlow } from "../src/flows/hub/hub-client.js";

const TOKEN = "gho_TESTTOKEN1234567890abcdefGHIJKLMNOPQR";
const CLEAN = "id: x-flow\nversion: 1\nsteps:\n  - run: echo hi\n";

function fakeFetch(status: number, body: unknown, opts: { html?: boolean } = {}) {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => (opts.html ? "<html>502</html>" : JSON.stringify(body)),
  })) as any;
}

describe("publishFlow", () => {
  it("returns ok on 201 (gated on status, not res.ok)", async () => {
    const f = fakeFetch(201, { ok: true, ref: "guy@x-flow:1.0.0", version: "1.0.0", sha256: "a".repeat(64), verified: false, diagnosis: { verdict: "accepted" } });
    const r = await publishFlow({ content: CLEAN, ref: "guy@x-flow:1.0.0", token: TOKEN, fetchImpl: f, allowPrivateHosts: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.version).toBe("1.0.0");
  });

  it("surfaces 422 rejected with diagnosis", async () => {
    const f = fakeFetch(422, { error: "flow rejected by scanner", diagnosis: { verdict: "rejected", findings: [{ id: "rce", message: "curl | sh", severity: "critical" }] } });
    const r = await publishFlow({ content: CLEAN, ref: "guy@x-flow:1.0.0", token: TOKEN, fetchImpl: f, allowPrivateHosts: true });
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.status).toBe(422); expect(r.diagnosis?.findings?.length).toBe(1); }
  });

  it("tolerates an edge 401 with an {error}-only body (no diagnosis)", async () => {
    const f = fakeFetch(401, { error: "invalid GitHub token" });
    const r = await publishFlow({ content: CLEAN, ref: "guy@x-flow:1.0.0", token: TOKEN, fetchImpl: f, allowPrivateHosts: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(401);
  });

  it("fails soft on a non-JSON 5xx (CloudFlare HTML), no throw", async () => {
    const f = fakeFetch(502, null, { html: true });
    const r = await publishFlow({ content: CLEAN, ref: "guy@x-flow:1.0.0", token: TOKEN, fetchImpl: f, allowPrivateHosts: true });
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.status).toBe(502); expect(r.reason).toMatch(/non-JSON/i); }
  });

  it("refuses a non-default origin BEFORE attaching the token (no fetch)", async () => {
    const f = vi.fn();
    const r = await publishFlow({ content: CLEAN, ref: "guy@x-flow:1.0.0", token: TOKEN, baseUrl: "https://evil.example", fetchImpl: f as any });
    expect(r.ok).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it("hard-refuses a secret-bearing flow before any fetch", async () => {
    const f = vi.fn();
    const r = await publishFlow({ content: "k: sk-" + "a".repeat(40), ref: "guy@x-flow:1.0.0", token: TOKEN, fetchImpl: f as any });
    expect(r.ok).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it("treats a 409 with matching content sha as idempotent success", async () => {
    const content = CLEAN;
    // sha256 of CLEAN, computed by the same helper the client uses.
    const { createHash } = await import("node:crypto");
    const sha = createHash("sha256").update(content, "utf8").digest("hex");
    const f = vi.fn(async (url: string) => {
      if (String(url).includes("/api/hub/publish")) {
        return { ok: false, status: 409, headers: { get: () => null }, text: async () => JSON.stringify({ error: "already exists" }) } as any;
      }
      // the pull verifying the existing version
      return { ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify({ ref: "guy@x-flow:1.0.0", version: "1.0.0", content, sha256: sha, verified: false }) } as any;
    });
    const r = await publishFlow({ content, ref: "guy@x-flow:1.0.0", token: TOKEN, fetchImpl: f as any, allowPrivateHosts: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.alreadyExisted).toBe(true);
  });

  it("never leaks the token in a thrown-network-error reason", async () => {
    const f = vi.fn(async () => { throw new Error(`connect failed for Bearer ${TOKEN}`); });
    const r = await publishFlow({ content: CLEAN, ref: "guy@x-flow:1.0.0", token: TOKEN, fetchImpl: f as any, allowPrivateHosts: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.includes(TOKEN)).toBe(false);
  });
});
