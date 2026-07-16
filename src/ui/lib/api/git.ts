// Project/run git inspection + guarded merge predict/apply/undo.
import { jsonGet, jsonPost } from "./http.js";
import type {
  GitBranchesOverview,
  GitCommitDetail,
  GitGraph,
  GitHistory,
  GitStatus,
  GitMergePrediction,
  GitResolutionProposal,
  GitApplyResult,
  GitUndoResult,
  GitResolvedFile,
} from "../types.js";

export const gitApi = {
  async getProjectGitStatus(): Promise<GitStatus> {
    const r = await jsonGet<{ status: GitStatus }>(
      "/api/project/git/status",
    );
    return r.status;
  },
  async getProjectGitHistory(limit = 20): Promise<GitHistory> {
    const r = await jsonGet<{ history: GitHistory }>(
      `/api/project/git/history?limit=${limit}`,
    );
    return r.history;
  },
  async getProjectGitGraph(maxNodes = 300): Promise<GitGraph> {
    const r = await jsonGet<{ graph: GitGraph }>(
      `/api/project/git/graph?maxNodes=${maxNodes}`,
    );
    return r.graph;
  },
  async getProjectGitCommit(hash: string): Promise<GitCommitDetail> {
    const r = await jsonGet<{ commit: GitCommitDetail }>(
      `/api/project/git/commit/${encodeURIComponent(hash)}`,
    );
    return r.commit;
  },
  async getProjectGitBranches(): Promise<GitBranchesOverview> {
    const r = await jsonGet<{ overview: GitBranchesOverview }>(
      "/api/project/git/branches",
    );
    return r.overview;
  },
  async predictGitMerge(source: string, target: string): Promise<GitMergePrediction> {
    const r = await jsonPost<{ prediction: GitMergePrediction }>(
      "/api/project/git/tree/predict",
      { source, target },
    );
    return r.prediction;
  },
  async proposeGitMergeResolutions(
    source: string,
    target: string,
  ): Promise<GitResolutionProposal> {
    const r = await jsonPost<{ proposal: GitResolutionProposal }>(
      "/api/project/git/tree/propose-resolutions",
      { source, target },
    );
    return r.proposal;
  },
  async applyGitMerge(source: string, target: string): Promise<GitApplyResult> {
    const r = await jsonPost<{ result: GitApplyResult }>(
      "/api/project/git/tree/apply",
      { source, target, confirm: "apply-merge" },
    );
    return r.result;
  },
  async applyGitMergeResolved(
    source: string,
    target: string,
    resolvedFiles: GitResolvedFile[],
  ): Promise<GitApplyResult> {
    const r = await jsonPost<{ result: GitApplyResult }>(
      "/api/project/git/tree/apply-resolved",
      { source, target, resolvedFiles, confirm: "apply-merge" },
    );
    return r.result;
  },
  async undoGitMerge(target: string): Promise<GitUndoResult> {
    const r = await jsonPost<{ result: GitUndoResult }>(
      "/api/project/git/tree/undo",
      { target, confirm: "undo-merge" },
    );
    return r.result;
  },
  async getRunGitStatus(runId: string): Promise<GitStatus> {
    const r = await jsonGet<{ status: GitStatus }>(
      `/api/runs/${encodeURIComponent(runId)}/git/status`,
    );
    return r.status;
  },
  async getRunGitHistory(runId: string, limit = 20): Promise<GitHistory> {
    const r = await jsonGet<{ history: GitHistory }>(
      `/api/runs/${encodeURIComponent(runId)}/git/history?limit=${limit}`,
    );
    return r.history;
  },
};
