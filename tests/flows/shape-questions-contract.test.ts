import { describe, it, expect } from "vitest";
import {
  flowShapeQuestionSchema,
  flowQuestionsOutputSchema,
  FLOW_QUESTIONS_CONTRACT,
} from "../../src/flows/schemas/flow-output-contracts.js";

const baseQ = {
  id: "accounts",
  question: "Do users sign in?",
  why: "Decides whether you need an auth system.",
  kind: "choice" as const,
  options: ["yes", "no"],
};

describe("shape question contract: model-emitted category", () => {
  it("requires a category from the fixed set", () => {
    // category is now a required, model-judged field.
    expect(flowShapeQuestionSchema.safeParse(baseQ).success).toBe(false);
    expect(
      flowShapeQuestionSchema.safeParse({ ...baseQ, category: "users" }).success,
    ).toBe(true);
    expect(
      flowShapeQuestionSchema.safeParse({ ...baseQ, category: "nonsense" })
        .success,
    ).toBe(false);
  });

  it("does NOT carry a model-emitted round (round is server state)", () => {
    // round must not be accepted from the model (strict schema rejects extras).
    const parsed = flowShapeQuestionSchema.safeParse({
      ...baseQ,
      category: "users",
      round: 2,
    });
    expect(parsed.success).toBe(false);
  });
});

describe("shape questions output contract: coverageComplete + empty set", () => {
  it("accepts coverageComplete:true with zero questions (gap-check says done)", () => {
    const parsed = flowQuestionsOutputSchema.safeParse({
      contract: FLOW_QUESTIONS_CONTRACT,
      stepId: "intake",
      coverageComplete: true,
      questions: [],
    });
    expect(parsed.success).toBe(true);
  });

  it("still accepts a normal non-empty categorized question set", () => {
    const parsed = flowQuestionsOutputSchema.safeParse({
      contract: FLOW_QUESTIONS_CONTRACT,
      stepId: "intake",
      questions: [{ ...baseQ, category: "users" }],
    });
    expect(parsed.success).toBe(true);
  });
});
