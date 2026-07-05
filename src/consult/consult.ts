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
import type { ConsultSections } from "./consult-sections.js";
import { saveManualProposal } from "../project/manual-proposals.js";
import { proposePolicy } from "../project/project-policy-service.js";
import { redactSecretsInText } from "../core/diff-service.js";

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
    /** A proposed owner preference the reviewer should check for (preference-gates.ts).
     *  Persisted PENDING (confirmedAt:null) - inert until the owner confirms it. */
    proposedPreference: z
      .object({
        statement: z.string().min(1).max(300),
        correction: z.string().min(1).max(300).nullable().default(null),
        rationale: z.string().min(1),
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
  "proposedManualUpdate": null,
  "proposedPreference": null
}`;

/** A typed, decoupled snapshot of what the user is currently looking at, so the
 *  orb can advise in full context. The caller serializes the screen's meaningful
 *  state into `details`; consult REDACTS it server-side before the model sees it
 *  (the engine never trusts the client to have redacted). Reactive only - used
 *  when the user asks. */
export type ConsultViewContext = {
  /** Short screen label, e.g. "Spec-up questions". */
  screen: string;
  /** Human-readable serialization of the screen's state (questions, answers,
   *  focused field). Redacted before it reaches the prompt. */
  details: string;
};

export type ConsultRequest = {
  projectRoot: string;
  question: string;
  taskId?: string | null;
  runId?: string | null;
  files?: string[];
  /** Screen-aware orb: a snapshot of the current screen (redacted server-side). */
  viewContext?: ConsultViewContext | null;
  /** Explicit profile; else the crew's read-only planner (cheap, read-only). */
  profileId?: string | null;
  crewId?: string | null;
  /** Ad-hoc provider + model + effort for this inquiry only; wins over profileId.
   *  Lets a user run a one-off consult on an exact provider/model/effort without
   *  a saved profile. */
  providerId?: string | null;
  model?: string | null;
  effort?: string | null;
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
  /** Deterministic, code-computed project-state sections. Rendered
   *  verbatim alongside the model's narrated answer - same state => same
   *  sections. */
  sections: ConsultSections;
  providerId: string;
  profileId: string;
  /** The model + effort actually used (null = the provider's own default). */
  model: string | null;
  effort: string | null;
};

function buildInstruction(
  question: string,
  contextText: string,
  usedSources: string[],
  screen: ConsultViewContext | null,
): string {
  const lines = [
    "You are Vibestrate's project consult - a project-aware engineering advisor.",
    "Answer the user's question about THIS project using ONLY the project context below. You are READ-ONLY: recommend actions, never assume any were taken.",
    "Be honest about your verification boundary: only deterministic evidence (validation results, config, run outcomes, annotations) is reliable. Where the context is insufficient to be sure, say so in `caveats` and lower `confidence`. Never invent facts or fake authority.",
    "If a `Project state (computed - authoritative...)` block is present, it was computed deterministically from the ledger + roadmap + run history. Narrate and rank those items - do NOT contradict them or invent open intents / next steps that aren't there.",
    "Cite which context you actually used in `usedContext`" +
      (usedSources.length ? ` (available: ${usedSources.join(", ")})` : "") +
      ".",
    "Only set `proposedManualUpdate` when you have a concrete, evidence-backed improvement to the project's operating manual (VIBESTRATE.md); it is shown as a proposal, not applied. Otherwise null.",
    "Set `proposedPreference` ONLY when the user states a durable review rule about HOW code/output should be written (e.g. 'stop using em-dashes', 'never add eyebrow labels') - a thing a reviewer should check on every change. Capture it as `statement` (the rule) + `correction` (the fix, or null). It is saved PENDING and the user confirms it before it takes effect; never for a one-off ask. Otherwise null.",
    "",
    "# Project context",
    contextText.trim() || "(no project context was available)",
  ];
  if (screen) {
    lines.push(
      "",
      `# Current screen: ${screen.screen}`,
      "What the user is looking at right now (use it to ground field-specific advice):",
      screen.details.trim() || "(no detail)",
    );
  }
  lines.push("", "# Question", question.trim());
  return lines.join("\n");
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

  // Screen-aware orb: redact the screen snapshot HERE (the engine never trusts
  // the caller to have redacted) before it reaches the prompt.
  const screen: ConsultViewContext | null = req.viewContext
    ? {
        screen: req.viewContext.screen,
        details: redactSecretsInText(req.viewContext.details).redacted,
      }
    : null;

  const result = await runAssist<ConsultAnswer>({
    projectRoot: req.projectRoot,
    label: "consult",
    auditBucket: "consult",
    instruction: buildInstruction(question, context.text, context.usedSources, screen),
    schema: consultAnswerSchema,
    schemaHint: CONSULT_SCHEMA_HINT,
    // Suppress assist's own rules.md injection - our context already includes it,
    // and we don't want the project context duplicated.
    loaded: { ...loaded, rules: "" },
    profileId: req.profileId,
    crewId: req.crewId,
    adHocProvider: req.providerId
      ? { providerId: req.providerId, model: req.model ?? null, effort: req.effort ?? null }
      : null,
    signal: req.signal,
    runner: req.runner,
  });

  return {
    answer: result.parsed,
    usedSources: context.usedSources,
    notes: context.notes,
    sections: context.sections,
    providerId: result.providerId,
    profileId: result.profileId,
    model: result.model,
    effort: result.effort,
  };
}

/**
 * Surface-layer helper: if a consult answer proposed a VIBESTRATE.md update,
 * persist it as a reviewable proposal (never applied) and return its id. Kept
 * out of `runConsult` so the engine itself stays purely read-only.
 */
export async function persistConsultProposal(
  projectRoot: string,
  result: ConsultResult,
): Promise<string | null> {
  const p = result.answer.proposedManualUpdate;
  if (!p) return null;
  const saved = await saveManualProposal(projectRoot, {
    rationale: p.rationale,
    evidence: p.evidence,
    suggestedText: p.suggestedText,
    source: "consult",
  });
  return saved.id;
}

/**
 * Surface-layer helper: if a consult answer proposed a project POLICY, persist it
 * PENDING (confirmedAt:null) at PROJECT scope so the owner confirms it before it
 * takes effect. `proposePolicy` hard-constrains it to the advise tier with no matcher
 * - a model can never author a hard merge-cap. Kept out of `runConsult` so the engine
 * stays read-only. Returns the new policy id, or null if none.
 */
export async function persistConsultPreferenceProposal(
  projectRoot: string,
  result: ConsultResult,
): Promise<string | null> {
  const p = result.answer.proposedPreference;
  if (!p) return null;
  const id = slugifyPreferenceId(p.statement);
  await proposePolicy(projectRoot, {
    id,
    statement: p.statement,
    correction: p.correction ?? null,
  });
  return id;
}

function slugifyPreferenceId(text: string): string {
  const base = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 50);
  return base || "preference";
}
