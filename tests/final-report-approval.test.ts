import { describe, it, expect } from "vitest";
import { renderFinalReport } from "../src/core/final-report.js";
import { makeEmptyMetrics } from "../src/core/runtime-metrics.js";
import type { ApprovalRequest } from "../src/core/approval-types.js";

const baseState = {
  runId: "r1",
  task: "t",
  status: "merge_ready" as const,
  projectRoot: "/p",
  worktreePath: "/wt",
  branchName: "amaco/r1",
  reviewLoopCount: 0,
  maxReviewLoops: 2,
  startedAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:01.000Z",
  finalDecision: "APPROVED" as const,
  verification: "PASSED" as const,
  error: null,
  pendingApprovalId: null,
  approvalRequestedFromStatus: null,
  taskId: null,
  pauseRequested: false,
  pausedAtStatus: null,
  effort: null,
  providerOverride: null,
  resolvedProviderId: null,
  readOnly: false,
  runtimeSkills: [],
};

describe("final report — approval section", () => {
  it("includes a placeholder line when there are no approvals", () => {
    const r = renderFinalReport({
      state: baseState,
      artifactPaths: {},
      validation: null,
      policyWarnings: [],
      reviewLoops: 0,
      metrics: makeEmptyMetrics({
        runId: "r1",
        task: "t",
        startedAt: baseState.startedAt,
      }),
      approvals: [],
    });
    expect(r).toContain("## Approval Decisions");
    expect(r).toContain("_No approval requests recorded._");
  });

  it("renders an approvals table with status, reason, and decision note", () => {
    const approvals: ApprovalRequest[] = [
      {
        id: "abc-123",
        runId: "r1",
        stageId: "architecting",
        agentId: "architect",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:30.000Z",
        status: "approved",
        reason: "needs review",
        prompt: null,
        sourceArtifactPath: "artifacts/04-architecture.md",
        requestedAction: "continue past architecting",
        riskLevel: "medium",
        source: "agent",
        alsoRequiredByPolicy: false,
        userMessage: null,
        resolvedAt: "2026-01-01T00:00:30.000Z",
        resolvedBy: "local-user",
        decisionNote: "looks fine",
      },
    ];
    const r = renderFinalReport({
      state: baseState,
      artifactPaths: {},
      validation: null,
      policyWarnings: [],
      reviewLoops: 0,
      metrics: {
        ...makeEmptyMetrics({
          runId: "r1",
          task: "t",
          startedAt: baseState.startedAt,
        }),
        approvalsSummary: {
          total: 1,
          pending: 0,
          approved: 1,
          rejected: 0,
          expired: 0,
          totalWaitMs: 30_000,
        },
      },
      approvals,
    });
    expect(r).toContain("## Approval Decisions");
    expect(r).toContain("**Total:** 1");
    expect(r).toContain("**Approved:** 1");
    expect(r).toContain("abc-123");
    expect(r).toContain("architecting");
    expect(r).toContain("looks fine");
    expect(r).toContain("needs review");
  });
});
