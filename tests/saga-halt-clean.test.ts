import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { setConfigValue } from "../src/setup/config-update-service.js";
import { Orchestrator } from "../src/core/orchestrator.js";
import { loadConfig } from "../src/project/config-loader.js";
import { resolveFlow } from "../src/flows/runtime/flow-resolver.js";
import { pickupReviewFlow } from "../src/flows/catalog/builtin-flows.js";
import { RoadmapService } from "../src/roadmap/roadmap-service.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

// Fake provider for the per-item REVIEW band (pickup-review). With
// VBS_ARBITER_SCRIPT=always-changes the arbiter returns CHANGES_REQUESTED on
// every pass, so the per-item self-heal loop is always exhausted. The
// implementer appends to the item file each pass (a real working-tree diff vs
// HEAD). In a normal run this caps-and-commits; in SAGA mode it must HALT
// cleanly (no commit, item left pending, run blocked).
const FAKE = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const counts = path.join(__dirname, 'arbiter-counts.json');
const script = process.env.VBS_ARBITER_SCRIPT || 'always-changes';
let inp = '';
process.stdin.on('data', (c) => (inp += c));
process.stdin.on('end', () => {
  const im = inp.match(/Current checklist item - (\\d+) of/);
  const n = im ? im[1] : 'x';
  const sm = inp.match(/Flow step:.*\\(([\\w-]+)\\)/);
  const id = sm ? sm[1] : '';
  if (id === 'plan' || id === 'micro-plan') {
    console.log('# Plan\\nWork the items in order.');
    return;
  }
  if (id === 'implement') {
    fs.appendFileSync('item' + n + '.txt', 'work for item ' + n + ' @ ' + Date.now() + '\\n');
    console.log('# Implementation Summary\\nImplemented checklist item ' + n + '.');
    return;
  }
  if (id === 'review-correctness') {
    console.log('# Correctness review\\nLooked at the item diff.');
    return;
  }
  if (id === 'review-security-risk') {
    console.log('# Risk review\\nLooked at the item diff.');
    return;
  }
  if (id === 'arbiter') {
    let state = {};
    try { state = JSON.parse(fs.readFileSync(counts, 'utf8')); } catch (e) {}
    const pass = (state[n] || 0) + 1;
    state[n] = pass;
    fs.writeFileSync(counts, JSON.stringify(state));
    const decision = script === 'always-changes' ? 'CHANGES_REQUESTED' : (pass === 1 ? 'CHANGES_REQUESTED' : 'APPROVED');
    console.log('# Arbiter verdict for item ' + n + ' (pass ' + pass + ')\\nMust fix: address F1.\\n\\nDECISION: ' + decision);
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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-saga-halt-"));
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
  await setConfigValue(dir, "workflow.maxReviewLoops", "1");
  return dir;
}

async function runSaga(dir: string, taskId: string, title: string) {
  const loaded = await loadConfig(dir);
  const resolved = resolveFlow({
    flow: pickupReviewFlow,
    source: { kind: "builtin", ref: "pickup-review" },
    config: loaded.config,
    task: title,
  });
  process.env.VBS_ARBITER_SCRIPT = "always-changes";
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
    delete process.env.VBS_ARBITER_SCRIPT;
  }
}

describe("saga clean halt (M1)", () => {
  it("halts cleanly when a step exhausts self-heal: no commit, step pending, run blocked", async () => {
    const dir = await makeProject();
    const svc = new RoadmapService(dir);
    await svc.init();
    const task = await svc.addTask({ title: "Build two things", kind: "saga" });
    const { item: i0 } = await svc.addChecklistItem(task.id, "create the first file");
    await svc.addChecklistItem(task.id, "create the second file");

    const out = await runSaga(dir, task.id, task.title);

    // The run ended blocked - not done, not merge_ready.
    expect(out.state.status).toBe("blocked");

    const after = await svc.getTask(task.id);
    // The failed step is left PENDING (not "done", not "blocked") so a resume
    // re-attempts it from the clean tip; the later step was never reached.
    expect(after!.checklist.map((c) => c.status)).toEqual(["pending", "pending"]);
    // No green-but-broken commit for the halted step.
    expect(after!.checklist[0]!.commitSha).toBeNull();
    // The halt is recorded on the task, naming the step it stopped at.
    expect(after!.sagaState).toBe("halted");
    expect(after!.sagaHalt?.atStepId).toBe(i0.id);
    expect(after!.sagaHalt?.reason).toBe("self-heal-exhausted");
  }, 60_000);
});
