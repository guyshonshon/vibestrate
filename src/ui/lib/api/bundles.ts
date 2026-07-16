// Suggestion bundles (review passes) + validation-profile management.
import { jsonGet, jsonPost, jsonPatch } from "./http.js";
import type {
  ReviewSuggestion,
  SmartApplyResult,
  SuggestionBundle,
  SuggestionValidationResult,
  BundlePreflightResult,
  ValidationProfileSummary,
  ProfileMigrationPreview,
  ProfileMigrationAudit,
  ProfileRenamePreview,
  ValidationProfileUsageEntry,
} from "../types.js";

export const bundlesApi = {
  async listBundles(runId: string): Promise<SuggestionBundle[]> {
    const r = await jsonGet<{ bundles: SuggestionBundle[] }>(
      `/api/runs/${encodeURIComponent(runId)}/suggestion-bundles`,
    );
    return r.bundles;
  },
  async getBundle(runId: string, bundleId: string): Promise<SuggestionBundle> {
    const r = await jsonGet<{ bundle: SuggestionBundle }>(
      `/api/runs/${encodeURIComponent(runId)}/suggestion-bundles/${encodeURIComponent(bundleId)}`,
    );
    return r.bundle;
  },
  async createBundle(input: {
    runId: string;
    title: string;
    description?: string;
    suggestionIds?: string[];
  }): Promise<SuggestionBundle> {
    const r = await jsonPost<{ bundle: SuggestionBundle }>(
      `/api/runs/${encodeURIComponent(input.runId)}/suggestion-bundles`,
      input,
    );
    return r.bundle;
  },
  async addToBundle(input: {
    runId: string;
    bundleId: string;
    suggestionId: string;
  }): Promise<SuggestionBundle> {
    const r = await jsonPost<{ bundle: SuggestionBundle }>(
      `/api/runs/${encodeURIComponent(input.runId)}/suggestion-bundles/${encodeURIComponent(input.bundleId)}/add`,
      { suggestionId: input.suggestionId },
    );
    return r.bundle;
  },
  async removeFromBundle(input: {
    runId: string;
    bundleId: string;
    suggestionId: string;
  }): Promise<SuggestionBundle> {
    const r = await jsonPost<{ bundle: SuggestionBundle }>(
      `/api/runs/${encodeURIComponent(input.runId)}/suggestion-bundles/${encodeURIComponent(input.bundleId)}/remove`,
      { suggestionId: input.suggestionId },
    );
    return r.bundle;
  },
  async approveBundle(input: {
    runId: string;
    bundleId: string;
    note?: string;
  }): Promise<SuggestionBundle> {
    const r = await jsonPost<{ bundle: SuggestionBundle }>(
      `/api/runs/${encodeURIComponent(input.runId)}/suggestion-bundles/${encodeURIComponent(input.bundleId)}/approve`,
      { note: input.note },
    );
    return r.bundle;
  },
  async rejectBundle(input: {
    runId: string;
    bundleId: string;
    note?: string;
  }): Promise<SuggestionBundle> {
    const r = await jsonPost<{ bundle: SuggestionBundle }>(
      `/api/runs/${encodeURIComponent(input.runId)}/suggestion-bundles/${encodeURIComponent(input.bundleId)}/reject`,
      { note: input.note },
    );
    return r.bundle;
  },
  async applyBundle(input: {
    runId: string;
    bundleId: string;
    validateAfterApply?: boolean;
    autoRevertOnValidationFail?: boolean;
    validationProfile?: string | null;
  }): Promise<{ bundle: SuggestionBundle; preflight: BundlePreflightResult }> {
    return jsonPost(
      `/api/runs/${encodeURIComponent(input.runId)}/suggestion-bundles/${encodeURIComponent(input.bundleId)}/apply`,
      {
        validateAfterApply: input.validateAfterApply,
        autoRevertOnValidationFail: input.autoRevertOnValidationFail,
        validationProfile: input.validationProfile,
      },
    );
  },
  async smartApplyBundle(input: {
    runId: string;
    bundleId: string;
    validateEachStep?: boolean;
    autoRevertFailing?: boolean;
    validationProfile?: string | null;
    useSuggestionProfiles?: boolean;
  }): Promise<{ bundle: SuggestionBundle; result: SmartApplyResult }> {
    return jsonPost(
      `/api/runs/${encodeURIComponent(input.runId)}/suggestion-bundles/${encodeURIComponent(input.bundleId)}/smart-apply`,
      {
        validateEachStep: input.validateEachStep,
        autoRevertFailing: input.autoRevertFailing,
        validationProfile: input.validationProfile,
        useSuggestionProfiles: input.useSuggestionProfiles,
      },
    );
  },
  async validateBundle(input: {
    runId: string;
    bundleId: string;
    validationProfile?: string | null;
  }): Promise<{
    bundle: SuggestionBundle;
    result: SuggestionValidationResult;
  }> {
    return jsonPost(
      `/api/runs/${encodeURIComponent(input.runId)}/suggestion-bundles/${encodeURIComponent(input.bundleId)}/validate`,
      { validationProfile: input.validationProfile },
    );
  },
  async listValidationProfiles(): Promise<ValidationProfileSummary[]> {
    const r = await jsonGet<{ profiles: ValidationProfileSummary[] }>(
      "/api/validation/profiles",
    );
    return r.profiles;
  },
  async updateSuggestionProfile(input: {
    runId: string;
    suggestionId: string;
    validationProfile: string | null;
  }): Promise<ReviewSuggestion> {
    const r = await jsonPatch<{ suggestion: ReviewSuggestion }>(
      `/api/runs/${encodeURIComponent(input.runId)}/suggestions/${encodeURIComponent(input.suggestionId)}/profile`,
      { validationProfile: input.validationProfile },
    );
    return r.suggestion;
  },
  async updateBundleProfile(input: {
    runId: string;
    bundleId: string;
    validationProfile: string | null;
  }): Promise<SuggestionBundle> {
    const r = await jsonPatch<{ bundle: SuggestionBundle }>(
      `/api/runs/${encodeURIComponent(input.runId)}/suggestion-bundles/${encodeURIComponent(input.bundleId)}/profile`,
      { validationProfile: input.validationProfile },
    );
    return r.bundle;
  },
  async previewProfileMigration(input: {
    fromProfile: string;
    toProfile: string | null;
    scope?: { kind: "recent"; limit?: number } | { kind: "all" } | { kind: "run"; runId: string };
  }): Promise<{ preview: ProfileMigrationPreview }> {
    return jsonPost("/api/validation/profile-migrations/preview", input);
  },
  async applyProfileMigration(input: {
    fromProfile: string;
    toProfile: string | null;
    scope?: { kind: "recent"; limit?: number } | { kind: "all" } | { kind: "run"; runId: string };
  }): Promise<{ audit: ProfileMigrationAudit }> {
    return jsonPost("/api/validation/profile-migrations/apply", input);
  },
  async listProfileMigrations(): Promise<ProfileMigrationAudit[]> {
    const r = await jsonGet<{ migrations: ProfileMigrationAudit[] }>(
      "/api/validation/profile-migrations",
    );
    return r.migrations;
  },
  async previewProfileRename(input: {
    fromProfile: string;
    toProfile: string;
    scope?: { kind: "recent"; limit?: number } | { kind: "all" } | { kind: "run"; runId: string };
  }): Promise<{ preview: ProfileRenamePreview }> {
    return jsonPost("/api/validation/profile-renames/preview", input);
  },
  async applyProfileRename(input: {
    fromProfile: string;
    toProfile: string;
    scope?: { kind: "recent"; limit?: number } | { kind: "all" } | { kind: "run"; runId: string };
  }): Promise<{ audit: ProfileMigrationAudit }> {
    return jsonPost("/api/validation/profile-renames/apply", input);
  },
  async getProfileUsage(): Promise<{
    entries: ValidationProfileUsageEntry[];
    filePath: string;
  }> {
    return jsonGet("/api/validation/profile-usage");
  },
  async revertBundle(input: {
    runId: string;
    bundleId: string;
  }): Promise<SuggestionBundle> {
    const r = await jsonPost<{ bundle: SuggestionBundle }>(
      `/api/runs/${encodeURIComponent(input.runId)}/suggestion-bundles/${encodeURIComponent(input.bundleId)}/revert`,
    );
    return r.bundle;
  },
  async preflightBundle(input: {
    runId: string;
    bundleId: string;
  }): Promise<BundlePreflightResult> {
    return jsonGet(
      `/api/runs/${encodeURIComponent(input.runId)}/suggestion-bundles/${encodeURIComponent(input.bundleId)}/preflight`,
    );
  },
};
