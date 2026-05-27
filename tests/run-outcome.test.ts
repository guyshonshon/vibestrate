import { describe, it, expect } from "vitest";
import {
  describeRunOutcome,
  filterRuns,
  isTerminalStatus,
} from "../src/ui/lib/run-outcome.js";
import type { RunState } from "../src/ui/lib/types.js";

function mk(o: Partial<RunState>): RunState {
  return {
    runId: "20260527-100000-do-a-thing",
    task: "Add audit logging",
    status: "blocked",
    error: null,
    finalDecision: null,
    verification: null,
    updatedAt: "2026-05-27T00:00:00.000Z",
    ...o,
  } as RunState;
}

describe("isTerminalStatus", () => {
  it("treats blocked/failed/aborted/merge_ready as terminal, running ones as not", () => {
    for (const s of ["blocked", "failed", "aborted", "merge_ready"] as const) {
      expect(isTerminalStatus(s)).toBe(true);
    }
    for (const s of ["planning", "reviewing", "waiting_for_approval"] as const) {
      expect(isTerminalStatus(s)).toBe(false);
    }
  });
});

describe("describeRunOutcome", () => {
  it("returns null for non-terminal and for merge_ready", () => {
    expect(describeRunOutcome(mk({ status: "reviewing" }))).toBeNull();
    expect(describeRunOutcome(mk({ status: "merge_ready" }))).toBeNull();
  });

  it("names the spend cap when that's the cause", () => {
    const o = describeRunOutcome(
      mk({ status: "blocked", error: "Daily spend cap of $5 exceeded." }),
    );
    expect(o?.title).toMatch(/spend cap/i);
    expect(o?.actions[0]).toBe("rerun");
  });

  it("names a rejected approval", () => {
    const o = describeRunOutcome(
      mk({ status: "blocked", error: "Run blocked after rejected approval" }),
    );
    expect(o?.title).toMatch(/approval/i);
  });

  it("explains a review BLOCKED verdict and offers the review first", () => {
    const o = describeRunOutcome(
      mk({ status: "blocked", finalDecision: "BLOCKED" }),
    );
    expect(o?.title).toMatch(/review/i);
    expect(o?.actions).toContain("review");
  });

  it("explains a failed run with its error and a generic blocked fallback", () => {
    const failed = describeRunOutcome(
      mk({ status: "failed", error: "worktree prep exploded" }),
    );
    expect(failed?.kind).toBe("failed");
    expect(failed?.reason).toContain("worktree prep exploded");

    const generic = describeRunOutcome(mk({ status: "blocked" }));
    expect(generic?.title).toMatch(/blocked/i);
    expect(generic?.actions).toContain("rerun");
  });
});

describe("filterRuns", () => {
  const runs = [
    mk({ runId: "20260527-1-alpha", task: "Add audit logging", status: "merge_ready" }),
    mk({ runId: "20260527-2-beta", task: "Refactor retries", status: "blocked" }),
  ];

  it("returns everything for an empty query", () => {
    expect(filterRuns(runs, "  ")).toHaveLength(2);
  });

  it("matches task, runId, and status case-insensitively", () => {
    expect(filterRuns(runs, "retries").map((r) => r.runId)).toEqual([
      "20260527-2-beta",
    ]);
    expect(filterRuns(runs, "ALPHA").map((r) => r.runId)).toEqual([
      "20260527-1-alpha",
    ]);
    expect(filterRuns(runs, "blocked").map((r) => r.runId)).toEqual([
      "20260527-2-beta",
    ]);
  });
});
