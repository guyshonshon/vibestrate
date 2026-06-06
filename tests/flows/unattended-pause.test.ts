import { describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { ApprovalService } from "../../src/core/approval-service.js";
import { Orchestrator } from "../../src/core/orchestrator.js";
import { resolveFlow } from "../../src/flows/runtime/flow-resolver.js";
import { flowDefinitionSchema } from "../../src/flows/schemas/flow-schema.js";
import { loadConfig } from "../../src/project/config-loader.js";
import { setConfigValue } from "../../src/setup/config-update-service.js";
import { applySetup } from "../../src/setup/setup-service.js";
import type { ProviderDetectionRunner } from "../../src/providers/provider-detection.js";
import type { ProjectConfig } from "../../src/project/config-schema.js";

const noProvider: ProviderDetectionRunner = async () => ({ exitCode: 127, stdout: "", stderr: "" });

const OK_PROVIDER = `#!/usr/bin/env node
let p = "";
process.stdin.on("data", (c) => (p += c));
process.stdin.on("end", () => { console.log("# Out\\n\\nok"); });
`;

async function makeRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-pause-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"pause"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  const p = path.join(dir, "ok.js");
  await fs.writeFile(p, OK_PROVIDER, { mode: 0o755 });
  await fs.chmod(p, 0o755);
  await setConfigValue(dir, "providers.fake", JSON.stringify({ type: "cli", command: "node", args: [p], input: "stdin" }));
  await setConfigValue(dir, "profiles.claude-balanced.provider", "fake");
  return dir;
}

const twoTurnFlow = flowDefinitionSchema.parse({
  id: "two",
  version: 1,
  label: "Two",
  description: "two agent turns",
  seats: { planner: { label: "Planner" } },
  steps: [
    { id: "s1", label: "S1", kind: "agent-turn", seat: "planner", outputs: ["a"] },
    { id: "s2", label: "S2", kind: "agent-turn", seat: "planner", outputs: ["b"] },
  ],
});

type RunEvent = { type: string; data?: Record<string, unknown> };

async function runWithDecision(
  dir: string,
  config: ProjectConfig,
  rules: Awaited<ReturnType<typeof loadConfig>>["rules"],
  decision: "approve" | "reject" | "none",
): Promise<{ status: string; events: RunEvent[] }> {
  const snapshot = resolveFlow({
    flow: twoTurnFlow,
    source: { kind: "fixture", ref: "two" },
    config,
    task: `pause ${Math.random().toString(36).slice(2, 8)}`,
  });
  const orchestrator = new Orchestrator({
    projectRoot: dir,
    config,
    rules,
    task: snapshot.task,
    flow: snapshot,
    isGitRepo: true,
    readOnly: false,
    onProgress: () => {},
  });
  // Resolve the first pending approval per the requested decision.
  const interval = setInterval(async () => {
    if (decision === "none") return;
    const runs = await fs.readdir(path.join(dir, ".vibestrate", "runs")).catch(() => []);
    const runId = runs.sort().at(-1);
    if (!runId) return;
    const approvals = new ApprovalService(dir, runId);
    const pending = await approvals.firstPending().catch(() => null);
    if (!pending) return;
    if (decision === "approve") await approvals.approve({ approvalId: pending.id }).catch(() => {});
    else await approvals.reject({ approvalId: pending.id }).catch(() => {});
  }, 40);

  let status = "unknown";
  let runId = "";
  try {
    const r = await orchestrator.run();
    status = r.state.status;
    runId = r.runId;
  } catch {
    const runs = (await fs.readdir(path.join(dir, ".vibestrate", "runs")).catch(() => []));
    runId = runs.sort().at(-1) ?? "";
    const raw = await fs.readFile(path.join(dir, ".vibestrate", "runs", runId, "state.json"), "utf8").catch(() => "{}");
    status = JSON.parse(raw).status ?? "unknown";
  } finally {
    clearInterval(interval);
  }
  const raw = await fs.readFile(path.join(dir, ".vibestrate", "runs", runId, "events.ndjson"), "utf8").catch(() => "");
  const events = raw.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as RunEvent);
  return { status, events };
}

function withBudget(config: ProjectConfig, over: Partial<ProjectConfig["budget"]>): ProjectConfig {
  return { ...config, budget: { ...config.budget, maxTurnsPerRun: 1, ...over } };
}

describe("onLimit: pause (unattended-resilience U5)", () => {
  it("pauses at a ceiling and continues when a human approves", async () => {
    const dir = await makeRepo();
    const loaded = await loadConfig(dir);
    const config = withBudget(loaded.config, { onLimit: "pause" });
    const { events } = await runWithDecision(dir, config, loaded.rules, "approve");

    // It paused (an approval was requested) and a human approved.
    expect(events.some((e) => e.type === "approval.requested")).toBe(true);
    expect(events.some((e) => e.type === "budget.limit" && e.data?.resolved === "approved")).toBe(true);
    // Both turns completed (the run continued past the ceiling).
    const completed = events.filter((e) => e.type === "flow.step.completed").map((e) => e.data?.stepId);
    expect(completed).toContain("s1");
    expect(completed).toContain("s2");
  }, 60_000);

  it("stops when the human rejects the pause", async () => {
    const dir = await makeRepo();
    const loaded = await loadConfig(dir);
    const config = withBudget(loaded.config, { onLimit: "pause" });
    const { status, events } = await runWithDecision(dir, config, loaded.rules, "reject");
    expect(status).toBe("blocked");
    expect(events.some((e) => e.type === "budget.limit" && e.data?.onLimit === "stop")).toBe(true);
  }, 60_000);

  it("--unattended forces stop even when onLimit is pause (never hangs)", async () => {
    const dir = await makeRepo();
    const loaded = await loadConfig(dir);
    const config = withBudget(loaded.config, { onLimit: "pause" });
    const snapshot = resolveFlow({
      flow: twoTurnFlow,
      source: { kind: "fixture", ref: "two" },
      config,
      task: "unattended pause",
    });
    const orchestrator = new Orchestrator({
      projectRoot: dir,
      config,
      rules: loaded.rules,
      task: snapshot.task,
      flow: snapshot,
      isGitRepo: true,
      readOnly: false,
      unattended: true,
      onProgress: () => {},
    });
    let status = "unknown";
    let runId = "";
    try {
      const r = await orchestrator.run();
      status = r.state.status;
      runId = r.runId;
    } catch {
      const runs = await fs.readdir(path.join(dir, ".vibestrate", "runs")).catch(() => []);
      runId = runs.sort().at(-1) ?? "";
      const raw = await fs.readFile(path.join(dir, ".vibestrate", "runs", runId, "state.json"), "utf8").catch(() => "{}");
      status = JSON.parse(raw).status ?? "unknown";
    }
    const raw = await fs.readFile(path.join(dir, ".vibestrate", "runs", runId, "events.ndjson"), "utf8").catch(() => "");
    const events = raw.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as RunEvent);
    // Forced stop: no approval was ever requested, the run blocked at the ceiling.
    expect(status).toBe("blocked");
    expect(events.some((e) => e.type === "approval.requested")).toBe(false);
    expect(events.some((e) => e.type === "budget.limit" && e.data?.onLimit === "stop")).toBe(true);
  }, 60_000);
});
