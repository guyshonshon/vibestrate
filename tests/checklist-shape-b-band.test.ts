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
import { runChecklistItemArbitrationPath } from "../src/utils/paths.js";
import {
  collectPerItemVerdicts,
} from "../src/flows/runtime/per-item-verdicts.js";
import { flowArbitrationLedgerSchema } from "../src/flows/runtime/flow-arbitration.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

// Fake provider for the per-item REVIEW band (Shape B, pickup-review). Scenario
// is injected via VBS_ARBITER_SCRIPT:
//   "fix-then-approve": item 0 (and any item) returns CHANGES_REQUESTED on the
//        first arbiter pass for that item, APPROVED after. (One fix iteration.)
//   "always-changes": every arbiter pass returns CHANGES_REQUESTED (the
//        cap-and-continue case).
// The arbiter counts its passes PER ITEM in a JSON file so it can flip its
// verdict between the fix loop's iterations. The implementer rewrites the
// item's file every pass (a real working-tree diff vs HEAD each time). All
// other steps emit short prose. The holistic `review` (outside the band)
// approves.
const FAKE = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const counts = path.join(__dirname, 'arbiter-counts.json');
const script = process.env.VBS_ARBITER_SCRIPT || 'fix-then-approve';
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
    // A fresh line every writer pass -> a non-empty diff vs HEAD on each pass.
    fs.appendFileSync('item' + n + '.txt', 'work for item ' + n + ' @ ' + Date.now() + '\\n');
    console.log('# Implementation Summary\\nImplemented checklist item ' + n + '.');
    return;
  }
  if (id === 'review-correctness') {
    console.log('# Correctness review\\nLooked at the item diff. Same id F1 referenced.');
    return;
  }
  if (id === 'review-security-risk') {
    console.log('# Risk review\\nLooked at the item diff. Same id F1 referenced.');
    return;
  }
  if (id === 'arbiter') {
    let state = {};
    try { state = JSON.parse(fs.readFileSync(counts, 'utf8')); } catch (e) {}
    const pass = (state[n] || 0) + 1;
    state[n] = pass;
    fs.writeFileSync(counts, JSON.stringify(state));
    let decision;
    if (script === 'always-changes') {
      decision = 'CHANGES_REQUESTED';
    } else {
      decision = pass === 1 ? 'CHANGES_REQUESTED' : 'APPROVED';
    }
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
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "vibestrate-shape-b-band-"),
  );
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
    JSON.stringify({
      type: "cli",
      command: "node",
      args: [fakeJs],
      input: "stdin",
    }),
  );
  await setConfigValue(dir, "profiles.claude-balanced.provider", "fake");
  return dir;
}

type RunEvent = { type: string; data?: Record<string, unknown> };

async function readEvents(dir: string, runId: string): Promise<RunEvent[]> {
  const raw = await fs.readFile(
    path.join(dir, ".vibestrate", "runs", runId, "events.ndjson"),
    "utf8",
  );
  return raw
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as RunEvent);
}

// Read the per-item summary artifact's review fields (the durable outcome
// surface: reviewVerdict / open findings / fix iterations are stamped there).
async function readItemSummaryFields(
  dir: string,
  runId: string,
  itemIndex: number,
): Promise<{
  reviewVerdict: string | null;
  openFindings: number | null;
  fixIterations: number | null;
}> {
  const body = await fs.readFile(
    path.join(
      dir,
      ".vibestrate",
      "runs",
      runId,
      "artifacts",
      "flows",
      "checklist",
      `item-${itemIndex + 1}-summary.md`,
    ),
    "utf8",
  );
  const v = body.match(/^- review: (\S+)$/m);
  const f = body.match(/^- open findings: (\d+)$/m);
  const it = body.match(/^- fix iterations: (\d+)$/m);
  return {
    reviewVerdict: v ? v[1]! : null,
    openFindings: f ? Number(f[1]) : null,
    fixIterations: it ? Number(it[1]) : null,
  };
}

async function runPickupReview(input: {
  dir: string;
  taskId: string;
  title: string;
  script: "fix-then-approve" | "always-changes";
  globalMaxReviewLoops?: number;
}) {
  if (input.globalMaxReviewLoops !== undefined) {
    await setConfigValue(
      input.dir,
      "workflow.maxReviewLoops",
      String(input.globalMaxReviewLoops),
    );
  }
  const loaded = await loadConfig(input.dir);
  const resolved = resolveFlow({
    flow: pickupReviewFlow,
    source: { kind: "builtin", ref: "pickup-review" },
    config: loaded.config,
    task: input.title,
  });
  const prevScript = process.env.VBS_ARBITER_SCRIPT;
  process.env.VBS_ARBITER_SCRIPT = input.script;
  try {
    const orch = new Orchestrator({
      projectRoot: input.dir,
      config: loaded.config,
      rules: loaded.rules,
      task: input.title,
      isGitRepo: true,
      taskId: input.taskId,
      flow: resolved,
      checklistMode: "continuous",
      onProgress: () => {},
    });
    return await orch.run();
  } finally {
    if (prevScript === undefined) delete process.env.VBS_ARBITER_SCRIPT;
    else process.env.VBS_ARBITER_SCRIPT = prevScript;
  }
}

