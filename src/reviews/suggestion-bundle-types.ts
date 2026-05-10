import { z } from "zod";

export const bundleStatusSchema = z.enum([
  "draft",
  "approved",
  "applying",
  "applied",
  "partially_applied",
  "failed",
  "validation_passed",
  "validation_failed",
  "reverted",
  "revert_failed",
  "rejected",
]);
export type BundleStatus = z.infer<typeof bundleStatusSchema>;

export const suggestionBundleSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  title: z.string().min(1).max(160),
  description: z.string().max(4_000).default(""),
  createdAt: z.string(),
  updatedAt: z.string(),
  status: bundleStatusSchema.default("draft"),
  suggestionIds: z.array(z.string()).default([]),
  approvalId: z.string().nullable().default(null),
  validationResultPath: z.string().nullable().default(null),
  createdBy: z.string().default("local-user"),
  decisionNote: z.string().nullable().default(null),
  appliedAt: z.string().nullable().default(null),
  revertedAt: z.string().nullable().default(null),
  errorMessage: z.string().max(2_000).nullable().default(null),
  /** Captured patch text covering every applied suggestion in this bundle. */
  appliedPatchPath: z.string().nullable().default(null),
  reversePatchPath: z.string().nullable().default(null),
  /** Best-effort summary of files touched, set on apply. */
  touchedFiles: z.array(z.string()).default([]),
  /** Same-file warnings recorded at preflight time. */
  sameFileWarnings: z
    .array(
      z.object({
        file: z.string(),
        suggestionIds: z.array(z.string()),
      }),
    )
    .default([]),
});
export type SuggestionBundle = z.infer<typeof suggestionBundleSchema>;

export const suggestionBundlesFileSchema = z.object({
  bundles: z.array(suggestionBundleSchema).default([]),
});
export type SuggestionBundlesFile = z.infer<typeof suggestionBundlesFileSchema>;
