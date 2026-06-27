import type { RunStatus } from "../../lib/types.js";

type Props = {
  status: RunStatus;
  /** Compact = the tinted dot + label only, no framed chip (for inline use). */
  compact?: boolean;
};

/**
 * Canonical run-status badge (coal/chalk + violet foundation). Status reads as
 * a flat tinted label + a static dot - never a pill, never a pulsing dot. The
 * framed (non-compact) form is a hairline coal chip; the compact form drops the
 * frame for inline breadcrumb use. Single source of truth for status tone -
 * RunHeaderV3 and the page scaffold reuse this rather than re-deriving color.
 */
type Tone = { dot: string; text: string };

const VIOLET: Tone = { dot: "bg-violet-soft", text: "text-violet-soft" };
const SKY: Tone = { dot: "bg-sky-glow", text: "text-sky-glow" };
const AMBER: Tone = { dot: "bg-amber-soft", text: "text-amber-soft" };
const EMERALD: Tone = { dot: "bg-emerald-400", text: "text-emerald-400" };
const ROSE: Tone = { dot: "bg-rose-400", text: "text-rose-300" };
const MUTED: Tone = { dot: "bg-chalk-400", text: "text-chalk-400" };

const STATUS_TONE: Record<RunStatus, Tone> = {
  created: MUTED,
  planning: VIOLET,
  planned: VIOLET,
  architecting: VIOLET,
  architected: VIOLET,
  executing: VIOLET,
  validating: SKY,
  reviewing: SKY,
  verifying: SKY,
  // Fix is recoverable attention, not failure.
  fixing: AMBER,
  // Awaiting human approval + paused are attention-needed, not broken.
  waiting_for_approval: AMBER,
  paused: AMBER,
  // Blocked = stalled, needs a human - attention, not a hard failure.
  blocked: AMBER,
  merge_ready: EMERALD,
  failed: ROSE,
  aborted: MUTED,
};

const STATUS_LABEL: Record<RunStatus, string> = {
  created: "created",
  planning: "planning",
  planned: "planned",
  architecting: "architecting",
  architected: "architected",
  executing: "executing",
  validating: "validating",
  reviewing: "reviewing",
  fixing: "fixing",
  verifying: "verifying",
  waiting_for_approval: "awaiting approval",
  paused: "paused",
  merge_ready: "merge ready",
  blocked: "blocked",
  failed: "failed",
  aborted: "aborted",
};

export function RunStatusBadge({ status, compact }: Props) {
  const tone = STATUS_TONE[status];
  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1.5 text-[11.5px] font-medium ${tone.text}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
        {STATUS_LABEL[status]}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[8px] border border-[color:var(--line)] bg-coal-600 px-2 py-0.5 text-[11.5px] font-medium ${tone.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
      {STATUS_LABEL[status]}
    </span>
  );
}
