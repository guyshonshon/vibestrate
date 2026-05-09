import { describe, it, expect } from "vitest";
import {
  effectiveReviewDecision,
  effectiveVerificationDecision,
  parseReviewDecision,
  parseVerificationDecision,
} from "../src/core/review-parser.js";

describe("review parser", () => {
  it("parses APPROVED", () => {
    expect(parseReviewDecision("DECISION: APPROVED").decision).toBe("APPROVED");
  });

  it("parses CHANGES_REQUESTED", () => {
    const text = "Some review\n\nDECISION: CHANGES_REQUESTED\n\nFindings...";
    expect(parseReviewDecision(text).decision).toBe("CHANGES_REQUESTED");
  });

  it("parses BLOCKED", () => {
    expect(parseReviewDecision("DECISION: BLOCKED").decision).toBe("BLOCKED");
  });

  it("returns null + reason on missing decision", () => {
    const r = parseReviewDecision("no decision here");
    expect(r.decision).toBeNull();
    expect(r.reason).toMatch(/DECISION/);
  });

  it("treats invalid review as BLOCKED via effective decision", () => {
    expect(effectiveReviewDecision("garbage")).toBe("BLOCKED");
  });
});

describe("verification parser", () => {
  it("parses PASSED, FAILED, NEEDS_HUMAN", () => {
    expect(parseVerificationDecision("VERIFICATION: PASSED").decision).toBe("PASSED");
    expect(parseVerificationDecision("VERIFICATION: FAILED").decision).toBe("FAILED");
    expect(parseVerificationDecision("VERIFICATION: NEEDS_HUMAN").decision).toBe(
      "NEEDS_HUMAN",
    );
  });

  it("treats missing verification as NEEDS_HUMAN via effective decision", () => {
    expect(effectiveVerificationDecision("nothing")).toBe("NEEDS_HUMAN");
  });
});
