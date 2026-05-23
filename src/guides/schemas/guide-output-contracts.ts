import { z } from "zod";
import { guideTokenSchema } from "./guide-schema.js";

export const GUIDE_FINDINGS_CONTRACT = "amaco.guide.findings.v1";
export const GUIDE_FINDING_RESPONSES_CONTRACT =
  "amaco.guide.finding-responses.v1";
export const GUIDE_FINDING_RESOLUTIONS_CONTRACT =
  "amaco.guide.finding-resolutions.v1";
export const GUIDE_DECISION_SUMMARY_CONTRACT =
  "amaco.guide.decision-summary.v1";

export const guideFindingCategorySchema = z.enum([
  "correctness",
  "architecture",
  "security",
  "tests",
  "performance",
  "maintainability",
  "product",
  "policy",
]);
export type GuideFindingCategory = z.infer<typeof guideFindingCategorySchema>;

export const guideFindingSeveritySchema = z.enum(["low", "medium", "high"]);
export type GuideFindingSeverity = z.infer<typeof guideFindingSeveritySchema>;

export const guideEvidenceRefSchema = z
  .object({
    kind: z.enum(["artifact", "file", "diff", "validation", "event"]),
    ref: z.string().min(1).max(400),
  })
  .strict();
export type GuideEvidenceRef = z.infer<typeof guideEvidenceRefSchema>;

export const guideFindingSchema = z
  .object({
    id: guideTokenSchema,
    severity: guideFindingSeveritySchema,
    category: guideFindingCategorySchema,
    claim: z.string().min(1).max(2000),
    evidence: z.array(guideEvidenceRefSchema).min(1),
    recommendation: z.string().min(1).max(2000),
  })
  .strict();
export type GuideFinding = z.infer<typeof guideFindingSchema>;

export const guideFindingsOutputSchema = z
  .object({
    contract: z.literal(GUIDE_FINDINGS_CONTRACT),
    stepId: guideTokenSchema,
    findings: z.array(guideFindingSchema),
  })
  .strict();
export type GuideFindingsOutput = z.infer<typeof guideFindingsOutputSchema>;

export const guideFindingResponseDispositionSchema = z.enum([
  "accept",
  "fix",
  "rebut",
  "defer",
  "needs-human",
]);
export type GuideFindingResponseDisposition = z.infer<
  typeof guideFindingResponseDispositionSchema
>;

export const guideFindingResponseSchema = z
  .object({
    findingId: guideTokenSchema,
    disposition: guideFindingResponseDispositionSchema,
    rationale: z.string().min(1).max(3000),
    evidence: z.array(guideEvidenceRefSchema).default([]),
  })
  .strict();
export type GuideFindingResponse = z.infer<typeof guideFindingResponseSchema>;

export const guideFindingResponsesOutputSchema = z
  .object({
    contract: z.literal(GUIDE_FINDING_RESPONSES_CONTRACT),
    stepId: guideTokenSchema,
    responses: z.array(guideFindingResponseSchema),
  })
  .strict();
export type GuideFindingResponsesOutput = z.infer<
  typeof guideFindingResponsesOutputSchema
>;

export const guideFindingResolutionDispositionSchema = z.enum([
  "resolved",
  "still-open",
  "invalid-finding",
  "needs-human",
]);
export type GuideFindingResolutionDisposition = z.infer<
  typeof guideFindingResolutionDispositionSchema
>;

export const guideFindingResolutionSchema = z
  .object({
    findingId: guideTokenSchema,
    disposition: guideFindingResolutionDispositionSchema,
    rationale: z.string().min(1).max(3000),
    evidence: z.array(guideEvidenceRefSchema).default([]),
  })
  .strict();
export type GuideFindingResolution = z.infer<
  typeof guideFindingResolutionSchema
>;

export const guideFindingResolutionsOutputSchema = z
  .object({
    contract: z.literal(GUIDE_FINDING_RESOLUTIONS_CONTRACT),
    stepId: guideTokenSchema,
    resolutions: z.array(guideFindingResolutionSchema),
  })
  .strict();
export type GuideFindingResolutionsOutput = z.infer<
  typeof guideFindingResolutionsOutputSchema
>;

export const guideDecisionRecommendationSchema = z.enum([
  "merge-ready",
  "changes-requested",
  "blocked",
  "needs-human",
]);
export type GuideDecisionRecommendation = z.infer<
  typeof guideDecisionRecommendationSchema
>;

export const guideValidationEvidenceSchema = z
  .object({
    status: z.enum(["passed", "failed", "not-run", "unknown"]),
    evidence: z.array(guideEvidenceRefSchema).default([]),
  })
  .strict();
export type GuideValidationEvidence = z.infer<
  typeof guideValidationEvidenceSchema
>;

export const guideDecisionSummaryOutputSchema = z
  .object({
    contract: z.literal(GUIDE_DECISION_SUMMARY_CONTRACT),
    stepId: guideTokenSchema,
    recommendation: guideDecisionRecommendationSchema,
    summary: z.string().min(1).max(6000),
    validation: guideValidationEvidenceSchema,
    agreementFindingIds: z.array(guideTokenSchema).default([]),
    disagreementFindingIds: z.array(guideTokenSchema).default([]),
    residualRisks: z.array(z.string().min(1).max(2000)).default([]),
    requiredHumanActions: z.array(z.string().min(1).max(2000)).default([]),
  })
  .strict();
export type GuideDecisionSummaryOutput = z.infer<
  typeof guideDecisionSummaryOutputSchema
>;

export const guideOutputContractSchemas = {
  findings: guideFindingsOutputSchema,
  findingResponses: guideFindingResponsesOutputSchema,
  findingResolutions: guideFindingResolutionsOutputSchema,
  decisionSummary: guideDecisionSummaryOutputSchema,
} as const;
