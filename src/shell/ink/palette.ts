// Pure command-palette catalog + fuzzy filter. The view layer renders
// the filtered list; the executor dispatches the chosen command.
//
// Commands are intentionally string-keyed so future phases can add
// entries without touching the dispatcher (which lives next to the
// runtime).

import type { PageId } from "./ui-state.js";

export type PaletteCommand = {
  id: string;
  title: string;
  /** Short hint, shown after the title in the palette list. */
  hint?: string;
  /** Keywords the fuzzy filter matches against in addition to title. */
  keywords?: string[];
  /**
   * What the runtime should do when the command fires. Kept abstract
   * here so this module stays import-free.
   */
  action:
    | { kind: "goto"; page: PageId }
    | { kind: "pause-run" }
    | { kind: "resume-run" }
    | { kind: "abort-run" }
    | { kind: "open-help" }
    | { kind: "quit" };
};

export const DEFAULT_PALETTE: PaletteCommand[] = [
  { id: "goto.dashboard", title: "Go to Dashboard", keywords: ["home", "overview"], action: { kind: "goto", page: "dashboard" } },
  { id: "goto.runs", title: "Go to Runs", action: { kind: "goto", page: "runs" } },
  { id: "goto.roadmap", title: "Go to Roadmap", keywords: ["tasks", "board"], action: { kind: "goto", page: "roadmap" } },
  { id: "goto.queue", title: "Go to Queue", keywords: ["scheduler"], action: { kind: "goto", page: "queue" } },
  { id: "goto.agents", title: "Go to Agents", action: { kind: "goto", page: "agents" } },
  { id: "goto.skills", title: "Go to Skills", keywords: ["mcp"], action: { kind: "goto", page: "skills" } },
  { id: "goto.approvals", title: "Go to Approvals", action: { kind: "goto", page: "approvals" } },
  { id: "goto.suggestions", title: "Go to Suggestions", keywords: ["bundles"], action: { kind: "goto", page: "suggestions" } },
  { id: "goto.notifications", title: "Go to Notifications", action: { kind: "goto", page: "notifications" } },
  { id: "goto.doctor", title: "Go to Doctor", keywords: ["settings", "diagnostics"], action: { kind: "goto", page: "doctor" } },
  { id: "run.pause", title: "Pause selected run", keywords: ["stop", "halt"], action: { kind: "pause-run" } },
  { id: "run.resume", title: "Resume selected run", action: { kind: "resume-run" } },
  { id: "run.abort", title: "Abort selected run", keywords: ["stop", "kill"], action: { kind: "abort-run" } },
  { id: "help.open", title: "Open help overlay", keywords: ["?", "keybindings"], action: { kind: "open-help" } },
  { id: "shell.quit", title: "Quit amaco", keywords: ["exit"], action: { kind: "quit" } },
];

/**
 * Score a command against a query. Returns null when there's no match
 * at all so callers can drop it from the list. Higher scores rank
 * first; ties fall back to declaration order. The scoring is small on
 * purpose — a TUI palette doesn't need full fuzzy fanciness, just
 * "did the user's letters appear in order in the haystack".
 */
export function scoreCommand(
  cmd: PaletteCommand,
  query: string,
): number | null {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return 0;
  const haystacks = [cmd.title, cmd.id, ...(cmd.keywords ?? [])]
    .map((s) => s.toLowerCase());
  let best: number | null = null;
  for (const h of haystacks) {
    const s = subsequenceScore(h, q);
    if (s !== null && (best === null || s > best)) best = s;
  }
  return best;
}

function subsequenceScore(haystack: string, needle: string): number | null {
  // Exact substring beats subsequence beats nothing. Score scales with
  // tightness so "rsm" matches "resume" tighter than "rsme" would.
  if (haystack.includes(needle)) return 100 - (haystack.length - needle.length);
  let hi = 0;
  let firstMatch = -1;
  let lastMatch = -1;
  for (const ch of needle) {
    while (hi < haystack.length && haystack[hi] !== ch) hi += 1;
    if (hi >= haystack.length) return null;
    if (firstMatch < 0) firstMatch = hi;
    lastMatch = hi;
    hi += 1;
  }
  const span = lastMatch - firstMatch;
  return Math.max(0, 50 - span);
}

export function filterPalette(
  catalog: ReadonlyArray<PaletteCommand>,
  query: string,
  limit = 10,
): PaletteCommand[] {
  const scored: Array<{ cmd: PaletteCommand; score: number; ord: number }> = [];
  catalog.forEach((cmd, ord) => {
    const score = scoreCommand(cmd, query);
    if (score === null) return;
    scored.push({ cmd, score, ord });
  });
  scored.sort((a, b) => (b.score - a.score) || (a.ord - b.ord));
  return scored.slice(0, limit).map((s) => s.cmd);
}
