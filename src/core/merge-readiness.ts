// ── Merge-readiness predicate (extracted for the P4b invariant tests) ───────
//
// The one place that says when a run may end `merge_ready`. Extracted from the
// flow runner so the express-flow skip semantics are a TESTED invariant, not
// prose: review-skip evidence satisfies the review requirement ONLY when no
// review turn ran at all (a review that ran and objected always wins), only on
// a non-read-only run, and never substitutes for validation/verification.

import type { ReviewDecision, VerificationDecision } from "./state-machine.js";

export type ReviewSkipEvidence = {
  /** The skipWhen step the deterministic evaluator skipped. */
  stepId: string;
  /** The strict-prose, unprotected files the decision was made from. */
  files: string[];
};

export type MergeReadinessInput = {
  readOnly: boolean;
  reviewDecision: ReviewDecision;
  /** True when ANY review-turn actually executed (even without a decision). */
  reviewTurnRan: boolean;
  /** Set ONLY by the deterministic inert-diff evaluator (review-descent.ts). */
  reviewSkipEvidence: ReviewSkipEvidence | null;
  validationPassed: boolean;
  /** A verify (summary-turn) step produced an artifact. */
  verified: boolean;
  verificationDecision: VerificationDecision;
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
  if (i.readOnly) return i.reviewDecision === "APPROVED";
  return (
    isReviewSatisfied(i) &&
    i.validationPassed &&
    (!i.verified || i.verificationDecision === "PASSED")
  );
}
