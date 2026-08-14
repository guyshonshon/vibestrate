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
