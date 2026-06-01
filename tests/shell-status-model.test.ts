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
      aggregates: { activeRuns: 0, queueWaiting: 0, queueRunning: 0 },
      runs: [],
    });
    expect(m.activity).toBe("idle");
    expect(m.busy).toBe(false);
    expect(m.runningTask).toBeNull();
    expect(m.crew).toBe("core");
    expect(m.flow).toBe("default");
    expect(m.branch).toBe("main");
    expect(m.worktree).toBe(false);
  });

  it("reports the most-recent active run as busy with a truncated task", () => {
    const m = buildStatusModel({
      projectName: "demo",
      git: { branch: "feat/x", isLinkedWorktree: true },
      session: { mode: "read-only", crewId: "reviewers", flowId: "pickup" },
      defaultCrewId: "core",
      aggregates: { activeRuns: 1, queueWaiting: 2, queueRunning: 1 },
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
  });

  it("derives activity from the runs list when aggregates are absent", () => {
    const m = buildStatusModel({
      projectName: "demo",
      git: null,
      session,
      defaultCrewId: null,
      aggregates: null,
      runs: [{ status: "planning", task: "t", updatedAt: "2026-01-01T00:00:00Z" }],
    });
    expect(m.busy).toBe(true);
    expect(m.activity).toBe("running · 1 active");
    expect(m.branch).toBe("—");
    expect(m.crew).toBe("default");
  });
});
