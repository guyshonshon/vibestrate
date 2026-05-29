import { describe, it, expect } from "vitest";
import { flowDefinitionSchema } from "../src/flows/schemas/flow-schema.js";

function baseFlow(loop: unknown) {
  return {
    id: "looping",
    version: 1,
    label: "Looping",
    description: "A flow with an adaptive review loop.",
    seats: {
      builder: { label: "Builder" },
      reviewer: { label: "Reviewer" },
    },
    steps: [
      { id: "implement", label: "Implement", kind: "agent-turn", seat: "builder" },
      { id: "review", label: "Review", kind: "review-turn", seat: "reviewer" },
      { id: "fix", label: "Fix", kind: "response-turn", seat: "builder" },
    ],
    loop,
  };
}

describe("flow adaptive loop schema", () => {
  it("accepts a valid loop gated by a review-turn inside the body", () => {
    const r = flowDefinitionSchema.safeParse(
      baseFlow({ from: "review", to: "fix", decisionStep: "review", maxIterations: 2 }),
    );
    expect(r.success).toBe(true);
  });

  it("rejects a decisionStep that isn't a review-turn", () => {
    const r = flowDefinitionSchema.safeParse(
      baseFlow({ from: "review", to: "fix", decisionStep: "fix", maxIterations: 2 }),
    );
    expect(r.success).toBe(false);
  });

  it("rejects a decisionStep outside the from..to body", () => {
    const r = flowDefinitionSchema.safeParse(
      baseFlow({ from: "fix", to: "fix", decisionStep: "review", maxIterations: 2 }),
    );
    expect(r.success).toBe(false);
  });

  it("rejects from after to, and unknown step ids", () => {
    expect(
      flowDefinitionSchema.safeParse(
        baseFlow({ from: "fix", to: "review", decisionStep: "review", maxIterations: 2 }),
      ).success,
    ).toBe(false);
    expect(
      flowDefinitionSchema.safeParse(
        baseFlow({ from: "nope", to: "fix", decisionStep: "review", maxIterations: 2 }),
      ).success,
    ).toBe(false);
  });

  it("a flow with no loop still parses", () => {
    const r = flowDefinitionSchema.safeParse(baseFlow(undefined));
    expect(r.success).toBe(true);
  });
});
