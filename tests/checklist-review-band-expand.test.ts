import { describe, it, expect } from "vitest";
import { expandChecklistReviewBand } from "../src/flows/runtime/flow-resolver.js";
import { pickupReviewFlow } from "../src/flows/catalog/builtin-flows.js";

const seg = { from: "micro-plan", to: "arbiter" } as const;

describe("expandChecklistReviewBand", () => {
  it("generates one reviewer step per lens and rewires the arbiter", () => {
    const steps = expandChecklistReviewBand(pickupReviewFlow.steps, seg, [
      "correctness",
      "tests",
      "security-risk",
    ]);
    const ids = steps.map((s) => s.id);
    expect(ids).toContain("review-correctness");
    expect(ids).toContain("review-tests");
    expect(ids).toContain("review-security-risk");
    const arbiter = steps.find((s) => s.id === "arbiter")!;
    expect(arbiter.needs).toEqual([
      "review-correctness",
      "review-tests",
      "review-security-risk",
    ]);
    // arbiter consumes each generated reviewer's findings token
    expect(arbiter.inputs).toEqual(
      expect.arrayContaining([
        "findings-correctness",
        "findings-tests",
        "findings-security-risk",
      ]),
    );
  });

  it("a single lens yields a single reviewer the arbiter needs", () => {
    const steps = expandChecklistReviewBand(pickupReviewFlow.steps, seg, ["correctness"]);
    const reviewers = steps.filter(
      (s) => s.kind === "review-turn" && s.id.startsWith("review-") && s.id !== "review",
    );
    expect(reviewers.map((s) => s.id)).toEqual(["review-correctness"]);
    expect(steps.find((s) => s.id === "arbiter")!.needs).toEqual(["review-correctness"]);
  });

  it("each generated reviewer is read-only (review-turn), continueOnError, needs the writer, emits findings-<lens>", () => {
    const steps = expandChecklistReviewBand(pickupReviewFlow.steps, seg, ["authz"]);
    const r = steps.find((s) => s.id === "review-authz")!;
    expect(r.kind).toBe("review-turn");
    expect(r.seat).toBe("reviewer");
    expect(r.continueOnError).toBe(true);
    expect(r.needs).toEqual(["implement"]);
    expect(r.outputs).toEqual(["findings-authz"]);
    expect(r.instructions && r.instructions.length).toBeGreaterThan(0);
  });

  it("default lenses reproduce the flow's own reviewer ids (no surprise churn)", () => {
    const steps = expandChecklistReviewBand(pickupReviewFlow.steps, seg, [
      "correctness",
      "security-risk",
    ]);
    const reviewers = steps
      .filter((s) => s.kind === "review-turn" && s.id !== "review" && s.id !== "arbiter")
      .map((s) => s.id);
    expect(reviewers).toEqual(["review-correctness", "review-security-risk"]);
  });

  it("dedupes repeated lenses", () => {
    const steps = expandChecklistReviewBand(pickupReviewFlow.steps, seg, [
      "correctness",
      "correctness",
    ]);
    const reviewers = steps.filter(
      (s) => s.kind === "review-turn" && s.id !== "review" && s.id !== "arbiter",
    );
    expect(reviewers.map((s) => s.id)).toEqual(["review-correctness"]);
  });

  it("does NOT emit a bare arbitration token in the band (findings-<lens> never equals 'findings')", () => {
    const steps = expandChecklistReviewBand(pickupReviewFlow.steps, seg, [
      "correctness",
      "security-risk",
    ]);
    for (const s of steps) {
      if (s.id === "review") continue; // the holistic postlude is outside the band
      expect(s.outputs ?? []).not.toContain("findings");
      expect(s.outputs ?? []).not.toContain("decision-summary");
    }
  });
});
