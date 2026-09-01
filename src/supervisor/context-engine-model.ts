// ── The model tier of the context engine ─────────────────────────────────────
//
// The deterministic tier states a fact: these artifacts exist and this step is
// not receiving them. It cannot say which of them MATTERS, and the attempt to
// guess that with keywords failed hard on real data (see context-engine.ts).
// Relevance is a judgment call, which is what this tier is for.
//
// THE MODEL SELECTS; THE SYSTEM SUPPLIES THE BYTES.
//
// It answers with token ids drawn from the candidate list and a reason for
// each. It never writes the content that gets injected - that is read from the
// artifact the token names. So a model that hallucinates can pick the wrong
// artifact, or invent a token id that gets dropped, and it still cannot put a
// single word into a seat's prompt that some step did not actually produce.
//
// Everything the additive-only guarantee rests on is inherited unchanged: this
// is a ContextEngine, so its return type is `FlowContextInjection[]`, its input
// is the complement of the step's declared inputs, and enrichStep clamps it. A
// model cannot reach a declared input from here because no such object is in
// scope.
//
// Failure is silence. runAssist throwing, a provider being absent, a malformed
// answer, or an unparseable schema all end in zero injections and a recorded
// note - enrichStep catches, and a step still receives everything its contract
// declares because that path does not come through here at all.

import { z } from "zod";
import { runAssist, type AssistProviderRunner } from "../core/assist/assist-runner.js";
import { redactSecretsInText } from "../core/diff-service.js";
import type { LoadedConfig } from "../project/config-loader.js";
import type { FlowContextInjection } from "../flows/runtime/flow-context-builder.js";
import type { ContextEngine, ContextEngineView } from "./context-engine.js";

/** How much of a candidate the model reads while judging relevance. */
const CANDIDATE_PREVIEW_BYTES = 1_500;
/** How much of a selected candidate is injected. A pointer stays a pointer. */
const SELECTED_EXCERPT_BYTES = 6_000;
/** The model may select at most this many; the rest stay in the manifest. */
const MAX_SELECTIONS = 2;

const selectionSchema = z.object({
  selections: z
    .array(
      z.object({
        token: z.string().min(1),
        reason: z.string().min(1).max(300),
      }),
    )
    .max(8)
    .default([]),
});

const SCHEMA_HINT = `{"selections":[{"token":"architecture","reason":"why this step needs it"}]}`;

/**
 * A model tier bound to one project's config.
 *
 * Built per run rather than as a module singleton because it needs the loaded
 * config and the abort signal, and because a shared instance would make one
 * run's cancellation reach another's.
 */
export function modelContextEngine(input: {
  projectRoot: string;
  loaded?: LoadedConfig;
  profileId?: string | null;
  crewId?: string | null;
  signal?: AbortSignal;
  runner?: AssistProviderRunner;
}): ContextEngine {
  return {
    id: "model",
    proposeInjections: async (view: ContextEngineView) => {
      if (view.candidates.length === 0) {
        return { injections: [], note: "Nothing outside this step's declared inputs to judge." };
      }

      // Previews are REDACTED here, at the site that builds the prompt, rather
      // than trusted from disk. An artifact is generated output and can carry a
      // token; this is a third place it would otherwise reach a model.
      const catalogue = view.candidates.map((candidate) => {
        const preview = redactSecretsInText(
          candidate.content.slice(0, CANDIDATE_PREVIEW_BYTES),
        ).redacted;
        return [
          `--- ${candidate.token} (${candidate.label}) ---`,
          preview,
        ].join("\n");
      });

      const instruction = [
        `A step in a coding flow is about to run: "${view.stepLabel}" (${view.stepId})`,
        view.seat ? `It runs as the ${view.seat} seat.` : "",
        "",
        `Task: ${view.task}`,
        "",
        `It already receives: ${view.declaredInputs.join(", ") || "(nothing)"}`,
        "",
        "Below are artifacts this run produced that the step is NOT receiving.",
        "Name the ones it would do its job WORSE without, and why.",
        "",
        "Select nothing unless a specific artifact would change what this step",
        "does or concludes. An irrelevant selection costs the step tokens and",
        "dilutes its prompt, which is worse than sending it nothing. Selecting",
        "nothing is the right answer most of the time.",
        "",
        "Reply ONLY with the JSON. `token` must be copied exactly from a header",
        "below; anything else is discarded.",
        "",
        ...catalogue,
      ]
        .filter((line) => line !== "")
        .join("\n");

      let parsed: z.infer<typeof selectionSchema>;
      let providerId = "unknown";
      try {
        const result = await runAssist({
          projectRoot: input.projectRoot,
          label: "context-engine",
          auditBucket: "selection",
          instruction,
          schema: selectionSchema,
          schemaHint: SCHEMA_HINT,
          profileId: input.profileId ?? undefined,
          crewId: input.crewId ?? undefined,
          loaded: input.loaded,
          signal: input.signal,
          runner: input.runner,
        });
        parsed = result.parsed;
        providerId = result.providerId;
      } catch (err) {
        // Silence, not failure. The step still gets its contract either way.
        return {
          injections: [],
          note: `Context engine did not run: ${err instanceof Error ? err.message : String(err)}`,
        };
      }

      const byToken = new Map(view.candidates.map((c) => [c.token, c]));
      const injections: FlowContextInjection[] = [];
      const unknown: string[] = [];
      for (const selection of parsed.selections) {
        if (injections.length >= MAX_SELECTIONS) break;
        const candidate = byToken.get(selection.token);
        if (!candidate) {
          // A token that is not on the list is a hallucination, and it is
          // dropped rather than looked up. This is the reason the model answers
          // with ids instead of prose: an invented id resolves to nothing,
          // where invented prose would have gone straight into a prompt.
          unknown.push(selection.token);
          continue;
        }
        injections.push({
          source: `model-selected:${candidate.token}`,
          label: `${candidate.label} (selected by the Supervisor)`,
          // Read from the artifact, never from the model's answer.
          content: redactSecretsInText(
            candidate.content.slice(0, SELECTED_EXCERPT_BYTES),
          ).redacted,
          reason: selection.reason,
        });
      }

      const notes: string[] = [];
      if (injections.length === 0) {
        notes.push(
          `Judged ${view.candidates.length} candidate(s) on ${providerId}; none would change what this step does.`,
        );
      }
      if (unknown.length > 0) {
        // Recorded rather than swallowed: a model naming tokens that do not
        // exist is a signal about the prompt, not noise to hide.
        notes.push(`Discarded ${unknown.length} selection(s) naming no real artifact: ${unknown.join(", ")}.`);
      }
      return { injections, note: notes.length > 0 ? notes.join(" ") : null };
    },
  };
}
