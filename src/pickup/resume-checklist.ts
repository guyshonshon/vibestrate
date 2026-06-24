import type { ChecklistItemOutcome } from "./item-summary.js";

/** The minimal checklist-item shape these helpers need (from the roadmap). */
export type ResumeChecklistItem = {
  id: string;
  text: string;
  status: string;
  commitSha: string | null;
};

/**
 * Reconstruct terse "done" outcomes for the items a prior run already committed,
 * so a RESUMED checklist run's prior-items context (and the holistic postlude
 * ledger) still see them instead of starting from an empty ledger.
 *
 * Built from the roadmap (id / text / status / commitSha) - robust across runs.
 * The rich per-item implementation summary lives in the source run's artifacts
 * under a run-local index and is deliberately NOT carried; what matters for
 * cross-item coherence is the "already done, do NOT redo it" signal plus the
 * commit, which this preserves. `index` is the item's position in the full
 * checklist so the numbering stays meaningful.
 */
export function reconstructDoneOutcomes(
  checklist: ResumeChecklistItem[],
): ChecklistItemOutcome[] {
  const total = checklist.length;
  const outcomes: ChecklistItemOutcome[] = [];
  checklist.forEach((c, fullIndex) => {
    if (c.status !== "done") return;
    outcomes.push({
      itemId: c.id,
      index: fullIndex,
      total,
      text: c.text,
      status: "done",
      commitSha: c.commitSha,
      filesTouched: [],
      summary: "",
      error: null,
      reviewVerdict: null,
      openFindingCount: 0,
      fixIterations: 0,
    });
  });
  return outcomes;
}

/**
 * True when a checklist was structurally changed between the original run and a
 * resume - ids added, removed, or reordered. resume-from-item skips items by the
 * roadmap's per-item done status, so a changed list could skip un-built work or
 * re-run the wrong item; the caller refuses the resume in that case.
 *
 * A null `recorded` fingerprint (a run from before the field existed, or a
 * non-checklist source) returns false: the guard is best-effort and never blocks
 * a resume it cannot verify.
 */
export function checklistIdsChanged(
  recorded: string[] | null,
  current: string[],
): boolean {
  if (!recorded) return false;
  if (recorded.length !== current.length) return true;
  return recorded.some((id, i) => id !== current[i]);
}
