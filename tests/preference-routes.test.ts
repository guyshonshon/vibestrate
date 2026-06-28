import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { startServer, type StartedServer } from "../src/server/server.js";
import { applySetup } from "../src/setup/setup-service.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

// Route-level checks for the preference-gates M1 write surface (CLAUDE.md §3:
// dashboard/server APIs need route-level checks). The high-stakes property is
// trust: a caller must not be able to forge a pre-confirmed / supervisor-proposed
// entry, and an owner add must be source:owner + confirmed-on-create.

const noProvider: ProviderDetectionRunner = async () => ({ exitCode: 127, stdout: "", stderr: "" });

async function makeProject(): Promise<string> {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-prefroute-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: project });
  await execa("git", ["config", "user.email", "x@x"], { cwd: project });
  await execa("git", ["config", "user.name", "x"], { cwd: project });
  await fs.writeFile(path.join(project, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: project });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: project });
  await applySetup({ options: { projectRoot: project }, detectionRunner: noProvider });
  return project;
}

let server: StartedServer | null = null;
afterEach(async () => {
  if (server) await server.close();
  server = null;
});

const json = { "content-type": "application/json" };

describe("preference routes (M1 capture write surface)", () => {
  it("POST adds an owner preference (active on create); GET reflects it", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const add = await fetch(`${server.url}/api/personas/staff-engineer/preferences`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ id: "no-em-dash", statement: "do not use em-dash characters", correction: "use a hyphen" }),
    });
    expect(add.status).toBe(200);
    const added = (await add.json()) as { preference: { source: string; confirmedAt: string | null } };
    expect(added.preference.source).toBe("owner");
    expect(added.preference.confirmedAt).not.toBeNull(); // confirmed on create

    const list = (await (await fetch(`${server.url}/api/personas/staff-engineer/preferences`)).json()) as {
      preferences: { id: string }[];
    };
    expect(list.preferences.map((p) => p.id)).toEqual(["no-em-dash"]);
  });

  it("TRUST: a body trying to forge source/confirmedAt is rejected (400, no write)", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const forged = await fetch(`${server.url}/api/personas/staff-engineer/preferences`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({
        id: "evil",
        statement: "looks innocent",
        source: "supervisor-proposed",
        confirmedAt: "2020-01-01T00:00:00.000Z",
      }),
    });
    expect(forged.status).toBe(400); // .strict() rejects the extra keys
    const after = (await (await fetch(`${server.url}/api/personas/staff-engineer/preferences`)).json()) as {
      preferences: unknown[];
    };
    expect(after.preferences).toEqual([]); // nothing written
  });

  it("rejects a bad body (missing statement) with 400", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });
    const bad = await fetch(`${server.url}/api/personas/staff-engineer/preferences`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ id: "x" }),
    });
    expect(bad.status).toBe(400);
  });

  it("DELETE removes a preference, and reports a no-op the second time", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });
    await fetch(`${server.url}/api/personas/staff-engineer/preferences`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ id: "a", statement: "rule a" }),
    });
    const del1 = (await (await fetch(`${server.url}/api/personas/staff-engineer/preferences/a`, { method: "DELETE" })).json()) as { removed: boolean };
    expect(del1.removed).toBe(true);
    const del2 = (await (await fetch(`${server.url}/api/personas/staff-engineer/preferences/a`, { method: "DELETE" })).json()) as { removed: boolean };
    expect(del2.removed).toBe(false);
  });

  it("GET on an unknown persona is a 404 (no silent fallback)", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });
    const res = await fetch(`${server.url}/api/personas/nope-not-real/preferences`);
    expect(res.status).toBe(404);
  });
});
