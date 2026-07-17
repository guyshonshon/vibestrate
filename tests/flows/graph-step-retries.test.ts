import { describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { ApprovalService } from "../../src/core/run/approval-service.js";
import { Orchestrator } from "../../src/core/orchestrator.js";
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

// Always-succeeds provider for the seed step (and the reviewer if used).
const OK_PROVIDER = `#!/usr/bin/env node
let prompt = "";
process.stdin.on("data", (c) => (prompt += c));
process.stdin.on("end", () => {
  const role = (prompt.match(/Vibestrate Agent: (\\w+)/) || [])[1] || "";
  if (role === "reviewer") { console.log("# Findings\\n\\nDECISION: APPROVED"); return; }
  console.log("# Plan\\n\\nSteps outlined.");
});
`;

// Flaky provider: fails (exit 1) the first two invocations, succeeds on the
// third. State persists across the separate processes via a counter file next
// to the script, so retries can be observed across attempts.
const FLAKY_PROVIDER = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const counter = path.join(__dirname, "flaky-attempts.txt");
let prompt = "";
process.stdin.on("data", (c) => (prompt += c));
process.stdin.on("end", () => {
  let n = 0;
  try { n = parseInt(fs.readFileSync(counter, "utf8"), 10) || 0; } catch {}
  n += 1;
  fs.writeFileSync(counter, String(n));
  if (n < 3) { process.exit(1); }
  console.log("# Findings\\n\\nNo blocking issues. DECISION: APPROVED");
});
`;

// Always fails - reads stdin (no EPIPE) then exits non-zero.
const ALWAYS_FAIL_PROVIDER = `#!/usr/bin/env node
let p = "";
process.stdin.on("data", (c) => (p += c));
process.stdin.on("end", () => { process.exit(1); });
`;

async function makeRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-retry-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"retry"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });

  const write = async (name: string, body: string) => {
    const p = path.join(dir, name);
    await fs.writeFile(p, body, { mode: 0o755 });
    await fs.chmod(p, 0o755);
    return p;
  };
  const okPath = await write("ok-provider.js", OK_PROVIDER);
  const flakyPath = await write("flaky-provider.js", FLAKY_PROVIDER);
  const failPath = await write("fail-provider.js", ALWAYS_FAIL_PROVIDER);

  const cli = (cmd: string, args: string[]) =>
    JSON.stringify({ type: "cli", command: cmd, args, input: "stdin" });
  await setConfigValue(dir, "providers.fake", cli("node", [okPath]));
  await setConfigValue(dir, "providers.flaky", cli("node", [flakyPath]));
  await setConfigValue(dir, "providers.broken", cli("node", [failPath]));
  await setConfigValue(dir, "profiles.claude-balanced.provider", "fake");
  await setConfigValue(dir, "profiles.flaky-profile.provider", "flaky");
  await setConfigValue(dir, "profiles.broken-profile.provider", "broken");
  return dir;
}

type RunEvent = { type: string; data?: Record<string, unknown> };

// A minimal two-step GRAPH flow: seed -> check, where `check` carries the retry
// (and optionally continueOnError) policy under test.
function retryFlow(check: { retries: number; continueOnError?: boolean }) {
  return flowDefinitionSchema.parse({
    id: "retry-test",
    version: 1,
    label: "Retry test",
    description: "A seed step then a flaky check step that retries.",
    seats: {
      planner: { label: "Planner" },
      reviewer: { label: "Reviewer" },
    },
    steps: [
      {
        id: "seed",
        label: "Seed",
        kind: "agent-turn",
        seat: "planner",
        inputs: [],
        outputs: ["plan"],
      },
      {
        id: "check",
        label: "Check",
        kind: "review-turn",
        seat: "reviewer",
        needs: ["seed"],
        inputs: ["plan"],
        outputs: ["review-decision"],
        retries: check.retries,
        ...(check.continueOnError ? { continueOnError: true } : {}),
      },
    ],
  });
}

async function runRetryFlow(
  projectRoot: string,
  check: { retries: number; continueOnError?: boolean },
  checkProvider: "flaky-profile" | "broken-profile",
): Promise<{
  status: string;
  steps: { id: string; status: string }[];
  events: RunEvent[];
}> {
  const loaded = await loadConfig(projectRoot);
  const snapshot = resolveFlow({
    flow: retryFlow(check),
    source: { kind: "fixture", ref: "retry-test" },
    config: loaded.config,
    task: `Exercise retries ${Math.random().toString(36).slice(2, 8)}.`,
    stepProfileOverrides: { check: checkProvider },
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

describe("per-step retries (Slice 5)", () => {
  it("retries a flaky turn until it succeeds (fails twice, passes on the third)", async () => {
    const projectRoot = await makeRepo();
    const { steps, events } = await runRetryFlow(
      projectRoot,
      { retries: 2 },
      "flaky-profile",
    );

    // The retried step recovered.
    expect(steps.find((s) => s.id === "check")?.status).toBe("passed");

    // Exactly two retry events for `check` (attempts 1 and 2 failed).
    const retried = events.filter(
      (e) => e.type === "flow.step.retried" && e.data?.stepId === "check",
    );
    expect(retried).toHaveLength(2);
    expect(retried.map((e) => e.data?.attempt).sort()).toEqual([1, 2]);

    // The provider really was invoked three times (concrete proof of retries).
    const count = await fs.readFile(
      path.join(projectRoot, "flaky-attempts.txt"),
      "utf8",
    );
    expect(count.trim()).toBe("3");

    // The step ultimately completed.
    const completed = events
      .filter((e) => e.type === "flow.step.completed")
      .map((e) => e.data?.stepId);
    expect(completed).toContain("check");
  }, 60_000);

  it("exhausts retries then defers to continueOnError (mark failed, run continues)", async () => {
    const projectRoot = await makeRepo();
    const { steps, events } = await runRetryFlow(
      projectRoot,
      { retries: 1, continueOnError: true },
      "broken-profile",
    );

    // 1 retry (attempt 1), then the final attempt fails -> tolerated.
    const retried = events.filter(
      (e) => e.type === "flow.step.retried" && e.data?.stepId === "check",
    );
    expect(retried).toHaveLength(1);

    // The step is recorded as a tolerated failure, and the run was not aborted.
    expect(steps.find((s) => s.id === "check")?.status).toBe("failed");
    const failEvent = events.find(
      (e) => e.type === "flow.step.failed" && e.data?.stepId === "check",
    );
    expect(failEvent?.data?.continued).toBe(true);
    const graphDone = events.find((e) => e.type === "flow.graph.completed");
    expect(graphDone?.data?.continuedFailures).toBe(1);
  }, 60_000);
});

describe("per-step retries: schema guards", () => {
  const seats = { worker: { label: "Worker" }, judge: { label: "Judge" } };

  it("rejects retries on a linear (non-graph) flow", () => {
    const result = flowDefinitionSchema.safeParse({
      id: "linear-retry",
      version: 1,
      label: "Linear",
      description: "Linear flow that wrongly uses retries.",
      seats,
      steps: [
        {
          id: "plan",
          label: "Plan",
          kind: "agent-turn",
          seat: "worker",
          inputs: [],
          outputs: ["plan"],
          retries: 2,
        },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(JSON.stringify(result.error.issues)).toContain("graph flows");
    }
  });

  it("rejects retries on a non-turn (validation) step", () => {
    const result = flowDefinitionSchema.safeParse({
      id: "bad-kind-retry",
      version: 1,
      label: "Bad kind",
      description: "Graph flow with retries on a validation step.",
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
          retries: 1,
        },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(JSON.stringify(result.error.issues)).toContain("turn steps only");
    }
  });
});
