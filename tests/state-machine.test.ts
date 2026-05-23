import { describe, it, expect } from "vitest";
import {
  applyTransition,
  assertTransition,
  canTransition,
  createInitialState,
  isTerminal,
} from "../src/core/state-machine.js";

describe("state machine", () => {
  it("creates a valid initial state in 'created'", () => {
    const s = createInitialState({
      runId: "20260509-120000-test",
      task: "x",
      projectRoot: "/tmp/p",
      worktreePath: null,
      branchName: null,
      maxReviewLoops: 2,
    });
    expect(s.status).toBe("created");
    expect(s.startedAt).toBe(s.updatedAt);
    expect(s.reviewLoopCount).toBe(0);
  });

  it("allows valid transitions", () => {
    expect(canTransition("created", "planning")).toBe(true);
    expect(canTransition("created", "reviewing")).toBe(true);
    expect(canTransition("planning", "planned")).toBe(true);
    expect(canTransition("reviewing", "verifying")).toBe(true);
    expect(canTransition("verifying", "merge_ready")).toBe(true);
  });

  it("rejects invalid transitions", () => {
    expect(canTransition("created", "merge_ready")).toBe(false);
    expect(canTransition("planning", "architected")).toBe(false);
    expect(canTransition("merge_ready", "planning")).toBe(false);
  });

  it("throws on terminal-state transitions", () => {
    expect(() => assertTransition("merge_ready", "blocked")).toThrow();
    expect(() => assertTransition("aborted", "planning")).toThrow();
  });

  it("updates updatedAt on apply", async () => {
    const s = createInitialState({
      runId: "r",
      task: "t",
      projectRoot: "/tmp/p",
      worktreePath: null,
      branchName: null,
      maxReviewLoops: 2,
    });
    const before = s.updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    const next = applyTransition(s, "planning");
    expect(next.status).toBe("planning");
    expect(next.updatedAt).not.toBe(before);
  });

  it("identifies terminal statuses", () => {
    expect(isTerminal("merge_ready")).toBe(true);
    expect(isTerminal("blocked")).toBe(true);
    expect(isTerminal("failed")).toBe(true);
    expect(isTerminal("aborted")).toBe(true);
    expect(isTerminal("planning")).toBe(false);
  });
});
