import { describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { ApprovalService } from "../../src/core/approval-service.js";
import { Orchestrator } from "../../src/core/orchestrator.js";
import { findFlowById } from "../../src/flows/catalog/flow-discovery.js";
import { resolveFlow } from "../../src/flows/runtime/flow-resolver.js";
import { flowDefinitionSchema } from "../../src/flows/schemas/flow-schema.js";
import { loadConfig } from "../../src/project/config-loader.js";
import { setConfigValue } from "../../src/setup/config-update-service.js";
import { applySetup } from "../../src/setup/setup-service.js";
import type { ProviderDetectionRunner } from "../../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

// Valid panel provider: reviewers emit findings, the arbiter (verifier role)
// approves, the builder spine emits something parseable enough to proceed.
const OK_PROVIDER = `#!/usr/bin/env node
let prompt = "";
process.stdin.on("data", (c) => (prompt += c));
process.stdin.on("end", () => {
  const role = (prompt.match(/Vibestrate Agent: (\\w+)/) || [])[1] || "";
  const stepMatch = prompt.match(/Flow step:.*\\(([\\w-]+)\\)/);
  const stepId = stepMatch ? stepMatch[1] : "";
  if (role === "reviewer") { console.log("# Findings (" + stepId + ")\\n\\nNo blocking issues from this lens."); return; }
  if (role === "verifier") { console.log("# Arbiter verdict\\n\\nDECISION: APPROVED"); return; }
  if (role === "executor") { console.log("# Implementation\\n\\nNo source change required."); return; }
  if (role === "architect") { console.log("# Architecture\\n\\nApproach described."); return; }
  if (role === "planner") { console.log("# Plan\\n\\nSteps outlined."); return; }
  console.log("# Output");
});
`;

// Broken provider: reads stdin (no EPIPE) then exits non-zero with no output.
const FAIL_PROVIDER = `#!/usr/bin/env node
let p = "";
process.stdin.on("data", (c) => (p += c));
process.stdin.on("end", () => { process.exit(1); });
`;

async function makeRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-cpf-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"cpf"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });

  const okPath = path.join(dir, "ok-provider.js");
  await fs.writeFile(okPath, OK_PROVIDER, { mode: 0o755 });
  await fs.chmod(okPath, 0o755);
  const failPath = path.join(dir, "fail-provider.js");
  await fs.writeFile(failPath, FAIL_PROVIDER, { mode: 0o755 });
  await fs.chmod(failPath, 0o755);

  await setConfigValue(
    dir,
    "providers.fake",
    JSON.stringify({ type: "cli", command: "node", args: [okPath], input: "stdin" }),
  );
  await setConfigValue(
    dir,
    "providers.broken",
    JSON.stringify({ type: "cli", command: "node", args: [failPath], input: "stdin" }),
  );
  await setConfigValue(dir, "profiles.claude-balanced.provider", "fake");
  await setConfigValue(dir, "profiles.broken-profile.provider", "broken");
  return dir;
}

type RunEvent = { type: string; data?: Record<string, unknown> };

