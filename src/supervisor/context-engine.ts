// ── Supervisor context engine ────────────────────────────────────────────────
//
// A Supervisor session that runs alongside the flow and enriches each step with
// context it judges relevant: a decision made three steps ago that this seat
// would otherwise not see, a constraint from the task brief the step's own
// inputs do not carry, a note that the last review already rejected this
// approach.
//
// THE LINE THAT DOES NOT MOVE. It is additive only. It may add reading
// material; it may never withhold, shrink, reorder away, or replace anything a
// step's contract declares.
//
// That is enforced by SHAPE, not by this comment. Two halves:
//
//   - `proposeInjections` returns `FlowContextInjection[]` and nothing else.
//     There is no `remove`, no `replace`, no `summarize`, no budget field.
//   - its input domain is the COMPLEMENT of the step's inputs. It sees what the
//     step is missing, never what the step already holds, so the objects it
//     would have to touch in order to drop one are not reachable from it.
//
// It has no channel through which to return a modified input, a removal, or a
// budget instruction. The context
// builder appends injections after the declared inputs and after the contract
// check, so an injection cannot satisfy a contract or displace what does. A
// buggy engine, or one whose model returns something adversarial, can at worst
// add irrelevant text and cost tokens.
//
// The objection this answers is the one that makes `block` policies owner-only
// and that triage-turn.ts is built around: a supervisor that can hide a file
// from a reviewer is a gate held by a model. This one cannot hide anything,
// because it is never asked what to remove.
//
// Every injection is emitted as a `supervisor.context_injection` event carrying
// its source, its stated reason, and its size. An addition nobody can see is
// indistinguishable from a change to the flow.

import type { FlowContextInjection } from "../flows/runtime/flow-context-builder.js";

/** What the engine is allowed to know about the step it is enriching. */
export type ContextEngineView = {
  readonly stepId: string;
  readonly stepLabel: string;
  readonly seat: string | null;
  /** Tokens the step declared. Names only - the engine gets no edit handle. */
  readonly declaredInputs: readonly string[];
  /** Tokens the step cannot run without, for judging what would be redundant. */
  readonly requiredInputs: readonly string[];
  /**
   * What the step is NOT getting: outputs this run has produced that this step
   * did not declare. This is the engine's ENTIRE input domain, and that is the
   * point.
   *
   * The engine can only ever choose from the complement of the step's inputs,
   * so "add something the step is missing" is the only sentence it can form.
   * It is never handed what the step already has, which is why there is no
   * shape in which it could shrink or drop one - the objects simply are not
   * reachable from here.
   */
  readonly candidates: readonly { token: string; label: string; content: string }[];
  readonly task: string;
};

export type ContextEngineDecision = {
  injections: FlowContextInjection[];
  /** Recorded when the engine chose to add nothing, so silence is legible. */
  note: string | null;
};

/** Per-step cap, so an engine cannot bloat a prompt without it being a choice. */
export const MAX_INJECTIONS_PER_STEP = 4;
export const MAX_INJECTION_BYTES = 8_000;

/**
 * Trim a proposal to what the engine is permitted to add.
 *
 * Applied to the engine's OWN output, not to the step's inputs, so the worst
 * case is that the Supervisor says less than it wanted. There is deliberately
 * no corresponding path that could trim a declared input.
 */
export function clampInjections(
  proposed: readonly FlowContextInjection[],
): { kept: FlowContextInjection[]; dropped: { label: string; why: string }[] } {
  const kept: FlowContextInjection[] = [];
  const dropped: { label: string; why: string }[] = [];
  for (const injection of proposed) {
    if (kept.length >= MAX_INJECTIONS_PER_STEP) {
      dropped.push({ label: injection.label, why: `more than ${MAX_INJECTIONS_PER_STEP} injections` });
      continue;
    }
    const content = injection.content.trim();
    if (content.length === 0) {
      dropped.push({ label: injection.label, why: "empty" });
      continue;
    }
    if (Buffer.byteLength(content, "utf8") > MAX_INJECTION_BYTES) {
      dropped.push({ label: injection.label, why: `over ${MAX_INJECTION_BYTES} bytes` });
      continue;
    }
    if (!injection.reason.trim()) {
      // An addition with no stated reason is unattributable, which defeats the
      // audit trail the whole mechanism depends on.
      dropped.push({ label: injection.label, why: "no stated reason" });
      continue;
    }
    kept.push({ ...injection, content });
  }
  return { kept, dropped };
}

