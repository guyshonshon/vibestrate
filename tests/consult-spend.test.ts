import { describe, it, expect } from "vitest";
import { spendByProvider } from "../src/core/metrics/run-spend.js";
import type { RunState } from "../src/core/state-machine.js";
import type { RuntimeMetrics } from "../src/core/metrics/runtime-metrics.js";

/**
 * "How much did claude cost me this week" came back with an empty answer,
 * because nothing in the consult context knew what anything cost. The number is
 * computed from run metrics, not retrieved from a page, so this asserts the
 * computation - the window, the per-provider split, and the estimate flag that
 * decides whether the answer is allowed to state a figure as fact.
 */

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 7, 16, 12, 0, 0);

function run(id: string, agoDays: number): RunState {
  return {
    runId: id,
    updatedAt: new Date(NOW - agoDays * DAY).toISOString(),
  } as unknown as RunState;
}

function metrics(
  roles: Array<{ providerId: string; totalCostUsd: number | null; costEstimated?: boolean }>,
): RuntimeMetrics {
  return { roles } as unknown as RuntimeMetrics;
}

describe("spend by provider", () => {
  it("splits cost per provider inside the window", () => {
    const out = spendByProvider({
      runs: [run("a", 1), run("b", 3)],
      metricsByRun: new Map([
        ["a", metrics([{ providerId: "claude", totalCostUsd: 2.5 }])],
        ["b", metrics([{ providerId: "claude", totalCostUsd: 1.25 }, { providerId: "codex", totalCostUsd: 0.5 }])],
      ]),
      days: 7,
      now: NOW,
    });
    expect(out.byProvider).toEqual([
      { providerId: "claude", costUsd: 3.75, runs: 2, estimated: false },
      { providerId: "codex", costUsd: 0.5, runs: 1, estimated: false },
    ]);
    expect(out.totalUsd).toBeCloseTo(4.25, 5);
  });

  it("excludes runs older than the window", () => {
    const out = spendByProvider({
      runs: [run("recent", 2), run("old", 30)],
      metricsByRun: new Map([
        ["recent", metrics([{ providerId: "claude", totalCostUsd: 1 }])],
        ["old", metrics([{ providerId: "claude", totalCostUsd: 999 }])],
      ]),
      days: 7,
      now: NOW,
    });
    expect(out.totalUsd).toBe(1);
  });

  it("counts a run once per provider however many turns it took", () => {
    const out = spendByProvider({
      runs: [run("a", 1)],
      metricsByRun: new Map([
        [
          "a",
          metrics([
            { providerId: "claude", totalCostUsd: 1 },
            { providerId: "claude", totalCostUsd: 2 },
            { providerId: "claude", totalCostUsd: 3 },
          ]),
        ],
      ]),
      days: 7,
      now: NOW,
    });
    expect(out.byProvider[0]).toEqual({
      providerId: "claude",
      costUsd: 6,
      runs: 1,
      estimated: false,
    });
  });

  it("marks the whole total estimated when ANY turn was priced locally", () => {
    // One locally-priced turn is enough: the total is then not a figure any
    // provider invoiced, and reporting it as fact would overstate it.
    const out = spendByProvider({
      runs: [run("a", 1)],
      metricsByRun: new Map([
        [
          "a",
          metrics([
            { providerId: "claude", totalCostUsd: 1 },
            { providerId: "claude", totalCostUsd: 2, costEstimated: true },
          ]),
        ],
      ]),
      days: 7,
      now: NOW,
    });
    expect(out.estimated).toBe(true);
    expect(out.byProvider[0]?.estimated).toBe(true);
  });

  it("ignores turns with no recorded cost rather than counting them as zero", () => {
    const out = spendByProvider({
      runs: [run("a", 1)],
      metricsByRun: new Map([
        ["a", metrics([{ providerId: "claude", totalCostUsd: null }])],
      ]),
      days: 7,
      now: NOW,
    });
    expect(out.byProvider).toEqual([]);
    expect(out.totalUsd).toBe(0);
  });

  it("survives a run whose metrics are missing", () => {
    const out = spendByProvider({
      runs: [run("a", 1), run("b", 1)],
      metricsByRun: new Map([
        ["a", null],
        ["b", metrics([{ providerId: "claude", totalCostUsd: 4 }])],
      ]),
      days: 7,
      now: NOW,
    });
    expect(out.totalUsd).toBe(4);
  });
});
