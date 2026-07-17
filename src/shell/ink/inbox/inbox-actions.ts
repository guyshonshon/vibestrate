// Thin wrappers used by the Approvals + Suggestions pages. Each
// returns the standard {ok, message} shape so the page can render
// a toast without try/catch.

import { ApprovalService } from "../../../core/run/approval-service.js";
import { ReviewSuggestionService } from "../../../reviews/review-suggestion-service.js";

export type InboxResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export async function approveApproval(
  projectRoot: string,
  runId: string,
  approvalId: string,
): Promise<InboxResult> {
  try {
    const svc = new ApprovalService(projectRoot, runId);
    await svc.approve({ approvalId });
    return { ok: true, message: `Approved ${approvalId}.` };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function rejectApproval(
  projectRoot: string,
  runId: string,
  approvalId: string,
): Promise<InboxResult> {
  try {
    const svc = new ApprovalService(projectRoot, runId);
    await svc.reject({ approvalId });
    return { ok: true, message: `Rejected ${approvalId}.` };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function requestChangesApproval(
  projectRoot: string,
  runId: string,
  approvalId: string,
  guidance: string,
): Promise<InboxResult> {
  try {
    const svc = new ApprovalService(projectRoot, runId);
    const before = await svc.get(approvalId);
    // Only an agent-requested gate has a turn to re-run; fail closed on a policy gate.
    if (before?.source === "policy") {
      return {
        ok: false,
        message: "Request-changes is only for agent-requested gates.",
      };
    }
    if (!guidance.trim()) {
      return { ok: false, message: "Guidance is required." };
    }
    await svc.requestChanges({ approvalId, guidance });
    return { ok: true, message: `Returned ${approvalId} for changes.` };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function approveSuggestion(
  projectRoot: string,
  runId: string,
  suggestionId: string,
): Promise<InboxResult> {
  try {
    const svc = new ReviewSuggestionService(projectRoot, runId);
    await svc.approve(suggestionId);
    return { ok: true, message: `Approved ${suggestionId}.` };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function rejectSuggestion(
  projectRoot: string,
  runId: string,
  suggestionId: string,
): Promise<InboxResult> {
  try {
    const svc = new ReviewSuggestionService(projectRoot, runId);
    await svc.reject(suggestionId);
    return { ok: true, message: `Rejected ${suggestionId}.` };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
