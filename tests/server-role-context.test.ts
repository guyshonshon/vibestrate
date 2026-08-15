import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { startServer, type StartedServer } from "../src/server/server.js";
import { applySetup } from "../src/setup/setup-service.js";
import { parseRoleFile } from "../src/agents/role-schema.js";
import { loadRolePrompt } from "../src/project/config-loader.js";
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

    // The editor works in instruction text, but what lands on disk is a role
    // file. Mutation check: write `content` raw and this fails - the config
    // loader would reject the file on the next run instead of here.
    const onDisk = await fs.readFile(
      path.join(project, ".vibestrate", "roles", "planner.json"),
      "utf8",
    );
    expect(parseRoleFile(onDisk, "planner.json")).toEqual({
      schemaVersion: 1,
      id: "planner",
      prompt: "# Planner\n\nYou are a careful planner.\n",
    });
    // And the same file the API just wrote is the one a run resolves.
    expect(await loadRolePrompt(project, ".vibestrate/roles/planner.json")).toBe(
      "# Planner\n\nYou are a careful planner.\n",
    );
  });

  it("422s a role file that is not a valid role file, rather than opening an empty editor", async () => {
    const project = await makeProject();
    // A hand-broken file must surface where it can be fixed. Serving "" would
    // invite a save that silently replaces the owner's instructions.
    await fs.writeFile(
      path.join(project, ".vibestrate", "roles", "planner.json"),
      "# Planner\n\nnot json at all\n",
    );
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const res = await fetch(`${server.url}/api/crews/default/roles/planner/context`);
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error?: string; message?: string };
    expect(JSON.stringify(body)).toMatch(/planner\.json/);
    // The message names the file, not where the project lives on disk.
    expect(JSON.stringify(body)).not.toContain(project);
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

  // The prompt is injected verbatim into every turn this role takes, so a
  // pasted token would reach a provider on each one.
  it("refuses a prompt carrying a secret, and leaves the file on disk untouched", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const before = (await fetch(
      `${server.url}/api/crews/default/roles/planner/context`,
    ).then((r) => r.json())) as { content: string; promptPath: string };

    const write = await fetch(`${server.url}/api/crews/default/roles/planner/context`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content: "Call the API with AKIAIOSFODNN7EXAMPLE when you need it.\n",
      }),
    });
    expect(write.status).toBe(400);
    const body = (await write.json()) as { error?: string; message?: string };
    const text = JSON.stringify(body);
    expect(text).toMatch(/secret/i);
    // The refusal reports the shape, never the token itself.
    expect(text).not.toContain("AKIAIOSFODNN7EXAMPLE");

    const after = (await fetch(
      `${server.url}/api/crews/default/roles/planner/context`,
    ).then((r) => r.json())) as { content: string };
    expect(after.content).toBe(before.content);
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
