export const fakeQualityArbitrationGuide = {
  id: "quality-arbitration-fixture",
  version: 1,
  label: "Quality Arbitration Fixture",
  description: "Deterministic Guide fixture for schema and output contract tests.",
  slots: {
    builder: {
      label: "Builder",
      defaultAgent: "executor",
    },
    challenger: {
      label: "Challenger",
      defaultAgent: "reviewer",
    },
    arbiter: {
      label: "Arbiter",
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
      id: "implementation-review",
      label: "Implementation Review",
      kind: "review-turn",
      slot: "challenger",
      agentId: "reviewer",
      inputs: ["plan", "diff"],
      outputs: ["findings"],
    },
    {
      id: "challenge-response",
      label: "Challenge Response",
      kind: "response-turn",
      slot: "builder",
      agentId: "fixer",
      inputs: ["findings"],
      outputs: ["finding-responses"],
    },
    {
      id: "decision-summary",
      label: "Decision Summary",
      kind: "summary-turn",
      slot: "arbiter",
      agentId: "verifier",
      inputs: ["findings", "finding-responses"],
      outputs: ["decision-summary"],
    },
  ],
} as const;

export const fakeGuideFindingsOutput = {
  contract: "amaco.guide.findings.v1",
  stepId: "implementation-review",
  findings: [
    {
      id: "finding-tests",
      severity: "high",
      category: "tests",
      claim: "The write path changed without coverage for the failure path.",
      evidence: [{ kind: "diff", ref: "artifacts/guides/implement/diff.patch" }],
      recommendation: "Add a regression test for the failed write.",
    },
  ],
} as const;

export const fakeGuideFindingResponsesOutput = {
  contract: "amaco.guide.finding-responses.v1",
  stepId: "challenge-response",
  responses: [
    {
      findingId: "finding-tests",
      disposition: "fix",
      rationale: "Added a failing-path regression test and kept the implementation change.",
      evidence: [{ kind: "validation", ref: "artifacts/validation/results.json" }],
    },
  ],
} as const;

export const fakeGuideDecisionSummaryOutput = {
  contract: "amaco.guide.decision-summary.v1",
  stepId: "decision-summary",
  recommendation: "merge-ready",
  summary: "The review finding was fixed and validation evidence is present.",
  validation: {
    status: "passed",
    evidence: [{ kind: "validation", ref: "artifacts/validation/results.json" }],
  },
  agreementFindingIds: ["finding-tests"],
  disagreementFindingIds: [],
  residualRisks: [],
  requiredHumanActions: [],
} as const;
