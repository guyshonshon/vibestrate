import { describe, it, expect } from "vitest";
import { flowDefinitionSchema } from "../src/flows/schemas/flow-schema.js";

// plan (once) → [micro-plan, implement] (per item) → review (once) → fix (once)
function flow(extra: Record<string, unknown>) {
  return {
    id: "pickup",
    version: 1,
    label: "Pickup",
    description: "A checklist-aware pick-up flow.",
    seats: {
      planner: { label: "Planner" },
      builder: { label: "Builder" },
      reviewer: { label: "Reviewer" },
    },
    steps: [
      { id: "plan", label: "Plan", kind: "agent-turn", seat: "planner" },
      { id: "micro-plan", label: "Micro-plan", kind: "agent-turn", seat: "planner" },
      { id: "implement", label: "Implement", kind: "agent-turn", seat: "builder" },
      { id: "review", label: "Review", kind: "review-turn", seat: "reviewer" },
      { id: "fix", label: "Fix", kind: "response-turn", seat: "builder" },
    ],
    ...extra,
  };
}

describe("flow checklistSegment schema", () => {
  it("accepts a segment that ends before the review loop", () => {
    const r = flowDefinitionSchema.safeParse(
      flow({
        checklistSegment: { from: "micro-plan", to: "implement" },
        loop: { from: "review", to: "fix", decisionStep: "review", maxIterations: 2 },
      }),
    );
    expect(r.success).toBe(true);
  });

  it("accepts a segment with no loop", () => {
    expect(
      flowDefinitionSchema.safeParse(
        flow({ checklistSegment: { from: "micro-plan", to: "implement" } }),
      ).success,
    ).toBe(true);
  });

  it("rejects unknown from/to step ids", () => {
    expect(
      flowDefinitionSchema.safeParse(
        flow({ checklistSegment: { from: "nope", to: "implement" } }),
      ).success,
    ).toBe(false);
  });

  it("rejects from after to", () => {
    expect(
      flowDefinitionSchema.safeParse(
        flow({ checklistSegment: { from: "implement", to: "micro-plan" } }),
      ).success,
    ).toBe(false);
  });

  it("rejects a segment that overlaps the adaptive loop", () => {
    const r = flowDefinitionSchema.safeParse(
      flow({
        // segment runs through `review`, which is where the loop begins → overlap
        checklistSegment: { from: "micro-plan", to: "review" },
        loop: { from: "review", to: "fix", decisionStep: "review", maxIterations: 2 },
      }),
    );
    expect(r.success).toBe(false);
  });

  it("a flow with no segment still parses", () => {
    expect(flowDefinitionSchema.safeParse(flow({})).success).toBe(true);
  });
});
