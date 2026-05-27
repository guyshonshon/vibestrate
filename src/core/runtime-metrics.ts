import { z } from "zod";

export const tokenUsageSchema = z
  .object({
    input: z.number().optional(),
    output: z.number().optional(),
    cacheRead: z.number().optional(),
    cacheCreation: z.number().optional(),
  })
  .partial();
export type TokenUsage = z.infer<typeof tokenUsageSchema>;

export const perModelCostSchema = z.object({
  model: z.string(),
  costUsd: z.number(),
});
export type PerModelCost = z.infer<typeof perModelCostSchema>;

export const roleMetricsSchema = z.object({
  roleId: z.string(),
  stageId: z.string(),
  providerId: z.string(),
  providerType: z.string(),
  command: z.string(),
  args: z.array(z.string()).default([]),
  cwd: z.string(),
  startedAt: z.string(),
  endedAt: z.string(),
  durationMs: z.number(),
  exitCode: z.number(),
  promptArtifactPath: z.string().optional(),
  outputArtifactPath: z.string().optional(),
  stdoutArtifactPath: z.string().optional(),
  stderrArtifactPath: z.string().optional(),
  sessionId: z.string().nullable().default(null),
  guideSlotId: z.string().nullable().default(null),
  guideContextMode: z
    .enum(["opened", "reused", "rehydrated", "stateless"])
    .nullable()
    .default(null),
  guideContextFallbackReason: z.string().nullable().default(null),
  model: z.string().nullable().default(null),
  totalCostUsd: z.number().nullable().default(null),
  /** True when totalCostUsd was computed locally (tokens × list price) rather
   *  than reported by the CLI — surfaced as an "est." label. */
  costEstimated: z.boolean().optional(),
  perModelCost: z.array(perModelCostSchema).default([]),
  tokenUsage: tokenUsageSchema.nullable().default(null),
  /** True when tokenUsage was estimated from text (provider reported none). */
  tokensEstimated: z.boolean().optional(),
  toolCallCount: z.number().nullable().default(null),
  filesChangedBefore: z.number().nullable().default(null),
  filesChangedAfter: z.number().nullable().default(null),
  diffInsertionsAfter: z.number().nullable().default(null),
  diffDeletionsAfter: z.number().nullable().default(null),
  validationSummary: z
    .object({
      total: z.number(),
      passed: z.number(),
      failed: z.number(),
    })
    .nullable()
    .default(null),
  reviewDecision: z.string().nullable().default(null),
  verificationDecision: z.string().nullable().default(null),
  skillsAttached: z.array(z.string()).default([]),
  skillsRequested: z.array(z.string()).default([]),
  notes: z.array(z.string()).default([]),
});
export type RoleMetrics = z.infer<typeof roleMetricsSchema>;

export const approvalsSummarySchema = z.object({
  total: z.number().default(0),
  pending: z.number().default(0),
  approved: z.number().default(0),
  rejected: z.number().default(0),
  expired: z.number().default(0),
  totalWaitMs: z.number().default(0),
});
export type ApprovalsSummary = z.infer<typeof approvalsSummarySchema>;

export const runtimeMetricsSchema = z.object({
  runId: z.string(),
  task: z.string(),
  startedAt: z.string(),
  updatedAt: z.string(),
  finalStatus: z.string().nullable().default(null),
  totalDurationMs: z.number().default(0),
  totalProviderCalls: z.number().default(0),
  totalCostUsd: z.number().nullable().default(null),
  reviewLoopCount: z.number().default(0),
  filesChanged: z.number().nullable().default(null),
  diffInsertions: z.number().nullable().default(null),
  diffDeletions: z.number().nullable().default(null),
  validationSummary: z
    .object({
      total: z.number(),
      passed: z.number(),
      failed: z.number(),
    })
    .nullable()
    .default(null),
  approvalsSummary: approvalsSummarySchema.default({
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    expired: 0,
    totalWaitMs: 0,
  }),
  notesProvided: z.array(z.string()).default([]),
  roles: z.array(roleMetricsSchema).default([]),
});
export type RuntimeMetrics = z.infer<typeof runtimeMetricsSchema>;

export function makeEmptyMetrics(input: {
  runId: string;
  task: string;
  startedAt: string;
}): RuntimeMetrics {
  return {
    runId: input.runId,
    task: input.task,
    startedAt: input.startedAt,
    updatedAt: input.startedAt,
    finalStatus: null,
    totalDurationMs: 0,
    totalProviderCalls: 0,
    totalCostUsd: null,
    reviewLoopCount: 0,
    filesChanged: null,
    diffInsertions: null,
    diffDeletions: null,
    validationSummary: null,
    approvalsSummary: {
      total: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
      expired: 0,
      totalWaitMs: 0,
    },
    notesProvided: [],
    roles: [],
  };
}

export function recomputeRunTotals(metrics: RuntimeMetrics): RuntimeMetrics {
  let totalDuration = 0;
  let totalCost: number | null = null;
  for (const a of metrics.roles) {
    totalDuration += a.durationMs;
    if (a.totalCostUsd !== null && a.totalCostUsd !== undefined) {
      totalCost = (totalCost ?? 0) + a.totalCostUsd;
    }
  }
  return {
    ...metrics,
    totalProviderCalls: metrics.roles.length,
    totalDurationMs: totalDuration,
    totalCostUsd: totalCost,
  };
}
