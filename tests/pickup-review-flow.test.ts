import { describe, it, expect } from "vitest";
import { pickupReviewFlow } from "../src/flows/catalog/builtin-flows.js";

describe("pickup-review builtin", () => {
  it("has a per-item review band ending in an arbiter", () => {
    expect(pickupReviewFlow.id).toBe("pickup-review");
    expect(pickupReviewFlow.checklistSegment).toEqual({ from: "micro-plan", to: "arbiter" });
    const ids = pickupReviewFlow.steps.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(["micro-plan", "implement", "review-correctness", "review-security-risk", "arbiter"]));
  });
  it("reviewers are read-only review-turns; arbiter joins them", () => {
    const arb = pickupReviewFlow.steps.find((s) => s.id === "arbiter")!;
    expect(arb.kind).toBe("review-turn");
    expect(arb.needs).toEqual(expect.arrayContaining(["review-correctness", "review-security-risk"]));
    const rc = pickupReviewFlow.steps.find((s) => s.id === "review-correctness")!;
    expect(rc.kind).toBe("review-turn");
    expect(rc.needs).toContain("implement");
    expect(rc.continueOnError).toBe(true);
  });
  it("implement accepts an optional per-item-findings input (fix context)", () => {
    const impl = pickupReviewFlow.steps.find((s) => s.id === "implement")!;
    expect(impl.inputs).toContain("per-item-findings");
  });
});
