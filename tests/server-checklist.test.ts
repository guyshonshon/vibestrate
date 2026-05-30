import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { startServer, type StartedServer } from "../src/server/server.js";
import { applySetup } from "../src/setup/setup-service.js";
import { RoadmapService } from "../src/roadmap/roadmap-service.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

async function makeProject(): Promise<string> {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-clr-"));
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

describe("checklist HTTP routes", () => {
  it("adds, patches, reorders, removes through /api (+ the /api/v1 alias)", async () => {
    const project = await makeProject();
    const svc = new RoadmapService(project);
    await svc.init();
    const task = await svc.addTask({ title: "Build health endpoint" });
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });
    const base = `${server.url}/api/tasks/${task.id}/checklist`;

    // Add two items — the second through the versioned /api/v1 alias.
    const a = await fetch(base, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "/health returns json" }),
    });
    expect(a.status).toBe(200);
    const aBody = (await a.json()) as { item: { id: string } };

    const b = await fetch(
      `${server.url}/api/v1/tasks/${task.id}/checklist`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "test the endpoint" }),
      },
    );
    expect(b.status).toBe(200);
    const bBody = (await b.json()) as { item: { id: string } };

    // Patch the first item to done.
    const patch = await fetch(`${base}/${aBody.item.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });
    expect(patch.status).toBe(200);
    expect((await patch.json()).item.status).toBe("done");

    // Reorder: second before first.
    const reorder = await fetch(base, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ order: [bBody.item.id, aBody.item.id] }),
    });
    expect(reorder.status).toBe(200);
    expect((await reorder.json()).task.checklist[0].id).toBe(bBody.item.id);

    // Remove the first (now-second) item.
    const del = await fetch(`${base}/${aBody.item.id}`, { method: "DELETE" });
    expect(del.status).toBe(200);
    const after = (await del.json()) as { task: { checklist: unknown[] } };
    expect(after.task.checklist).toHaveLength(1);
  });

  it("validates input and missing ids", async () => {
    const project = await makeProject();
    const svc = new RoadmapService(project);
    await svc.init();
    const task = await svc.addTask({ title: "x" });
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });
    const base = `${server.url}/api/tasks/${task.id}/checklist`;

    // Empty text → 400.
    const empty = await fetch(base, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "" }),
    });
    expect(empty.status).toBe(400);

    // Patch a non-existent item → 404.
    const ghost = await fetch(`${base}/ci-ghost`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });
    expect(ghost.status).toBe(404);

    // Reorder with a non-permutation → 400.
    const bad = await fetch(base, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ order: ["ci-ghost"] }),
    });
    expect(bad.status).toBe(400);
  });
});
