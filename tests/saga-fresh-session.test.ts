import { describe, it, expect, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { setConfigValue } from "../src/setup/config-update-service.js";
import { RoadmapService } from "../src/roadmap/roadmap-service.js";
import { cmdSequence } from "../src/cli/commands/saga.js";
import { runEventsPath } from "../src/utils/paths.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

// Saga flow fake (single per-item reviewer, no arbiter panel). fix-then-approve:
// CHANGES_REQUESTED on pass 1 of each step, APPROVED on pass 2, so each step runs
// exactly ONE fix iteration (the implement+review band re-runs once). The fix
// loop runs AFTER enterChecklistItem, so the per-step context reset must fire
// once per step (2), never per fix iteration (4). The implementer appends to the
// step file each pass (a real working-tree diff vs HEAD). It also writes the
// prompt it received for the implement step to a file keyed by step+timestamp so
// the test can confirm the curated packet (not the plain brief) reached it.
const FAKE = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const counts = path.join(__dirname, 'review-counts.json');
let inp = '';
process.stdin.on('data', (c) => (inp += c));
process.stdin.on('end', () => {
  const im = inp.match(/Step (\\d+) of/) || inp.match(/Current checklist item - (\\d+) of/);
  const n = im ? im[1] : 'x';
  const sm = inp.match(/Flow step:.*\\(([\\w-]+)\\)/);
  const id = sm ? sm[1] : '';
  if (id === 'plan' || id === 'micro-plan') {
    console.log('# Plan\\nWork the steps in order.');
    return;
  }
  if (id === 'implement') {
    // Record the prompt this implement turn received (proof of the packet).
    fs.appendFileSync(path.join(__dirname, 'implement-prompt-' + n + '.txt'), inp + '\\n=====\\n');
    fs.appendFileSync('item' + n + '.txt', 'work for step ' + n + ' @ ' + Date.now() + '\\n');
    console.log('# Implementation Summary\\nImplemented saga step ' + n + '.');
    return;
  }
  if (id === 'review-item') {
    let state = {};
    try { state = JSON.parse(fs.readFileSync(counts, 'utf8')); } catch (e) {}
    const pass = (state[n] || 0) + 1;
    state[n] = pass;
    fs.writeFileSync(counts, JSON.stringify(state));
    const decision = pass === 1 ? 'CHANGES_REQUESTED' : 'APPROVED';
    console.log('# Review of step ' + n + ' (pass ' + pass + ')\\nMust fix: address F1.\\n\\nDECISION: ' + decision);
    return;
  }
  if (id === 'review') {
    console.log('# Holistic review\\nDECISION: APPROVED');
    return;
  }
  console.log('ok');
});
`;

async function makeProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-saga-fresh-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  const fakeJs = path.join(dir, "fake.js");
  await fs.writeFile(fakeJs, FAKE, { mode: 0o755 });
  await fs.chmod(fakeJs, 0o755);
  await setConfigValue(
    dir,
    "providers.fake",
    JSON.stringify({ type: "cli", command: "node", args: [fakeJs], input: "stdin" }),
  );
  await setConfigValue(dir, "profiles.claude-balanced.provider", "fake");
  // A passing per-item review needs >= 2 loops, else the M1 self-heal halt fires
  // on the first CHANGES_REQUESTED before the fix-then-approve reviewer approves.
  await setConfigValue(dir, "workflow.maxReviewLoops", "2");
  return dir;
}

async function readEvents(dir: string): Promise<Array<{ type: string; data?: any }>> {
  const runsDir = path.join(dir, ".vibestrate", "runs");
  const runIds = (await fs.readdir(runsDir, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  expect(runIds).toHaveLength(1);
  const raw = await fs.readFile(runEventsPath(dir, runIds[0]!), "utf8");
  return raw
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

async function runId(dir: string): Promise<string> {
  const runsDir = path.join(dir, ".vibestrate", "runs");
  const runIds = (await fs.readdir(runsDir, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  return runIds[0]!;
}

describe("saga fresh context per step (M2b)", () => {
  const prevCwd = process.cwd();
  afterEach(() => {
    process.chdir(prevCwd);
  });

  it("resets context ONCE per step (not per fix iteration), and packets reach the implementer", async () => {
    const dir = await makeProject();
    const svc = new RoadmapService(dir);
    await svc.init();
    const task = await svc.addTask({ title: "Build two things", runMode: "supervised" });
    await svc.addChecklistItem(task.id, "create the first file", {
      objective: "Create src/first.ts exporting first().",
      acceptanceCheck: "src/first.ts exists and exports first.",
      fileHints: ["package.json"],
    });
    await svc.addChecklistItem(task.id, "create the second file", {
      objective: "Create src/second.ts exporting second().",
      acceptanceCheck: "src/second.ts exists and exports second.",
    });

    process.chdir(dir);
    const code = await cmdSequence(task.id, { json: true });
    expect(code).toBe(0);

    const after = await svc.getTask(task.id);
    // Sanity: both steps went green via fix-then-approve (one fix iter each).
    expect(after!.checklist.map((c) => c.status)).toEqual(["done", "done"]);
    expect(after!.supervised.state).toBe("done");

    const events = await readEvents(dir);

    // THE per-step / not-per-fix-iteration proof: one context_reset per STEP.
    const resets = events.filter((e) => e.type === "supervised.step.context_reset");
    expect(resets.length).toBe(2);
    expect(resets.map((e) => e.data.index)).toEqual([0, 1]);

    // Each step ran a fix iteration (so there were MORE band passes than steps):
    // the review event fires once per pass per item -> 4 (2 items x 2 passes).
    // If the reset had been per fix iteration it would also be 4; proving the
    // reset count is 2 while review passes are 4 is the discriminating signal.
    const reviewPasses = events.filter(
      (e) => e.type === "flow.checklist.item.review",
    );
    expect(reviewPasses.length).toBe(4);

    // The curated packet (not the plain brief) reached the implementer: the
    // implement prompt contains the packet header + the step's objective.
    const prompt1 = await fs.readFile(
      path.join(dir, "implement-prompt-1.txt"),
      "utf8",
    );
    expect(prompt1).toContain("Saga step packet");
    expect(prompt1).toContain("Create src/first.ts exporting first().");
    expect(prompt1).toContain("Build two things"); // the feature goal
  }, 120_000);

  it("writes a per-step packet artifact with the goal and step sections", async () => {
    const dir = await makeProject();
    const svc = new RoadmapService(dir);
    await svc.init();
    const task = await svc.addTask({ title: "Assemble the widget", runMode: "supervised" });
    await svc.addChecklistItem(task.id, "wire the base", {
      objective: "Add the base module.",
      acceptanceCheck: "base compiles.",
    });
    await svc.addChecklistItem(task.id, "wire the trim", {
      objective: "Add the trim module.",
      acceptanceCheck: "trim compiles.",
    });

    process.chdir(dir);
    expect(await cmdSequence(task.id, { json: true })).toBe(0);

    const id = await runId(dir);
    const artifactDir = path.join(
      dir,
      ".vibestrate",
      "runs",
      id,
      "artifacts",
      "flows",
      "checklist",
    );
    const packet1 = await fs.readFile(
      path.join(artifactDir, "item-1-packet.md"),
      "utf8",
    );
    expect(packet1).toContain("# Saga step packet");
    expect(packet1).toContain("## Feature goal");
    expect(packet1).toContain("Assemble the widget");
    expect(packet1).toContain("## This step");
    expect(packet1).toContain("Add the base module.");
    // The invariants ledger (M3) is empty for this saga (the supervisor recorded
    // none), so its section is omitted entirely - no empty-section noise.
    expect(packet1).not.toContain("## Invariants");

    // Step 2's packet carries the prior step's outcome (carried-forward ledger).
    const packet2 = await fs.readFile(
      path.join(artifactDir, "item-2-packet.md"),
      "utf8",
    );
    expect(packet2).toContain("## Prior step outcomes");
    expect(packet2).toContain("wire the base");
  }, 120_000);
});
