import { describe, it, expect } from "vitest";
import {
  applyTransition,
  canTransition,
  createInitialState,
} from "../src/core/state-machine.js";

describe("state machine — waiting_for_approval", () => {
  it("allows planned → waiting_for_approval and back to planned", () => {
    expect(canTransition("planned", "waiting_for_approval")).toBe(true);
    expect(canTransition("waiting_for_approval", "planned")).toBe(true);
  });
  it("allows architected/reviewing/fixing/verifying → waiting_for_approval", () => {
    for (const from of [
      "architected",
      "reviewing",
      "fixing",
      "verifying",
      "executing",
    ] as const) {
      expect(canTransition(from, "waiting_for_approval")).toBe(true);
    }
  });
  it("allows waiting_for_approval → blocked (rejection path)", () => {
    expect(canTransition("waiting_for_approval", "blocked")).toBe(true);
  });
  it("does NOT allow waiting_for_approval → merge_ready directly", () => {
    expect(canTransition("waiting_for_approval", "merge_ready")).toBe(false);
  });
  it("createInitialState includes new approval fields", () => {
    const s = createInitialState({
      runId: "r",
      task: "t",
      projectRoot: "/tmp/p",
      worktreePath: null,
      branchName: null,
      maxReviewLoops: 2,
    });
    expect(s.pendingApprovalId).toBeNull();
    expect(s.approvalRequestedFromStatus).toBeNull();
  });
  it("applyTransition planned → waiting_for_approval succeeds and updates timestamp", async () => {
    const s = createInitialState({
      runId: "r",
      task: "t",
      projectRoot: "/tmp/p",
      worktreePath: null,
      branchName: null,
      maxReviewLoops: 2,
    });
    const planned = applyTransition(s, "planning");
    const planned2 = applyTransition(planned, "planned");
    const waiting = applyTransition(planned2, "waiting_for_approval");
    expect(waiting.status).toBe("waiting_for_approval");
  });
});
