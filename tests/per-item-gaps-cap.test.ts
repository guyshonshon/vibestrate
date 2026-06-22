import { describe, it, expect } from "vitest";
import { checklistItemGapsCap } from "../src/safety/run-assurance.js";
import { computeMergeReady, type MergeReadinessInput } from "../src/core/merge-readiness.js";

describe("checklist per-item gaps cap", () => {
  it("caps merge-readiness when any item has open findings", () => {
    const cap = checklistItemGapsCap([
      { itemIndex: 0, verdict: "approved", openFindingCount: 0 },
      { itemIndex: 1, verdict: "changes_requested", openFindingCount: 2 },
    ]);
    expect(cap.caps).toBe(true);
    expect(cap.note).toMatch(/item 2/i);
  });

  it("caps when verdict is changes_requested even with 0 openFindingCount", () => {
    const cap = checklistItemGapsCap([
      { itemIndex: 0, verdict: "changes_requested", openFindingCount: 0 },
    ]);
    expect(cap.caps).toBe(true);
    expect(cap.note).toMatch(/item 1/i);
  });

  it("does not cap when every item is clean", () => {
    const cap = checklistItemGapsCap([{ itemIndex: 0, verdict: "approved", openFindingCount: 0 }]);
    expect(cap.caps).toBe(false);
  });

  it("does not cap a run with no per-item review (empty verdicts)", () => {
    expect(checklistItemGapsCap([]).caps).toBe(false);
  });

  it("note names all gapped items and includes human-review reminder", () => {
    const cap = checklistItemGapsCap([
      { itemIndex: 0, verdict: "changes_requested", openFindingCount: 0 },
      { itemIndex: 2, verdict: "approved", openFindingCount: 1 },
    ]);
    expect(cap.caps).toBe(true);
    expect(cap.note).toMatch(/item 1/i);
    expect(cap.note).toMatch(/item 3/i);
    expect(cap.note).toMatch(/human/i);
  });
});

// ── computeMergeReady back-compat + cap ────────────────────────────────────

const baseWriteFlow: MergeReadinessInput = {
  readOnly: false,
  reviewDecision: "APPROVED",
  hasReviewStep: true,
  reviewTurnRan: true,
  reviewSkipEvidence: null,
  validationPassed: true,
  verified: false,
  verificationDecision: "NEEDS_HUMAN",
};

describe("computeMergeReady - checklistItemsClean field", () => {
  it("merge-ready when field is omitted (back-compat)", () => {
    expect(computeMergeReady(baseWriteFlow)).toBe(true);
  });

  it("merge-ready when checklistItemsClean is true", () => {
    expect(computeMergeReady({ ...baseWriteFlow, checklistItemsClean: true })).toBe(true);
  });

  it("not merge-ready when checklistItemsClean is false (gapped checklist run)", () => {
    expect(computeMergeReady({ ...baseWriteFlow, checklistItemsClean: false })).toBe(false);
  });

  it("non-checklist run: empty itemOutcomes -> caps:false -> clean:true -> no behavior change", () => {
    // Simulates the orchestrator path: no checklist items -> gap cap not applied
    const itemGaps = checklistItemGapsCap([]);
    expect(itemGaps.caps).toBe(false);
    expect(computeMergeReady({ ...baseWriteFlow, checklistItemsClean: !itemGaps.caps })).toBe(true);
  });
});
