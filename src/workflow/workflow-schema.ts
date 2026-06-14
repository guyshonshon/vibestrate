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
  maxReviewLoops: z.number().int().min(0).default(2).describe("Max review->fix loops before stopping (default 2)."),
  requireHumanMerge: z.boolean().default(true).describe("Require a human to do the final merge (default on)."),
});

export type WorkflowConfig = z.infer<typeof workflowConfigSchema>;
