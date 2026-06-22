import { describe, it, expect } from "vitest";
import { resolveChecklistReviewLenses } from "../src/flows/runtime/flow-resolver.js";
import { flowDefinitionSchema } from "../src/flows/schemas/flow-schema.js";

describe("checklist review lenses", () => {
  it("defaults to correctness + security-risk", () => {
    expect(resolveChecklistReviewLenses({})).toEqual([
      "correctness",
      "security-risk",
    ]);
  });
  it("flow overrides default; crew overrides flow", () => {
    expect(
      resolveChecklistReviewLenses({ flowLenses: ["correctness"] }),
    ).toEqual(["correctness"]);
    expect(
      resolveChecklistReviewLenses({
        flowLenses: ["correctness"],
        crewLenses: ["tests", "security-risk"],
      }),
    ).toEqual(["tests", "security-risk"]);
  });
  it("flow schema accepts checklistReview.lenses and rejects an unknown lens", () => {
    const ok = flowDefinitionSchema.safeParse({
      id: "f",
      version: 1,
      label: "F",
      description: "Test flow",
      seats: { x: { label: "X" } },
      steps: [
        {
          id: "s",
          label: "S",
          kind: "agent-turn",
          seat: "x",
          stage: "executing",
          inputs: [],
          outputs: ["o"],
        },
      ],
      checklistReview: { lenses: ["correctness", "security-risk"] },
    });
    expect(ok.success).toBe(true);
    const bad = flowDefinitionSchema.safeParse({
      id: "f",
      version: 1,
      label: "F",
      description: "Test flow",
      seats: { x: { label: "X" } },
      steps: [
        {
          id: "s",
          label: "S",
          kind: "agent-turn",
          seat: "x",
          stage: "executing",
          inputs: [],
          outputs: ["o"],
        },
      ],
      checklistReview: { lenses: ["made-up-lens"] },
    });
    expect(bad.success).toBe(false);
  });
});
