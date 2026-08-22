import { describe, it, expect } from "vitest";
import { drainGuidanceFor } from "../src/core/run/guidance-service.js";

const g = (note: string, stepId: string | null = null) => ({
  note,
  at: "2026-08-22T00:00:00.000Z",
  stepId,
});

describe("drainGuidanceFor - which queued notes land on this step", () => {
  it("gives an unaimed note to whatever step runs next", () => {
    const { text, remaining } = drainGuidanceFor([g("use integer cents")], "implement");
    expect(text).toBe("use integer cents");
    expect(remaining).toEqual([]);
  });

  it("holds a step-aimed note until that step runs", () => {
    const q = [g("be stricter", "review-authz")];
    const atImplement = drainGuidanceFor(q, "implement");
    expect(atImplement.text).toBeNull();
    // still queued, so the later step still gets it
    expect(drainGuidanceFor(atImplement.remaining, "review-authz").text).toBe("be stricter");
  });

  it("joins several notes for the same step in the order they were queued", () => {
    const { text } = drainGuidanceFor([g("first"), g("second")], "fix");
    expect(text).toBe("first\n\nsecond");
  });

  it("drains only what applies and leaves the rest queued", () => {
    const q = [g("anyone"), g("only fix", "fix"), g("only verify", "verify")];
    const { text, remaining } = drainGuidanceFor(q, "fix");
    expect(text).toBe("anyone\n\nonly fix");
    expect(remaining.map((r) => r.note)).toEqual(["only verify"]);
  });

  it("is a no-op on an empty queue, so an unguided step is byte-identical", () => {
    expect(drainGuidanceFor([], "plan")).toEqual({ text: null, remaining: [] });
  });
});
