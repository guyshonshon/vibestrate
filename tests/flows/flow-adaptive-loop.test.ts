import { describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { ApprovalService } from "../../src/core/approval-service.js";
import { Orchestrator } from "../../src/core/orchestrator.js";
import { flowDefinitionSchema } from "../../src/flows/schemas/flow-schema.js";
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

// A minimal looping flow: implement → (review → fix)* → summary. The body is
// [review, fix] with the review-turn as the head decisionStep, so a review
// that isn't CHANGES_REQUESTED exits to `summary` without running `fix` again.
const loopingFlow = flowDefinitionSchema.parse({
  id: "looping",
  version: 1,
  label: "Looping",
  description: "Exercises the adaptive review→fix loop in the flow runner.",
  slots: {
    builder: { label: "Builder", defaultRole: "executor" },
    reviewer: { label: "Reviewer", defaultRole: "reviewer" },
    arbiter: { label: "Arbiter", defaultRole: "verifier" },
  },
  steps: [
    {
      id: "implement",
      label: "Implement",
      kind: "agent-turn",
      slot: "builder",
      roleId: "executor",
      inputs: ["task-brief"],
      outputs: ["execution", "diff"],
    },
    {
      id: "review",
      label: "Review",
      kind: "review-turn",
      slot: "reviewer",
      roleId: "reviewer",
      inputs: ["execution", "diff"],
      outputs: ["findings", "review-decision"],
    },
    {
      id: "fix",
      label: "Fix",
      kind: "response-turn",
      slot: "builder",
      roleId: "fixer",
      inputs: ["findings", "diff"],
      outputs: ["diff"],
    },
    {
      id: "summary",
      label: "Summary",
      kind: "summary-turn",
      slot: "arbiter",
      roleId: "verifier",
      inputs: ["execution", "review-decision"],
      outputs: ["decision-summary"],
    },
  ],
  loop: { from: "review", to: "fix", decisionStep: "review", maxIterations: 3 },
});

// Fake provider: the reviewer asks for changes on its first turn and approves
// after that (tracked via a counter file), so the loop runs exactly one fix.
async function makeLoopRepo(reviewerScript: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "amaco-flow-loop-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"flow-loop"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });

  const providerPath = path.join(dir, "fake-loop-provider.js");
  await fs.writeFile(providerPath, reviewerScript, { mode: 0o755 });
  await fs.chmod(providerPath, 0o755);
  await setConfigValue(
    dir,
    "providers.fake",
    JSON.stringify({
      type: "cli",
      command: "node",
      args: [providerPath],
      input: "stdin",
    }),
  );
  for (const role of ["planner", "architect", "executor", "fixer", "reviewer", "verifier"]) {
    await setConfigValue(dir, `roles.${role}.provider`, "fake");
  }
  return dir;
}

const REVIEWER_SCRIPT = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const counter = path.join(__dirname, "review-counter.txt");
let prompt = "";
process.stdin.on("data", (chunk) => (prompt += chunk));
process.stdin.on("end", () => {
  if (prompt.includes("Amaco Agent: reviewer")) {
    let n = 0;
    try { n = parseInt(fs.readFileSync(counter, "utf8"), 10) || 0; } catch {}
    n += 1;
    fs.writeFileSync(counter, String(n));
    console.log("# Review\\n\\nDECISION: " + (n === 1 ? "CHANGES_REQUESTED" : "APPROVED"));
  } else if (prompt.includes("Amaco Agent: verifier")) {
    console.log("# Summary\\n\\nVERIFICATION: PASSED");
  } else if (prompt.includes("Amaco Agent: fixer")) {
    console.log("# Fix\\n\\nAddressed the finding.");
  } else if (prompt.includes("Amaco Agent: executor")) {
    console.log("# Implementation\\n\\nNo source change required.");
  } else {
    console.log("# Output");
  }
});
`;

async function readEvents(projectRoot: string, runId: string): Promise<{ type: string; data?: Record<string, unknown> }[]> {
  const file = path.join(projectRoot, ".amaco", "runs", runId, "events.ndjson");
  const raw = await fs.readFile(file, "utf8");
  return raw
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

describe("Flow adaptive loop execution (D2 phase B-3a)", () => {
  it("re-runs the body until the review approves, then exits to the post-loop step", async () => {
    const projectRoot = await makeLoopRepo(REVIEWER_SCRIPT);
    const loaded = await loadConfig(projectRoot);
    const snapshot = resolveFlow({
      flow: loopingFlow,
      source: { kind: "fixture", ref: loopingFlow.id },
      config: loaded.config,
      task: "Exercise the adaptive loop.",
    });

    const orchestrator = new Orchestrator({
      projectRoot,
      config: loaded.config,
      rules: loaded.rules,
      task: snapshot.task,
      flow: snapshot,
      isGitRepo: true,
      onProgress: () => {},
    });
    // Defensive: auto-approve any policy approval so the run can't hang.
    let approvedOnce = false;
    const interval = setInterval(async () => {
      if (approvedOnce) return;
      const runs = await fs
        .readdir(path.join(projectRoot, ".amaco", "runs"))
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

    expect(result.state.status).toBe("merge_ready");

    const events = await readEvents(projectRoot, result.runId);
    // Two loop passes: review(CHANGES_REQUESTED) → fix → review(APPROVED) → exit.
    const iterations = events.filter((e) => e.type === "flow.loop.iteration");
    expect(iterations.length).toBe(2);

    const decisions = events.filter((e) => e.type === "flow.loop.decision");
    expect(decisions.map((e) => e.data?.decision)).toEqual([
      "CHANGES_REQUESTED",
      "APPROVED",
    ]);
    expect(decisions.map((e) => e.data?.continuing)).toEqual([true, false]);

    // `fix` ran exactly once (only after the first, change-requesting review).
    const fixStarts = events.filter(
      (e) => e.type === "flow.step.started" && e.data?.stepId === "fix",
    );
    expect(fixStarts.length).toBe(1);

    // The post-loop summary ran after the loop exited.
    const summaryStarts = events.filter(
      (e) => e.type === "flow.step.started" && e.data?.stepId === "summary",
    );
    expect(summaryStarts.length).toBe(1);
  });

  it("stops at maxIterations when the review keeps requesting changes (blocks)", async () => {
    // Reviewer always asks for changes → the loop runs maxIterations passes
    // then exits with the run blocked.
    const alwaysChanges = REVIEWER_SCRIPT.replace(
      'n === 1 ? "CHANGES_REQUESTED" : "APPROVED"',
      '"CHANGES_REQUESTED"',
    );
    const projectRoot = await makeLoopRepo(alwaysChanges);
    const loaded = await loadConfig(projectRoot);
    const snapshot = resolveFlow({
      flow: loopingFlow,
      source: { kind: "fixture", ref: loopingFlow.id },
      config: loaded.config,
      task: "Exercise the adaptive loop bound.",
    });

    const orchestrator = new Orchestrator({
      projectRoot,
      config: loaded.config,
      rules: loaded.rules,
      task: snapshot.task,
      flow: snapshot,
      isGitRepo: true,
      onProgress: () => {},
    });
    let approvedOnce = false;
    const interval = setInterval(async () => {
      if (approvedOnce) return;
      const runs = await fs
        .readdir(path.join(projectRoot, ".amaco", "runs"))
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

    expect(result.state.status).toBe("blocked");

    const events = await readEvents(projectRoot, result.runId);
    const iterations = events.filter((e) => e.type === "flow.loop.iteration");
    expect(iterations.length).toBe(3); // maxIterations
    const decisions = events.filter((e) => e.type === "flow.loop.decision");
    // Last decision exits because the budget is spent, not because it approved.
    expect(decisions.at(-1)?.data?.continuing).toBe(false);
    expect(decisions.at(-1)?.data?.decision).toBe("CHANGES_REQUESTED");
  });
});
