import { afterEach, describe, expect, it } from "vitest";
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
  const project = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-role-ctx-"));
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
  await server?.close();
  server = null;
});

describe("role context API", () => {
  it("reads, writes, and reads back a role's prompt (context)", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const read = await fetch(`${server.url}/api/crews/default/roles/planner/context`);
    expect(read.status).toBe(200);
    const before = (await read.json()) as {
      roleId: string;
      profile: string;
      promptPath: string;
      content: string;
    };
    expect(before.roleId).toBe("planner");
    expect(before.promptPath).toContain("planner");

    const write = await fetch(`${server.url}/api/crews/default/roles/planner/context`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "# Planner\n\nYou are a careful planner.\n" }),
    });
    expect(write.status).toBe(200);

    const after = (await fetch(`${server.url}/api/crews/default/roles/planner/context`).then((r) =>
      r.json(),
    )) as { content: string };
    expect(after.content).toContain("You are a careful planner.");
  });

  it("404s an unknown role and 400s a bad content body", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const missing = await fetch(`${server.url}/api/crews/default/roles/no-such-role/context`);
    expect(missing.status).toBe(404);

    const bad = await fetch(`${server.url}/api/crews/default/roles/planner/context`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: 123 }),
    });
    expect(bad.status).toBe(400);
  });

  it("does not leak prompt contents in the bulk roles list", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });
    const list = (await fetch(`${server.url}/api/crews/default`).then((r) => r.json())) as {
      crew: { roles: Record<string, unknown>[] };
    };
    expect(list.crew.roles.length).toBeGreaterThan(0);
    for (const role of list.crew.roles) {
      expect(role).not.toHaveProperty("content");
      expect(role).not.toHaveProperty("prompt");
    }
  });
});
