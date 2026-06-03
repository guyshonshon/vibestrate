// ── Consult: project-aware Q&A over controlled context ──────────────────────
//
// One read-only, structured-output question to the project's planner profile,
// answered ONLY from controlled project context (assembled in consult-context).
// Built on the assist primitive, so it is broker-gated and never writes. The
// answer schema bakes in the locked guardrail from the design review: the model
// must state a confidence and list caveats (what it could NOT verify) rather than
// laundering model confidence as authority. See
// docs/design/responsible-orchestrator.md.

import { z } from "zod";
import { VibestrateError } from "../utils/errors.js";
import { loadConfig, type LoadedConfig } from "../project/config-loader.js";
import { runAssist, type AssistProviderRunner } from "../assist/assist-runner.js";
import { assembleConsultContext } from "./consult-context.js";

export class ConsultError extends VibestrateError {
  constructor(message: string, cause?: unknown) {
    super("CONSULT_ERROR", message, cause);
    this.name = "ConsultError";
  }
}

export const consultActionKindSchema = z.enum([
  "run",
  "select_flow",
  "annotate",
  "propose_config",
  "propose_vibestrate",
  "request_sandbox",
  "explain_block",
  "other",
]);
export type ConsultActionKind = z.infer<typeof consultActionKindSchema>;

export const consultAnswerSchema = z
  .object({
    /** Plain-language answer, grounded in the provided context. */
    answer: z.string().min(1),
    /** How well-grounded the answer is in *verifiable* evidence. */
    confidence: z.enum(["low", "medium", "high"]),
    /** What the answer could NOT verify from the context (the honesty boundary). */
    caveats: z.array(z.string()).default([]),
    /** Which context pieces the answer actually drew on. */
    usedContext: z.array(z.string()).default([]),
    /** Recommendations - routed through normal effects if the user acts; never auto. */
    recommendedActions: z
      .array(
        z.object({
          kind: consultActionKindSchema,
          detail: z.string().min(1),
        }),
      )
      .default([]),
    /** A proposed VIBESTRATE.md improvement (read-only proposal; not applied). */
    proposedManualUpdate: z
      .object({
        rationale: z.string().min(1),
        evidence: z.string().min(1),
        suggestedText: z.string().min(1),
      })
      .nullable()
      .default(null),
  })
  .strict();
export type ConsultAnswer = z.infer<typeof consultAnswerSchema>;

const CONSULT_SCHEMA_HINT = `{
  "answer": "string - plain-language answer grounded ONLY in the project context",
  "confidence": "low | medium | high",
  "caveats": ["string - what you could NOT verify from the context"],
  "usedContext": ["string - which context labels you actually used"],
  "recommendedActions": [{ "kind": "run|select_flow|annotate|propose_config|propose_vibestrate|request_sandbox|explain_block|other", "detail": "string" }],
  "proposedManualUpdate": null
}`;

export type ConsultRequest = {
  projectRoot: string;
  question: string;
  taskId?: string | null;
  runId?: string | null;
  files?: string[];
  /** Explicit profile; else the crew's read-only planner (cheap, read-only). */
  profileId?: string | null;
  crewId?: string | null;
  loaded?: LoadedConfig | null;
  signal?: AbortSignal;
  /** Test seam - forwarded to the assist primitive. */
  runner?: AssistProviderRunner;
};

export type ConsultResult = {
  answer: ConsultAnswer;
  /** What context was available (assembled), for display alongside the answer. */
  usedSources: string[];
  /** Non-fatal context notes (e.g. a refused file, missing manual). */
  notes: string[];
  providerId: string;
  profileId: string;
};

function buildInstruction(question: string, contextText: string, usedSources: string[]): string {
  return [
    "You are Vibestrate's project consult - a project-aware engineering advisor.",
    "Answer the user's question about THIS project using ONLY the project context below. You are READ-ONLY: recommend actions, never assume any were taken.",
    "Be honest about your verification boundary: only deterministic evidence (validation results, config, run outcomes, annotations) is reliable. Where the context is insufficient to be sure, say so in `caveats` and lower `confidence`. Never invent facts or fake authority.",
    "Cite which context you actually used in `usedContext`" +
      (usedSources.length ? ` (available: ${usedSources.join(", ")})` : "") +
      ".",
    "Only set `proposedManualUpdate` when you have a concrete, evidence-backed improvement to the project's operating manual (VIBESTRATE.md); it is shown as a proposal, not applied. Otherwise null.",
    "",
    "# Project context",
    contextText.trim() || "(no project context was available)",
    "",
    "# Question",
    question.trim(),
  ].join("\n");
}

export async function runConsult(req: ConsultRequest): Promise<ConsultResult> {
  const question = req.question.trim();
  if (!question) throw new ConsultError("A consult needs a non-empty question.");

  const loaded = req.loaded ?? (await loadConfig(req.projectRoot).catch(() => null));
  if (!loaded) {
    throw new ConsultError(
      "Project is not initialized (no .vibestrate/project.yml). Run `vibe init` first.",
    );
  }

  const context = await assembleConsultContext({
    projectRoot: req.projectRoot,
    taskId: req.taskId,
    runId: req.runId,
    files: req.files,
    loaded,
  });

  const result = await runAssist<ConsultAnswer>({
    projectRoot: req.projectRoot,
    label: "consult",
    auditBucket: "consult",
    instruction: buildInstruction(question, context.text, context.usedSources),
    schema: consultAnswerSchema,
    schemaHint: CONSULT_SCHEMA_HINT,
    // Suppress assist's own rules.md injection - our context already includes it,
    // and we don't want the project context duplicated.
    loaded: { ...loaded, rules: "" },
    profileId: req.profileId,
    crewId: req.crewId,
    signal: req.signal,
    runner: req.runner,
  });

  return {
    answer: result.parsed,
    usedSources: context.usedSources,
    notes: context.notes,
    providerId: result.providerId,
    profileId: result.profileId,
  };
}
