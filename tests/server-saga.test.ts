import { describe, it, expect, beforeEach, afterEach } from "vitest";
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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-server-saga-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  return dir;
}

let project: string;
let server: StartedServer | null = null;

afterEach(async () => {
  if (server) await server.close();
  server = null;
});

describe("server: saga task routes", () => {
  beforeEach(async () => {
    project = await makeProject();
    server = await startServer({
      projectRoot: project,
      port: 0,
      host: "127.0.0.1",
    });
  });

  it("creates a saga task via POST /api/tasks", async () => {
    const res = await fetch(`${server!.url}/api/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Feature X", kind: "saga" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { task: { kind: string } };
    expect(body.task.kind).toBe("saga");
  });

  it("adds a step with objective", async () => {
    const created = await fetch(`${server!.url}/api/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "F", kind: "saga" }),
    });
    const { task } = (await created.json()) as { task: { id: string } };
    const taskId = task.id;
    const res = await fetch(`${server!.url}/api/tasks/${taskId}/checklist`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "step", objective: "do x", fileHints: ["src/x.ts"] }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { item: { objective: string; fileHints: string[] } };
    expect(body.item.objective).toBe("do x");
    expect(body.item.fileHints).toEqual(["src/x.ts"]);
  });

  it("patches a step acceptanceCheck", async () => {
    const created = await fetch(`${server!.url}/api/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "F", kind: "saga" }),
    });
    const { task } = (await created.json()) as { task: { id: string } };
    const taskId = task.id;
    const added = await fetch(`${server!.url}/api/tasks/${taskId}/checklist`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "step" }),
    });
    const addedBody = (await added.json()) as { item: { id: string } };
    const itemId = addedBody.item.id;
    const res = await fetch(
      `${server!.url}/api/tasks/${taskId}/checklist/${itemId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ acceptanceCheck: "passes" }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { item: { acceptanceCheck: string } };
    expect(body.item.acceptanceCheck).toBe("passes");
  });
});
