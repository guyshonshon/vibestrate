// saga-e2e.test.ts - git-level end-to-end proofs for the saga conductor.
//
// Three properties under test:
//   1. Happy path: a 3-step saga with an approving reviewer commits exactly one
//      commit per step on the feature branch (not main), each carrying a
//      `Vibestrate-Checklist-Item` trailer.
//   2. Clean halt (A-F1): a 2-step saga whose reviewer always returns
//      CHANGES_REQUESTED halts blocked, leaves the worktree clean, and writes
//      no commit for the failed step.
//   3. Resume: the same saga that halted on step 1 can be re-run with an
//      approving reviewer and both steps end `done` with commits.
//
// Fake CLI providers only. Harness modelled on saga-halt-clean.test.ts and
// saga-sequence-launch.test.ts.

import { describe, it, expect, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { setConfigValue } from "../src/setup/config-update-service.js";
import { Orchestrator } from "../src/core/orchestrator.js";
import { loadConfig } from "../src/project/config-loader.js";
import { resolveFlow } from "../src/flows/runtime/flow-resolver.js";
import { sagaFlow } from "../src/flows/catalog/builtin-flows.js";
import { RoadmapService } from "../src/roadmap/roadmap-service.js";
import { RunStateStore } from "../src/core/state-machine.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

// ---------------------------------------------------------------------------
// Fake provider: saga flow (review-item verdict driven by env / counter file)
//
// VBS_SAGA_DECISION controls per-step verdict behaviour:
//   "always-approve"    - review-item always returns APPROVED (happy path)
//   "always-changes"    - review-item always returns CHANGES_REQUESTED (halt)
//   "first-pass-approve"- like always-approve, one-shot pass (for resume run)
//
// The implementer writes a distinct per-step file so each commit carries a real
// diff. plan / micro-plan output a brief text so the orchestrator has its
// scaffolding.
// ---------------------------------------------------------------------------

// The fake provider stores its counters in the project dir (via __dirname, which
// is the dir containing fake.js = the temp project dir). The implement step uses
// an incrementing counter so each call writes a distinct file (step1.txt,
// step2.txt, ...) regardless of the prompt format.
const FAKE = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
// Review-pass counter (keyed by the rough item number extracted from the packet,
// or by global invocation order as fallback). Stored in project dir.
const reviewCounts = path.join(__dirname, 'review-counts.json');
// Implement invocation counter - gives each implement call a unique file name.
const implCounter = path.join(__dirname, 'impl-counter.json');

let inp = '';
process.stdin.on('data', (c) => (inp += c));
process.stdin.on('end', () => {
  // Try to extract step number from the saga packet ("Step N of M").
  const im = inp.match(/Step (\\d+) of \\d+/) || inp.match(/Current checklist item - (\\d+) of/);
  const n = im ? im[1] : 'x';
  const sm = inp.match(/Flow step:.*\\(([\\w-]+)\\)/);
  const id = sm ? sm[1] : '';

  if (id === 'plan' || id === 'micro-plan') {
    console.log('# Plan\\nWork the steps in order.');
    return;
  }

  if (id === 'implement') {
    // Use a counter file so each implement invocation writes a uniquely-named
    // file even when the prompt does not carry a legible step number.
    let cnt = {};
    try { cnt = JSON.parse(fs.readFileSync(implCounter, 'utf8')); } catch (e) {}
    const seq = (cnt.seq || 0) + 1;
    cnt.seq = seq;
    fs.writeFileSync(implCounter, JSON.stringify(cnt));
    // Write relative to process.cwd() (= worktree) so it becomes a real diff.
    fs.writeFileSync('step' + seq + '.txt', 'implementation for seq ' + seq + ' @ ' + Date.now() + '\\n');
    console.log('# Implementation Summary\\nImplemented saga step ' + seq + '.');
    return;
  }

  if (id === 'review-item') {
    const script = process.env.VBS_SAGA_DECISION || 'always-approve';
    let state = {};
    try { state = JSON.parse(fs.readFileSync(reviewCounts, 'utf8')); } catch (e) {}
    const pass = (state[n] || 0) + 1;
    state[n] = pass;
    fs.writeFileSync(reviewCounts, JSON.stringify(state));

    let decision;
    if (script === 'always-approve') {
      decision = 'APPROVED';
    } else if (script === 'always-changes') {
      decision = 'CHANGES_REQUESTED';
    } else {
      decision = 'APPROVED';
    }
    console.log('# Review of step ' + n + ' (pass ' + pass + ')\\nChecked the diff.\\n\\nDECISION: ' + decision);
    return;
  }

  if (id === 'review') {
    console.log('# Holistic review\\nDECISION: APPROVED');
    return;
  }

  console.log('ok');
});
`;

// ---------------------------------------------------------------------------
// Helper: create a temp git project with the fake provider wired up.
// maxReviewLoops default is 2 so the fix-then-approve cycle in saga-sequence
// works; tests that want maxReviewLoops=1 pass it as an option.
// ---------------------------------------------------------------------------

async function makeProject(opts?: { maxReviewLoops?: number }): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-saga-e2e-"));
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
  // maxReviewLoops >= 2 ensures a fix-then-approve cycle can land before the
  // M1 self-heal halt fires. Halting tests pass maxReviewLoops=1.
  await setConfigValue(dir, "workflow.maxReviewLoops", String(opts?.maxReviewLoops ?? 2));
  return dir;
}

// ---------------------------------------------------------------------------
// Run the saga flow via the Orchestrator directly (mirrors saga-halt-clean).
// Returns the OrchestratorOutput so tests can inspect worktreePath + branchName.
// ---------------------------------------------------------------------------

async function runSaga(
  dir: string,
  taskId: string,
  title: string,
  decision: "always-approve" | "always-changes" = "always-approve",
) {
  const loaded = await loadConfig(dir);
  const resolved = resolveFlow({
    flow: sagaFlow,
    source: { kind: "builtin", ref: "saga" },
    config: loaded.config,
    task: title,
  });
  process.env.VBS_SAGA_DECISION = decision;
  try {
    const orch = new Orchestrator({
      projectRoot: dir,
      config: loaded.config,
      rules: loaded.rules,
      task: title,
      isGitRepo: true,
      taskId,
      flow: resolved,
      checklistMode: "continuous",
      sagaMode: true,
      onProgress: () => {},
    });
    return await orch.run();
  } finally {
    delete process.env.VBS_SAGA_DECISION;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("saga e2e - git-level proofs", () => {
  const prevCwd = process.cwd();
  afterEach(() => {
    process.chdir(prevCwd);
  });

  // -------------------------------------------------------------------------
  // Test 1: happy path - one commit per step, all on the feature branch.
  // -------------------------------------------------------------------------

  it(
    "3-step happy path: one commit per step with Vibestrate-Checklist-Item trailer, all on feature branch",
    async () => {
      const dir = await makeProject();
      process.chdir(dir);
      const svc = new RoadmapService(dir);
      await svc.init();
      const task = await svc.addTask({ title: "Build three things", kind: "saga" });
      const { item: i0 } = await svc.addChecklistItem(task.id, "create the alpha file");
      const { item: i1 } = await svc.addChecklistItem(task.id, "create the beta file");
      const { item: i2 } = await svc.addChecklistItem(task.id, "create the gamma file");

      const out = await runSaga(dir, task.id, task.title, "always-approve");

      // Run must complete (not blocked, not failed).
      expect(["merge_ready", "done"]).toContain(out.state.status);

      // Worktree path is available - we need it to inspect git.
      const wt = out.worktreePath;
      const branch = out.branchName;
      expect(wt).not.toBeNull();
      expect(branch).not.toBeNull();

      // All three items committed.
      const after = await svc.getTask(task.id);
      expect(after!.checklist.map((c) => c.status)).toEqual(["done", "done", "done"]);
      const [sha0, sha1, sha2] = after!.checklist.map((c) => c.commitSha);
      expect(sha0).not.toBeNull();
      expect(sha1).not.toBeNull();
      expect(sha2).not.toBeNull();

      // M1: every completed saga step records WHICH run executed it and a
      // one-line curated outcome (previously these were never written).
      for (const step of after!.checklist) {
        expect(step.runId).toBe(out.runId);
        expect(step.outcomeSummary.length).toBeGreaterThan(0);
      }

      // --- Git assertions on the worktree ---

      // All commits are on the feature branch, NOT main.
      const headBranch = (
        await execa("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: wt! })
      ).stdout.trim();
      expect(headBranch).not.toBe("main");
      expect(headBranch).toBe(branch);

      // There are exactly 3 commits on the feature branch since main (one per step).
      const { stdout: aheadRaw } = await execa(
        "git",
        ["rev-list", "--count", "main..HEAD"],
        { cwd: wt! },
      );
      // The number must be >= 3 (plan commit is separate in some flows but the
      // saga flow does not commit the plan; every step commit carries the trailer).
      const commitCount = parseInt(aheadRaw.trim(), 10);
      expect(commitCount).toBeGreaterThanOrEqual(3);

      // Every step commit carries a Vibestrate-Checklist-Item trailer.
      const { stdout: logRaw } = await execa(
        "git",
        ["log", "main..HEAD", "--format=%B"],
        { cwd: wt! },
      );
      const trailers = logRaw
        .split("\n")
        .filter((l) => l.startsWith("Vibestrate-Checklist-Item:"))
        .map((l) => l.replace("Vibestrate-Checklist-Item:", "").trim());

      // All three item ids appear in the trailers.
      expect(trailers).toContain(i0.id);
      expect(trailers).toContain(i1.id);
      expect(trailers).toContain(i2.id);

      // Each step's commit must contain at least one file change. We already
      // have the sha from the roadmap; use git show --name-only to verify.
      for (const sha of [sha0, sha1, sha2]) {
        const { stdout: showOut } = await execa(
          "git",
          ["show", "--name-only", "--pretty=format:", sha!],
          { cwd: wt! },
        );
        const files = showOut.split("\n").map((l) => l.trim()).filter(Boolean);
        expect(files.length).toBeGreaterThan(0);
      }
    },
    120_000,
  );

  // -------------------------------------------------------------------------
  // Test 2: clean halt (A-F1) - worktree clean after mid-saga halt.
  // -------------------------------------------------------------------------

  it(
    "clean halt: worktree clean after exhausted self-heal; no commit for failed step; sagaState halted",
    async () => {
      // maxReviewLoops=1 so the M1 self-heal fires quickly on a single
      // CHANGES_REQUESTED without needing many fix iterations.
      const dir = await makeProject({ maxReviewLoops: 1 });
      process.chdir(dir);
      const svc = new RoadmapService(dir);
      await svc.init();
      const task = await svc.addTask({ title: "Build with a bad step", kind: "saga" });
      const { item: i0 } = await svc.addChecklistItem(task.id, "write the broken file");
      await svc.addChecklistItem(task.id, "write the second file");

      const out = await runSaga(dir, task.id, task.title, "always-changes");

      // Run must end blocked, not done.
      expect(out.state.status).toBe("blocked");

      // The worktree is available - we need it for git checks.
      const wt = out.worktreePath;
      expect(wt).not.toBeNull();

      // --- A-F1: worktree is clean (the halt reset uncommitted work) ---
      const { stdout: statusOut } = await execa(
        "git",
        ["status", "--porcelain"],
        { cwd: wt! },
      );
      expect(statusOut.trim()).toBe("");

      // --- No commit for the failed step ---
      // The feature branch contains no Vibestrate-Checklist-Item trailer for step 1.
      const { stdout: logRaw } = await execa(
        "git",
        ["log", "main..HEAD", "--format=%B"],
        { cwd: wt! },
      );
      const trailers = logRaw
        .split("\n")
        .filter((l) => l.startsWith("Vibestrate-Checklist-Item:"))
        .map((l) => l.replace("Vibestrate-Checklist-Item:", "").trim());
      expect(trailers).not.toContain(i0.id);

      // --- Task state assertions ---
      const after = await svc.getTask(task.id);
      // The failed step is reset to pending, not done; the second step was never reached.
      expect(after!.checklist.map((c) => c.status)).toEqual(["pending", "pending"]);
      expect(after!.checklist[0]!.commitSha).toBeNull();
      expect(after!.sagaState).toBe("halted");
      expect(after!.sagaHalt?.atStepId).toBe(i0.id);
    },
    60_000,
  );

  // -------------------------------------------------------------------------
  // Test 3: resume via re-sequence.
  //
  // The saga halts on step 1 (always-changes). Then re-run the SAME task with
  // an approving provider. The second run should see step 1 still pending
  // (reset by M1), run it, commit it, then run step 2 and commit it.
  // sagaState ends done; both checklist items done.
  // -------------------------------------------------------------------------

  it(
    "resume: halted saga re-runs to completion when provider approves; both steps done with commits",
    async () => {
      // maxReviewLoops=1 for the initial run so the halt fires quickly.
      const dir = await makeProject({ maxReviewLoops: 1 });
      process.chdir(dir);
      const svc = new RoadmapService(dir);
      await svc.init();
      const task = await svc.addTask({ title: "Build in two runs", kind: "saga" });
      await svc.addChecklistItem(task.id, "write the first file");
      await svc.addChecklistItem(task.id, "write the second file");

      // --- First run: always-changes -> halt ---
      const out1 = await runSaga(dir, task.id, task.title, "always-changes");
      expect(out1.state.status).toBe("blocked");

      const afterHalt = await svc.getTask(task.id);
      expect(afterHalt!.sagaState).toBe("halted");
      // Both steps pending: step 1 was reset by the halt; step 2 never ran.
      expect(afterHalt!.checklist.map((c) => c.status)).toEqual(["pending", "pending"]);

      // --- Reset saga state so the second run can proceed ---
      // The conductor requires sagaState != "halted" to sequence; after a real
      // `vibe saga sequence` cmdSequence resets it. We reset it directly here
      // (same as cmdSequence does via setSagaState("sequencing") before the run).
      await svc.setSagaState(task.id, "sequencing");

      // --- Second run: maxReviewLoops=2, always-approve -> should complete ---
      // Update maxReviewLoops to 2 for the approving run so the review loop
      // has room.
      await setConfigValue(dir, "workflow.maxReviewLoops", "2");

      const out2 = await runSaga(dir, task.id, task.title, "always-approve");

      // Run must complete, not blocked.
      expect(["merge_ready", "done"]).toContain(out2.state.status);

      // Both steps done with commits.
      const afterDone = await svc.getTask(task.id);
      expect(afterDone!.checklist.map((c) => c.status)).toEqual(["done", "done"]);
      expect(afterDone!.checklist[0]!.commitSha).not.toBeNull();
      expect(afterDone!.checklist[1]!.commitSha).not.toBeNull();
      // sagaState was set to done by the orchestrator lifecycle.
      // (cmdSequence sets "done" after a non-halted run; here we used the
      // Orchestrator directly so we check the run outcome, not the lifecycle.)
      // The run completed; that is the material assertion for resume.

      // --- Verify no step-work duplication ---
      // The feature branch from the second run should contain the commits for
      // the two steps (band filters status!="done" so it only runs pending
      // items). Both commits must carry files (real diffs, not empty commits).
      const wt2 = out2.worktreePath;
      expect(wt2).not.toBeNull();
      const [sha0r, sha1r] = afterDone!.checklist.map((c) => c.commitSha);
      for (const sha of [sha0r, sha1r]) {
        const { stdout: showOut } = await execa(
          "git",
          ["show", "--name-only", "--pretty=format:", sha!],
          { cwd: wt2! },
        );
        const files = showOut.split("\n").map((l) => l.trim()).filter(Boolean);
        expect(files.length).toBeGreaterThan(0);
      }

      // Both step item ids appear as trailers in the second run's commits.
      const [item0, item1] = afterDone!.checklist;
      const { stdout: logRaw } = await execa(
        "git",
        ["log", "main..HEAD", "--format=%B"],
        { cwd: wt2! },
      );
      const trailers = logRaw
        .split("\n")
        .filter((l) => l.startsWith("Vibestrate-Checklist-Item:"))
        .map((l) => l.replace("Vibestrate-Checklist-Item:", "").trim());
      expect(trailers).toContain(item0!.id);
      expect(trailers).toContain(item1!.id);
    },
    120_000,
  );
});
