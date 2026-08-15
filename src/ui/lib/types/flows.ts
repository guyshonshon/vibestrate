// ── Supervisor-assisted flow authoring (draft) ───────────────────────────────
// Hand-mirrored from src/flows/authoring/flow-assist.ts, the same convention
// types/policies.ts uses: the dashboard restates the service's return shape
// rather than importing it, because the UI compiles under its own tsconfig.

import type { FlowCoverage, FlowDefinition } from "./runs.js";

/**
 * What the drafting agent checked against a live source, and what it could not.
 * Vibestrate itself opens no socket - `checked` entries are the AGENT's own web
 * tool reporting back through its provider CLI. Both lists are model
 * self-report and nothing in the product can verify them, which is why the
 * draft panels render them even when empty: an empty list is then a visible
 * claim rather than an absence. Shared with the crew draft (types/crews.ts),
 * matching flow-assist.ts exporting `currencySchema` for crew-assist.ts.
 */
export type AssistCurrency = {
  checked: string[];
  unverified: string[];
};

/** One field that differs between the flow as it stands and the revision.
 *  `null` means the key was absent on that side, which is not the same as
 *  present-but-empty. */
export type FlowFieldChange = {
  name: string;
  before: string | null;
  after: string | null;
};

/** One difference, anchored where the editor already pins messages: a top-level
 *  flow field, a step, a seat, or the loop. */
export type FlowRevisionChange = {
  target: "flow" | "step" | "seat" | "loop";
  op: "added" | "removed" | "edited" | "moved";
  /** Step id, seat id, or the flow field's name. Null for the loop. */
  id: string | null;
  /** Position in the REVISED steps array. Null for a removed step and for every
   *  non-step change. */
  index: number | null;
  fields: FlowFieldChange[];
  summary: string;
};

/**
 * What one instruction to the supervisor did to the flow the owner is HOLDING
 * in the editor. Unlike a draft, this starts from the work already on screen:
 * the editor sends the flow as it stands, and what comes back is that same flow
 * revised.
 *
 * `flow` is null when the instruction was a question ("why is the architect seat
 * uncovered?"). An answer with no edit is a valid outcome, not a failure, so a
 * caller must render `answer` rather than treat a null flow as an error.
 *
 * `changes` is computed from the two definitions server-side, never model
 * self-report - an assistant claiming it added a review step while adding none
 * is the failure this surface exists to prevent.
 *
 * Nothing here touches disk. Applying a revision replaces the editor's draft;
 * the editor's own Save is still the only writer.
 */
export type FlowRevision = {
  flow: FlowDefinition | null;
  /** Canonical YAML of the revision. Null when there is no revision. */
  yaml: string | null;
  answer: string;
  changes: FlowRevisionChange[];
  currency: AssistCurrency;
  /** Seat gaps for whichever flow this describes - the revision when there is
   *  one, otherwise the flow as it stands. Null when neither parses. */
  coverage: FlowCoverage | null;
};

/**
 * A model-proposed, EDITABLE flow. Nothing is on disk: `targetPath` is where
 * accepting it WOULD write, and accepting is a separate createFlow() call the
 * owner makes.
 */
export type FlowDraft = {
  flow: FlowDefinition;
  /** Canonical YAML - byte-for-byte what accepting this draft would write. */
  yaml: string;
  rationale: string;
  currency: AssistCurrency;
  /** Seat gaps against the target crew, computed server-side without a model. */
  coverage: FlowCoverage;
  /** Project-relative: `.vibestrate/flows/<id>/flow.yml`. */
  targetPath: string;
  /** A project flow with this id already exists (accepting needs overwrite). */
  exists: boolean;
};
