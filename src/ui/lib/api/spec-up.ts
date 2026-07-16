// Spec-up phase: intake questions, artifact edits, roadmap/build handoff.
import { jsonGet, jsonPost } from "./http.js";
import type {
  SpecUpQuestion,
} from "../types.js";

export const specUpApi = {
  // ── Spec-up phase (docs/design/spec-up-phase.md): the CTO planning chain. ──
  /** Start the Spec-up phase from a brief: launch the read-only intake run that
   *  asks the gap questions (the UI "Plan" action; mirrors `vibe spec-up start`).
   *  `flowId` is the flow to BUILD once the spec is approved (carried forward). */
  async specUpIntake(input: {
    task: string;
    persona?: string;
    flowId?: string;
  }): Promise<{ ok: true; runId: string; pid: number | null }> {
    return jsonPost("/api/spec-up/intake", input);
  },
  /** Read an intake run's pending gap questions (null = not an intake run). */
  async getSpecUpQuestions(
    runId: string,
  ): Promise<{
    questions: SpecUpQuestion[] | null;
    hasBrief?: boolean;
    targetFlowId?: string | null;
    round?: number;
    coverageComplete?: boolean;
  }> {
    return jsonGet(`/api/runs/${encodeURIComponent(runId)}/spec-up-questions`);
  },
  /** Submit a round's answers -> either a gap-check round or the spec-up run.
   *  `proceed` finalizes now (skip further gap-checks). */
  async submitSpecUpAnswers(input: {
    sourceRunId: string;
    answers: { id: string; answer: string }[];
    proceed?: boolean;
  }): Promise<{ ok: true; runId: string; pid: number | null; action: "gap-check" | "finalize" }> {
    return jsonPost("/api/spec-up/answers", input);
  },
  /** "Proceed to spec" with no new answers: finalize the accumulated set. */
  async proceedSpecUp(
    sourceRunId: string,
  ): Promise<{ ok: true; runId: string; pid: number | null }> {
    return jsonPost("/api/spec-up/proceed", { sourceRunId });
  },
  /** Per-question assist (read-only, draft-only): Simplify / Suggest / Suggest-all. */
  async specUpAssist(input: {
    sourceRunId: string;
    mode: "simplify" | "suggest" | "suggest-all";
    questionId?: string;
    questionIds?: string[];
    forNonDeveloper?: boolean;
  }): Promise<{
    ok: true;
    mode: string;
    // simplify
    text?: string;
    affects?: string;
    analogy?: string;
    // suggest
    suggestedValue?: string;
    why?: string;
    // suggest-all
    items?: { questionId: string; suggestedValue: string; why: string }[];
  }> {
    return jsonPost("/api/spec-up/assist", input);
  },
  /** Approve the spec-up draft -> launch the roadmap synthesis run. */
  async approveSpecUpRoadmap(
    specUpRunId: string,
  ): Promise<{ ok: true; runId: string; pid: number | null }> {
    return jsonPost("/api/spec-up/roadmap", { specUpRunId });
  },
  /** Approve the spec-up draft -> BUILD it: run the chosen flow seeded with the
   *  approved spec as context. `flowId` overrides the carried target. */
  async buildSpecUp(
    specUpRunId: string,
    flowId?: string | null,
  ): Promise<{ ok: true; runId: string; pid: number | null; flowId: string }> {
    return jsonPost("/api/spec-up/build", {
      specUpRunId,
      ...(flowId ? { flowId } : {}),
    });
  },
  /** Turn a finished spec-up-roadmap run into a reviewable proposal. */
  async createSpecUpRoadmapProposal(
    runId: string,
  ): Promise<{ ok: true; proposalId: string }> {
    return jsonPost("/api/spec-up/roadmap-proposal", { runId });
  },
  /** Read a spec-up section's content + content-hash (the edit baseline). `frozen`
   *  = the build was already approved (the section is no longer editable). */
  async getSpecUpArtifact(
    runId: string,
    section: string,
  ): Promise<{ content: string; hash: string; frozen: boolean; editableSections: string[] }> {
    return jsonGet(
      `/api/spec-up/runs/${encodeURIComponent(runId)}/artifact/${encodeURIComponent(section)}`,
    );
  },
  /** Edit a spec-up section before the build (guarded write). `baseHash` is the
   *  hash from getSpecUpArtifact, for optimistic concurrency. Returns the new hash. */
  async editSpecUpArtifact(
    runId: string,
    section: string,
    content: string,
    baseHash?: string | null,
  ): Promise<{ ok: true; hash: string }> {
    return jsonPost(`/api/spec-up/runs/${encodeURIComponent(runId)}/artifact`, {
      section,
      content,
      ...(baseHash ? { baseHash } : {}),
    });
  },
};
