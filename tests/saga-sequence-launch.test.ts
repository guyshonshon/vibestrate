import { describe, it, expect, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { setConfigValue } from "../src/setup/config-update-service.js";
import { loadConfig } from "../src/project/config-loader.js";
import { RoadmapService } from "../src/roadmap/roadmap-service.js";
import { cmdSequence } from "../src/cli/commands/saga.js";
import { acquireTaskLock, releaseTaskLock } from "../src/core/run-lock.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

// Fake provider for the SAGA flow (single per-item reviewer `review-item`, no
// arbiter panel). fix-then-approve: the per-item reviewer returns
// CHANGES_REQUESTED on the first pass for an item and APPROVED on the second, so
// each step takes exactly one fix iteration and then commits. The holistic
// `review` (outside the band) approves. The implementer rewrites the item file
// each pass (a real working-tree diff vs HEAD).
const FAKE = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const counts = path.join(__dirname, 'review-counts.json');
let inp = '';
process.stdin.on('data', (c) => (inp += c));
process.stdin.on('end', () => {
  const im = inp.match(/Current checklist item - (\\d+) of/);
  const n = im ? im[1] : 'x';
  const sm = inp.match(/Flow step:.*\\(([\\w-]+)\\)/);
  const id = sm ? sm[1] : '';
  if (id === 'plan' || id === 'micro-plan') {
    console.log('# Plan\\nWork the steps in order.');
    return;
  }
  if (id === 'implement') {
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
    let dec = 'APPROVED';
    try { dec = (fs.readFileSync(path.join(__dirname, 'holistic-decision.txt'), 'utf8').trim() || 'APPROVED'); } catch (e) {}
    console.log('# Holistic review\\nDECISION: ' + dec);
    return;
  }
  console.log('ok');
});
`;

async function makeProject(opts?: { holisticDecision?: string }): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-saga-seq-"));
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
  // The fake's holistic `review` reads its verdict from this file (defaults to
  // APPROVED when absent), so a test can force the run to end blocked.
  if (opts?.holisticDecision) {
    await fs.writeFile(path.join(dir, "holistic-decision.txt"), opts.holisticDecision);
  }
  await setConfigValue(
    dir,
    "providers.fake",
    JSON.stringify({ type: "cli", command: "node", args: [fakeJs], input: "stdin" }),
  );
  await setConfigValue(dir, "profiles.claude-balanced.provider", "fake");
  // M4: a passing per-item review needs >= 2 loops, else the M1 self-heal halt
  // can fire on the first CHANGES_REQUESTED before the fix-then-approve reviewer
  // reaches APPROVED.
  await setConfigValue(dir, "workflow.maxReviewLoops", "2");
  return dir;
}

describe("vibe saga sequence (launch)", () => {
  const prevCwd = process.cwd();
  afterEach(() => {
    process.chdir(prevCwd);
  });

  it("runs a 2-step saga to done: both steps committed, run non-blocked, sagaState done", async () => {
    const dir = await makeProject();
    const svc = new RoadmapService(dir);
    await svc.init();
    const task = await svc.addTask({ title: "Build two things", kind: "saga" });
    await svc.addChecklistItem(task.id, "create the first file");
    await svc.addChecklistItem(task.id, "create the second file");

    // The command resolves the project from process.cwd().
    process.chdir(dir);
    const code = await cmdSequence(task.id, { json: true });

    // A clean saga ends merge_ready -> exit 0 (not 2 = run failure, not a halt).
    expect(code).toBe(0);

    const after = await svc.getTask(task.id);
    // Both steps ran to completion and committed - no halt.
    expect(after!.checklist.map((c) => c.status)).toEqual(["done", "done"]);
    expect(after!.checklist[0]!.commitSha).not.toBeNull();
    expect(after!.checklist[1]!.commitSha).not.toBeNull();
    // The conductor flipped the lifecycle to done (and never to halted).
    expect(after!.sagaState).toBe("done");
    expect(after!.sagaHalt).toBeNull();
  }, 90_000);

  it("a lock-rejected sequence is a state no-op: never marks the saga done", async () => {
    // Concurrency: another run already holds this task's lock (a LIVE holder -
    // this test's own pid, no terminal state.json, so it is never reclaimed).
    // cmdSequence's run must fail fast (TaskLockedError -> exit 1) WITHOUT
    // claiming any terminal outcome on the (possibly still-running) saga.
    const dir = await makeProject();
    const svc = new RoadmapService(dir);
    await svc.init();
    const task = await svc.addTask({ title: "Already running", kind: "saga" });
    await svc.addChecklistItem(task.id, "do a thing");

    const lock = await acquireTaskLock(dir, task.id, "other-live-run");
    try {
      process.chdir(dir);
      const code = await cmdSequence(task.id, { json: true });
      // The run never started; a lock rejection is a non-zero failure, NOT a
      // clean completion.
      expect(code).toBe(1);
      const after = await svc.getTask(task.id);
      // The bug: cmdSequence stamped "done" (and printed "Saga done") whenever
      // the saga was not "halted", ignoring that the run never ran.
      expect(after!.sagaState).not.toBe("done");
      expect(after!.sagaHalt).toBeNull();
    } finally {
      await releaseTaskLock(lock);
    }
  }, 30_000);

  it("a run that ends blocked (holistic review) is recorded as halted, not done", async () => {
    // Every step passes per-item review and commits, but the holistic review
    // blocks. The run ends `blocked` with no step-level halt - the orchestrator
    // records nothing. cmdSequence must NOT relabel this "done"; it records a
    // clean halt so the lifecycle is honest + resumable.
    const dir = await makeProject({ holisticDecision: "CHANGES_REQUESTED" });
    const svc = new RoadmapService(dir);
    await svc.init();
    const task = await svc.addTask({ title: "Blocks at the end", kind: "saga" });
    await svc.addChecklistItem(task.id, "create the only file");

    process.chdir(dir);
    const code = await cmdSequence(task.id, { json: true });

    const after = await svc.getTask(task.id);
    // The step committed, but the run is blocked - not a clean completion.
    expect(after!.sagaState).not.toBe("done");
    expect(after!.sagaState).toBe("halted");
    expect(after!.sagaHalt).not.toBeNull();
    // A halt is a reportable outcome, not a tool failure (exit 0); only a thrown
    // run (exit 2) propagates.
    expect(code).toBe(0);
  }, 90_000);

  it("rejects sequencing a non-saga task and a saga with no steps", async () => {
    const dir = await makeProject();
    const svc = new RoadmapService(dir);
    await svc.init();
    const single = await svc.addTask({ title: "Just one", kind: "single" });
    const emptySaga = await svc.addTask({ title: "Empty saga", kind: "saga" });

    process.chdir(dir);
    expect(await cmdSequence(single.id, {})).toBe(1);
    expect(await cmdSequence(emptySaga.id, {})).toBe(1);
    expect(await cmdSequence("nope-does-not-exist", {})).toBe(1);

    // A rejected pre-flight never touches the lifecycle.
    const after = await svc.getTask(emptySaga.id);
    expect(after!.sagaState).toBe("idle");
  }, 30_000);
});
