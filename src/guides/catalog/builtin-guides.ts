import {
  guideDefinitionSchema,
  type GuideDefinition,
} from "../schemas/guide-schema.js";

export const qualityArbitrationGuide = guideDefinitionSchema.parse({
  id: "quality-arbitration",
  version: 1,
  label: "Quality Arbitration",
  description:
    "Cross-provider planning, review, implementation, challenge, second review, and Amaco decision summary.",
  slots: {
    builder: {
      label: "Builder",
      description: "Plans, implements, and answers review findings.",
      defaultAgent: "executor",
    },
    challenger: {
      label: "Challenger",
      description: "Challenges plans and code before the final decision.",
      defaultAgent: "reviewer",
    },
    arbiter: {
      label: "Arbiter",
      description: "Summarizes evidence, disagreement, and residual risk.",
      defaultAgent: "verifier",
    },
  },
  steps: [
    {
      id: "plan",
      label: "Plan",
      kind: "agent-turn",
      slot: "builder",
      agentId: "planner",
      inputs: ["task-brief"],
      outputs: ["plan"],
    },
    {
      id: "plan-review",
      label: "Plan Review",
      kind: "review-turn",
      slot: "challenger",
      agentId: "reviewer",
      inputs: ["task-brief", "plan"],
      outputs: ["findings"],
      optional: true,
    },
    {
      id: "implement",
      label: "Implement",
      kind: "agent-turn",
      slot: "builder",
      agentId: "executor",
      inputs: ["task-brief", "plan", "findings"],
      outputs: ["execution", "diff"],
    },
    {
      id: "validation",
      label: "Validate",
      kind: "validation",
      inputs: ["diff"],
      outputs: ["validation"],
    },
    {
      id: "implementation-review",
      label: "Implementation Review",
      kind: "review-turn",
      slot: "challenger",
      agentId: "reviewer",
      inputs: ["plan", "diff", "validation"],
      outputs: ["findings", "review-decision"],
    },
    {
      id: "challenge-response",
      label: "Challenge Response",
      kind: "response-turn",
      slot: "builder",
      agentId: "fixer",
      inputs: ["findings", "diff", "validation"],
      outputs: ["finding-responses", "diff"],
    },
    {
      id: "second-review",
      label: "Second Review",
      kind: "review-turn",
      slot: "challenger",
      agentId: "reviewer",
      inputs: ["findings", "finding-responses", "diff", "validation"],
      outputs: ["finding-resolutions", "review-decision"],
    },
    {
      id: "decision-summary",
      label: "Decision Summary",
      kind: "summary-turn",
      slot: "arbiter",
      agentId: "verifier",
      inputs: [
        "plan",
        "findings",
        "finding-responses",
        "finding-resolutions",
        "diff",
        "validation",
      ],
      outputs: ["decision-summary"],
    },
  ],
});

export const builtinGuides: readonly GuideDefinition[] = [
  qualityArbitrationGuide,
];

export function findBuiltinGuide(id: string): GuideDefinition | null {
  return builtinGuides.find((guide) => guide.id === id) ?? null;
}
