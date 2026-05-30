// ── Per-item forward-carry (Phase 3 pick-up execution) ──────────────────────
//
// The make-or-break of continuous-mode execution (design §1): after each
// checklist item, write a *compact* summary and feed it forward — NOT full
// diffs (token blow-up). Item 5 needs to know what item 2 did without
// re-reading every line it wrote. These are pure renderers so the carry logic
// is testable without a run.

export type ChecklistItemOutcome = {
  itemId: string;
  /** 0-based position in the checklist. */
  index: number;
  total: number;
  text: string;
  status: "done" | "blocked";
  commitSha: string | null;
  /** Files the item touched (from the per-item commit), best-effort. */
  filesTouched: string[];
  /** A compact note — the agent's implementation summary, trimmed. */
  summary: string;
  error: string | null;
};

const ONE_LINE_SUMMARY_CHARS = 240;
const DEFAULT_CARRY_BUDGET_CHARS = 2_400;

function shortSha(sha: string | null): string {
  return sha ? sha.slice(0, 8) : "(uncommitted)";
}

function oneLine(text: string, max = ONE_LINE_SUMMARY_CHARS): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max).trimEnd()}…` : flat;
}

/** The per-item summary artifact stored under the run (one file per item). */
export function renderItemSummaryArtifact(o: ChecklistItemOutcome): string {
  const lines = [
    `# Item ${o.index + 1}/${o.total} — ${o.text}`,
    "",
    `- status: ${o.status}`,
    `- commit: ${shortSha(o.commitSha)}`,
    o.filesTouched.length
      ? `- files: ${o.filesTouched.join(", ")}`
      : "- files: (none)",
  ];
  if (o.error) lines.push(`- error: ${oneLine(o.error, 400)}`);
  lines.push("", "## Summary", o.summary.trim() || "_No summary produced._", "");
  return lines.join("\n");
}

/**
 * The carried-forward context handed to the *next* item: a compact running
 * ledger of completed items so the agent knows what's already done. When the
 * full ledger would exceed `budgetChars`, older items fold to a single line
 * (id + status + commit) and only the most recent keep their note — the
 * "compact folds old summaries when budget tightens" behavior.
 */
export function buildPriorItemsContext(
  outcomes: ChecklistItemOutcome[],
  budgetChars: number = DEFAULT_CARRY_BUDGET_CHARS,
): string {
  if (outcomes.length === 0) return "";

  const full = (o: ChecklistItemOutcome): string => {
    const head = `${o.index + 1}. ${o.text} — ${o.status} (commit ${shortSha(o.commitSha)})`;
    const note = o.summary.trim() ? `\n   ${oneLine(o.summary)}` : "";
    const files = o.filesTouched.length
      ? `\n   files: ${o.filesTouched.slice(0, 8).join(", ")}`
      : "";
    return head + note + files;
  };
  const terse = (o: ChecklistItemOutcome): string =>
    `${o.index + 1}. ${o.text} — ${o.status} (commit ${shortSha(o.commitSha)})`;

  // Start all-full; while over budget, fold the oldest items to terse form.
  const modes = outcomes.map(() => "full" as "full" | "terse");
  const render = () =>
    outcomes
      .map((o, i) => (modes[i] === "full" ? full(o) : terse(o)))
      .join("\n");

  for (let i = 0; i < outcomes.length && render().length > budgetChars; i++) {
    modes[i] = "terse";
  }

  return [
    "# Completed checklist items (carried forward)",
    "For context only — these are already done in this same worktree. Do NOT redo them.",
    "",
    render(),
    "",
  ].join("\n");
}

/** The brief for the item currently being worked. */
export function renderCurrentItemBrief(
  item: { text: string },
  index: number,
  total: number,
): string {
  return [
    `# Current checklist item — ${index + 1} of ${total}`,
    "",
    item.text,
    "",
    "Focus ONLY on this item. Earlier items are already done (see the carried context); do not redo them, and do not start later items. Make the smallest change that completes this item.",
    "",
  ].join("\n");
}

/** Compact an agent's free-text implementation summary for forward-carry. */
export function compactImplementationSummary(raw: string, maxChars = 600): string {
  const flat = raw.replace(/\r/g, "").trim();
  if (flat.length <= maxChars) return flat;
  return `${flat.slice(0, maxChars).trimEnd()}…`;
}
