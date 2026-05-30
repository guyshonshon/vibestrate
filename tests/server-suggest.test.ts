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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-sg-"));
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

describe("GET /api/tasks/suggest", () => {
  it("ranks the backlog and the static route wins over /:taskId", async () => {
    const project = await makeProject();
    const svc = new RoadmapService(project);
    await svc.init();
    await svc.addTask({ title: "low one", priority: "low" });
    await svc.addTask({ title: "high one", priority: "high" });
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const r = await fetch(`${server.url}/api/tasks/suggest`);
    expect(r.status).toBe(200);
    const body = (await r.json()) as {
      suggestions: { title: string; ready: boolean }[];
    };
    expect(body.suggestions).toHaveLength(2);
    // high priority ranks first; not parsed as a taskId lookup.
    expect(body.suggestions[0]!.title).toBe("high one");
  });
});
