import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { startServer, type StartedServer } from "../src/server/server.js";
import { applySetup } from "../src/setup/setup-service.js";
import { setConfigValue } from "../src/setup/config-update-service.js";
import { RoadmapService } from "../src/roadmap/roadmap-service.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

// A fake CLI provider that reads the prompt on stdin and prints a JSON
// checklist — exercising the real runProvider path without a model.
const FAKE_SCRIPT = `#!/usr/bin/env node
let i='';process.stdin.on('data',c=>i+=c);process.stdin.on('end',()=>{
  console.log('Here is your checklist:');
  console.log(JSON.stringify({ items: ['define the route', 'return json', 'add a test'] }));
});
`;

async function makeProjectWithFakeProvider(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-enh-srv-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });

  const fakeJs = path.join(dir, "fake.js");
  await fs.writeFile(fakeJs, FAKE_SCRIPT, { mode: 0o755 });
  await fs.chmod(fakeJs, 0o755);
  await setConfigValue(
    dir,
    "providers.fake",
    JSON.stringify({ type: "cli", command: "node", args: [fakeJs], input: "stdin" }),
  );
  // Point the planner's profile (what the assist resolves) at the fake provider.
  await setConfigValue(dir, "profiles.claude-balanced.provider", "fake");
  return dir;
}

let server: StartedServer | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

describe("POST /api/tasks/:id/enhance", () => {
  it("previews then applies a proposed checklist end-to-end", async () => {
    const project = await makeProjectWithFakeProvider();
    const svc = new RoadmapService(project);
    await svc.init();
    const task = await svc.addTask({ title: "Add a health endpoint" });
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });
    const url = `${server.url}/api/tasks/${task.id}/enhance`;

    // Preview (apply: false) — proposes but does not mutate.
    const preview = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ apply: false }),
    });
    expect(preview.status).toBe(200);
    const pBody = (await preview.json()) as {
      applied: boolean;
      proposal: { items: string[] };
    };
    expect(pBody.applied).toBe(false);
    expect(pBody.proposal.items).toEqual([
      "define the route",
      "return json",
      "add a test",
    ]);
    expect((await svc.getTask(task.id))!.checklist).toHaveLength(0);

    // Apply — appends the items.
    const applied = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ apply: true }),
    });
    expect(applied.status).toBe(200);
    const aBody = (await applied.json()) as {
      applied: boolean;
      added: { text: string }[];
    };
    expect(aBody.applied).toBe(true);
    expect(aBody.added).toHaveLength(3);
    expect((await svc.getTask(task.id))!.checklist).toHaveLength(3);
  });
});
