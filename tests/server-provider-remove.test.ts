import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { startServer, type StartedServer } from "../src/server/server.js";
import { applySetup } from "../src/setup/setup-service.js";
import { addProvider } from "../src/setup/provider-setup-service.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

async function makeProject(): Promise<string> {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-prm-"));
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

describe("DELETE /api/providers/:id", () => {
  it("removes an unused provider and 409s one still used by a role", async () => {
    const project = await makeProject();
    // An unused spare provider — removable.
    await addProvider(project, {
      id: "spare",
      config: { type: "cli", command: "spare", args: [], input: "stdin" },
      alsoAssignAllProfiles: false,
    });
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const del = await fetch(`${server.url}/api/providers/spare`, { method: "DELETE" });
    expect(del.status).toBe(200);
    expect((await del.json()).ok).toBe(true);

    // claude is the default for every role → refuse with 409.
    const refused = await fetch(`${server.url}/api/providers/claude`, {
      method: "DELETE",
    });
    expect(refused.status).toBe(409);
    const body = (await refused.json()) as { error?: string; message?: string };
    expect(JSON.stringify(body)).toContain("still used by");
  });

  it("400s an invalid provider id", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });
    const bad = await fetch(`${server.url}/api/providers/1bad`, { method: "DELETE" });
    // "1bad" starts with a digit → fails the provider-id guard → 400.
    expect(bad.status).toBe(400);
  });
});
