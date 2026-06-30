import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { startServer, type StartedServer } from "../src/server/server.js";
import { applySetup } from "../src/setup/setup-service.js";
import { RoadmapService } from "../src/roadmap/roadmap-service.js";
import { acquireTaskLock } from "../src/core/run-lock.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

async function makeProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-saga-route-"));
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
  await server?.close();
  server = null;
});

describe("GET /api/sagas/:taskId/status", () => {
  it("returns the conductor status incl. the live run, progress, invariants", async () => {
    const dir = await makeProject();
    const svc = new RoadmapService(dir);
    const task = await svc.addTask({ title: "Dashboard saga", runMode: "supervised" });
    await svc.addChecklistItem(task.id, "step one");
    await svc.addChecklistItem(task.id, "step two");
    const withSteps = await svc.getTask(task.id);
    await svc.setChecklistItemStatus(task.id, withSteps!.checklist[0]!.id, "done");
    await svc.appendSagaInvariants(task.id, ["responses use snake_case"]);
    await acquireTaskLock(dir, task.id, "20260629-150000-live");

    server = await startServer({ projectRoot: dir, port: 0, host: "127.0.0.1" });
    const res = await fetch(`${server.url}/api/sagas/${task.id}/status`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: Record<string, unknown> };
    expect(body.status.supervisedState).toBe("idle");
    expect(body.status.liveRunId).toBe("20260629-150000-live");
    expect(body.status.progress).toEqual({ done: 1, total: 2 });
    expect(body.status.supervisedInvariants).toContain("responses use snake_case");
  }, 30_000);

  it("404s a missing saga and 400s a non-saga task", async () => {
    const dir = await makeProject();
    const svc = new RoadmapService(dir);
    const single = await svc.addTask({ title: "Plain", runMode: "plain" });

    server = await startServer({ projectRoot: dir, port: 0, host: "127.0.0.1" });
    expect((await fetch(`${server.url}/api/sagas/nope/status`)).status).toBe(404);
    expect((await fetch(`${server.url}/api/sagas/${single.id}/status`)).status).toBe(400);
  }, 30_000);
});
