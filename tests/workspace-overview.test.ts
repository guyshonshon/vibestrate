import { describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import {
  buildWorkspaceOverview,
  summarizeProjectRuns,
  type ProjectRegistryEntry,
} from "../src/workspace/workspace-overview.js";
import { runStateSchema, type RunState } from "../src/core/state-machine.js";
import {
  runtimeMetricsSchema,
  type RoleMetrics,
} from "../src/core/runtime-metrics.js";

const FIXED_NOW = new Date("2026-05-25T18:00:00Z").getTime();

/** A schema-valid RunState (parsed so on-disk writes always re-validate). */
function run(over: Partial<RunState>): RunState {
  const at = new Date(FIXED_NOW - 60_000).toISOString();
  return runStateSchema.parse({
    runId: "r-1",
    task: "do a thing",
    status: "merge_ready",
    projectRoot: "/x",
    worktreePath: null,
    branchName: null,
    startedAt: at,
    updatedAt: at,
    ...over,
  });
}

function role(over: Partial<RoleMetrics>): RoleMetrics {
  return {
    roleId: "executor",
    stageId: "executing",
    providerId: "claude-sonnet",
    providerType: "cli",
    command: "claude",
    args: [],
    cwd: "/x",
    startedAt: new Date(FIXED_NOW - 120_000).toISOString(),
    endedAt: new Date(FIXED_NOW - 60_000).toISOString(),
    durationMs: 60_000,
    exitCode: 0,
    sessionId: null,
    flowSeat: null,
    flowContextMode: null,
    flowContextFallbackReason: null,
    model: "claude-sonnet-4",
    totalCostUsd: 0.5,
    perModelCost: [],
    tokenUsage: { input: 1000, output: 500 },
    toolCallCount: null,
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
  };
}

function metrics(runId: string, roles: RoleMetrics[]) {
  return runtimeMetricsSchema.parse({
    runId,
    task: "t",
    startedAt: new Date(FIXED_NOW - 120_000).toISOString(),
    updatedAt: new Date(FIXED_NOW - 60_000).toISOString(),
    roles,
  });
}

const entry = (over: Partial<ProjectRegistryEntry>): ProjectRegistryEntry => ({
  root: "/proj",
  label: "proj",
  current: false,
  lastPort: null,
  lastOpenedAt: null,
  ...over,
});

describe("summarizeProjectRuns", () => {
  it("counts active, needs-testing, and window outcomes", () => {
    const runs = [
      run({ runId: "a", status: "merge_ready" }),
      run({ runId: "b", status: "failed" }),
      run({ runId: "c", status: "executing" }), // non-terminal ⇒ active
      run({
        runId: "d",
        status: "merge_ready",
        needsTesting: { reason: "smoke it" },
      }),
    ];
    const summary = summarizeProjectRuns({
      entry: entry({ current: true }),
      initialized: true,
      unreadable: false,
      runs,
      metricsByRun: new Map([
        ["a", metrics("a", [role({})])],
        ["d", metrics("d", [role({ totalCostUsd: 1.25 })])],
      ]),
      range: "7d",
      now: FIXED_NOW,
    });

    expect(summary.totalRuns).toBe(4);
    expect(summary.activeRuns).toBe(1);
    expect(summary.needsTesting).toBe(1);
    expect(summary.window.runs).toBe(4);
    expect(summary.window.merged).toBe(2);
    expect(summary.window.failed).toBe(1);
    expect(summary.window.costUsd).toBeCloseTo(1.75, 5);
    expect(summary.window.tokens).toBe(3000); // two metrics × (1000+500)
    expect(summary.recentRuns.length).toBe(4);
  });

  it("treats an empty project as all-zero", () => {
    const summary = summarizeProjectRuns({
      entry: entry({}),
      initialized: false,
      unreadable: false,
      runs: [],
      metricsByRun: new Map(),
      range: "7d",
      now: FIXED_NOW,
    });
    expect(summary.totalRuns).toBe(0);
    expect(summary.activeRuns).toBe(0);
    expect(summary.window.runs).toBe(0);
    expect(summary.lastActivityAt).toBeNull();
    expect(summary.initialized).toBe(false);
  });
});

describe("buildWorkspaceOverview (on disk)", () => {
  async function writeRun(root: string, state: RunState, m?: ReturnType<typeof metrics>) {
    const dir = path.join(root, ".vibestrate", "runs", state.runId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "state.json"), JSON.stringify(state));
    if (m) {
      await fs.writeFile(
        path.join(dir, "runtime-metrics.json"),
        JSON.stringify(m),
      );
    }
  }

  it("rolls up multiple projects and combines totals", async () => {
    const a = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-ov-a-"));
    const b = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-ov-b-"));
    const missing = path.join(os.tmpdir(), "vibestrate-ov-missing-does-not-exist");

    await writeRun(a, run({ runId: "a1", status: "merge_ready" }), metrics("a1", [role({})]));
    await writeRun(a, run({ runId: "a2", status: "executing" }));
    await writeRun(b, run({ runId: "b1", status: "failed" }));

    const overview = await buildWorkspaceOverview({
      projects: [
        entry({ root: a, label: "A", current: true, lastPort: 4317 }),
        entry({ root: b, label: "B", lastPort: 4400 }),
        entry({ root: missing, label: "Gone" }),
      ],
      range: "7d",
      now: FIXED_NOW,
    });

    expect(overview.totals.projects).toBe(3);
    expect(overview.totals.runs).toBe(3); // a1,a2,b1 — missing contributes 0
    expect(overview.totals.activeRuns).toBe(1); // a2
    expect(overview.totals.merged).toBe(1);
    expect(overview.totals.failed).toBe(1);
    expect(overview.totals.costUsd).toBeCloseTo(0.5, 5);

    const projA = overview.projects.find((p) => p.label === "A");
    expect(projA?.current).toBe(true);
    expect(projA?.initialized).toBe(true);
    expect(projA?.totalRuns).toBe(2);

    const gone = overview.projects.find((p) => p.label === "Gone");
    expect(gone?.initialized).toBe(false);
    expect(gone?.totalRuns).toBe(0);
  });

  it("skips a corrupt state file without sinking the project", async () => {
    const a = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-ov-c-"));
    await writeRun(a, run({ runId: "ok", status: "merge_ready" }));
    const badDir = path.join(a, ".vibestrate", "runs", "bad");
    await fs.mkdir(badDir, { recursive: true });
    await fs.writeFile(path.join(badDir, "state.json"), "{ not json");

    const overview = await buildWorkspaceOverview({
      projects: [entry({ root: a, label: "A" })],
      range: "7d",
      now: FIXED_NOW,
    });
    const projA = overview.projects[0]!;
    expect(projA.unreadable).toBe(false);
    expect(projA.totalRuns).toBe(1); // only the good run counted
  });
});
