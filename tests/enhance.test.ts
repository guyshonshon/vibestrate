import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { RoadmapService } from "../src/roadmap/roadmap-service.js";
import { proposeChecklist, enhanceChecklist } from "../src/assist/enhance.js";
import { AssistError, type AssistProviderRunner } from "../src/assist/assist-runner.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

async function makeProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-enh-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  return dir;
}

function fakeRunner(response: string): AssistProviderRunner {
  return async () => ({
    exitCode: 0,
    normalized: { responseText: response, metrics: null },
  });
}

describe("enhance", () => {
  let projectRoot: string;
  let svc: RoadmapService;
  beforeEach(async () => {
    projectRoot = await makeProject();
    svc = new RoadmapService(projectRoot);
    await svc.init();
  });

  it("proposes items without mutating the task", async () => {
    const task = await svc.addTask({ title: "Build health endpoint" });
    const proposal = await proposeChecklist(projectRoot, task.id, {
      runner: fakeRunner(
        '{"items":["/health returns json","test the endpoint"]}',
      ),
    });
    expect(proposal.items).toEqual([
      "/health returns json",
      "test the endpoint",
    ]);
    const reloaded = await svc.getTask(task.id);
    expect(reloaded!.checklist).toHaveLength(0); // propose = dry run
  });

  it("applies proposed items, appending them to the checklist", async () => {
    const task = await svc.addTask({ title: "x" });
    const { added, task: updated } = await enhanceChecklist(projectRoot, task.id, {
      runner: fakeRunner('{"items":["alpha","beta","gamma"]}'),
    });
    expect(added.map((i) => i.text)).toEqual(["alpha", "beta", "gamma"]);
    expect(updated.checklist).toHaveLength(3);
  });

  it("de-duplicates against existing items (case-insensitive)", async () => {
    const task = await svc.addTask({ title: "x" });
    await svc.addChecklistItem(task.id, "Alpha");
    const proposal = await proposeChecklist(projectRoot, task.id, {
      runner: fakeRunner('{"items":["alpha","  beta  ","beta"]}'),
    });
    // "alpha" drops (dup of existing "Alpha"); "beta" appears once, trimmed.
    expect(proposal.items).toEqual(["beta"]);
  });

  it("errors when every proposed item is empty or a duplicate", async () => {
    const task = await svc.addTask({ title: "x" });
    await svc.addChecklistItem(task.id, "only");
    await expect(
      proposeChecklist(projectRoot, task.id, {
        runner: fakeRunner('{"items":["only","  "]}'),
      }),
    ).rejects.toBeInstanceOf(AssistError);
  });

  it("errors on a missing task", async () => {
    await expect(
      proposeChecklist(projectRoot, "task-ghost", {
        runner: fakeRunner('{"items":["x"]}'),
      }),
    ).rejects.toBeInstanceOf(AssistError);
  });
});
