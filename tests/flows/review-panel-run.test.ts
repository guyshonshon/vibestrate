import { describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { ApprovalService } from "../../src/core/run/approval-service.js";
import { Orchestrator, type ResumeStage } from "../../src/core/orchestrator.js";
import { resolveResumeFrom } from "../../src/core/run/run-launcher.js";
import { findFlowById } from "../../src/flows/catalog/flow-discovery.js";
import { resolveFlow } from "../../src/flows/runtime/flow-resolver.js";
import { loadConfig } from "../../src/project/config-loader.js";
import { setConfigValue } from "../../src/setup/config-update-service.js";
import { applySetup } from "../../src/setup/setup-service.js";
import type { ProviderDetectionRunner } from "../../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

// Fake provider for the panel-review flow. The three reviewers (the `reviewer`
// role) each record a start/end timestamp around a 200ms sleep, so the test can
// prove they ran CONCURRENTLY (all start before any end). The arbiter (the
// `verifier` role fills the `arbiter` seat) renders an APPROVED verdict.
const PANEL_PROVIDER = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const log = path.join(__dirname, "panel-concurrency.log");
let prompt = "";
process.stdin.on("data", (c) => (prompt += c));
process.stdin.on("end", () => {
  const role = (prompt.match(/Vibestrate Agent: (\\w+)/) || [])[1] || "";
  const stepMatch = prompt.match(/Flow step:.*\\(([\\w-]+)\\)/);
  const stepId = stepMatch ? stepMatch[1] : "";
  if (role === "reviewer") {
    fs.appendFileSync(log, JSON.stringify({ phase: "start", id: stepId, t: Date.now() }) + "\\n");
    setTimeout(() => {
      fs.appendFileSync(log, JSON.stringify({ phase: "end", id: stepId, t: Date.now() }) + "\\n");
      console.log("# Findings (" + stepId + ")\\n\\nNo blocking issues from this lens.");
    }, 400);
    return;
  }
  if (role === "verifier") { console.log("# Arbiter verdict\\n\\nDECISION: APPROVED"); return; }
  if (role === "executor") { console.log("# Implementation\\n\\nNo source change required."); return; }
  if (role === "architect") { console.log("# Architecture\\n\\nApproach described."); return; }
  if (role === "planner") { console.log("# Plan\\n\\nSteps outlined."); return; }
  console.log("# Output");
});
`;

async function makeRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-panel-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"panel"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });

  const providerPath = path.join(dir, "fake-provider.js");
  await fs.writeFile(providerPath, PANEL_PROVIDER, { mode: 0o755 });
  await fs.chmod(providerPath, 0o755);
  await setConfigValue(
    dir,
    "providers.fake",
    JSON.stringify({ type: "cli", command: "node", args: [providerPath], input: "stdin" }),
  );
  await setConfigValue(dir, "profiles.claude-balanced.provider", "fake");
  return dir;
}

type RunEvent = { type: string; data?: Record<string, unknown> };

async function runPanel(
  projectRoot: string,
  readOnly: boolean,
  resume?: { sourceRunId: string; fromStage: ResumeStage },
): Promise<{ result: Awaited<ReturnType<Orchestrator["run"]>>; events: RunEvent[] }> {
  const discovered = await findFlowById(projectRoot, "panel-review");
  const loaded = await loadConfig(projectRoot);
  const snapshot = resolveFlow({
    flow: discovered!.definition,
    source: discovered!.source,
    config: loaded.config,
    task: `Exercise the review panel ${Math.random().toString(36).slice(2, 8)}.`,
  });
  const orchestrator = new Orchestrator({
    projectRoot,
    config: loaded.config,
    rules: loaded.rules,
    task: snapshot.task,
    flow: snapshot,
    isGitRepo: true,
    readOnly,
    onProgress: () => {},
    ...(resume ? { resumeFrom: await resolveResumeFrom(projectRoot, resume) } : {}),
  });
  let approvedOnce = false;
  const interval = setInterval(async () => {
    if (approvedOnce) return;
    const runs = await fs
      .readdir(path.join(projectRoot, ".vibestrate", "runs"))
      .catch(() => []);
    const runId = runs[0];
    if (!runId) return;
    const approvals = new ApprovalService(projectRoot, runId);
    const pending = await approvals.firstPending();
    if (!pending) return;
    approvedOnce = true;
    await approvals.approve({ approvalId: pending.id });
  }, 50);
  let result: Awaited<ReturnType<Orchestrator["run"]>>;
  try {
    result = await orchestrator.run();
  } finally {
    clearInterval(interval);
  }
  const eventsRaw = await fs.readFile(
    path.join(projectRoot, ".vibestrate", "runs", result.runId, "events.ndjson"),
    "utf8",
  );
  const events = eventsRaw
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as RunEvent);
  return { result, events };
}

describe("panel-review graph flow (Slice 4 frontier scheduler)", () => {
  it("runs plan -> implement -> validate -> 3 parallel reviewers -> arbiter, reaching merge_ready", async () => {
    const projectRoot = await makeRepo();
    const { result, events } = await runPanel(projectRoot, false);

    expect(result.state.status).toBe("merge_ready");
    expect(result.state.flow?.flowId).toBe("panel-review");

    // Graph traversal happened (not the linear loop).
    expect(events.some((e) => e.type === "flow.graph.started")).toBe(true);
    expect(events.some((e) => e.type === "flow.graph.completed")).toBe(true);
    expect(events.some((e) => e.type === "flow.loop.iteration")).toBe(false);

    // A single fan-out wave of all three reviewers.
    const frontier = events.filter((e) => e.type === "flow.frontier.scheduled");
    expect(frontier).toHaveLength(1);
    expect(frontier[0]!.data?.width).toBe(3);
    expect((frontier[0]!.data?.stepIds as string[]).sort()).toEqual([
      "review-correctness",
      "review-risk",
      "review-tests",
    ]);

    // Every panel step actually started.
    const started = (id: string) =>
      events.filter((e) => e.type === "flow.step.started" && e.data?.stepId === id).length;
    for (const id of [
      "plan",
      "architecture",
      "implement",
      "validation",
      "review-correctness",
      "review-tests",
      "review-risk",
      "arbiter",
    ]) {
      expect(started(id)).toBe(1);
    }
  });

  it("actually runs the reviewers concurrently (their run intervals overlap)", async () => {
    const projectRoot = await makeRepo();
    await runPanel(projectRoot, false);
    const raw = await fs.readFile(path.join(projectRoot, "panel-concurrency.log"), "utf8");
    const marks = raw
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as { phase: "start" | "end"; id: string; t: number });
    const starts = marks.filter((m) => m.phase === "start");
    const ends = marks.filter((m) => m.phase === "end");
    expect(starts).toHaveLength(3);
    expect(ends).toHaveLength(3);
    // Concurrency proof: the maximum number of reviewers running at the same
    // instant is >= 2. We sweep the start (+1) / end (-1) timeline; at a tie we
    // process ends before starts (conservative - a sequential run, where each
    // reviewer ends exactly as the next starts, would never reach 2). Robust to
    // process-startup stagger under load in a way an absolute-timing race isn't.
    const events = [
      ...starts.map((m) => ({ t: m.t, d: 1 })),
      ...ends.map((m) => ({ t: m.t, d: -1 })),
    ].sort((a, b) => a.t - b.t || a.d - b.d);
    let live = 0;
    let maxLive = 0;
    for (const e of events) {
      live += e.d;
      maxLive = Math.max(maxLive, live);
    }
    expect(maxLive).toBeGreaterThanOrEqual(2);
  });

  it("resumes a graph flow mid-DAG: seeds the upstream prefix, re-runs the rest incl. the fan-out", async () => {
    const projectRoot = await makeRepo();

    // Source run: the full panel to merge_ready.
    const source = await runPanel(projectRoot, false);
    expect(source.result.state.status).toBe("merge_ready");

    // Resume into the SAME graph flow from "executing": plan + architecture are
    // seeded (skipped), and the frontier re-runs implement -> validation ->
    // 3-reviewer fan-out -> arbiter. (Upstream stage = no worktree snapshot
    // needed, mirroring the linear rewind tests.)
    const resumed = await runPanel(projectRoot, false, {
      sourceRunId: source.result.runId,
      fromStage: "executing",
    });

    expect(resumed.result.runId).not.toBe(source.result.runId);
    expect(resumed.result.state.status).toBe("merge_ready");
    expect(resumed.result.state.flow?.flowId).toBe("panel-review");
    expect(resumed.result.state.resumedFrom).toEqual({
      sourceRunId: source.result.runId,
      fromStage: "executing",
    });

    // plan + architecture are seeded (skipped); the rest re-run.
    const skipped = (resumed.result.state.flow?.steps ?? [])
      .filter((s) => s.status === "skipped")
      .map((s) => s.id);
    expect(skipped).toEqual(expect.arrayContaining(["plan", "architecture"]));
    expect(skipped).not.toContain("arbiter");

    // The panel still fanned out all three reviewers on resume - proving the
    // frontier honored the seeded prefix yet advanced the remaining steps.
    const frontier = resumed.events.filter(
      (e) => e.type === "flow.frontier.scheduled",
    );
    expect(frontier).toHaveLength(1);
    expect(frontier[0]!.data?.width).toBe(3);

    // The downstream steps completed; the seeded plan did not re-run this run.
    const completedIds = resumed.events
      .filter((e) => e.type === "flow.step.completed")
      .map((e) => e.data?.stepId);
    expect(completedIds).toEqual(
      expect.arrayContaining([
        "implement",
        "review-correctness",
        "review-tests",
        "review-risk",
        "arbiter",
      ]),
    );
    expect(completedIds).not.toContain("plan");
  }, 60_000);

  it("read-only run skips implement+validation but still fans out the read-only panel", async () => {
    const projectRoot = await makeRepo();
    const { result, events } = await runPanel(projectRoot, true);

    // Read-only bar = an APPROVED arbiter verdict (no verify needed).
    expect(result.state.status).toBe("merge_ready");

    const skipped = events
      .filter((e) => e.type === "flow.step.skipped" && e.data?.readOnly === true)
      .map((e) => e.data?.stepId);
    expect(new Set(skipped)).toEqual(new Set(["implement", "validation"]));

    // The panel still fanned out the three read-only reviewers.
    const frontier = events.filter((e) => e.type === "flow.frontier.scheduled");
    expect(frontier).toHaveLength(1);
    expect(frontier[0]!.data?.width).toBe(3);
  });
});
