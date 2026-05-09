import type { ReviewDecision, VerificationDecision } from "./state-machine.js";

const REVIEW_LINE_RE = /^\s*DECISION\s*:\s*(APPROVED|CHANGES_REQUESTED|BLOCKED)\s*$/m;
const VERIFY_LINE_RE = /^\s*VERIFICATION\s*:\s*(PASSED|FAILED|NEEDS_HUMAN)\s*$/m;

export type ReviewParseResult = {
  decision: ReviewDecision | null;
  reason: string | null;
};

export type VerificationParseResult = {
  decision: VerificationDecision | null;
  reason: string | null;
};

export function parseReviewDecision(text: string): ReviewParseResult {
  const match = text.match(REVIEW_LINE_RE);
  if (!match) {
    return {
      decision: null,
      reason: "Reviewer did not provide a valid DECISION line.",
    };
  }
  return { decision: match[1] as ReviewDecision, reason: null };
}

export function parseVerificationDecision(text: string): VerificationParseResult {
  const match = text.match(VERIFY_LINE_RE);
  if (!match) {
    return {
      decision: null,
      reason: "Verifier did not provide a valid VERIFICATION line.",
    };
  }
  return { decision: match[1] as VerificationDecision, reason: null };
}

export function effectiveReviewDecision(text: string): ReviewDecision {
  const parsed = parseReviewDecision(text);
  return parsed.decision ?? "BLOCKED";
}

export function effectiveVerificationDecision(text: string): VerificationDecision {
  const parsed = parseVerificationDecision(text);
  return parsed.decision ?? "NEEDS_HUMAN";
}
