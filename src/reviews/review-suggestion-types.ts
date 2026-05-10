import { z } from "zod";

export const suggestionStatusSchema = z.enum([
  "open",
  "approved",
  "rejected",
  "applying",
  "applied",
  "validation_passed",
  "validation_failed",
  "revert_failed",
  "reverted",
  "reverted_after_validation_failed",
  "validation_failed_revert_failed",
  "failed",
  "resolved",
]);
export type SuggestionStatus = z.infer<typeof suggestionStatusSchema>;

export const suggestionSourceSchema = z.enum([
  "reviewer",
  "verifier",
  "user",
  "artifact",
]);
export type SuggestionSource = z.infer<typeof suggestionSourceSchema>;

export const reviewSuggestionSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  source: suggestionSourceSchema,
  sourceArtifactPath: z.string().nullable().default(null),
  file: z.string().nullable().default(null),
  lineStart: z.number().int().min(1).nullable().default(null),
  lineEnd: z.number().int().min(1).nullable().default(null),
  title: z.string().min(1).max(200),
  body: z.string().max(20_000).default(""),
  status: suggestionStatusSchema.default("open"),
  proposedPatch: z.string().nullable().default(null),
  requiresApproval: z.boolean().default(true),
  approvalId: z.string().nullable().default(null),
  decisionNote: z.string().nullable().default(null),
  errorMessage: z.string().max(2_000).nullable().default(null),
  /** When part of a review pass / bundle, the owning bundle id. */
  bundleId: z.string().nullable().default(null),
  /** Where the applied + reverse patches live, when capture succeeded. */
  appliedPatchPath: z.string().nullable().default(null),
  reversePatchPath: z.string().nullable().default(null),
  /** Most recent validation result file for this suggestion, if any. */
  validationResultPath: z.string().nullable().default(null),
  /**
   * Optional named validation profile to run by default for this suggestion.
   * "default" / null / undefined all resolve to commands.validate. Honored by
   * `validate`, `apply --validate`, and smart-apply (when
   * useSuggestionProfiles=true).
   */
  validationProfile: z.string().nullable().default(null),
});
export type ReviewSuggestion = z.infer<typeof reviewSuggestionSchema>;

export const suggestionsFileSchema = z.object({
  suggestions: z.array(reviewSuggestionSchema).default([]),
});
export type SuggestionsFile = z.infer<typeof suggestionsFileSchema>;
