import type { ReviewDecision, VerificationDecision } from "./state-machine.js";

const REVIEW_LINE_RE = /^\s*DECISION\s*:\s*(APPROVED|CHANGES_REQUESTED|BLOCKED)\s*$/m;
const VERIFY_LINE_RE = /^\s*VERIFICATION\s*:\s*(PASSED|FAILED|NEEDS_HUMAN)\s*$/m;

// Advisory "a human should look at this" marker (Phase 3). Non-blocking — the
// run still reaches its terminal verdict; the linked card is flagged so a human
// can eyeball something the model can't perceive (visual/UX/3D), then pass it or
// send it back. Distinct from HUMAN_APPROVAL, which blocks.
const NEEDS_TESTING_RE = /^\s*HUMAN_REVIEW\s*:\s*ADVISORY\s*$/m;
const NEEDS_TESTING_REASON_RE = /^\s*HUMAN_REVIEW_REASON\s*:\s*(.+)$/m;

export type NeedsTestingSignal = {
  advisory: boolean;
  reason: string | null;
};

/** Detect a non-blocking "needs human testing" advisory in agent output. */
export function detectNeedsTesting(text: string): NeedsTestingSignal {
  if (!text || !NEEDS_TESTING_RE.test(text)) {
    return { advisory: false, reason: null };
  }
  const reason = text.match(NEEDS_TESTING_REASON_RE);
  return { advisory: true, reason: reason ? reason[1]!.trim() : null };
}

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
