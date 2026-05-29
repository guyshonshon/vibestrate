export const fakeQualityArbitrationFlow = {
  id: "quality-arbitration-fixture",
  version: 1,
  label: "Quality Arbitration Fixture",
  description: "Deterministic Flow fixture for schema and output contract tests.",
  seats: {
    builder: {
      label: "Builder",
    },
    challenger: {
      label: "Challenger",
    },
    arbiter: {
      label: "Arbiter",
    },
  },
  steps: [
    {
      id: "plan",
      label: "Plan",
      kind: "agent-turn",
      seat: "builder",
      inputs: ["task-brief"],
      outputs: ["plan"],
    },
    {
      id: "implementation-review",
      label: "Implementation Review",
      kind: "review-turn",
      seat: "challenger",
      inputs: ["plan", "diff"],
      outputs: ["findings"],
    },
    {
      id: "challenge-response",
      label: "Challenge Response",
      kind: "response-turn",
      seat: "builder",
      inputs: ["findings"],
      outputs: ["finding-responses"],
    },
    {
      id: "decision-summary",
      label: "Decision Summary",
      kind: "summary-turn",
      seat: "arbiter",
      inputs: ["findings", "finding-responses"],
      outputs: ["decision-summary"],
    },
  ],
} as const;

export const fakeFlowFindingsOutput = {
  contract: "vibestrate.flow.findings.v1",
  stepId: "implementation-review",
  findings: [
    {
      id: "finding-tests",
      severity: "high",
      category: "tests",
      claim: "The write path changed without coverage for the failure path.",
      evidence: [{ kind: "diff", ref: "artifacts/flows/implement/diff.patch" }],
      recommendation: "Add a regression test for the failed write.",
    },
  ],
} as const;

export const fakeFlowFindingResponsesOutput = {
  contract: "vibestrate.flow.finding-responses.v1",
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

export const fakeFlowDecisionSummaryOutput = {
  contract: "vibestrate.flow.decision-summary.v1",
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
