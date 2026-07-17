import type { LedgerState } from "../core/context/project-ledger.js";

// ── Deterministic consult sections ───────────────────────────────────────────
//
// The consult answer used to be whatever the LLM volunteered, so "what should I
// do next / what did we mention but never do" was non-deterministic. These
// sections are COMPUTED IN CODE from the project ledger + roadmap + run
// history; the LLM only narrates/ranks them. Same inputs => same sections, so
// it's testable. Pure - no disk, no clock.

/** What a computed section item points at, so the UI can link it (a consult
 *  answer item must be openable, not a dead string). Run -> run detail, task ->
 *  board card. Absent when the source carries no id (e.g. a bare ledger title). */
export type ConsultRef =
  | { kind: "run"; id: string }
  | { kind: "task"; id: string };

/** One computed item: the human text + an optional reference to open. */
export type ConsultSectionItem = { text: string; ref?: ConsultRef };

export type ConsultSections = {
  /** Recent run outcomes, newest first. */
  recentActivity: ConsultSectionItem[];
  /** Goals not yet shipped (ledger intents + open roadmap tasks), deduped. */
  openIntents: ConsultSectionItem[];
  /** Raised in a run/consult but never acted on (ledger mentions). */
  mentionedNeverWorked: ConsultSectionItem[];
  /** Mechanically-derived next steps: open follow-ups + open intents, newest
   *  first. NOT invented - every item traces to a ledger/roadmap entry. */
  suggestedNextSteps: ConsultSectionItem[];
  /** Maintenance tips the user may act on - surfaced, never auto-applied (the
   *  tool never deletes data itself). Plain text (no ref). Empty unless something
   *  crossed a threshold (e.g. rewind snapshots accumulating in `.git`). */
  housekeeping: string[];
};

/** Surface the snapshot-growth tip once snapshots span more than this many runs.
 *  Generous so a young project is never nagged - it's a heads-up, not an alarm. */
const SNAPSHOT_TIP_RUN_THRESHOLD = 25;

/** Build the housekeeping tips (pure). Only the snapshot-growth tip today, and
 *  only when (a) snapshots span > threshold runs AND (b) the user has NOT already
 *  enabled retention (`snapshotRetentionRuns` 0 = off) - if they opted in, it's
 *  handled, so no nag. Points at the config knob (settable in UI + CLI), never a
 *  CLI command, and reaffirms the tool won't purge on its own. */
export function buildHousekeepingTips(input: {
  snapshots: { runs: number; refs: number };
  snapshotRetentionRuns: number;
}): string[] {
  const tips: string[] = [];
  if (
    input.snapshotRetentionRuns <= 0 &&
    input.snapshots.runs > SNAPSHOT_TIP_RUN_THRESHOLD
  ) {
    tips.push(
      `Rewind snapshots from ${input.snapshots.runs} past runs are stored in git ` +
        `(they let you resume old runs to review/fix/verify, but add to .git over time). ` +
        `Vibestrate won't remove them on its own. To clean up, set ` +
        `\`git.snapshotRetentionRuns\` to keep the most recent few (e.g. 50) - older ` +
        `snapshots are then pruned automatically at your next run start.`,
    );
  }
  return tips;
}

/** Roadmap task statuses that still represent open work. */
const OPEN_TASK_STATUSES = new Set([
  "backlog",
  "ready",
  "queued",
  "running",
  "waiting_for_approval",
  "blocked",
  "review",
]);

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Dedupe items by normalized text, preserving first-seen order (and its ref). */
function dedupe(items: ConsultSectionItem[]): ConsultSectionItem[] {
  const seen = new Set<string>();
  const out: ConsultSectionItem[] = [];
  for (const item of items) {
    const key = normalize(item.text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/** A ledger entry contributes a run ref when it traces to a source run. */
function runRef(sourceRunId: string | null | undefined): ConsultRef | undefined {
  return sourceRunId ? { kind: "run", id: sourceRunId } : undefined;
}

export function computeConsultSections(input: {
  ledger: LedgerState;
  roadmapTasks: { id: string; title: string; status: string }[];
  recentRuns: {
    runId: string;
    displayName?: string | null;
    task: string;
    status: string;
  }[];
  /** Rewind-snapshot stats (from countSnapshotRuns) + the active retention
   *  setting, for the housekeeping tip. Omitted = no snapshot tip. */
  snapshots?: { runs: number; refs: number };
  snapshotRetentionRuns?: number;
}): ConsultSections {
  const recentActivity: ConsultSectionItem[] = input.recentRuns
    .slice(0, 8)
    .map((r) => ({
      text: `${r.status}: ${r.displayName || r.task}`,
      ref: { kind: "run", id: r.runId } as ConsultRef,
    }));

  const ledgerIntents: ConsultSectionItem[] = input.ledger.intents.map((e) => ({
    text: e.title,
    ref: runRef(e.sourceRunId),
  }));
  const openTasks: ConsultSectionItem[] = input.roadmapTasks
    .filter((t) => OPEN_TASK_STATUSES.has(t.status))
    .map((t) => ({ text: t.title, ref: { kind: "task", id: t.id } as ConsultRef }));
  const openIntents = dedupe([...ledgerIntents, ...openTasks]);

  const mentionedNeverWorked = dedupe(
    input.ledger.mentions.map((e) => ({ text: e.title, ref: runRef(e.sourceRunId) })),
  );

  // Next steps: concrete open follow-ups first (a shipped slice left them), then
  // open intents. Both are already newest-first from the ledger fold.
  const residuals: ConsultSectionItem[] = input.ledger.residuals.map((e) => ({
    text: e.title,
    ref: runRef(e.sourceRunId),
  }));
  const suggestedNextSteps = dedupe([...residuals, ...openIntents]).slice(0, 8);

  const housekeeping = input.snapshots
    ? buildHousekeepingTips({
        snapshots: input.snapshots,
        snapshotRetentionRuns: input.snapshotRetentionRuns ?? 0,
      })
    : [];

  return { recentActivity, openIntents, mentionedNeverWorked, suggestedNextSteps, housekeeping };
}

/** Render the computed sections as a markdown block (for the consult context +
 *  the CLI/UI). Only non-empty sections appear. */
export function renderConsultSections(s: ConsultSections): string {
  const blocks: string[] = [];
  const add = (heading: string, items: ConsultSectionItem[]) => {
    if (items.length === 0) return;
    blocks.push(`### ${heading}\n${items.map((i) => `- ${i.text}`).join("\n")}`);
  };
  add("Recent activity", s.recentActivity);
  add("Open intents", s.openIntents);
  add("Mentioned but never worked on", s.mentionedNeverWorked);
  add("Suggested next steps", s.suggestedNextSteps);
  add("Housekeeping", s.housekeeping.map((text) => ({ text })));
  return blocks.join("\n\n");
}

/** True when every computed section is empty (so callers can skip rendering). */
export function consultSectionsEmpty(s: ConsultSections): boolean {
  return (
    s.recentActivity.length === 0 &&
    s.openIntents.length === 0 &&
    s.mentionedNeverWorked.length === 0 &&
    s.suggestedNextSteps.length === 0 &&
    s.housekeeping.length === 0
  );
}
