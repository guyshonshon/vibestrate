import type { PermissionMode } from "../../project/config-schema.js";
import type { ActionEvaluator } from "../../safety/action-broker.js";
import type { ApprovalRequest } from "../approval-types.js";
import type { FlowFinding } from "../../flows/schemas/flow-output-contracts.js";

/**
 * Permission mode as broker evaluators, scoped to the run-level effects
 * Vibestrate actually owns (NOT per-shell-command - codex is opaque, claude
 * tool_use is display-only):
 *  - ask: every turn diff (file.patch) requires human approval before it's kept.
 *  - accept-edits: writes auto-apply, but the run does NOT auto-complete - it
 *    HOLDS at the completion boundary (require_approval on run.complete) for human
 *    sign-off and RESUMES to merge_ready on approval (reject / unattended-timeout
 *    -> blocked). See the run.complete handler in runFlowSequence.
 *  - auto / read-only: none here (read-only is the readOnly clamp).
 */
export function permissionModeEvaluators(mode: PermissionMode): ActionEvaluator[] {
  if (mode === "ask") {
    return [
      (req) =>
        req.kind === "file.patch"
          ? {
              effect: "require_approval",
              ruleIds: ["permission-mode.ask"],
              reason: "Permission mode 'ask': a human approves each change.",
            }
          : null,
    ];
  }
  if (mode === "accept-edits") {
    return [
      (req) =>
        req.kind === "run.complete"
          ? {
              effect: "require_approval",
              ruleIds: ["permission-mode.accept-edits"],
              reason:
                "Permission mode 'accept-edits': the run holds for human review (the applied diff) before it can be merged.",
            }
          : null,
    ];
  }
  return [];
}

export function summarizeApprovals(approvals: ApprovalRequest[]): {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  expired: number;
  totalWaitMs: number;
} {
  let pending = 0;
  let approved = 0;
  let rejected = 0;
  let expired = 0;
  let totalWaitMs = 0;
  for (const a of approvals) {
    switch (a.status) {
      case "pending":
        pending += 1;
        break;
      case "approved":
        approved += 1;
        break;
      case "rejected":
        rejected += 1;
        break;
      case "expired":
        expired += 1;
        break;
    }
    if (a.resolvedAt) {
      totalWaitMs +=
        Date.parse(a.resolvedAt) - Date.parse(a.createdAt) || 0;
    }
  }
  return {
    total: approvals.length,
    pending,
    approved,
    rejected,
    expired,
    totalWaitMs,
  };
}

export function flowFindingSuggestionTitle(finding: FlowFinding): string {
  const prefix = `Quality Arbitration ${finding.id}: `;
  const claim = finding.claim.replace(/\s+/g, " ").trim();
  return `${prefix}${claim}`.slice(0, 200);
}