/**
 * The engine's contract with its caller.
 *
 * Deliberately returns only additions. There is no `remove`, no `replace`, no
 * `summarize` and no budget field, because a channel that does not exist cannot
 * be misused - by a bug, by a prompt injection in an artifact it read, or by a
 * model deciding a reviewer does not need the diff.
 */
export type ContextEngine = {
  readonly id: string;
  proposeInjections(view: ContextEngineView): Promise<ContextEngineDecision>;
};

/** Runs an engine and clamps it. Never throws: a failed engine adds nothing. */
export async function enrichStep(
  engine: ContextEngine,
  view: ContextEngineView,
): Promise<{
  injections: FlowContextInjection[];
  dropped: { label: string; why: string }[];
  note: string | null;
  error: string | null;
}> {
  let decision: ContextEngineDecision;
  try {
    decision = await engine.proposeInjections(view);
  } catch (err) {
    // A Supervisor that fails must cost the enrichment, never the run. The step
    // still receives everything its contract declares - that path does not go
    // through here at all.
    return {
      injections: [],
      dropped: [],
      note: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
  const { kept, dropped } = clampInjections(decision.injections);
  return { injections: kept, dropped, note: decision.note, error: null };
}

/**
 * The event one injection becomes.
 *
 * Emitted per injection rather than once per step, so a run's audit trail shows
 * WHAT was added and WHY, not just that enrichment happened. Size is carried
 * because a large addition is a different thing from a one-line note, and a
 * reader should not have to open the packet to tell them apart.
 */
export function injectionEvent(input: {
  stepId: string;
  engineId: string;
  injection: FlowContextInjection;
}): { type: "supervisor.context_injection"; message: string; data: Record<string, unknown> } {
  return {
    type: "supervisor.context_injection",
    message: `Supervisor added "${input.injection.label}" to ${input.stepId}.`,
    data: {
      stepId: input.stepId,
      engineId: input.engineId,
      source: input.injection.source,
      label: input.injection.label,
      reason: input.injection.reason,
      bytes: Buffer.byteLength(input.injection.content, "utf8"),
      // Named so a reader knows this event can only ever describe an addition.
      effect: "added",
    },
  };
}

// ── The deterministic tier ───────────────────────────────────────────────────
//
// The same shape flow-sizing.ts has against triage-turn.ts: run the free,
// deterministic answer first, and only pay a model for what it cannot settle.
//
// It answers the concrete version of "context is lost between steps": a step
// declares four inputs, the run has produced seven, and the three it did not
// declare may bear on it. A reviewer that never received the architecture
// step's output does not know the approach was already chosen, and reports it
// as a finding.
//
// WHAT IT EMITS IS A MANIFEST, NOT A DIGEST, and that is a correction.
//
// The first version scanned undeclared outputs for decision-shaped lines
// ("decided", "chose", "rejected", "constraint") and injected the matches.
// Calibrated against 107 real artifacts from recorded benchmark runs rather
// than against invented fixtures, it did not survive: the loose marker set hit
// 169 lines that were overwhelmingly headings ("## Final Decision"), table
// columns ("| Stage | ... | Decision |") and run metadata ("Flow chosen
// explicitly with --flow"), and tightening it to verb-led phrases dropped to 18
// hits that were almost entirely role-prompt boilerplate rather than run
// output. A tier that injects mostly noise costs tokens and dilutes the prompt,
// which is worse than adding nothing.
//
// So this states a FACT instead of guessing: which outputs exist that this step
// does not receive, and where to read them. No heuristic, no false positives,
// one line each. The seat decides whether to open one. A model tier can later
// decide which pointer is worth expanding into content - that is a judgment
// call, which is exactly the work a model should be paid for and a keyword list
// should not attempt.

/** How much of a pointer line is kept, so a long label cannot bloat a prompt. */
const MANIFEST_LABEL_CHARS = 120;

/**
 * The free tier. No model call, no cost, always available.
 *
 * One injection listing every output this run produced that this step does not
 * receive, with where to read each. A fact, not a guess - see the note above
 * for the heuristic this replaced and the calibration that killed it.
 */
export const deterministicContextEngine: ContextEngine = {
  id: "deterministic",
  proposeInjections: async (view) => {
    if (view.candidates.length === 0) {
      return { injections: [], note: "Every output this run has produced is already declared by this step." };
    }
    const lines = view.candidates.map((candidate) => {
      const label = candidate.label.slice(0, MANIFEST_LABEL_CHARS);
      const size = Buffer.byteLength(candidate.content, "utf8");
      return `- ${candidate.token} (${label}, ${size.toLocaleString()} bytes)`;
    });
    return {
      injections: [
        {
          source: "undeclared-outputs",
          label: "Produced by this run, not sent to this step",
          content: [
            "These artifacts exist in this run and are NOT among this step's inputs.",
            "They are listed, not included: open one only if it bears on your work.",
            "",
            ...lines,
          ].join("\n"),
          reason: `${view.candidates.length} output(s) this run produced are outside this step's declared inputs.`,
        },
      ],
      note: null,
    };
  },
};

/**
 * Build the engine's view for one step.
 *
 * The candidate set is computed HERE, as the complement of the step's declared
 * inputs, so the engine never receives the outputs the step already holds. That
 * is the structural half of the additive-only guarantee: a caller cannot
 * accidentally widen it by passing the whole map, because this function is what
 * decides what an engine can see.
 */
export function viewForStep(input: {
  step: { id: string; label: string; seat: string | null; inputs: readonly string[]; requiredInputs?: readonly string[] };
  outputs: ReadonlyMap<string, { token: string; label: string; content: string }>;
  task: string;
}): ContextEngineView {
  const declared = new Set(input.step.inputs);
  const candidates: { token: string; label: string; content: string }[] = [];
  for (const [token, output] of input.outputs) {
    if (declared.has(token)) continue;
    candidates.push({ token, label: output.label, content: output.content });
  }
  return {
    stepId: input.step.id,
    stepLabel: input.step.label,
    seat: input.step.seat,
    declaredInputs: [...input.step.inputs],
    requiredInputs: [...(input.step.requiredInputs ?? [])],
    candidates,
    task: input.task,
  };
}

/**
 * The event an engine's SILENCE becomes.
 *
 * Without this, "the engine ran and judged nothing relevant", "the engine ran
 * and its provider failed", and "the engine never ran at all" are the same
 * observation: no injection events. That ambiguity cost a live debugging pass -
 * the model tier appeared not to run, and the log could not say whether it had
 * declined or been skipped.
 *
 * An engine that considered and declined is a real decision by the Supervisor,
 * and a run's audit trail should carry it.
 *
 * It also carries how many undeclared outputs the engine had to judge. A
 * decline with nothing to judge is not a decision, and a reader that wants to
 * tell the two apart branches on that number, never on the note's wording.
 */
export function engineOutcomeEvent(input: {
  stepId: string;
  engineId: string;
  injected: number;
  dropped: number;
  candidates: number;
  note: string | null;
  error: string | null;
}): { type: "supervisor.context_injection"; message: string; data: Record<string, unknown> } {
  const verdict = input.error
    ? "failed"
    : input.injected > 0
      ? "added"
      : "declined";
  return {
    type: "supervisor.context_injection",
    message: `Supervisor context engine "${input.engineId}" ${verdict} on ${input.stepId}.`,
    data: {
      stepId: input.stepId,
      engineId: input.engineId,
      effect: verdict,
      injected: input.injected,
      dropped: input.dropped,
      candidates: input.candidates,
      note: input.note,
      error: input.error,
    },
  };
}
