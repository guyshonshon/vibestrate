import { describe, it, expect, beforeEach, afterEach } from "vitest";
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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-server-rm-"));
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

describe("server: roadmap & task routes", () => {
  beforeEach(async () => {
    project = await makeProject();
    server = await startServer({
      projectRoot: project,
      port: 0,
      host: "127.0.0.1",
    });
  });

  it("POST /api/roadmap/items + GET returns the new item", async () => {
    const post = await fetch(`${server!.url}/api/roadmap/items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Build onboarding" }),
    });
    expect(post.status).toBe(200);
    const list = (await fetch(`${server!.url}/api/roadmap`).then((r) =>
      r.json(),
    )) as { items: { title: string }[] };
    expect(list.items.map((i) => i.title)).toContain("Build onboarding");
  });

  it("POST /api/tasks accepts and stores the task", async () => {
    const r = await fetch(`${server!.url}/api/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Create setup wizard",
        priority: "high",
        touchedFiles: ["src/cli/commands/setup.ts"],
      }),
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { task: { id: string; priority: string } };
    expect(body.task.priority).toBe("high");
    expect(body.task.id).toMatch(/^task-/);
  });

  it("rejects path traversal in task id", async () => {
    const r = await fetch(`${server!.url}/api/tasks/..%2Fevil`);
    expect(r.status).toBe(400);
  });

  it("comments add + resolve flow", async () => {
    const svc = new RoadmapService(project);
    await svc.init();
    const t = await svc.addTask({ title: "x" });
    const add = await fetch(
      `${server!.url}/api/tasks/${t.id}/comments`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: "test note" }),
      },
    );
    expect(add.status).toBe(200);
    const cBody = (await add.json()) as { comment: { id: string } };
    const resolve = await fetch(
      `${server!.url}/api/tasks/${t.id}/comments/${cBody.comment.id}/resolve`,
      { method: "POST" },
    );
    expect(resolve.status).toBe(200);
    const r = (await resolve.json()) as { comment: { resolved: boolean } };
    expect(r.comment.resolved).toBe(true);
  });

  it("queue endpoint adds task to scheduler queue and updates status", async () => {
    const svc = new RoadmapService(project);
    await svc.init();
    const t = await svc.addTask({ title: "x" });
    const r = await fetch(`${server!.url}/api/tasks/${t.id}/queue`, {
      method: "POST",
    });
    expect(r.status).toBe(200);
    const queueRes = (await fetch(`${server!.url}/api/queue`).then((rr) =>
      rr.json(),
    )) as { queue: { taskId: string }[] };
    expect(queueRes.queue.map((e) => e.taskId)).toContain(t.id);
  });

  it("no /api/tasks/:id/run endpoint exists (would be a shell-execution vector)", async () => {
    const svc = new RoadmapService(project);
    await svc.init();
    const t = await svc.addTask({ title: "x" });
    const r = await fetch(`${server!.url}/api/tasks/${t.id}/run`, {
      method: "POST",
    });
    expect(r.status).toBe(404);
  });

  it("GET /api/scheduler/conflicts returns empty by default", async () => {
    const r = await fetch(`${server!.url}/api/scheduler/conflicts`);
    expect(r.status).toBe(200);
    const body = (await r.json()) as { warnings: unknown[] };
    expect(body.warnings).toEqual([]);
  });
});
