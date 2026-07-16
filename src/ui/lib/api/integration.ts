// Merge-ready overview, integration preview/apply/advice/finish.
import { jsonGet, jsonPost } from "./http.js";
import type {
  MergeOverviewRowDto,
  MergeAnalysisDto,
  MergeAdviceDto,
} from "./types.js";

export const integrationApi = {
  async listMergeReady(): Promise<
    { runId: string; task: string; branchName: string; taskId: string | null }[]
  > {
    const r = await jsonGet<{
      mergeReady: { runId: string; task: string; branchName: string; taskId: string | null }[];
    }>("/api/integration");
    return r.mergeReady;
  },
  async previewIntegration(runIds?: string[]): Promise<{
    baseBranch: string;
    allClean: boolean;
    results: { branch: string; runId?: string; clean: boolean; conflictedFiles: string[]; note: string }[];
  }> {
    const r = await jsonPost<{ preview: {
      baseBranch: string;
      allClean: boolean;
      results: { branch: string; runId?: string; clean: boolean; conflictedFiles: string[]; note: string }[];
    } }>("/api/integration/preview", { runIds });
    return r.preview;
  },
  async applyIntegration(
    into: string,
    runIds?: string[],
  ): Promise<{
    integrationBranch: string;
    baseBranch: string;
    worktreePath: string;
    stoppedAt: string | null;
    integrated: { branch: string; clean: boolean; note: string }[];
  }> {
    const r = await jsonPost<{ result: {
      integrationBranch: string;
      baseBranch: string;
      worktreePath: string;
      stoppedAt: string | null;
      integrated: { branch: string; clean: boolean; note: string }[];
    } }>("/api/integration/apply", { into, runIds });
    return r.result;
  },
  /** Cheap hub-list projection - lanes + topology, no preview, no
   *  recommendation. Safe per page load. */
  async integrationOverview(): Promise<{ rows: MergeOverviewRowDto[] }> {
    return jsonGet<{ rows: MergeOverviewRowDto[] }>("/api/integration/overview");
  },
  /** Read-only merge advice (deterministic - no model output). Same
   *  cost class as preview; call it on drill-in, not per hub-list row. */
  async adviseIntegration(runIds?: string[]): Promise<{
    advice: MergeAdviceDto[];
    missing: string[];
  }> {
    return jsonPost<{ advice: MergeAdviceDto[]; missing: string[] }>(
      "/api/integration/advice",
      { runIds },
    );
  },
  /** Optional read-only LLM pass over the run's redacted diff.
   *  Spawns a local provider (same exposure class as /api/consult); advisory
   *  prose only, never changes the deterministic advice. */
  async analyzeIntegration(runId: string): Promise<{ result: MergeAnalysisDto }> {
    return jsonPost<{ result: MergeAnalysisDto }>("/api/integration/analyze", {
      runId,
    });
  },
  /** P7b: merge a complete integration branch into main, locally (never
   *  pushed). The confirm token guards against accidental invocation. */
  async finishIntegration(integrationBranch: string): Promise<{
    mergedSha: string;
    intoBranch: string;
    integrationBranch: string;
  }> {
    const r = await jsonPost<{ result: {
      mergedSha: string;
      intoBranch: string;
      integrationBranch: string;
    } }>("/api/integration/finish", {
      integrationBranch,
      confirm: "merge-to-main",
    });
    return r.result;
  },
};
