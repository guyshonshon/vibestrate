import { describe, it, expect, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { startServer, type StartedServer } from "../src/server/server.js";
import { applySetup } from "../src/setup/setup-service.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

async function makeProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-ledger-route-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  return dir;
}

let server: StartedServer | null = null;
afterEach(async () => {
  if (server) await server.close();
  server = null;
});

describe("POST /api/ledger (hand-add a ledger entry)", () => {
  it("creates an entry, server-generated id/createdAt, tagged as manual, and it shows up in GET /api/ledger", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const res = await fetch(`${server.url}/api/ledger`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "intent", title: "Look into the flaky test", detail: "context" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: true;
      entry: { id: string; title: string; sourceRunId: string | null; tags: string[] };
    };
    expect(body.entry.title).toBe("Look into the flaky test");
    expect(body.entry.sourceRunId).toBeNull();
    expect(body.entry.tags).toContain("manual");
    expect(body.entry.id).toMatch(/^manual:/);

    const getRes = await fetch(`${server.url}/api/ledger`);
    const getBody = (await getRes.json()) as {
      state: { intents: { id: string; title: string }[] };
    };
    expect(getBody.state.intents.map((e) => e.id)).toContain(body.entry.id);
  });

  it("rejects a client-supplied id (strict schema - never trusted, never silently dropped)", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const res = await fetch(`${server.url}/api/ledger`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "intent", title: "t", id: "attacker-chosen" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects an oversized title", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const res = await fetch(`${server.url}/api/ledger`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "intent", title: "x".repeat(301) }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects a 'flag' kind (no relatesTo target a hand entry could point at)", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const res = await fetch(`${server.url}/api/ledger`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "flag", title: "t" }),
    });
    expect(res.status).toBe(400);
  });
});
