// ── Run brief (the story so far) ────────────────────────────────────────────
//
// A compact, evolving summary the orchestrator maintains across a flow's steps,
// so each role gets a tight through-line - chosen flow, decisions made, changed
// files, validation status, open risks - instead of nothing cross-cutting (a
// step only sees the specific prior artifacts its `inputs` select). The brief is
// DETERMINISTIC (no LLM): assembled from facts the orchestrator already has,
// budget-bounded by folding the oldest step outcomes - the same forward-carry
// idea as the per-item ledger in pickup/item-summary.ts. See
// docs/design/responsible-orchestrator.md.

import type { WorkflowSelection } from "../orchestrator/select-workflow.js";

export type RunBriefStepOutcome = {
  stepId: string;
  label: string;
  kind: string;
  /** A compact head of the step's output. */
  summary: string;
  /** A decision marker the step produced (review/verification), if any. */
  decision: string | null;
};

export type RunBriefState = {
  task: string;
  flow: { id: string; source: string; crewId: string | null } | null;
  reasons: string[];
  steps: RunBriefStepOutcome[];
  validation: { total: number; passed: number; failed: number } | null;
  filesChanged: number | null;
  risks: string[];
};

const DEFAULT_BRIEF_BUDGET_CHARS = 2_000;
const STEP_SUMMARY_CHARS = 220;

function oneLine(text: string, max = STEP_SUMMARY_CHARS): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max).trimEnd()}…` : flat;
}

/** Seed a brief from the task and the Slice-2 selection (flow / crew / reasons). */
export function initRunBrief(input: {
  task: string;
  selection?: WorkflowSelection | null;
}): RunBriefState {
  const sel = input.selection ?? null;
  return {
    task: input.task,
    flow: sel
      ? { id: sel.flowId, source: sel.source, crewId: sel.crewId }
      : null,
    reasons: sel?.reasons ?? [],
    steps: [],
    validation: null,
    filesChanged: null,
    risks: sel?.risks ? [...sel.risks] : [],
  };
}

/** Record a completed step's outcome (its output head + any decision marker). */
export function appendStepOutcome(
  state: RunBriefState,
  input: { stepId: string; label: string; kind: string; output: string; decision?: string | null },
): void {
  state.steps.push({
    stepId: input.stepId,
    label: input.label,
    kind: input.kind,
    summary: oneLine(input.output),
    decision: input.decision ?? null,
  });
}

/** Update the run-level facts the brief carries (validation + changed files). */
export function updateRunBriefFacts(
  state: RunBriefState,
  facts: { validation?: { total: number; passed: number; failed: number } | null; filesChanged?: number | null },
): void {
  if (facts.validation !== undefined) state.validation = facts.validation;
  if (facts.filesChanged !== undefined) state.filesChanged = facts.filesChanged;
}

/**
 * Render the brief as a bounded markdown block. Returns "" before any step has
 * completed (so the first role shows no brief section). When the full form would
 * exceed `budgetChars`, the oldest step outcomes fold to one line (label +
 * decision), newest keep their summary - mirroring the pickup item ledger.
 */
export function renderRunBrief(
  state: RunBriefState,
  budgetChars: number = DEFAULT_BRIEF_BUDGET_CHARS,
): string {
  if (state.steps.length === 0) return "";

  const full = (s: RunBriefStepOutcome): string => {
    const dec = s.decision ? ` [${s.decision}]` : "";
    const note = s.summary ? `\n   ${oneLine(s.summary)}` : "";
    return `- ${s.label} (${s.kind})${dec}${note}`;
  };
  const terse = (s: RunBriefStepOutcome): string =>
    `- ${s.label} (${s.kind})${s.decision ? ` [${s.decision}]` : ""}`;

  const modes = state.steps.map(() => "full" as "full" | "terse");
  const renderSteps = () =>
    state.steps.map((s, i) => (modes[i] === "full" ? full(s) : terse(s))).join("\n");

  const head: string[] = ["# Run brief (the story so far)"];
  head.push("For context - what has happened in this run so far. Build on it; don't redo it.", "");
  head.push(`Task: ${oneLine(state.task, 300)}`);
  if (state.flow) {
    const crew = state.flow.crewId ? `, crew ${state.flow.crewId}` : "";
    head.push(`Flow: ${state.flow.id} (${state.flow.source}${crew})`);
    if (state.reasons[0]) head.push(`  why: ${oneLine(state.reasons[0], 200)}`);
  }

  const facts: string[] = [];
  if (state.validation) {
    facts.push(
      `Validation: ${state.validation.passed}/${state.validation.total} passed${state.validation.failed ? `, ${state.validation.failed} failed` : ""}`,
    );
  }
  if (state.filesChanged !== null) facts.push(`Files changed: ${state.filesChanged}`);
  if (state.risks.length) facts.push(`Open risks: ${state.risks.map((r) => oneLine(r, 120)).join("; ")}`);

  const assemble = () =>
    [...head, "", "## Steps so far", renderSteps(), ...(facts.length ? ["", "## Status", ...facts] : []), ""].join("\n");

  for (let i = 0; i < state.steps.length && assemble().length > budgetChars; i++) {
    modes[i] = "terse";
  }
  return assemble();
}
