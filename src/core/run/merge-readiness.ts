// ── Merge-readiness predicate (extracted for the P4b invariant tests) ───────
//
// The one place that says when a run may end `merge_ready`. Extracted from the
// flow runner so the express-flow skip semantics are a TESTED invariant, not
// prose: review-skip evidence satisfies the review requirement ONLY when no
// review turn ran at all (a review that ran and objected always wins), only on
// a non-read-only run, and never substitutes for validation/verification.

import type { ReviewDecision, VerificationDecision } from "../state-machine.js";

export type ReviewSkipEvidence = {
  /** The skipWhen step the deterministic evaluator skipped. */
  stepId: string;
  /** The strict-prose, unprotected files the decision was made from. */
  files: string[];
};

export type MergeReadinessInput = {
  readOnly: boolean;
  reviewDecision: ReviewDecision;
  /** True when the resolved flow declares ANY review-turn step. A read-only flow
   *  with no review step (e.g. the spec-up-intake enrichment phase) has nothing to
   *  approve - completing its steps IS success, not `blocked`. */
  hasReviewStep: boolean;
  /** True when ANY review-turn actually executed (even without a decision). */
  reviewTurnRan: boolean;
  /** Set ONLY by the deterministic inert-diff evaluator (review-descent.ts). */
  reviewSkipEvidence: ReviewSkipEvidence | null;
  validationPassed: boolean;
  /** A verify (summary-turn) step produced an artifact. */
  verified: boolean;
  verificationDecision: VerificationDecision;
  /** Optional cap from the per-item checklist review band (Shape B). When false,
   *  at least one checklist item has open findings or a changes_requested verdict,
   *  so the run cannot be merge_ready regardless of the main review lane.
   *  Undefined is treated as true so all existing callers/tests are unaffected. */
  checklistItemsClean?: boolean;
  /** Optional cap from `block`-tier project policies (policy-block.ts). When false,
   *  a confirmed block policy's regex matched the run's added diff, so the run
   *  cannot be merge_ready - DETERMINISTIC, independent of the model reviewer's
   *  decision (it never touches reviewDecision, so it cannot clobber the
   *  correctness verdict). Undefined is treated as true so existing callers are
   *  unaffected. */
  policiesClean?: boolean;
};

/** Review is satisfied by an APPROVED decision, or - express only - by skip
 *  evidence when no review turn ran. A review that ran always wins over
 *  evidence; read-only runs never use evidence (their diff is empty by
 *  construction, so evidence there would be vacuous, not earned). */
export function isReviewSatisfied(i: MergeReadinessInput): boolean {
  if (i.reviewDecision === "APPROVED") return true;
  return !i.readOnly && !i.reviewTurnRan && i.reviewSkipEvidence !== null;
}

export function computeMergeReady(i: MergeReadinessInput): boolean {
  if (i.readOnly) {
    // A read-only run with NO review step (the spec-up-intake enrichment phase, or
    // any no-reviewer single-turn read-only flow) has nothing to approve: it is
    // merge_ready on completion - provided any validation it ran still passed
    // (it never can for spec-up-intake, but this keeps the invariant honest for a
    // future no-reviewer read-only flow that DOES validate). A read-only run that
    // DOES declare a reviewer still requires a real APPROVED decision (a genuine
    // CHANGES_REQUESTED must still block).
    if (!i.hasReviewStep) return i.validationPassed;
    return i.reviewDecision === "APPROVED";
  }
  return (
    isReviewSatisfied(i) &&
    i.validationPassed &&
    (!i.verified || i.verificationDecision === "PASSED") &&
    (i.checklistItemsClean ?? true) &&
    (i.policiesClean ?? true)
  );
}
