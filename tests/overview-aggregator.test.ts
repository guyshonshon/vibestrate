import { describe, expect, it } from "vitest";
import {
  buildAgentsOverview,
  buildMetricsOverview,
  bucketDaily,
  spendByAgent,
  activityHeatmap,
  leaderboard,
} from "../src/core/overview-aggregator.js";
import type { RunState } from "../src/core/state-machine.js";
import type { RuntimeMetrics } from "../src/core/runtime-metrics.js";

const FIXED_NOW = new Date("2026-05-25T18:00:00Z").getTime();

function run(over: Partial<RunState>): RunState {
  // Minimal RunState that satisfies the zod schema's shape — we don't
  // .parse() here because the aggregator only consumes a subset of
  // fields. Casts are confined to this helper.
  return {
    runId: "r-x",
    task: "test",
    status: "merge_ready",
    projectRoot: "/x",
    worktreePath: null,
    branchName: null,
    reviewLoopCount: 0,
    maxReviewLoops: 0,
    startedAt: new Date(FIXED_NOW - 60_000).toISOString(),
    updatedAt: new Date(FIXED_NOW - 60_000).toISOString(),
    finalDecision: null,
    verification: null,
    error: null,
    pendingApprovalId: null,
    approvalRequestedFromStatus: null,
    taskId: null,
    pauseRequested: false,
    pausedAtStatus: null,
    effort: null,
    providerOverride: null,
    resolvedProviderId: "claude-sonnet",
    readOnly: false,
    runtimeSkills: [],
    concise: false,
    guide: null,
    ...over,
  } as RunState;
}

function metrics(
  runId: string,
  agents: Array<{
    stageId: string;
    providerId: string;
    durationMs?: number;
    totalCostUsd?: number;
    skills?: string[];
  }>,
): RuntimeMetrics {
  return ({
    runId,
    task: "t",
    startedAt: new Date(FIXED_NOW).toISOString(),
    updatedAt: new Date(FIXED_NOW).toISOString(),
    finalStatus: "merge_ready",
    totalDurationMs: 0,
    totalProviderCalls: agents.length,
    totalCostUsd: agents.reduce((a, b) => a + (b.totalCostUsd ?? 0), 0),
    reviewLoopCount: 0,
    filesChanged: null,
    diffInsertions: null,
    diffDeletions: null,
    validationSummary: null,
    approvals: {
      total: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
      expired: 0,
      totalWaitMs: 0,
    },
    agents: agents.map((a, i) => ({
      agentId: `${runId}-a${i}`,
      stageId: a.stageId,
      providerId: a.providerId,
      providerType: "cli",
      command: "x",
      args: [],
      cwd: "/x",
      startedAt: new Date(FIXED_NOW).toISOString(),
      endedAt: new Date(FIXED_NOW + (a.durationMs ?? 1000)).toISOString(),
      durationMs: a.durationMs ?? 1000,
      exitCode: 0,
      sessionId: null,
      guideSlotId: null,
      guideContextMode: null,
      guideContextFallbackReason: null,
      model: null,
      totalCostUsd: a.totalCostUsd ?? 0,
      perModelCost: [],
      tokenUsage: null,
      toolCallCount: null,
      filesChangedBefore: null,
      filesChangedAfter: null,
      diffInsertionsAfter: null,
      diffDeletionsAfter: null,
      validationSummary: null,
      reviewDecision: null,
      verificationDecision: null,
      skillsAttached: a.skills ?? [],
      skillsRequested: [],
      notes: [],
    })),
  } as unknown) as RuntimeMetrics;
}

describe("bucketDaily", () => {
  it("emits N consecutive day buckets ending today and counts outcomes", () => {
    const today = new Date(FIXED_NOW).toISOString();
    const yesterday = new Date(FIXED_NOW - 24 * 3600_000).toISOString();
    const buckets = bucketDaily(
      [
        run({ runId: "a", updatedAt: today, status: "merge_ready" }),
        run({ runId: "b", updatedAt: today, status: "failed" }),
        run({ runId: "c", updatedAt: yesterday, status: "merge_ready" }),
        run({
          runId: "d",
          updatedAt: yesterday,
          status: "waiting_for_approval",
        }),
      ],
      7,
      FIXED_NOW,
    );
    expect(buckets).toHaveLength(7);
    const last = buckets[buckets.length - 1]!;
    const prev = buckets[buckets.length - 2]!;
    expect(last.merged).toBe(1);
    expect(last.failed).toBe(1);
    expect(prev.merged).toBe(1);
    expect(prev.changes).toBe(1);
  });
});

describe("spendByAgent", () => {
  it("sums cost across agents grouped by providerId, sorted desc", () => {
    const runs = [run({ runId: "a" }), run({ runId: "b" })];
    const map = new Map<string, RuntimeMetrics | null>([
      [
        "a",
        metrics("a", [
          { stageId: "exec", providerId: "claude-sonnet", totalCostUsd: 1.2 },
          { stageId: "review", providerId: "codex-gpt5", totalCostUsd: 0.4 },
        ]),
      ],
      [
        "b",
        metrics("b", [
          { stageId: "exec", providerId: "claude-sonnet", totalCostUsd: 0.8 },
        ]),
      ],
    ]);
    const out = spendByAgent(runs, map, {
      "claude-sonnet": { label: "Claude Sonnet 4.5", vendor: "Anthropic" },
      "codex-gpt5": { label: "Codex GPT-5", vendor: "OpenAI" },
    });
    expect(out[0]!.providerId).toBe("claude-sonnet");
    expect(out[0]!.dollars).toBeCloseTo(2.0, 5);
    expect(out[1]!.providerId).toBe("codex-gpt5");
    expect(out[1]!.dollars).toBeCloseTo(0.4, 5);
  });
});

