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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-ntr-"));
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

describe("POST /api/tasks/:id/needs-testing/verdict", () => {
  it("resolves a flagged task and validates the verdict", async () => {
    const project = await makeProject();
    const svc = new RoadmapService(project);
    await svc.init();
    const task = await svc.addTask({ title: "Polish the modal" });
    await svc.flagNeedsTesting(task.id, "check the focus ring");
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });
    const url = `${server.url}/api/tasks/${task.id}/needs-testing/verdict`;

    // Bad verdict → 400.
    const bad = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ verdict: "maybe" }),
    });
    expect(bad.status).toBe(400);

    // pass → done, flag cleared.
    const ok = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ verdict: "pass" }),
    });
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { task: { needsTesting: boolean; status: string } };
    expect(body.task.needsTesting).toBe(false);
    expect(body.task.status).toBe("done");
  });
});
