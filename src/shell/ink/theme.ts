// Single source of truth for visual tokens used by the panel.
// Inspired by the Claude CLI: generous whitespace, monochrome with a
// cyan accent, glyph-based status badges, and rounded card borders.

export type Color =
  | "cyan"
  | "green"
  | "yellow"
  | "red"
  | "magenta"
  | "blue"
  | "gray"
  | undefined;

export type StatusToken = {
  glyph: string;
  color: Color;
  label: string;
};

/**
 * Tokens for `RunState.status`. The glyph + color combo lets the
 * user spot a run's phase at a glance without reading the word.
 */
export const RUN_STATUS_TOKENS: Record<string, StatusToken> = {
  created: { glyph: "○", color: "gray", label: "created" },
  planning: { glyph: "◐", color: "cyan", label: "planning" },
  planned: { glyph: "◑", color: "cyan", label: "planned" },
  architecting: { glyph: "◐", color: "cyan", label: "architecting" },
  architected: { glyph: "◑", color: "cyan", label: "architected" },
  executing: { glyph: "●", color: "magenta", label: "executing" },
  validating: { glyph: "◐", color: "blue", label: "validating" },
  reviewing: { glyph: "◐", color: "blue", label: "reviewing" },
  fixing: { glyph: "●", color: "magenta", label: "fixing" },
  verifying: { glyph: "◐", color: "blue", label: "verifying" },
  waiting_for_approval: { glyph: "⏳", color: "yellow", label: "approval" },
  paused: { glyph: "‖", color: "yellow", label: "paused" },
  blocked: { glyph: "✗", color: "red", label: "blocked" },
  merge_ready: { glyph: "✓", color: "green", label: "ready to merge" },
  failed: { glyph: "✗", color: "red", label: "failed" },
  aborted: { glyph: "✗", color: "red", label: "aborted" },
};

export function runStatusToken(status: string): StatusToken {
  return RUN_STATUS_TOKENS[status] ?? { glyph: "○", color: "gray", label: status };
}

/** Tokens for `Task.status` (kanban). */
export const TASK_STATUS_TOKENS: Record<string, StatusToken> = {
  backlog: { glyph: "○", color: "gray", label: "backlog" },
  ready: { glyph: "◯", color: "cyan", label: "ready" },
  queued: { glyph: "◔", color: "cyan", label: "queued" },
  running: { glyph: "●", color: "magenta", label: "running" },
  waiting_for_approval: { glyph: "⏳", color: "yellow", label: "approval" },
  review: { glyph: "◐", color: "blue", label: "review" },
  blocked: { glyph: "✗", color: "red", label: "blocked" },
  done: { glyph: "✓", color: "green", label: "done" },
  failed: { glyph: "✗", color: "red", label: "failed" },
  cancelled: { glyph: "✗", color: "gray", label: "cancelled" },
};

export function taskStatusToken(status: string): StatusToken {
  return TASK_STATUS_TOKENS[status] ?? { glyph: "○", color: "gray", label: status };
}

/** Tokens for `AmacoEvent.type`. Only the prefix needs to colorize. */
export function eventTypeColor(type: string): Color {
  if (type.endsWith(".failed") || type === "run.aborted") return "red";
  if (type === "run.completed" || type === "agent.completed") return "green";
  if (type.startsWith("approval.")) return "yellow";
  if (type.startsWith("run.pause") || type.startsWith("run.resume"))
    return "yellow";
  if (type === "mcp.attached") return "magenta";
  if (type === "agent.started" || type === "provider.started") return "cyan";
  return "gray";
}

/** A short relative-time label like "12s ago" / "4m ago" / "2h ago". */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const ms = Math.max(0, now.getTime() - t);
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

/** Truncate with an ellipsis; rounded to char widths. */
export function clip(s: string, w: number): string {
  if (w <= 0) return "";
  if (s.length <= w) return s;
  return `${s.slice(0, Math.max(0, w - 1))}…`;
}

/**
 * Visual padding for card sections used as the focal area of a page.
 * The outer panel Frame draws the single rounded border around all
 * content; inner sections use plain padding so we don't end up with
 * a "boxes inside boxes" look. Centralized so the rhythm stays
 * consistent across pages.
 */
export const CARD_PROPS = {
  paddingX: 1,
  paddingY: 0,
};

/**
 * Used for the focal panel inside a page (e.g. the Runs inspector,
 * the Roadmap detail card). One thin border to draw the eye, no
 * background fill — keeps the panel calm.
 */
export const FOCAL_CARD_PROPS = {
  borderStyle: "round" as const,
  borderColor: "cyan" as const,
  paddingX: 2,
  paddingY: 1,
};