describe("pickup-review per-item band (Shape B)", () => {
  it("records a per-item ledger per item, no run-global collision", async () => {
    const dir = await makeProject();
    const svc = new RoadmapService(dir);
    await svc.init();
    const task = await svc.addTask({ title: "Build two things" });
    await svc.addChecklistItem(task.id, "create the first file");
    await svc.addChecklistItem(task.id, "create the second file");

    const out = await runPickupReview({
      dir,
      taskId: task.id,
      title: task.title,
      script: "fix-then-approve",
    });

    // Both items committed.
    const after = await svc.getTask(task.id);
    expect(after!.checklist.map((c) => c.status)).toEqual(["done", "done"]);

    // Each item has its OWN arbitration ledger file with its own decision.
    const p0 = runChecklistItemArbitrationPath(dir, out.runId, 0);
    const p1 = runChecklistItemArbitrationPath(dir, out.runId, 1);
    const l0 = flowArbitrationLedgerSchema.parse(
      JSON.parse(await fs.readFile(p0, "utf8")),
    );
    const l1 = flowArbitrationLedgerSchema.parse(
      JSON.parse(await fs.readFile(p1, "utf8")),
    );
    expect(l0.decision?.output.recommendation).toBe("merge-ready");
    expect(l1.decision?.output.recommendation).toBe("merge-ready");

    // collectPerItemVerdicts reads each per-item ledger.
    const verdicts = await collectPerItemVerdicts({
      projectRoot: dir,
      runId: out.runId,
      itemCount: 2,
    });
    expect(verdicts[0]).toMatchObject({ itemIndex: 0, verdict: "approved" });
    expect(verdicts[1]!.verdict).toBeDefined();
    expect(verdicts[1]!.verdict).not.toBe("none");

    // The run-global arbitration.json is the holistic postlude's, NOT the band's.
    const globalLedger = flowArbitrationLedgerSchema.parse(
      JSON.parse(
        await fs.readFile(
          path.join(dir, ".vibestrate", "runs", out.runId, "arbitration.json"),
          "utf8",
        ),
      ),
    );
    // Holistic `review` step recorded the run-level decision (its stepId), not
    // the per-item arbiter's.
    expect(globalLedger.decision?.sourceStepId).not.toBe("arbiter");
  }, 60_000);

  it("runs a bounded per-item fix loop (CHANGES_REQUESTED then APPROVED)", async () => {
    const dir = await makeProject();
    const svc = new RoadmapService(dir);
    await svc.init();
    const task = await svc.addTask({ title: "One thing" });
    await svc.addChecklistItem(task.id, "create the only file");

    const out = await runPickupReview({
      dir,
      taskId: task.id,
      title: task.title,
      script: "fix-then-approve",
      globalMaxReviewLoops: 2,
    });

    const fields = await readItemSummaryFields(dir, out.runId, 0);
    expect(fields.reviewVerdict).toBe("approved");
    expect(fields.fixIterations).toBeGreaterThanOrEqual(1);

    const events = await readEvents(dir, out.runId);
    const reviews = events.filter(
      (e) => e.type === "flow.checklist.item.review",
    );
    // More than one review pass for the single item (the fix loop re-reviewed).
    expect(reviews.length).toBeGreaterThan(1);
  }, 60_000);

  it("caps and continues: always-CHANGES_REQUESTED still commits all items", async () => {
    const dir = await makeProject();
    const svc = new RoadmapService(dir);
    await svc.init();
    const task = await svc.addTask({ title: "Two things" });
    await svc.addChecklistItem(task.id, "create the first file");
    await svc.addChecklistItem(task.id, "create the second file");

    const out = await runPickupReview({
      dir,
      taskId: task.id,
      title: task.title,
      script: "always-changes",
      globalMaxReviewLoops: 1,
    });

    // The band still reached AND committed both items - it did NOT abort.
    expect(out.state.checklistProgress?.completed).toBe(2);
    const after = await svc.getTask(task.id);
    expect(after!.checklist.map((c) => c.status)).toEqual(["done", "done"]);

    const fields0 = await readItemSummaryFields(dir, out.runId, 0);
    expect(fields0.reviewVerdict).toBe("changes_requested");
  }, 60_000);
});
