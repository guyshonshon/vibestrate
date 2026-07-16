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
import { MetricsStore } from "../src/core/metrics-store.js";
import { makeEmptyMetrics, type RoleMetrics } from "../src/core/runtime-metrics.js";
import {
  computeRunSpendUsd,
  checkSagaStopConditions,
} from "../src/core/saga/budget.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

// ─── Unit: checkSagaStopConditions (pure) ───────────────────────────────────
describe("checkSagaStopConditions", () => {
  const cases: Array<{
    name: string;
    spentUsd: number;
    stepsCompleted: number;
    budget: { maxSpendUsd: number | null; maxSteps: number | null };
    halt: boolean;
    reasonMatch?: RegExp;
  }> = [
    {
      name: "both null -> no halt",
      spentUsd: 999,
      stepsCompleted: 999,
      budget: { maxSpendUsd: null, maxSteps: null },
      halt: false,
    },
    {
      name: "under maxSpendUsd -> no halt",
      spentUsd: 4.0,
      stepsCompleted: 1,
      budget: { maxSpendUsd: 5.0, maxSteps: null },
      halt: false,
    },
    {
      name: "over maxSpendUsd -> halt",
      spentUsd: 6.0,
      stepsCompleted: 1,
      budget: { maxSpendUsd: 5.0, maxSteps: null },
      halt: true,
      reasonMatch: /budget/i,
    },
    {
      name: "exact-equal maxSpendUsd -> halt (>=)",
      spentUsd: 5.0,
      stepsCompleted: 1,
      budget: { maxSpendUsd: 5.0, maxSteps: null },
      halt: true,
      reasonMatch: /budget/i,
    },
    {
      name: "under maxSteps -> no halt",
      spentUsd: 0,
      stepsCompleted: 1,
      budget: { maxSpendUsd: null, maxSteps: 2 },
      halt: false,
    },
    {
      name: "over maxSteps -> halt",
      spentUsd: 0,
      stepsCompleted: 3,
      budget: { maxSpendUsd: null, maxSteps: 2 },
      halt: true,
      reasonMatch: /max steps/i,
    },
    {
      name: "exact-equal maxSteps -> halt (>=)",
      spentUsd: 0,
      stepsCompleted: 2,
      budget: { maxSpendUsd: null, maxSteps: 2 },
      halt: true,
      reasonMatch: /max steps/i,
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const res = checkSagaStopConditions({
        spentUsd: c.spentUsd,
        stepsCompleted: c.stepsCompleted,
        budget: c.budget,
      });
      expect(res.halt).toBe(c.halt);
      if (c.halt) {
        expect(res.reason).not.toBeNull();
        if (c.reasonMatch) expect(res.reason!).toMatch(c.reasonMatch);
      } else {
        expect(res.reason).toBeNull();
      }
    });
  }

  it("spend cap is checked before step cap when both trip", () => {
    const res = checkSagaStopConditions({
      spentUsd: 10,
      stepsCompleted: 10,
      budget: { maxSpendUsd: 5, maxSteps: 2 },
    });
    expect(res.halt).toBe(true);
    expect(res.reason!).toMatch(/budget/i);
  });
});