async function runPanelWithFailingLens(projectRoot: string): Promise<{
  status: string;
  steps: { id: string; status: string }[];
  events: RunEvent[];
}> {
  const discovered = await findFlowById(projectRoot, "panel-review");
  const loaded = await loadConfig(projectRoot);
  const snapshot = resolveFlow({
    flow: discovered!.definition,
    source: discovered!.source,
    config: loaded.config,
    task: `Exercise continue-past-failure ${Math.random().toString(36).slice(2, 8)}.`,
    // Point ONLY the tests lens at the broken provider; the others stay valid.
    stepProfileOverrides: { "review-tests": "broken-profile" },
  });
  const orchestrator = new Orchestrator({
    projectRoot,
    config: loaded.config,
    rules: loaded.rules,
    task: snapshot.task,
    flow: snapshot,
    isGitRepo: true,
    readOnly: false,
    onProgress: () => {},
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
  const steps = (result.state.flow?.steps ?? []).map((s) => ({
    id: s.id,
    status: s.status,
  }));
  return { status: result.state.status, steps, events };
}

describe("continue-past-failure: resilient review panel (Slice 5)", () => {
  it("tolerates one reviewer's provider failure and still reaches a verdict", async () => {
    const projectRoot = await makeRepo();
    const { status, steps, events } = await runPanelWithFailingLens(projectRoot);

    // The run still completes - one failed lens does not sink the panel.
    expect(status).toBe("merge_ready");

    // The failed lens is recorded as failed, not silently passed.
    const byId = (id: string) => steps.find((s) => s.id === id)?.status;
    expect(byId("review-tests")).toBe("failed");
    expect(byId("review-correctness")).toBe("passed");
    expect(byId("review-risk")).toBe("passed");
    expect(byId("arbiter")).toBe("passed");

    // The failure is on the record as a tolerated (continued) failure.
    const failEvent = events.find(
      (e) => e.type === "flow.step.failed" && e.data?.stepId === "review-tests",
    );
    expect(failEvent).toBeTruthy();
    expect(failEvent!.data?.continued).toBe(true);

    // The graph-completed event reports the tolerated failure count honestly.
    const graphDone = events.find((e) => e.type === "flow.graph.completed");
    expect(graphDone?.data?.continuedFailures).toBe(1);

    // The fan-out still scheduled all three reviewers (the failure was inside it).
    const frontier = events.filter((e) => e.type === "flow.frontier.scheduled");
    expect(frontier).toHaveLength(1);
    expect(frontier[0]!.data?.width).toBe(3);

    // The arbiter still ran (join proceeded with the survivors).
    const completed = events
      .filter((e) => e.type === "flow.step.completed")
      .map((e) => e.data?.stepId);
    expect(completed).toEqual(
      expect.arrayContaining(["review-correctness", "review-risk", "arbiter"]),
    );
  }, 60_000);
});

describe("continue-past-failure: schema guards", () => {
  const seats = { worker: { label: "Worker" }, judge: { label: "Judge" } };

  it("rejects continueOnError on a linear (non-graph) flow", () => {
    const result = flowDefinitionSchema.safeParse({
      id: "linear-cpf",
      version: 1,
      label: "Linear",
      description: "Linear flow that wrongly uses continueOnError.",
      seats,
      steps: [
        {
          id: "plan",
          label: "Plan",
          kind: "agent-turn",
          seat: "worker",
          inputs: [],
          outputs: ["plan"],
          continueOnError: true,
        },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(JSON.stringify(result.error.issues)).toContain("graph flows");
    }
  });

  it("rejects continueOnError on a non-turn (validation) step", () => {
    const result = flowDefinitionSchema.safeParse({
      id: "bad-kind-cpf",
      version: 1,
      label: "Bad kind",
      description: "Graph flow with continueOnError on a validation step.",
      seats,
      steps: [
        {
          id: "build",
          label: "Build",
          kind: "agent-turn",
          seat: "worker",
          inputs: [],
          outputs: ["diff"],
        },
        {
          id: "validate",
          label: "Validate",
          kind: "validation",
          needs: ["build"],
          inputs: ["diff"],
          outputs: ["validation"],
          continueOnError: true,
        },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(JSON.stringify(result.error.issues)).toContain("turn steps only");
    }
  });

  it("accepts continueOnError on a turn step inside a graph flow", () => {
    const result = flowDefinitionSchema.safeParse({
      id: "good-cpf",
      version: 1,
      label: "Good",
      description: "Graph flow with a best-effort review turn.",
      seats,
      steps: [
        {
          id: "build",
          label: "Build",
          kind: "agent-turn",
          seat: "worker",
          inputs: [],
          outputs: ["diff"],
        },
        {
          id: "review",
          label: "Review",
          kind: "review-turn",
          seat: "judge",
          needs: ["build"],
          inputs: ["diff"],
          outputs: ["findings"],
          continueOnError: true,
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});
