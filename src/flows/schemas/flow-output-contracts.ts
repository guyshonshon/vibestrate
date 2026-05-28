import { z } from "zod";
import { flowTokenSchema } from "./flow-schema.js";

export const FLOW_FINDINGS_CONTRACT = "vibestrate.flow.findings.v1";
export const FLOW_FINDING_RESPONSES_CONTRACT =
  "vibestrate.flow.finding-responses.v1";
export const FLOW_FINDING_RESOLUTIONS_CONTRACT =
  "vibestrate.flow.finding-resolutions.v1";
export const FLOW_DECISION_SUMMARY_CONTRACT =
  "vibestrate.flow.decision-summary.v1";

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

export const flowOutputContractSchemas = {
  findings: flowFindingsOutputSchema,
  findingResponses: flowFindingResponsesOutputSchema,
  findingResolutions: flowFindingResolutionsOutputSchema,
  decisionSummary: flowDecisionSummaryOutputSchema,
} as const;
