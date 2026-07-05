// The ENHANCE pass.
//
// When the between-steps supervisor returns ENHANCE, the plan has diverged from
// the code as-built and the *pending* steps should be re-grounded before the
// next one runs. This module is the PURE core of that pass: a prompt builder, a
// step-diff parser, a deterministic authority classifier, and a pure transform
// that applies a diff to a pending step list. No provider, no fs - the
// orchestrator wires the actual model turn + persistence (the saga-scoped
// overlay) around these.
//
// Two scopes, one vocabulary:
//   - conductor (autonomous): may refine / reorder / remove PENDING steps. It may
//     NOT add (no durable status home for a fresh id without tripping the resume
//     guard - see docs/design/saga-conductor-enhance.md), and it may
//     not remove an `owner`-authored step. Either -> escalate to the owner.
//   - manual (`vibe saga enhance --apply`): may also add; the owner reviews the
//     dry-run diff first, so nothing escalates.
//
// All model-generated text in the prompt is redacted; the diff is bounded.

import { z } from "zod";
import { redactSecretsInText } from "../core/diff-service.js";
import type { Provenance } from "../roadmap/roadmap-types.js";

const redact = (s: string): string => redactSecretsInText(s).redacted;

const MAX_PROMPT_DIFF_CHARS = 8_000;
const MAX_FRESH_READ_CHARS = 6_000;

/** The pending-step shape the Enhance functions operate on - the saga step
 *  fields plus `provenance` (the authority key). A subset of `ChecklistItem`. */
export type EnhanceStep = {
  id: string;
  text: string;
  objective: string;
  acceptanceCheck: string;
  fileHints: string[];
  provenance: Provenance;
};

const refineSchema = z.object({
  id: z.string().min(1),
  text: z.string().optional(),
  objective: z.string().optional(),
  acceptanceCheck: z.string().optional(),
  fileHints: z.array(z.string()).optional(),
});
const addSchema = z.object({
  text: z.string().min(1),
  objective: z.string().optional(),
  acceptanceCheck: z.string().optional(),
  fileHints: z.array(z.string()).optional(),
});

// The model emits a single JSON object (fenced or bare). Arrays default empty;
// `reorder` is null when absent (distinct from "reorder to empty"). Unknown ids
// in refine/remove/reorder are tolerated and ignored by `applyStepDiff`.
export const stepDiffSchema = z.object({
  refine: z.array(refineSchema).default([]),
  remove: z.array(z.string().min(1)).default([]),
  reorder: z.array(z.string().min(1)).nullable().default(null),
  add: z.array(addSchema).default([]),
});
export type StepDiff = z.infer<typeof stepDiffSchema>;

export type StepDiffParse = {
  /** Null when no diff could be parsed (caller folds that to a no-op PROCEED). */
  diff: StepDiff | null;
  reason: string | null;
};

/** Pull the first JSON object out of model text: a ```json fenced block if
 *  present, else the first `{` … last `}` span. Returns null when neither. */
function extractJsonObject(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1] && fenced[1].includes("{")) return fenced[1].trim();
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) return text.slice(first, last + 1);
  return null;
}

/**
 * Parse the model's step diff. Robust by design (a cheap model may wrap the JSON
 * in prose): extract the JSON object, validate against `stepDiffSchema`. Any
 * failure returns `{ diff: null }` with a reason - the caller treats a null diff
 * as "no change" (Enhance is advisory; a malformed turn must not corrupt the
 * plan).
 */
export function parseStepDiff(text: string): StepDiffParse {
  const raw = extractJsonObject(text);
  if (!raw) return { diff: null, reason: "No JSON diff object found." };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { diff: null, reason: "Diff JSON did not parse." };
  }
  const result = stepDiffSchema.safeParse(parsed);
  if (!result.success) {
    return { diff: null, reason: "Diff JSON failed schema validation." };
  }
  return { diff: result.data, reason: null };
}

/**
 * Decide whether a diff may be applied autonomously or must escalate to the
 * owner. DETERMINISTIC - keyed on `provenance`, never on model prose:
 *   - manual: always auto (the owner reviews the dry-run diff).
 *   - conductor: escalate if it adds ANY step (autonomous add is out of scope),
 *     or if a `remove` targets an `owner`-authored pending step. Else auto.
 */
export function classifyAuthority(
  diff: StepDiff,
  pending: EnhanceStep[],
  mode: "conductor" | "manual",
): "auto" | "escalate" {
  if (mode === "manual") return "auto";
  if (diff.add.length > 0) return "escalate";
  const provById = new Map(pending.map((s) => [s.id, s.provenance]));
  for (const id of diff.remove) {
    if (provById.get(id) === "owner") return "escalate";
  }
  return "auto";
}

