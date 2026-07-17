import { describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { Orchestrator } from "../../src/core/orchestrator.js";
import { resolveFlow } from "../../src/flows/runtime/flow-resolver.js";
import { flowDefinitionSchema } from "../../src/flows/schemas/flow-schema.js";
import { loadConfig } from "../../src/project/config-loader.js";
import { setConfigValue } from "../../src/setup/config-update-service.js";
import { applySetup } from "../../src/setup/setup-service.js";
import { MetricsStore } from "../../src/core/metrics/metrics-store.js";
import { runtimeMetricsSchema } from "../../src/core/metrics/runtime-metrics.js";
import { nowIso } from "../../src/utils/time.js";
import type { ProviderDetectionRunner } from "../../src/providers/provider-detection.js";
import type { ProjectConfig } from "../../src/project/config-schema.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

// Each provider drops a marker so the test can tell which one actually ran.
const marker = (name: string) => `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
let p = "";
process.stdin.on("data", (c) => (p += c));
process.stdin.on("end", () => {
  fs.writeFileSync(path.join(__dirname, "ran-${name}"), "1");
  console.log("# Out\\n\\n${name}");
});
`;

async function makeRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-cap-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"cap"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });

  for (const name of ["expensive", "cheap"]) {
    const p = path.join(dir, `${name}.js`);
    await fs.writeFile(p, marker(name), { mode: 0o755 });
    await fs.chmod(p, 0o755);
    await setConfigValue(
      dir,
      `providers.${name}prov`,
      JSON.stringify({ type: "cli", command: "node", args: [p], input: "stdin" }),
    );
  }
  await setConfigValue(dir, "profiles.claude-balanced.provider", "expensiveprov");
  await setConfigValue(dir, "profiles.cheap.provider", "cheapprov");
  return dir;
}

// Seed today's spend above any small cap, so the very first turn trips it.
async function seedSpend(dir: string, usd: number): Promise<void> {
  await new MetricsStore(dir, "seed-run").write(
    runtimeMetricsSchema.parse({
      runId: "seed-run",
      task: "seed",
      startedAt: nowIso(),
      updatedAt: nowIso(),
      totalCostUsd: usd,
    }),
  );
}

const soloFlow = flowDefinitionSchema.parse({
  id: "solo",
  version: 1,
  label: "Solo",
  description: "one agent turn",
  seats: { planner: { label: "Planner" } },
  steps: [{ id: "do", label: "Do", kind: "agent-turn", seat: "planner", outputs: ["plan"] }],
});

type RunEvent = { type: string; data?: Record<string, unknown> };

async function run(dir: string, config: ProjectConfig, rules: Awaited<ReturnType<typeof loadConfig>>["rules"]) {
  const snapshot = resolveFlow({
    flow: soloFlow,
    source: { kind: "fixture", ref: "solo" },
    config,
    task: `cap ${Math.random().toString(36).slice(2, 8)}`,
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
  let status = "unknown";
  let runId = "";
  try {
    const r = await orchestrator.run();
    status = r.state.status;
    runId = r.runId;
  } catch {
    const runs = (await fs.readdir(path.join(dir, ".vibestrate", "runs")).catch(() => [])).filter((x) => x !== "seed-run");
    runId = runs.sort().at(-1) ?? "";
    const raw = await fs.readFile(path.join(dir, ".vibestrate", "runs", runId, "state.json"), "utf8").catch(() => "{}");
    status = JSON.parse(raw).status ?? "unknown";
  }
  const raw = await fs.readFile(path.join(dir, ".vibestrate", "runs", runId, "events.ndjson"), "utf8").catch(() => "");
  const events = raw.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as RunEvent);
  const ran = async (name: string) =>
    fs.access(path.join(dir, `ran-${name}`)).then(() => true).catch(() => false);
  return { status, events, ranExpensive: await ran("expensive"), ranCheap: await ran("cheap") };
}

function withBudget(config: ProjectConfig, over: Partial<ProjectConfig["budget"]>): ProjectConfig {
  return { ...config, budget: { ...config.budget, spendCapDailyUsd: 1, ...over } };
}

describe("budget cap actions (unattended-resilience U4)", () => {
  it("downgrade-model switches the run to the cheaper fallback profile", async () => {
    const dir = await makeRepo();
    await seedSpend(dir, 5);
    const loaded = await loadConfig(dir);
    const config = withBudget(loaded.config, { capAction: "downgrade-model", fallbackProfile: "cheap" });
    const { events, ranExpensive, ranCheap } = await run(dir, config, loaded.rules);

    const action = events.find((e) => e.type === "spend.action");
    expect(action?.data?.action).toBe("downgrade-model");
    expect(action?.data?.fallbackProfile).toBe("cheap");
    // The cheap fallback ran; the expensive (default) provider never did.
    expect(ranCheap).toBe(true);
    expect(ranExpensive).toBe(false);
  }, 60_000);

  it("downgrade-model with no usable fallback falls back to stop", async () => {
    const dir = await makeRepo();
    await seedSpend(dir, 5);
    const loaded = await loadConfig(dir);
    const config = withBudget(loaded.config, { capAction: "downgrade-model", fallbackProfile: undefined });
    const { status, events, ranExpensive } = await run(dir, config, loaded.rules);

    expect(status).toBe("blocked");
    expect(events.some((e) => e.type === "spend.capped")).toBe(true);
    expect(events.some((e) => e.type === "spend.action")).toBe(false);
    // Stopped before spending - the provider never ran.
    expect(ranExpensive).toBe(false);
  }, 60_000);

  it("reduce-effort continues the run instead of stopping", async () => {
    const dir = await makeRepo();
    await seedSpend(dir, 5);
    const loaded = await loadConfig(dir);
    const config = withBudget(loaded.config, { capAction: "reduce-effort" });
    const { events, ranExpensive } = await run(dir, config, loaded.rules);

    const action = events.find((e) => e.type === "spend.action");
    expect(action?.data?.action).toBe("reduce-effort");
    // The run continued (no spend stop); the turn ran and completed.
    expect(events.some((e) => e.type === "spend.capped")).toBe(false);
    expect(ranExpensive).toBe(true);
    expect(events.some((e) => e.type === "flow.step.completed" && e.data?.stepId === "do")).toBe(true);
  }, 60_000);
});