describe("activityHeatmap", () => {
  it("counts runs by weekday × hour-of-day", () => {
    // 2026-05-25 is a Monday at 18:00 local.
    const monday = new Date(2026, 4, 25, 18, 0, 0).toISOString();
    const friday = new Date(2026, 4, 22, 9, 0, 0).toISOString();
    const rows = activityHeatmap([
      run({ runId: "a", startedAt: monday }),
      run({ runId: "b", startedAt: monday }),
      run({ runId: "c", startedAt: friday }),
    ]);
    expect(rows.find((r) => r.day === "Mon")!.cells[18]).toBe(2);
    expect(rows.find((r) => r.day === "Fri")!.cells[9]).toBe(1);
    expect(rows.find((r) => r.day === "Sun")!.cells[0]).toBe(0);
  });
});

describe("leaderboard", () => {
  it("computes runs/success/cost per provider and Δ vs prior window", () => {
    const day = 24 * 3600_000;
    const cur = new Date(FIXED_NOW - day).toISOString();
    const prev = new Date(FIXED_NOW - 8 * day).toISOString();
    const board = leaderboard({
      runs: [
        run({ runId: "1", updatedAt: cur, resolvedProviderId: "claude-sonnet", status: "merge_ready" }),
        run({ runId: "2", updatedAt: cur, resolvedProviderId: "claude-sonnet", status: "failed" }),
        run({ runId: "3", updatedAt: cur, resolvedProviderId: "codex-gpt5", status: "merge_ready" }),
        run({ runId: "4", updatedAt: prev, resolvedProviderId: "claude-sonnet", status: "merge_ready" }),
      ],
      metricsByRun: new Map([
        ["1", metrics("1", [{ stageId: "exec", providerId: "claude-sonnet", totalCostUsd: 0.5 }])],
        ["3", metrics("3", [{ stageId: "exec", providerId: "codex-gpt5", totalCostUsd: 0.3 }])],
      ]),
      providers: {
        "claude-sonnet": { label: "Sonnet", vendor: "Anthropic" },
        "codex-gpt5": { label: "Codex", vendor: "OpenAI" },
      },
      windowStart: FIXED_NOW - 7 * day,
      prevWindowStart: FIXED_NOW - 14 * day,
    });
    const sonnet = board.find((e) => e.providerId === "claude-sonnet")!;
    expect(sonnet.runs).toBe(2);
    expect(sonnet.successRate).toBeCloseTo(0.5, 5);
    expect(sonnet.delta).toBe(1); // cur 2 − prev 1
    const codex = board.find((e) => e.providerId === "codex-gpt5")!;
    expect(codex.runs).toBe(1);
    expect(codex.delta).toBe(1);
  });
});

describe("buildMetricsOverview", () => {
  it("returns a self-consistent overview shape for a small fixture", () => {
    const today = new Date(FIXED_NOW - 3600_000).toISOString();
    const out = buildMetricsOverview("7d", {
      now: FIXED_NOW,
      runs: [
        run({ runId: "a", updatedAt: today, status: "merge_ready" }),
        run({ runId: "b", updatedAt: today, status: "failed" }),
      ],
      metricsByRun: new Map([
        [
          "a",
          metrics("a", [
            { stageId: "exec", providerId: "claude-sonnet", totalCostUsd: 0.5, durationMs: 2000 },
          ]),
        ],
        ["b", null],
      ]),
      providers: {
        "claude-sonnet": { label: "Sonnet", vendor: "Anthropic" },
      },
    });
    expect(out.range).toBe("7d");
    expect(out.daily).toHaveLength(7);
    expect(out.totals.runs).toBe(2);
    expect(out.totals.merged).toBe(1);
    expect(out.totals.failed).toBe(1);
    expect(out.totals.successRate).toBeCloseTo(0.5, 5);
    expect(out.spendByAgent[0]!.providerId).toBe("claude-sonnet");
    expect(out.phaseLatency.find((p) => p.phase === "Execute")?.p50).toBe(2);
    expect(out.kpiSparks.runs.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(2);
  });
});

describe("buildAgentsOverview", () => {
  it("rolls up providers from runs + metrics with throughput sparkline", () => {
    const yesterday = new Date(FIXED_NOW - 23 * 3600_000).toISOString();
    const out = buildAgentsOverview({
      now: FIXED_NOW,
      runs: [
        run({
          runId: "a",
          startedAt: yesterday,
          updatedAt: yesterday,
          resolvedProviderId: "claude-sonnet",
          status: "merge_ready",
        }),
      ],
      metricsByRun: new Map([
        [
          "a",
          metrics("a", [
            {
              stageId: "exec",
              providerId: "claude-sonnet",
              totalCostUsd: 0.4,
              durationMs: 1500,
              skills: ["typescript", "react"],
            },
          ]),
        ],
      ]),
      providers: [
        {
          id: "claude-sonnet",
          label: "Sonnet",
          vendor: "Anthropic",
          available: true,
          configured: true,
        },
        {
          id: "codex-gpt5",
          label: "Codex",
          vendor: "OpenAI",
          available: false,
          configured: false,
        },
      ],
    });
    const sonnet = out.providers.find(
      (p) => p.providerId === "claude-sonnet",
    )!;
    expect(sonnet.runs).toBe(1);
    expect(sonnet.costUsd).toBeCloseTo(0.4, 5);
    expect(sonnet.skills).toEqual(
      expect.arrayContaining(["typescript", "react"]),
    );
    expect(sonnet.throughputSpark).toHaveLength(14);
    expect(out.kpi.onlineCount).toBe(1);
    expect(out.kpi.totalCount).toBe(2);
    expect(out.kpi.runs24h).toBe(1);
  });
});
