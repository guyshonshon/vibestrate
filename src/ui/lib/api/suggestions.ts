// Editor integration + review suggestions (approve/apply/validate/revert).
import { jsonGet, jsonPost } from "./http.js";
import type {
  EditorStatus,
  ReviewSuggestion,
  SuggestionValidationResult,
} from "../types.js";

export const suggestionsApi = {
  async getEditorStatus(): Promise<EditorStatus> {
    return jsonGet("/api/editor/status");
  },
  async openInEditor(input: {
    path: string;
    runId?: string | null;
    line?: number | null;
    column?: number | null;
  }): Promise<{ ok: boolean; command?: string; path?: string; message?: string }> {
    return jsonPost("/api/editor/open", input);
  },
  async listSuggestions(runId: string): Promise<ReviewSuggestion[]> {
    const r = await jsonGet<{ suggestions: ReviewSuggestion[] }>(
      `/api/runs/${encodeURIComponent(runId)}/suggestions`,
    );
    return r.suggestions;
  },
  async createSuggestion(input: {
    runId: string;
    title: string;
    body?: string;
    file?: string | null;
    lineStart?: number | null;
    lineEnd?: number | null;
    proposedPatch?: string | null;
  }): Promise<ReviewSuggestion> {
    const r = await jsonPost<{ suggestion: ReviewSuggestion }>(
      `/api/runs/${encodeURIComponent(input.runId)}/suggestions`,
      input,
    );
    return r.suggestion;
  },
  async approveSuggestion(input: {
    runId: string;
    suggestionId: string;
    note?: string;
  }): Promise<ReviewSuggestion> {
    const r = await jsonPost<{ suggestion: ReviewSuggestion }>(
      `/api/runs/${encodeURIComponent(input.runId)}/suggestions/${encodeURIComponent(input.suggestionId)}/approve`,
      { note: input.note },
    );
    return r.suggestion;
  },
  async rejectSuggestion(input: {
    runId: string;
    suggestionId: string;
    note?: string;
  }): Promise<ReviewSuggestion> {
    const r = await jsonPost<{ suggestion: ReviewSuggestion }>(
      `/api/runs/${encodeURIComponent(input.runId)}/suggestions/${encodeURIComponent(input.suggestionId)}/reject`,
      { note: input.note },
    );
    return r.suggestion;
  },
  async applySuggestion(input: {
    runId: string;
    suggestionId: string;
    validateAfterApply?: boolean;
    autoRevertOnValidationFail?: boolean;
    validationProfile?: string | null;
  }): Promise<ReviewSuggestion> {
    const r = await jsonPost<{ suggestion: ReviewSuggestion }>(
      `/api/runs/${encodeURIComponent(input.runId)}/suggestions/${encodeURIComponent(input.suggestionId)}/apply`,
      {
        validateAfterApply: input.validateAfterApply,
        autoRevertOnValidationFail: input.autoRevertOnValidationFail,
        validationProfile: input.validationProfile,
      },
    );
    return r.suggestion;
  },
  async validateSuggestion(input: {
    runId: string;
    suggestionId: string;
    validationProfile?: string | null;
  }): Promise<{
    suggestion: ReviewSuggestion;
    result: SuggestionValidationResult;
  }> {
    return jsonPost(
      `/api/runs/${encodeURIComponent(input.runId)}/suggestions/${encodeURIComponent(input.suggestionId)}/validate`,
      { validationProfile: input.validationProfile },
    );
  },
  async revertSuggestion(input: {
    runId: string;
    suggestionId: string;
  }): Promise<ReviewSuggestion> {
    const r = await jsonPost<{ suggestion: ReviewSuggestion }>(
      `/api/runs/${encodeURIComponent(input.runId)}/suggestions/${encodeURIComponent(input.suggestionId)}/revert`,
    );
    return r.suggestion;
  },
};
