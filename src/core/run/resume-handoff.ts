// ── Resume handoff (carried rationale) ──────────────────────────────────────
//
// A downstream resume (review/fix/verify) restores the source run's CODE (the
// worktree snapshot) and ARTIFACTS (seeded step outputs) but used to drop its
// RATIONALE: the arbitration decision-summary and the project ledger's open
// decisions/residuals never reached the resumed run - it has no planner turn,
// and the continuity ledger is planner-only by design. This module builds the
// bounded "carried" lines the run brief delivers to every non-clean-room turn
// of a resumed run. Pure builder + one best-effort disk reader, mirroring
// project-ledger's split so the pure part is trivially testable.

import { pathExists } from "../../utils/fs.js";
import { readJson } from "../../utils/json.js";
import { runFlowArbitrationPath } from "../../utils/paths.js";
import {
  flowArbitrationLedgerSchema,
} from "../../flows/runtime/flow-arbitration.js";
import type { FlowDecisionSummaryOutput } from "../../flows/schemas/flow-output-contracts.js";
import {
  LedgerStore,
  type LedgerEntry,
  type LedgerState,
} from "../context/project-ledger.js";

/** Per-category caps: enough to carry the substance, bounded so a run with a
 *  noisy source can't bloat every downstream prompt. */
const MAX_RISKS = 5;
const MAX_ACTIONS = 5;
const MAX_LEDGER_DECISIONS = 3;
const MAX_LEDGER_RESIDUALS = 5;
const LINE_CHARS = 240;

function clip(text: string, max = LINE_CHARS): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** First evidence ref as a compact locator hint, if the entry carries one. */
function evidenceHint(e: LedgerEntry): string {
  const ref = e.evidence[0];
  return ref ? ` [${ref.kind}:${clip(ref.ref, 80)}]` : "";
}

/**
 * Pure: assemble the carried lines from the source run's decision summary and
 * the project ledger's live state. Order mirrors how a cold agent should read
 * them: what was decided -> what risk is open -> what a human still owes ->
 * what the wider project has settled / left open.
 */
export function buildCarriedHandoffLines(input: {
  decision: FlowDecisionSummaryOutput | null;
  ledger: LedgerState | null;
}): string[] {
  const lines: string[] = [];
  const d = input.decision;
  if (d) {
    lines.push(`Decision (${d.recommendation}): ${clip(d.summary)}`);
    for (const r of d.residualRisks.slice(0, MAX_RISKS)) lines.push(`Risk: ${clip(r)}`);
    for (const a of d.requiredHumanActions.slice(0, MAX_ACTIONS))
      lines.push(`Human action: ${clip(a)}`);
  }
  const l = input.ledger;
  if (l) {
    for (const e of l.decisions.slice(0, MAX_LEDGER_DECISIONS))
      lines.push(`Decided earlier: ${clip(e.title)}${evidenceHint(e)}`);
    for (const e of l.residuals.slice(0, MAX_LEDGER_RESIDUALS))
      lines.push(`Open follow-up: ${clip(e.title)}${evidenceHint(e)}`);
  }
  return lines;
}

/** Disk: read the source run's arbitration decision + the project ledger and
 *  build the carried lines. Best-effort by construction - a missing or torn
 *  source never blocks the resume (each source degrades to null independently,
 *  so a corrupt arbitration.json still lets ledger rationale carry). */
export async function readCarriedHandoffLines(
  projectRoot: string,
  sourceRunId: string,
): Promise<string[]> {
  let decision: FlowDecisionSummaryOutput | null = null;
  try {
    const p = runFlowArbitrationPath(projectRoot, sourceRunId);
    if (await pathExists(p)) {
      decision =
        flowArbitrationLedgerSchema.parse(await readJson<unknown>(p)).decision
          ?.output ?? null;
    }
  } catch {
    // torn/absent arbitration - carry what the ledger has.
  }
  let ledger: LedgerState | null = null;
  try {
    ledger = await new LedgerStore(projectRoot).state();
  } catch {
    // unreadable ledger - carry what the decision has.
  }
  return buildCarriedHandoffLines({ decision, ledger });
}
