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
// That is enforced by SHAPE, not by this comment. `proposeInjections` returns
// `FlowContextInjection[]` and nothing else. It is handed a read-only view of
// what the step is already getting, and it has no channel through which to
// return a modified input, a removal, or a budget instruction. The context
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
  /** Prior step outcomes, oldest first, as the run recorded them. */
  readonly priorOutcomes: readonly { stepId: string; summary: string }[];
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
