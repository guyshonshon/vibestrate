import { z } from "zod";
import { flowTokenSchema } from "./flow-schema.js";

export const FLOW_FINDINGS_CONTRACT = "vibestrate.flow.findings.v1";
export const FLOW_FINDING_RESPONSES_CONTRACT =
  "vibestrate.flow.finding-responses.v1";
export const FLOW_FINDING_RESOLUTIONS_CONTRACT =
  "vibestrate.flow.finding-resolutions.v1";
export const FLOW_DECISION_SUMMARY_CONTRACT =
  "vibestrate.flow.decision-summary.v1";
// Shape phase: the intake step emits a structured set of gap questions the
// consult surface renders as a form. The submitted answers seed the shape run.
export const FLOW_QUESTIONS_CONTRACT = "vibestrate.flow.questions.v1";

export const flowFindingCategorySchema = z.enum([
  "correctness",
  "architecture",
  "security",
  "tests",
  "performance",
  "maintainability",
  "product",
  "policy",
]);
export type FlowFindingCategory = z.infer<typeof flowFindingCategorySchema>;

export const flowFindingSeveritySchema = z.enum(["low", "medium", "high"]);
export type FlowFindingSeverity = z.infer<typeof flowFindingSeveritySchema>;

export const flowEvidenceRefSchema = z
  .object({
    kind: z.enum(["artifact", "file", "diff", "validation", "event"]),
    ref: z.string().min(1).max(400),
  })
  .strict();
export type FlowEvidenceRef = z.infer<typeof flowEvidenceRefSchema>;

export const flowFindingSchema = z
  .object({
    id: flowTokenSchema,
    severity: flowFindingSeveritySchema,
    category: flowFindingCategorySchema,
    claim: z.string().min(1).max(2000),
    evidence: z.array(flowEvidenceRefSchema).min(1),
    recommendation: z.string().min(1).max(2000),
  })
  .strict();
export type FlowFinding = z.infer<typeof flowFindingSchema>;

export const flowFindingsOutputSchema = z
  .object({
    contract: z.literal(FLOW_FINDINGS_CONTRACT),
    stepId: flowTokenSchema,
    findings: z.array(flowFindingSchema),
  })
  .strict();
export type FlowFindingsOutput = z.infer<typeof flowFindingsOutputSchema>;

export const flowFindingResponseDispositionSchema = z.enum([
  "accept",
  "fix",
  "rebut",
  "defer",
  "needs-human",
]);
export type FlowFindingResponseDisposition = z.infer<
  typeof flowFindingResponseDispositionSchema
>;

export const flowFindingResponseSchema = z
  .object({
    findingId: flowTokenSchema,
    disposition: flowFindingResponseDispositionSchema,
    rationale: z.string().min(1).max(3000),
    evidence: z.array(flowEvidenceRefSchema).default([]),
  })
  .strict();
export type FlowFindingResponse = z.infer<typeof flowFindingResponseSchema>;

export const flowFindingResponsesOutputSchema = z
  .object({
    contract: z.literal(FLOW_FINDING_RESPONSES_CONTRACT),
    stepId: flowTokenSchema,
    responses: z.array(flowFindingResponseSchema),
  })
  .strict();
export type FlowFindingResponsesOutput = z.infer<
  typeof flowFindingResponsesOutputSchema
>;

export const flowFindingResolutionDispositionSchema = z.enum([
  "resolved",
  "still-open",
  "invalid-finding",
  "needs-human",
]);
export type FlowFindingResolutionDisposition = z.infer<
  typeof flowFindingResolutionDispositionSchema
>;

export const flowFindingResolutionSchema = z
  .object({
    findingId: flowTokenSchema,
    disposition: flowFindingResolutionDispositionSchema,
    rationale: z.string().min(1).max(3000),
    evidence: z.array(flowEvidenceRefSchema).default([]),
  })
  .strict();
export type FlowFindingResolution = z.infer<
  typeof flowFindingResolutionSchema
>;

export const flowFindingResolutionsOutputSchema = z
  .object({
    contract: z.literal(FLOW_FINDING_RESOLUTIONS_CONTRACT),
    stepId: flowTokenSchema,
    resolutions: z.array(flowFindingResolutionSchema),
  })
  .strict();
export type FlowFindingResolutionsOutput = z.infer<
  typeof flowFindingResolutionsOutputSchema
>;

export const flowDecisionRecommendationSchema = z.enum([
  "merge-ready",
  "changes-requested",
  "blocked",
  "needs-human",
]);
export type FlowDecisionRecommendation = z.infer<
  typeof flowDecisionRecommendationSchema
>;

export const flowValidationEvidenceSchema = z
  .object({
    status: z.enum(["passed", "failed", "not-run", "unknown"]),
    evidence: z.array(flowEvidenceRefSchema).default([]),
  })
  .strict();
export type FlowValidationEvidence = z.infer<
  typeof flowValidationEvidenceSchema
>;