/**
 * Apply refine/remove/reorder to a pending step list, purely. Operates on
 * EXISTING ids only (add is the caller's job - it mints ids + persists). Unknown
 * ids are ignored. Order: remove -> refine -> reorder, so a reorder list sees the
 * post-remove set; ids the reorder omits keep their original relative order at
 * the end.
 */
export function applyStepDiff(pending: EnhanceStep[], diff: StepDiff): EnhanceStep[] {
  const removeSet = new Set(diff.remove);
  let out = pending.filter((s) => !removeSet.has(s.id));

  const refineById = new Map(diff.refine.map((r) => [r.id, r]));
  out = out.map((s) => {
    const r = refineById.get(s.id);
    if (!r) return s;
    return {
      ...s,
      ...(r.text !== undefined ? { text: r.text } : {}),
      ...(r.objective !== undefined ? { objective: r.objective } : {}),
      ...(r.acceptanceCheck !== undefined ? { acceptanceCheck: r.acceptanceCheck } : {}),
      ...(r.fileHints !== undefined ? { fileHints: r.fileHints } : {}),
    };
  });

  if (diff.reorder) {
    const byId = new Map(out.map((s) => [s.id, s]));
    const used = new Set<string>();
    const ordered: EnhanceStep[] = [];
    for (const id of diff.reorder) {
      const s = byId.get(id);
      if (s && !used.has(id)) {
        ordered.push(s);
        used.add(id);
      }
    }
    for (const s of out) if (!used.has(s.id)) ordered.push(s);
    out = ordered;
  }

  return out;
}

export type EnhancePromptArgs = {
  goal: string;
  doneOutcomes: { text: string; summary: string }[];
  pending: EnhanceStep[];
  diff: string;
  freshRead: string;
  invariants: string[];
  mode: "conductor" | "manual";
};

const bounded = (s: string, max: number): string =>
  s.length > max ? `${s.slice(0, max)}\n… [truncated]` : s;

/** Build the Enhance prompt. All model-prose sections are redacted; the diff and
 *  fresh-read are bounded. The instruction block differs by mode (conductor may
 *  not add). */
export function buildEnhancePrompt(args: EnhancePromptArgs): string {
  const { goal, doneOutcomes, pending, diff, freshRead, invariants, mode } = args;
  const parts: string[] = [];

  parts.push(
    "Saga conductor re-grounding (ENHANCE).\nYou are the saga conductor re-grounding a multi-step feature plan against the code as it actually is now. This is a PLAN-ONLY pass: you do not write code. You revise only the PENDING steps so the next ones build on reality, not the original guess.",
  );

  parts.push(`## Feature goal\n${redact(goal)}`);

  if (invariants.length > 0) {
    parts.push(
      `## Invariants so far (must keep holding)\n${invariants.map((i) => `- ${redact(i)}`).join("\n")}`,
    );
  }

  if (doneOutcomes.length > 0) {
    parts.push(
      `## Steps already done (immutable history)\n${doneOutcomes
        .map((o) => `- ${redact(o.text)} -> ${redact(o.summary)}`)
        .join("\n")}`,
    );
  }

  if (diff.trim()) {
    parts.push(`## Committed work so far (diff)\n${bounded(redact(diff), MAX_PROMPT_DIFF_CHARS)}`);
  }

  if (freshRead.trim()) {
    parts.push(
      `## Fresh read of the current code\n${bounded(redact(freshRead), MAX_FRESH_READ_CHARS)}`,
    );
  }

  parts.push(
    `## Pending steps (revise THESE, by id)\n${pending
      .map((s) => {
        const obj = s.objective ? ` - objective: ${redact(s.objective)}` : "";
        return `- ${s.id}: ${redact(s.text)}${obj}`;
      })
      .join("\n")}`,
  );

  const ops =
    mode === "conductor"
      ? "`refine` (sharpen a pending step's text/objective/acceptanceCheck/fileHints), `remove` (drop a now-unnecessary pending step), `reorder` (resequence pending step ids)"
      : "`refine`, `remove`, `reorder`, and `add` (a brand-new step)";

  const addRule =
    mode === "conductor"
      ? "You may NOT add new steps and you may NOT remove an owner-authored step. If the plan genuinely needs a new step or an owner step dropped, leave the plan as-is - the saga will escalate that decision to the owner."
      : "You may add new steps when the plan needs them.";

  parts.push(
    [
      "## Output",
      `Reply with ONE JSON object describing the changes, using ${ops}. Reference pending steps by their id. ${addRule}`,
      "If the plan is already well-grounded, reply with an empty object `{}`.",
      "Shape: `{ \"refine\": [{\"id\":\"...\",\"text\":\"...\"}], \"remove\": [\"id\"], \"reorder\": [\"id\",\"id\"], \"add\": [{\"text\":\"...\"}] }` - every field optional.",
    ].join("\n"),
  );

  return parts.join("\n\n");
}
