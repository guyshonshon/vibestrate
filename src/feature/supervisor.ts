// The between-steps SUPERVISOR turn (Saga Phase 2b, M3).
//
// After a saga step commits cleanly, a cheap model turn judges whether the saga
// should PROCEED to the next step or ESCALATE (halt cleanly with a report). It
// also maintains the non-folding INVARIANTS ledger: an append-only list of
// cross-cutting decisions (e.g. "all API responses use snake_case") re-injected
// into every step's packet - the anti-drift guarantee a folding outcome summary
// cannot give. `ENHANCE` (re-ground the pending plan) is reserved for Phase 3;
// here it folds to PROCEED and is logged.
//
// This module is PURE: the prompt builder, the decision/invariants parsers, and
// the ledger accumulation are all testable without a provider. The orchestrator
// wires the actual `runRole` turn + persistence at the band's per-item seam, and
// is the ONLY place a decision touches control flow - the supervisor NEVER
// writes the run-scoped `reviewDecision` (that would clobber the run verdict).

import { redactSecretsInText } from "../core/diff-service.js";

const redact = (s: string): string => redactSecretsInText(s).redacted;

export type SupervisorDecision = "PROCEED" | "ENHANCE" | "ESCALATE";

// Mirror REVIEW_DECISION_RE (review-findings.ts): one strict DECISION line,
// scanned multiline. The supervisor's vocabulary is its own (PROCEED/ENHANCE/
// ESCALATE) so its parse can never be mistaken for - or clobber - a review one.
export const SUPERVISOR_DECISION_RE =
  /^\s*DECISION\s*:\s*(PROCEED|ENHANCE|ESCALATE)\s*$/m;

// New cross-cutting invariants are emitted one per line, `INVARIANT: <text>`.
const SUPERVISOR_INVARIANT_RE = /^\s*INVARIANT\s*:\s*(.+?)\s*$/gim;

// The ledger is re-injected into EVERY step's packet, so it must stay bounded -
// a runaway list would crowd out the goal + this-step sections it exists to
// protect. Non-folding, but capped.
export const MAX_INVARIANTS = 50;
export const MAX_INVARIANT_CHARS = 200;
const MAX_PROMPT_DIFF_CHARS = 8_000;

export type SupervisorParse = {
  /** Null when no decision could be parsed (caller treats null as PROCEED). */
  decision: SupervisorDecision | null;
  reason: string | null;
};

/**
 * Parse the supervisor's decision. Primary: the strict `DECISION:` line.
 * Fallback (a cheap model may not format perfectly): the LAST bare keyword in
 * the text. If neither is present, returns `{ decision: null }` with a reason -
 * the caller folds that to PROCEED (the supervisor is an advisory strategic
 * guard ON TOP of the per-item review, which already fail-closes correctness; a
 * malformed supervisor turn must not spuriously halt an otherwise-passing saga).
 */
export function parseSupervisorDecision(text: string): SupervisorParse {
  const strict = text.match(SUPERVISOR_DECISION_RE);
  if (strict) return { decision: strict[1] as SupervisorDecision, reason: null };
  // Lenient fallback: the last standalone keyword wins.
  const kw = /\b(PROCEED|ENHANCE|ESCALATE)\b/g;
  let last: SupervisorDecision | null = null;
  let m: RegExpExecArray | null;
  while ((m = kw.exec(text)) !== null) last = m[1] as SupervisorDecision;
  if (last) return { decision: last, reason: null };
  return {
    decision: null,
    reason: "Supervisor did not provide a parseable DECISION; proceeding.",
  };
}

/**
 * The decision that drives control flow: ENHANCE folds to PROCEED (Phase 3
 * reserves the real re-ground pass), and an unparseable turn folds to PROCEED.
 * Only an explicit ESCALATE halts the saga.
 */
export function effectiveSupervisorDecision(text: string): "PROCEED" | "ESCALATE" {
  return parseSupervisorDecision(text).decision === "ESCALATE"
    ? "ESCALATE"
    : "PROCEED";
}

/** Extract `INVARIANT:` lines, redacted + trimmed, dropping empties. */
export function parseNewInvariants(text: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  SUPERVISOR_INVARIANT_RE.lastIndex = 0;
  while ((m = SUPERVISOR_INVARIANT_RE.exec(text)) !== null) {
    const v = redact(m[1]!.trim());
    if (v) out.push(v);
  }
  return out;
}