export const flowDecisionSummaryOutputSchema = z
  .object({
    contract: z.literal(FLOW_DECISION_SUMMARY_CONTRACT),
    stepId: flowTokenSchema,
    recommendation: flowDecisionRecommendationSchema,
    summary: z.string().min(1).max(6000),
    validation: flowValidationEvidenceSchema,
    agreementFindingIds: z.array(flowTokenSchema).default([]),
    disagreementFindingIds: z.array(flowTokenSchema).default([]),
    residualRisks: z.array(z.string().min(1).max(2000)).default([]),
    requiredHumanActions: z.array(z.string().min(1).max(2000)).default([]),
  })
  .strict();
export type FlowDecisionSummaryOutput = z.infer<
  typeof flowDecisionSummaryOutputSchema
>;

// ── Builder-side handoff contracts (Slice 3 deferred item) ──────────────────
//
// The review side above gives reviewers/arbiters a structured shape. These give
// the *builder* phases (plan -> architecture -> execution) the same: a planner
// emits an ordered plan, the architect a design with decisions, the implementer
// an execution report that maps back to the plan. The point is a deterministic
// through-line - the run brief, the next step, and the dashboard can read named
// fields (open questions, risks, files, per-step coverage) instead of scraping
// prose.
//
// OPT-IN by token name, exactly like the review contracts: a step only produces
// a contract when it declares the matching output token (`plan-handoff` etc.).
// Existing flows that emit free-form `plan`/`architecture`/`execution` are
// untouched; panel-review is the first flow to adopt these. Parsing degrades
// gracefully - a step whose JSON doesn't validate keeps its raw text output and
// records a parse issue (see the orchestrator), so adoption is never fail-hard.

export const FLOW_PLAN_HANDOFF_CONTRACT = "vibestrate.flow.plan-handoff.v1";
export const FLOW_ARCHITECTURE_HANDOFF_CONTRACT =
  "vibestrate.flow.architecture-handoff.v1";
export const FLOW_EXECUTION_HANDOFF_CONTRACT =
  "vibestrate.flow.execution-handoff.v1";

export const flowPlanStepSchema = z
  .object({
    id: flowTokenSchema,
    title: z.string().min(1).max(200),
    detail: z.string().min(1).max(2000).optional(),
  })
  .strict();
export type FlowPlanStep = z.infer<typeof flowPlanStepSchema>;

export const flowPlanHandoffOutputSchema = z
  .object({
    contract: z.literal(FLOW_PLAN_HANDOFF_CONTRACT),
    stepId: flowTokenSchema,
    goal: z.string().min(1).max(2000),
    steps: z.array(flowPlanStepSchema).min(1).max(40),
    filesLikelyTouched: z.array(z.string().min(1).max(400)).max(60).default([]),
    assumptions: z.array(z.string().min(1).max(1000)).max(20).default([]),
    openQuestions: z.array(z.string().min(1).max(1000)).max(20).default([]),
    risks: z.array(z.string().min(1).max(1000)).max(20).default([]),
  })
  .strict();
export type FlowPlanHandoffOutput = z.infer<typeof flowPlanHandoffOutputSchema>;

export const flowArchitectureDecisionSchema = z
  .object({
    id: flowTokenSchema,
    decision: z.string().min(1).max(1000),
    rationale: z.string().min(1).max(2000).optional(),
    alternatives: z.array(z.string().min(1).max(1000)).max(10).default([]),
  })
  .strict();
export type FlowArchitectureDecision = z.infer<
  typeof flowArchitectureDecisionSchema
>;

export const flowArchitectureHandoffOutputSchema = z
  .object({
    contract: z.literal(FLOW_ARCHITECTURE_HANDOFF_CONTRACT),
    stepId: flowTokenSchema,
    approach: z.string().min(1).max(3000),
    decisions: z.array(flowArchitectureDecisionSchema).max(30).default([]),
    componentsTouched: z.array(z.string().min(1).max(400)).max(60).default([]),
    interfaces: z.array(z.string().min(1).max(600)).max(30).default([]),
    risks: z.array(z.string().min(1).max(1000)).max(20).default([]),
    openQuestions: z.array(z.string().min(1).max(1000)).max(20).default([]),
  })
  .strict();
export type FlowArchitectureHandoffOutput = z.infer<
  typeof flowArchitectureHandoffOutputSchema
>;

// Shape phase intake: one gap question the CTO must ask to scope the work.
// `kind: "choice"` renders as a select of `options`; `kind: "text"` as a field.
// Questions request scope decisions only - never secret values (the safety model
// allows env var NAMES, never values).
export const flowShapeQuestionSchema = z
  .object({
    id: flowTokenSchema,
    question: z.string().min(1).max(400),
    why: z.string().min(1).max(400),
    kind: z.enum(["choice", "text"]),
    options: z.array(z.string().min(1).max(160)).max(8).default([]),
  })
  .strict();
export type FlowShapeQuestion = z.infer<typeof flowShapeQuestionSchema>;

export const flowQuestionsOutputSchema = z
  .object({
    contract: z.literal(FLOW_QUESTIONS_CONTRACT),
    stepId: flowTokenSchema,
    questions: z.array(flowShapeQuestionSchema).min(1).max(20),
  })
  .strict();
