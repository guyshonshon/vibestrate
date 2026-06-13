import { describe, it, expect } from "vitest";
import { deriveStartupProgress } from "../src/core/run-startup.js";

const ev = (stage: string, status: string, detail?: string) => ({
  type: "run.startup",
  data: { stage, status, ...(detail ? { detail } : {}) },
});

describe("deriveStartupProgress (T7)", () => {
  it("returns null when there are no startup events", () => {
    expect(deriveStartupProgress([])).toBeNull();
    expect(
      deriveStartupProgress([{ type: "run.created" }, { type: "git.worktree.created" }]),
    ).toBeNull();
  });

  it("folds events to the latest status per stage", () => {
    const p = deriveStartupProgress([
      ev("workspace", "active"),
      ev("workspace", "done"),
      ev("environment", "active"),
    ])!;
    const byStage = Object.fromEntries(p.stages.map((s) => [s.stage, s.status]));
    expect(byStage).toEqual({
      workspace: "done",
      environment: "active",
      context: "pending",
      models: "pending",
      provider: "pending",
    });
    // Not complete yet - provider hasn't started and nothing failed.
    expect(p.complete).toBe(false);
    expect(p.failedStage).toBeNull();
  });

  it("is complete once the provider stage starts", () => {
    const p = deriveStartupProgress([
      ev("workspace", "done"),
      ev("environment", "skipped", "linkEnvironment off"),
      ev("context", "skipped", "no context sources"),
      ev("models", "done", "codex: up to date"),
      ev("provider", "active"),
    ])!;
    expect(p.complete).toBe(true);
    expect(p.failedStage).toBeNull();
    // detail is carried through.
    expect(p.stages.find((s) => s.stage === "environment")?.detail).toBe(
      "linkEnvironment off",
    );
  });

  it("surfaces a failed stage and marks the run startup complete (stops the spinner)", () => {
    const p = deriveStartupProgress([
      ev("workspace", "active"),
      ev("workspace", "failed", "fatal: not a git repository"),
    ])!;
    expect(p.failedStage).toBe("workspace");
    expect(p.complete).toBe(true);
    expect(p.stages.find((s) => s.stage === "workspace")?.detail).toBe(
      "fatal: not a git repository",
    );
  });

  it("ignores unknown stages/statuses", () => {
    expect(
      deriveStartupProgress([ev("bogus", "active"), ev("workspace", "weird")]),
    ).toBeNull();
  });
});
