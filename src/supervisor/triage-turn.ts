// ── Triage turn ──────────────────────────────────────────────────────────────
//
// One cheap, read-only assist call that sizes a task and, when the task is big
// enough to have parts, names them. It is the gray-zone tier: the deterministic
// sizer (flow-sizing.ts) runs first and free, and this only gets asked about
// what the keyword lists cannot settle.
//
// The point of the turn is context. The deterministic tier reads a sentence; a
// keyword list can never know that "make the sidebar collapsible" touches a
// component with nine call sites, or that this repo keeps its routes in one
// file. This turn sees the `vibe learn` codebase map, so it can answer from the
// repo instead of from vocabulary.
//
// WHAT IT MAY DECIDE, and the line that does not move:
//
//   It may choose a leaner FRONT - skip the plan and architecture turns by
//   routing to `express`. That is a cost decision, and being wrong about it
//   costs a worse plan.
//
//   It may NOT reduce a back gate. Its one possible target is `express`, whose
//   review and verify are decided by the actual diff after the work is done
//   (review-descent.ts). So a model can never talk its way into less scrutiny
//   for the code it is about to write - the thing this product exists to stop.
//
// The roadmap it returns is DATA, not an effect. This module writes nothing:
// the caller decides whether the steps land on a task card, get shown, or are
// dropped. Selection stays a decision, not a side effect.
//
// Fail-closed throughout: a provider failure, an unparseable answer, a refusal,
// or any uncertainty returns null, and null means the full flow. The expensive
// direction is the safe one.

import { z } from "zod";
import { runAssist, type AssistProviderRunner } from "../core/assist/assist-runner.js";
import { loadCodebaseMap, renderCodebaseMapForPrompt } from "../project/codebase-map.js";
import { redactSecretsInText } from "../core/diff-service.js";
import type { LoadedConfig } from "../project/config-loader.js";

/** How much of the codebase map rides into the triage prompt. Small on purpose:
 *  this turn is meant to be the cheap one, and the map's leading sections are
 *  its most informative (languages, entry points, layout). */
const MAP_PROMPT_MAX_BYTES = 6_000;

/** Upper bound on returned steps. A triage that wants more than this has not
 *  sized a task, it has written a project plan - which is spec-up's job. */
const MAX_STEPS = 12;

export const triageAnswerSchema = z
  .object({
    size: z.enum(["trivial", "standard"]),
    reasons: z.array(z.string().min(1).max(300)).max(6).default([]),
    /** Ordered work items, when the task genuinely has parts. Empty for a task
     *  small enough that decomposing it is noise. */
    steps: z
      .array(
        z
          .object({
            text: z.string().min(1).max(300),
            objective: z.string().max(500).default(""),
          })
          .strict(),
      )
      .max(MAX_STEPS)
      .default([]),
  })
  .strict();

export type TriageAnswer = z.infer<typeof triageAnswerSchema>;

const SCHEMA_HINT = `{
  "size": "trivial | standard - trivial ONLY for a small, low-risk change; anything touching auth, money, personal data, migrations, CI/deploy config, or that you are unsure about is standard",
  "reasons": ["string - what decided it, grounded in the repo where possible"],
  "steps": [{ "text": "one work item, imperative", "objective": "what done looks like" }]
}`;

export type TriageResult = {
  size: "trivial" | "standard";
  reasons: string[];
  steps: { text: string; objective: string }[];
  /** What actually answered, for the audit trail. */
  providerId: string;
  model: string | null;
};

/**
 * Ask one read-only question: how big is this, and what are its parts?
 *
 * Returns null on any failure or uncertainty - the caller then runs the full
 * flow. Never throws: a triage that cannot answer must not be able to fail a
 * run that would otherwise have started.
 */
export async function runTriageTurn(input: {
  projectRoot: string;
  task: string;
  loaded?: LoadedConfig;
  crewId?: string | null;
  profileId?: string | null;
  signal?: AbortSignal;
  runner?: AssistProviderRunner;
}): Promise<TriageResult | null> {
  try {
    const instruction = [
      "Size this task, and if it genuinely has parts, list them.",
      "Reply ONLY with the JSON.",
      "",
      `Task: ${input.task}`,
      "",
      await repoContextBlock(input.projectRoot),
      "",
      "trivial = a small, low-risk change: presentation, copy, a contained tweak.",
      "standard = anything touching auth, money, personal data, permissions,",
      "  migrations, deploys or CI config - or anything you are unsure about.",
      "",
      "Prefer standard when torn. Being wrong toward standard costs a slower run;",
      "being wrong toward trivial costs a worse plan for real work.",
      "",
      "steps: leave EMPTY for a task small enough that splitting it is noise.",
      "Otherwise give the ordered work items a person would tick off. Describe",
      "outcomes, not instructions to a model.",
    ]
      .filter((line) => line !== null)
      .join("\n");

    const result = await runAssist({
      projectRoot: input.projectRoot,
      label: "triage",
      auditBucket: "selection",
      instruction,
      schema: triageAnswerSchema,
      schemaHint: SCHEMA_HINT,
      crewId: input.crewId ?? undefined,
      profileId: input.profileId ?? undefined,
      loaded: input.loaded,
      signal: input.signal,
      runner: input.runner,
    });
    return {
      size: result.parsed.size,
      reasons: result.parsed.reasons,
      steps: result.parsed.steps,
      providerId: result.providerId,
      model: result.model,
    };
  } catch {
    // Fail closed: no triage means the full flow, which is the safe default.
    return null;
  }
}

/** The `vibe learn` map, bounded and redacted, or a line saying there isn't one.
 *  Redacted at this boundary rather than trusted from disk: the map is a
 *  generated artifact, and anything entering a prompt gets redacted at the site
 *  that builds the prompt. */
async function repoContextBlock(projectRoot: string): Promise<string> {
  const loaded = await loadCodebaseMap(projectRoot).catch(() => null);
  if (!loaded?.present || !loaded.map) {
    return "(No codebase map for this project - size from the task text alone.)";
  }
  const rendered = renderCodebaseMapForPrompt(loaded.map, {
    maxBytes: MAP_PROMPT_MAX_BYTES,
    stale: loaded.stale,
  });
  return redactSecretsInText(rendered).redacted;
}
