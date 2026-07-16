import { z } from "zod";

export const workflowStageIdSchema = z.enum([
  "planning",
  "architecting",
  "executing",
  "validating",
  "reviewing",
  "fixing",
  "verifying",
  "finalizing",
]);

export type WorkflowStageId = z.infer<typeof workflowStageIdSchema>;

export const workflowConfigSchema = z.object({
  id: z.string().min(1).default("default-plan-build-review").describe("Flow/workflow id this run follows (default-plan-build-review)."),
  maxReviewLoops: z.number().int().min(0).nullable().default(null).describe("Global ceiling on review->fix loops. null (default) = each flow uses its own loop budget; set N = lower any flow's loop to at most N. A per-crew maxReviewLoops override takes precedence (and may exceed this)."),
  requireHumanMerge: z.boolean().default(true).describe("Require a human to do the final merge (default on)."),
});

export type WorkflowConfig = z.infer<typeof workflowConfigSchema>;