// ─── Unit: computeRunSpendUsd reads the run metrics total ────────────────────
describe("computeRunSpendUsd", () => {
  it("returns the run's totalCostUsd summed from role metrics", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-runspend-"));
    const runId = "run-spend-1";
    const store = new MetricsStore(dir, runId);
    await store.write(
      makeEmptyMetrics({ runId, task: "t", startedAt: new Date().toISOString() }),
    );
    const role = (over: Partial<RoleMetrics>): RoleMetrics => ({
      roleId: "executor",
      stageId: "execute",
      providerId: "fake",
      providerType: "cli",
      command: "node",
      args: [],
      cwd: dir,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      durationMs: 1,
      exitCode: 0,
      sessionId: null,
      flowSeat: null,
      flowContextMode: null,
      flowContextFallbackReason: null,
      model: "m",
      totalCostUsd: 1.25,
      perModelCost: [],
      tokenUsage: null,
      toolCallCount: null,
      internalsAvailable: false,
      tools: [],
      subAgents: [],
      filesChangedBefore: null,
      filesChangedAfter: null,
      diffInsertionsAfter: null,
      diffDeletionsAfter: null,
      validationSummary: null,
      reviewDecision: null,
      verificationDecision: null,
      skillsAttached: [],
      skillsRequested: [],
      notes: [],
      ...over,
    });
    await store.appendRoleMetrics(role({ roleId: "executor", totalCostUsd: 1.25 }));
    await store.appendRoleMetrics(
      role({
        roleId: "reviewer",
        startedAt: new Date(Date.now() + 1).toISOString(),
        totalCostUsd: 0.75,
      }),
    );

    const spent = await computeRunSpendUsd(store);
    expect(spent).toBeCloseTo(2.0, 5);
  });

  it("returns 0 when no metrics exist", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-runspend-0-"));
    const store = new MetricsStore(dir, "missing-run");
    expect(await computeRunSpendUsd(store)).toBe(0);
  });
});

// ─── Integration: maxSteps halts a saga between steps ────────────────────────
// fix-then-approve arbiter: pass 1 = CHANGES_REQUESTED, pass 2 = APPROVED. With
// maxReviewLoops=1 the implementer gets a second pass, the arbiter approves, the
// step commits clean. Each step thus completes. With sagaBudget.maxSteps below
// the item count, the conductor halts AFTER a clean step (keeping its commit).
const FAKE = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const counts = path.join(__dirname, 'arbiter-counts.json');
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
    const decision = pass === 1 ? 'CHANGES_REQUESTED' : 'APPROVED';
    console.log('# Arbiter verdict for item ' + n + ' (pass ' + pass + ')\\nDECISION: ' + decision);
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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-saga-budget-"));
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
  // 2 review passes per item: pass 1 = CHANGES_REQUESTED (one fix attempt),
  // pass 2 = APPROVED, so each step passes review and commits clean.
  await setConfigValue(dir, "workflow.maxReviewLoops", "2");
  return dir;
}

async function runSaga(
  dir: string,
  taskId: string,
  title: string,
  sagaBudget: { maxSpendUsd: number | null; maxSteps: number | null },
) {
  const loaded = await loadConfig(dir);
  const resolved = resolveFlow({
    flow: pickupReviewFlow,
    source: { kind: "builtin", ref: "pickup-review" },
    config: loaded.config,
    task: title,
  });
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
    sagaBudget,
    onProgress: () => {},
  });
  return await orch.run();
}

describe("saga per-saga budget (M4)", () => {
  it("maxSteps halts the saga between steps: items 1-2 done+committed, item 3 pending, run blocked", async () => {
    const dir = await makeProject();
    const svc = new RoadmapService(dir);
    await svc.init();
    const task = await svc.addTask({ title: "Build three things", runMode: "supervised" });
    await svc.addChecklistItem(task.id, "create the first file");
    await svc.addChecklistItem(task.id, "create the second file");
    await svc.addChecklistItem(task.id, "create the third file");

    const out = await runSaga(dir, task.id, task.title, {
      maxSpendUsd: null,
      maxSteps: 2,
    });

    expect(out.state.status).toBe("blocked");

    const after = await svc.getTask(task.id);
    const statuses = after!.checklist.map((c) => c.status);
    expect(statuses).toEqual(["done", "done", "pending"]);
    // The two completed steps kept their commits (budget halt does NOT reset).
    expect(after!.checklist[0]!.commitSha).not.toBeNull();
    expect(after!.checklist[1]!.commitSha).not.toBeNull();
    expect(after!.checklist[2]!.commitSha).toBeNull();
    // The halt is recorded, naming the last completed step, with a max-steps reason.
    expect(after!.supervised.state).toBe("halted");
    expect(after!.supervised.halt?.reason ?? "").toMatch(/max steps/i);
    expect(after!.supervised.halt?.atStepId).toBe(after!.checklist[1]!.id);
  }, 60_000);
});