/** Normalize for dedup: collapse whitespace + lowercase. */
function invariantKey(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Append new invariants to the existing ledger: redacted, per-item length-capped,
 * deduped (case/whitespace-insensitive, existing wins), and total-count-capped.
 * Existing invariants keep priority over the count cap (they are established
 * conventions); excess newcomers are dropped.
 */
export function appendInvariants(
  existing: readonly string[],
  incoming: readonly string[],
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string): void => {
    const v = redact(raw.trim()).slice(0, MAX_INVARIANT_CHARS);
    if (!v) return;
    const key = invariantKey(v);
    if (seen.has(key)) return;
    if (out.length >= MAX_INVARIANTS) return;
    seen.add(key);
    out.push(v);
  };
  for (const e of existing) push(e);
  for (const i of incoming) push(i);
  return out;
}

/**
 * The packet's `## Invariants` section (replaces the Phase-2b seam placeholder).
 * Empty ledger -> empty string (the packet omits empty sections). Redaction is
 * applied again by the packet builder, so this can stay plain.
 */
export function renderInvariantsSection(invariants: readonly string[]): string {
  if (invariants.length === 0) return "";
  return [
    "## Invariants",
    "Cross-cutting decisions from earlier steps. These DO NOT fold away - honor every one.",
    "",
    ...invariants.map((i) => `- ${i}`),
  ].join("\n");
}

function truncate(text: string, max: number): string {
  const flat = text.replace(/\r/g, "");
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max).trimEnd()}\n…(truncated at ${max} chars)`;
}

export type SupervisorPromptArgs = {
  goal: string;
  lastStep: { text: string; outcomeSummary: string };
  /** Committed work on the feature branch so far (accumulated, fork-point diff). */
  diffSoFar: string;
  remainingSteps: string[];
  invariants: readonly string[];
};

/**
 * Build the supervisor turn's prompt. Every section is redacted. The model is
 * told the exact output contract (a DECISION line + optional INVARIANT lines) so
 * `parseSupervisorDecision` / `parseNewInvariants` can read it deterministically.
 */
export function buildSupervisorPrompt(args: SupervisorPromptArgs): string {
  const { goal, lastStep, diffSoFar, remainingSteps, invariants } = args;
  const parts: string[] = [];
  parts.push(
    [
      "# Saga supervisor checkpoint",
      "",
      "A step of this saga just finished and committed. Judge whether the saga is on track to continue, or whether it has drifted off the feature goal / hit something irrecoverable and must halt.",
    ].join("\n"),
  );
  parts.push(["## Feature goal", "", redact(goal.trim()) || "_No goal text._"].join("\n"));

  const inv = invariants.length > 0
    ? invariants.map((i) => `- ${redact(i)}`).join("\n")
    : "_None yet._";
  parts.push(["## Invariants so far (do not contradict these)", "", inv].join("\n"));

  parts.push(
    [
      "## The step that just finished",
      "",
      redact(lastStep.text.trim()) || "_(no text)_",
      "",
      "Outcome:",
      redact(lastStep.outcomeSummary.trim()) || "_(no summary)_",
    ].join("\n"),
  );

  const diff = redact(truncate(diffSoFar, MAX_PROMPT_DIFF_CHARS).trim());
  if (diff) {
    parts.push(
      ["## Committed work so far (diff)", "", "```diff", diff, "```"].join("\n"),
    );
  }

  const remaining = remainingSteps.length > 0
    ? remainingSteps.map((s, i) => `${i + 1}. ${redact(s)}`).join("\n")
    : "_None - this was the last step._";
  parts.push(["## Remaining steps", "", remaining].join("\n"));

  parts.push(
    [
      "## Your output (exact format)",
      "Render exactly ONE decision line, then zero or more invariant lines:",
      "",
      "DECISION: PROCEED | ESCALATE",
      "INVARIANT: <a cross-cutting convention later steps must honor> (optional, repeatable)",
      "",
      "PROCEED if the work is on-goal and the remaining steps still make sense. ESCALATE only if the feature has drifted off the goal, an earlier step is irrecoverably wrong, or continuing would build on something broken - on ESCALATE add a one-paragraph report of why. Add an INVARIANT line for any NEW cross-cutting decision this step established (naming, format, contract, boundary) that later steps must not contradict. Do not restate existing invariants.",
    ].join("\n"),
  );

  return parts.join("\n\n") + "\n";
}
