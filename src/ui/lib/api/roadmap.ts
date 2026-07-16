// Roadmap items + roadmap/manual proposals.
import { jsonGet, jsonPost } from "./http.js";
import type {
  ProposalAcceptResponse,
  ProposalDryRunResponse,
  ProposalParseSummary,
  ProposalSummary,
  RoadmapItem,
} from "../types.js";

export const roadmapApi = {
  // ─── roadmap ──────────────────────────────────────────────────────────────
  async listRoadmap(): Promise<RoadmapItem[]> {
    const r = await jsonGet<{ items: RoadmapItem[] }>("/api/roadmap");
    return r.items;
  },
  async addRoadmapItem(input: {
    title: string;
    description?: string;
    priority?: "low" | "medium" | "high";
  }): Promise<RoadmapItem> {
    const r = await jsonPost<{ item: RoadmapItem }>(
      "/api/roadmap/items",
      input,
    );
    return r.item;
  },
  // ─── proposals ────────────────────────────────────────────────────────────
  async listProposals(): Promise<ProposalSummary[]> {
    const r = await jsonGet<{ proposals: ProposalSummary[] }>(
      "/api/roadmap/proposals",
    );
    return r.proposals;
  },
  /** Generate a roadmap proposal from a broad goal (mirrors `vibe roadmap
   *  plan`). Runs the local planner provider inline, so this can take a while. */
  async planRoadmap(input: {
    goal: string;
    providerId?: string;
  }): Promise<{ ok: true; proposalId: string }> {
    return jsonPost("/api/roadmap/proposals", input);
  },
  async getProposal(id: string): Promise<{
    proposalId: string;
    body: string;
    accepted: { acceptedAt: string } | null;
  }> {
    return jsonGet(
      `/api/roadmap/proposals/${encodeURIComponent(id)}`,
    );
  },
  async parseProposal(id: string): Promise<ProposalParseSummary> {
    return jsonGet(`/api/roadmap/proposals/${encodeURIComponent(id)}/parse`);
  },
  async dryRunProposal(input: {
    id: string;
    allowUnresolvedDependencies?: boolean;
  }): Promise<ProposalDryRunResponse> {
    return jsonPost(
      `/api/roadmap/proposals/${encodeURIComponent(input.id)}/accept`,
      {
        dryRun: true,
        allowUnresolvedDependencies: input.allowUnresolvedDependencies,
      },
    );
  },
  async acceptProposal(input: {
    id: string;
    allowUnresolvedDependencies?: boolean;
  }): Promise<ProposalAcceptResponse> {
    return jsonPost(
      `/api/roadmap/proposals/${encodeURIComponent(input.id)}/accept`,
      {
        dryRun: false,
        allowUnresolvedDependencies: input.allowUnresolvedDependencies,
      },
    );
  },
  async applyManualProposal(id: string): Promise<{ ok: true; created: boolean }> {
    return jsonPost(`/api/vibestrate/proposals/${encodeURIComponent(id)}/apply`);
  },
  async rejectManualProposal(id: string): Promise<{ ok: true }> {
    return jsonPost(`/api/vibestrate/proposals/${encodeURIComponent(id)}/reject`);
  },
};
