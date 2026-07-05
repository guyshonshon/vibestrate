import { describe, it, expect } from "vitest";
import {
  PONYTAIL_POSTURE,
  isCodeWritingStep,
  renderPonytailBlock,
} from "../src/orchestrator/ponytail-posture.js";
import { composeReviewerStepNotes } from "../src/orchestrator/review-lenses.js";
import { defaultFlow } from "../src/flows/catalog/builtin-flows.js";

// The default flow's real steps, so the test asserts against the shipped seats.
const stepById = (id: string) => {
  const s = defaultFlow.steps.find((st) => st.id === id);
  if (!s) throw new Error(`no step ${id} in defaultFlow`);
  return s;
};

describe("ponytail - code-writing seat discriminator", () => {
  it("targets the implementer/fixer (executing model turns that emit a diff)", () => {
    expect(isCodeWritingStep(stepById("implement"))).toBe(true);
    expect(isCodeWritingStep(stepById("fix"))).toBe(true);
  });

  it("excludes planners, reviewers, validation, and the verify/summary turn", () => {
    expect(isCodeWritingStep(stepById("plan"))).toBe(false); // planning
    expect(isCodeWritingStep(stepById("architecture"))).toBe(false); // architecting
    expect(isCodeWritingStep(stepById("review"))).toBe(false); // review-turn
    expect(isCodeWritingStep(stepById("validation"))).toBe(false); // deterministic
    expect(isCodeWritingStep(stepById("verify"))).toBe(false); // summary/verifying
  });
});

describe("ponytail - block rendering respects the config knob", () => {
  it("enabled -> the verbatim vendored posture", () => {
    expect(renderPonytailBlock(true)).toBe(PONYTAIL_POSTURE);
  });
  it("disabled -> null (nothing injected)", () => {
    expect(renderPonytailBlock(false)).toBeNull();
  });
});

describe("ponytail - injection through composeReviewerStepNotes", () => {
  const base = { baseNotes: "BASE", lensEmphasis: null, policyAdviseBlock: null };
  const block = renderPonytailBlock(true);

  it("a code-writing seat's prompt CONTAINS the posture", () => {
    const notes = composeReviewerStepNotes({
      ...base,
      isReviewer: false,
      ponytailBlock: block,
      isCodeWriting: true,
    });
    expect(notes).toContain("lazy senior developer");
    expect(notes).toContain("stop at the first rung");
  });

  it("a reviewer seat's prompt does NOT contain the posture", () => {
    const notes = composeReviewerStepNotes({
      ...base,
      isReviewer: true,
      ponytailBlock: block,
      isCodeWriting: false, // reviewers are not code-writing seats
    });
    expect(notes).not.toContain("lazy senior developer");
    expect(notes).not.toContain("stop at the first rung");
  });

  it("ponytail:false (block null) -> no seat's prompt contains it", () => {
    const off = renderPonytailBlock(false);
    for (const isCodeWriting of [true, false]) {
      const notes = composeReviewerStepNotes({
        ...base,
        isReviewer: !isCodeWriting,
        ponytailBlock: off,
        isCodeWriting,
      });
      expect(notes).not.toContain("lazy senior developer");
    }
  });
});