export type FlowQuestionsOutput = z.infer<typeof flowQuestionsOutputSchema>;

export const flowExecutionStepStatusSchema = z.enum([
  "done",
  "partial",
  "skipped",
  "blocked",
]);
export type FlowExecutionStepStatus = z.infer<
  typeof flowExecutionStepStatusSchema
>;

export const flowExecutionStepReportSchema = z
  .object({
    // Ties back to a `plan-handoff` step id when known, so coverage is checkable.
    planStepId: flowTokenSchema.optional(),
    title: z.string().min(1).max(200),
    status: flowExecutionStepStatusSchema,
    note: z.string().min(1).max(1000).optional(),
  })
  .strict();
export type FlowExecutionStepReport = z.infer<
  typeof flowExecutionStepReportSchema
>;

export const flowExecutionHandoffOutputSchema = z
  .object({
    contract: z.literal(FLOW_EXECUTION_HANDOFF_CONTRACT),
    stepId: flowTokenSchema,
    summary: z.string().min(1).max(3000),
    steps: z.array(flowExecutionStepReportSchema).max(60).default([]),
    filesChanged: z.array(z.string().min(1).max(400)).max(100).default([]),
    commandsRun: z.array(z.string().min(1).max(400)).max(40).default([]),
    followUps: z.array(z.string().min(1).max(1000)).max(20).default([]),
    risks: z.array(z.string().min(1).max(1000)).max(20).default([]),
  })
  .strict();
export type FlowExecutionHandoffOutput = z.infer<
  typeof flowExecutionHandoffOutputSchema
>;

// Registry of builder-side handoff contracts, keyed by the output token a step
// declares. One source of truth for both the prompt-side render (the JSON
// example a step is asked to emit) and the orchestrator-side parse. `example`
// is a minimal valid instance with a `__stepId__` placeholder the renderer
// swaps for the real step id.
export const flowHandoffContracts = {
  "plan-handoff": {
    contractId: FLOW_PLAN_HANDOFF_CONTRACT,
    schema: flowPlanHandoffOutputSchema,
    label: "Flow Plan Handoff",
    example: {
      contract: FLOW_PLAN_HANDOFF_CONTRACT,
      stepId: "__stepId__",
      goal: "...",
      steps: [{ id: "step-1", title: "...", detail: "..." }],
      filesLikelyTouched: ["src/..."],
      assumptions: ["..."],
      openQuestions: ["..."],
      risks: ["..."],
    },
  },
  "architecture-handoff": {
    contractId: FLOW_ARCHITECTURE_HANDOFF_CONTRACT,
    schema: flowArchitectureHandoffOutputSchema,
    label: "Flow Architecture Handoff",
    example: {
      contract: FLOW_ARCHITECTURE_HANDOFF_CONTRACT,
      stepId: "__stepId__",
      approach: "...",
      decisions: [
        { id: "decision-1", decision: "...", rationale: "...", alternatives: ["..."] },
      ],
      componentsTouched: ["src/..."],
      interfaces: ["fn signature or API shape"],
      risks: ["..."],
      openQuestions: ["..."],
    },
  },
  "execution-handoff": {
    contractId: FLOW_EXECUTION_HANDOFF_CONTRACT,
    schema: flowExecutionHandoffOutputSchema,
    label: "Flow Execution Handoff",
    example: {
      contract: FLOW_EXECUTION_HANDOFF_CONTRACT,
      stepId: "__stepId__",
      summary: "...",
      steps: [{ planStepId: "step-1", title: "...", status: "done", note: "..." }],
      filesChanged: ["src/..."],
      commandsRun: ["pnpm test"],
      followUps: ["..."],
      risks: ["..."],
    },
  },
  questions: {
    contractId: FLOW_QUESTIONS_CONTRACT,
    schema: flowQuestionsOutputSchema,
    label: "Shape Intake Questions",
    example: {
      contract: FLOW_QUESTIONS_CONTRACT,
      stepId: "__stepId__",
      questions: [
        {
          id: "accounts",
          question: "Do users need to sign in?",
          why: "Decides whether you need an auth system and a user store.",
          kind: "choice",
          options: ["No accounts", "Email + password", "Social login", "Not sure"],
        },
      ],
    },
  },
} as const;
export type FlowHandoffToken = keyof typeof flowHandoffContracts;

/** True iff `token` names a builder-side handoff contract. */
export function isFlowHandoffToken(token: string): token is FlowHandoffToken {
  return Object.prototype.hasOwnProperty.call(flowHandoffContracts, token);
}

export const flowOutputContractSchemas = {
  findings: flowFindingsOutputSchema,
  findingResponses: flowFindingResponsesOutputSchema,
  findingResolutions: flowFindingResolutionsOutputSchema,
  decisionSummary: flowDecisionSummaryOutputSchema,
  planHandoff: flowPlanHandoffOutputSchema,
  architectureHandoff: flowArchitectureHandoffOutputSchema,
  executionHandoff: flowExecutionHandoffOutputSchema,
  questions: flowQuestionsOutputSchema,
} as const;
