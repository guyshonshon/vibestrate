// The mutable state a run accumulates across its turns.
//
// Five fields, and they are here rather than on the Orchestrator for one
// reason: more than one call path writes them. A role turn's abort observer
// latches `abortRequestedSeen`, and `throwIfAbortRequested` reads it later from
// a different stack, after that observer's interval has been cleared. The
// catalog cache is filled either by a real turn or by the resilience helper's
// `ensureResolvedCatalog`, whichever runs first.
//
// Holding them in one object passed by reference makes divergence impossible to
// write. The alternative - each caller keeping its own copy and remembering to
// sync - fails silently in the worst way: the abort latch is set on one copy,
// read from the other, and a run that was asked to stop keeps taking turns
// while every individual turn still looks correct.
//
// One object per run. Nothing here is shared between runs.

import type { ResolvedCatalog } from "../../providers/provider-apply.js";

export type RunTurnState = {
  /** Latched by a turn's abort observer so the signal outlives the interval
   *  that saw it. Checked wherever the run is about to continue. */
  abortRequestedSeen: boolean;
  /** Capability catalog (built-in + project overlay), resolved once per run.
   *  null means "not resolved yet, or the last attempt failed" - a failure is
   *  retried on the next turn rather than cached as absent. */
  resolvedCatalog: ResolvedCatalog | null;
  /** One-shot guard so the continuity ledger and its flags reach a single
   *  planner turn rather than every planning turn in the run. */
  ledgerInjected: boolean;
  /** Dedupe keys for the "effort won't take effect" warning (provider+effort)
   *  and the "isolation requested but no provider sandbox" warning (provider),
   *  so a long run warns once rather than once per turn. Mutated in place. */
  readonly warnedEffort: Set<string>;
  readonly warnedSandbox: Set<string>;
};

export function createRunTurnState(): RunTurnState {
  return {
    abortRequestedSeen: false,
    resolvedCatalog: null,
    ledgerInjected: false,
    warnedEffort: new Set<string>(),
    warnedSandbox: new Set<string>(),
  };
}
