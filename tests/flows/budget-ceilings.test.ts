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
import type { ProviderDetectionRunner } from "../../src/providers/provider-detection.js";
import type { ProjectConfig } from "../../src/project/config-schema.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

// Always-succeeds: reads stdin, prints non-empty output, exits 0.
const OK_PROVIDER = `#!/usr/bin/env node
let p = "";
process.stdin.on("data", (c) => (p += c));
process.stdin.on("end", () => { console.log("# Out\\n\\nok"); });
`;

async function makeRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-budget-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"budget"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });

  const okPath = path.join(dir, "ok-provider.js");
  await fs.writeFile(okPath, OK_PROVIDER, { mode: 0o755 });
  await fs.chmod(okPath, 0o755);
  await setConfigValue(
    dir,
    "providers.fake",
    JSON.stringify({ type: "cli", command: "node", args: [okPath], input: "stdin" }),
  );
  await setConfigValue(dir, "profiles.claude-balanced.provider", "fake");
  return dir;
}

// A linear flow of N agent turns, all on the (crew-filled) planner seat.
function nTurnFlow(n: number) {
  return flowDefinitionSchema.parse({
    id: "many",
    version: 1,
    label: "Many",
    description: "several agent turns in a row",
    seats: { planner: { label: "Planner" } },
    steps: Array.from({ length: n }, (_, i) => ({
      id: `s${i + 1}`,
      label: `Step ${i + 1}`,
      kind: "agent-turn",
      seat: "planner",
      outputs: [`out-${i + 1}`],
    })),
  });
}

type RunEvent = { type: string; data?: Record<string, unknown> };

async function runFlow(
  projectRoot: string,
  config: ProjectConfig,
  rules: Awaited<ReturnType<typeof loadConfig>>["rules"],
  flow: ReturnType<typeof nTurnFlow>,
): Promise<{ status: string; events: RunEvent[] }> {
  const snapshot = resolveFlow({
    flow,
    source: { kind: "fixture", ref: "many" },
    config,
    task: `budget ${Math.random().toString(36).slice(2, 8)}`,
  });
  const orchestrator = new Orchestrator({
    projectRoot,
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
    const result = await orchestrator.run();
    status = result.state.status;
    runId = result.runId;
  } catch {
    // A ceiling stop blocks the run; read the latest run's state for the status.
    const runs = await fs
      .readdir(path.join(projectRoot, ".vibestrate", "runs"))
      .catch(() => []);
    runId = runs.sort().at(-1) ?? "";
    const raw = await fs
      .readFile(path.join(projectRoot, ".vibestrate", "runs", runId, "state.json"), "utf8")
      .catch(() => "{}");
    status = JSON.parse(raw).status ?? "unknown";
  }
  const eventsRaw = await fs
    .readFile(path.join(projectRoot, ".vibestrate", "runs", runId, "events.ndjson"), "utf8")
    .catch(() => "");
  const events = eventsRaw
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as RunEvent);
  return { status, events };
}

describe("budget count/time ceilings (unattended-resilience U1)", () => {
  it("stops the run at maxTurnsPerRun (blocked, with a budget.limit event)", async () => {
    const projectRoot = await makeRepo();
    const loaded = await loadConfig(projectRoot);
    const config: ProjectConfig = {
      ...loaded.config,
      budget: { ...loaded.config.budget, maxTurnsPerRun: 2 },
    };
    const { status, events } = await runFlow(projectRoot, config, loaded.rules, nTurnFlow(3));

    // The third turn is over the cap, so the run is blocked (not merge_ready).
    expect(status).toBe("blocked");

    const limit = events.find((e) => e.type === "budget.limit");
    expect(limit).toBeTruthy();
    expect(limit!.data?.kind).toBe("per-run turns");
    expect(limit!.data?.limit).toBe(2);

    // Two turns ran; the third never completed.
    const completed = events
      .filter((e) => e.type === "flow.step.completed")
      .map((e) => e.data?.stepId);
    expect(completed).toContain("s1");
    expect(completed).toContain("s2");
    expect(completed).not.toContain("s3");
  }, 60_000);

  it("stops at maxTurnsPerDay using turns from an earlier run today", async () => {
    const projectRoot = await makeRepo();
    const loaded = await loadConfig(projectRoot);

    // Run 1: no caps, one turn - persists one turn of usage for today.
    const first = await runFlow(projectRoot, loaded.config, loaded.rules, nTurnFlow(1));
    // (status may be blocked since there's no review/verify; we only need its
    // turn recorded in today's metrics.)
    expect(first.events.some((e) => e.type === "flow.step.completed")).toBe(true);

    // Run 2: a daily cap of 1 - already met by run 1, so its first turn stops.
    const config: ProjectConfig = {
      ...loaded.config,
      budget: { ...loaded.config.budget, maxTurnsPerDay: 1 },
    };
    const second = await runFlow(projectRoot, config, loaded.rules, nTurnFlow(2));
    expect(second.status).toBe("blocked");
    const limit = second.events.find((e) => e.type === "budget.limit");
    expect(limit).toBeTruthy();
    expect(limit!.data?.kind).toBe("daily turns");
    expect(limit!.data?.limit).toBe(1);
    // No step completed in run 2 - it stopped on the first turn.
    expect(second.events.some((e) => e.type === "flow.step.completed")).toBe(false);
  }, 60_000);
});
