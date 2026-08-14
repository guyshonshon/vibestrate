// Which of the four run-level prompt blocks a given role turn receives.
//
// Extracted from the turn itself because the interaction between them is the
// whole point and it is easy to get wrong: three blocks share a one-shot flag
// and the fourth deliberately does not. Inline in a 200-line turn function that
// distinction is invisible, and the failure it guards against is silent - a
// planner losing its ledger because some earlier role took the codebase map.

import type { RunTurnState } from "./run-turn-state.js";

export type ContinuityBlockInput = {
  roleId: string;
  /** A judge seat that drops the producer's narrative. It receives none of
   *  these blocks, so it must not consume a guard either - the caller discards
   *  them after the fact, and a spent guard would deny this role the block for
   *  the rest of the run. */
  cleanRoom: boolean;
  /** Mutated: both one-shot guards live here and are consumed on injection.
   *  Not persisted, so a resumed run re-sends to every configured role. */
  turnState: RunTurnState;
  /** Crew roles configured to receive the codebase map. */
  codebaseMapRoles: readonly string[];
  /** Crew roles configured to receive the project's methodology guidance. */
  methodologyRoles: readonly string[];
  codebaseMapBlock: string;
  /** A run-level context source already carries the map (spec-up stages it into
   *  priorArtifacts for every role), so injecting here would send it twice. */
  hasStagedCodebaseMapContext: boolean;
  ledgerPromptBlock: string;
  ledgerFlagsBlock: string;
  methodologyBlock: string;
};

export type ContinuityBlocks = {
  projectLedger: string;
  continuityFlags: string;
  methodologyGuidance: string;
  projectMemory: string;
};

export function resolveContinuityBlocks(input: ContinuityBlockInput): ContinuityBlocks {
  const { roleId, turnState } = input;

  // Ledger and flags: the PLANNER only, once per run. They prime the role that
  // decides the approach with where the project stands. Other roles build on
  // the run's own brief, and a resumed run that re-runs no planner correctly
  // skips them.
  const injectContinuity =
    roleId === "planner" && !input.cleanRoom && !turnState.ledgerInjected;
  const projectLedger = injectContinuity ? input.ledgerPromptBlock : "";
  const continuityFlags = injectContinuity ? input.ledgerFlagsBlock : "";

  // Methodology used to ride the ledger's planner-only channel, which meant a
  // flow without a planner seat - express, scaffold, quality-arbitration - never
  // saw the methodology the project had set. Configurable and per-role now, for
  // the same reason as the map below.
  const wantsMethodology =
    input.methodologyRoles.includes(roleId) &&
    !input.cleanRoom &&
    !turnState.methodologySentTo.has(roleId);
  const methodologyGuidance = wantsMethodology ? input.methodologyBlock : "";

  // The map is gated per-role rather than one-shot: each configured role needs
  // orienting once, while a role taking several turns (a builder runs three
  // times in quality-arbitration) must not pay again.
  const wantsMap =
    input.codebaseMapRoles.includes(roleId) &&
    !input.cleanRoom &&
    !turnState.codebaseMapSentTo.has(roleId);
  const projectMemory =
    wantsMap && !input.hasStagedCodebaseMapContext ? input.codebaseMapBlock : "";

  // Consume the guards only for what actually went out, so an empty block does
  // not burn the one chance a later turn had at a real one.
  if (projectMemory) turnState.codebaseMapSentTo.add(roleId);
  if (methodologyGuidance) turnState.methodologySentTo.add(roleId);
  if (projectLedger || continuityFlags) turnState.ledgerInjected = true;

  return { projectLedger, continuityFlags, methodologyGuidance, projectMemory };
}
