import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { RoadmapService } from "../src/roadmap/roadmap-service.js";
import {
  proposeChecklist,
  enhanceChecklist,
  proposeChecklistQuestions,
} from "../src/core/assist/enhance.js";
import { AssistError, type AssistProviderRunner } from "../src/core/assist/assist-runner.js";
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

  it("proposes guided clarifying questions (bounded, structured)", async () => {
    const task = await svc.addTask({ title: "Add auth" });
    const { questions } = await proposeChecklistQuestions(projectRoot, task.id, {
      runner: fakeRunner(
        '{"questions":[{"id":"provider","question":"Which auth provider?","why":"changes the steps","kind":"choice","options":["OAuth","password"]},{"id":"scope","question":"Login only or also signup?","kind":"text"}]}',
      ),
    });
    expect(questions.map((q) => q.id)).toEqual(["provider", "scope"]);
    expect(questions[0]!.options).toEqual(["OAuth", "password"]);
    // dry run - nothing written to the task
    const reloaded = await svc.getTask(task.id);
    expect(reloaded!.checklist).toHaveLength(0);
  });

  it("allows an empty question set (task already clear)", async () => {
    const task = await svc.addTask({ title: "Rename a var" });
    const { questions } = await proposeChecklistQuestions(projectRoot, task.id, {
      runner: fakeRunner('{"questions":[]}'),
    });
    expect(questions).toEqual([]);
  });

  it("threads answers into the breakdown prompt", async () => {
    const task = await svc.addTask({ title: "Add auth" });
    let seenInstruction = "";
    const capturingRunner: AssistProviderRunner = async (_providers, input) => {
      seenInstruction = JSON.stringify(input);
      return {
        exitCode: 0,
        normalized: { responseText: '{"items":["wire oauth"]}', metrics: null },
      };
    };
    const proposal = await proposeChecklist(projectRoot, task.id, {
      runner: capturingRunner,
      answers: [{ question: "Which auth provider?", answer: "OAuth" }],
    });
    expect(proposal.items).toEqual(["wire oauth"]);
    // the answer text reached the model instruction
    expect(seenInstruction).toContain("OAuth");
    expect(seenInstruction).toContain("Which auth provider?");
  });
});
