import { describe, it, expect } from "vitest";
import { buildStatusModel } from "../src/shell/ink/status-model.js";
import type { SessionState } from "../src/shell/ink/ui-state.js";

const session: SessionState = { mode: "write", crewId: null, flowId: null };

describe("buildStatusModel", () => {
  it("is idle with no runs and falls back to the default crew + 'default' flow", () => {
    const m = buildStatusModel({
      projectName: "demo",
      git: { branch: "main", isLinkedWorktree: false },
      session,
      defaultCrewId: "core",
      aggregates: { activeRuns: 0, queueWaiting: 0, queueRunning: 0, pendingApprovals: 0 },
      budget: null,
      runs: [],
    });
    expect(m.activity).toBe("idle");
    expect(m.busy).toBe(false);
    expect(m.runningTask).toBeNull();
    expect(m.crew).toBe("core");
    expect(m.flow).toBe("default");
    expect(m.branch).toBe("main");
    expect(m.worktree).toBe(false);
    expect(m.budget).toBeNull();
    expect(m.pendingApprovals).toBe(0);
  });

  it("reports the most-recent active run as busy with a truncated task", () => {
    const m = buildStatusModel({
      projectName: "demo",
      git: { branch: "feat/x", isLinkedWorktree: true },
      session: { mode: "read-only", crewId: "reviewers", flowId: "pickup" },
      defaultCrewId: "core",
      aggregates: { activeRuns: 1, queueWaiting: 2, queueRunning: 1, pendingApprovals: 3 },
      budget: null,
      runs: [
        { status: "merged", task: "old done thing", updatedAt: "2026-01-01T00:00:00Z" },
        { status: "executing", task: "x".repeat(80), updatedAt: "2026-02-01T00:00:00Z" },
      ],
    });
    expect(m.busy).toBe(true);
    expect(m.activity).toBe("running · 1 active · 2 queued");
    expect(m.runningTask).toMatch(/…$/);
    expect(m.runningTask!.length).toBeLessThanOrEqual(48);
    expect(m.mode).toBe("read-only");
    expect(m.crew).toBe("reviewers");
    expect(m.flow).toBe("pickup");
    expect(m.worktree).toBe(true);
    expect(m.pendingApprovals).toBe(3);
  });

  it("derives activity from the runs list when aggregates are absent", () => {
    const m = buildStatusModel({
      projectName: "demo",
      git: null,
      session,
      defaultCrewId: null,
      aggregates: null,
      budget: null,
      runs: [{ status: "planning", task: "t", updatedAt: "2026-01-01T00:00:00Z" }],
    });
    expect(m.busy).toBe(true);
    expect(m.activity).toBe("running · 1 active");
    expect(m.branch).toBe("-");
    expect(m.crew).toBe("default");
    expect(m.pendingApprovals).toBe(0);
  });

  const baseInput = {
    projectName: "demo",
    git: { branch: "main", isLinkedWorktree: false },
    session,
    defaultCrewId: "core",
    aggregates: { activeRuns: 0, queueWaiting: 0, queueRunning: 0, pendingApprovals: 0 },
    runs: [],
  } as const;

  it("renders the spend ratio when a daily cap is set", () => {
    const m = buildStatusModel({
      ...baseInput,
      budget: { spentUsd: 2.3, cap: 10, state: "ok" },
    });
    expect(m.budget).toEqual({ label: "$2.30 / $10.00", state: "ok" });
  });

  it("carries the cap state through for the color (warn / exceeded)", () => {
    expect(
      buildStatusModel({ ...baseInput, budget: { spentUsd: 8.5, cap: 10, state: "warn" } }).budget,
    ).toEqual({ label: "$8.50 / $10.00", state: "warn" });
    expect(
      buildStatusModel({ ...baseInput, budget: { spentUsd: 12, cap: 10, state: "exceeded" } }).budget,
    ).toEqual({ label: "$12.00 / $10.00", state: "exceeded" });
  });

  it("with no cap, shows today's spend only - and nothing at $0", () => {
    expect(
      buildStatusModel({ ...baseInput, budget: { spentUsd: 1.5, cap: null, state: "ok" } }).budget,
    ).toEqual({ label: "$1.50 today", state: "ok" });
    // No cap + nothing spent yet -> no chip at all (uncluttered idle).
    expect(
      buildStatusModel({ ...baseInput, budget: { spentUsd: 0, cap: null, state: "ok" } }).budget,
    ).toBeNull();
  });

  it("never renders a negative or NaN spend", () => {
    expect(
      buildStatusModel({ ...baseInput, budget: { spentUsd: Number.NaN, cap: 10, state: "ok" } }).budget,
    ).toEqual({ label: "$0.00 / $10.00", state: "ok" });
  });
});
