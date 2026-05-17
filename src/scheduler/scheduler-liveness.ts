// Pure helper: given the scheduler state file's lastUpdatedAt
// timestamp (or null if the file doesn't exist), decide whether the
// scheduler loop is currently running.
//
// The scheduler writes its state on every tick (idlePollMs = 1s by
// default + any state mutation). If we haven't seen a write in
// roughly 3 polling intervals, treat it as offline.
//
// We keep this pure (no IO) so the panel, the CLI, and the dashboard
// API can all derive the same verdict from a single snapshot.

import type { SchedulerState } from "./scheduler-types.js";

export type SchedulerLivenessStatus =
  | "never-started"
  | "offline"
  | "stale"
  | "live"
  | "paused";

export type SchedulerLiveness = {
  status: SchedulerLivenessStatus;
  /** How many seconds since the scheduler last wrote its state, or null. */
  secondsSinceTick: number | null;
  /** Human-readable summary the UI can render verbatim. */
  summary: string;
  /** When `false`, the scheduler isn't picking up queued tasks. */
  pickingUpWork: boolean;
};

const OFFLINE_AFTER_SECONDS = 5;
const STALE_AFTER_SECONDS = 2;

export function deriveSchedulerLiveness(
  state: SchedulerState | null,
  now: Date = new Date(),
): SchedulerLiveness {
  if (!state) {
    return {
      status: "never-started",
      secondsSinceTick: null,
      summary:
        "scheduler has never run in this project · start it with `amaco queue run`",
      pickingUpWork: false,
    };
  }
  const lastTick = new Date(state.lastUpdatedAt).getTime();
  const seconds = Number.isFinite(lastTick)
    ? Math.max(0, Math.floor((now.getTime() - lastTick) / 1000))
    : null;
  if (state.paused) {
    return {
      status: "paused",
      secondsSinceTick: seconds,
      summary: "scheduler is paused · press p or run `amaco queue resume`",
      pickingUpWork: false,
    };
  }
  if (seconds === null || seconds > OFFLINE_AFTER_SECONDS) {
    return {
      status: "offline",
      secondsSinceTick: seconds,
      summary:
        seconds === null
          ? "scheduler state is unreadable · start it with `amaco queue run`"
          : `scheduler last ticked ${humanAgo(seconds)} (OFFLINE) · start it with \`amaco queue run\``,
      pickingUpWork: false,
    };
  }
  if (seconds > STALE_AFTER_SECONDS) {
    return {
      status: "stale",
      secondsSinceTick: seconds,
      summary: `scheduler last ticked ${humanAgo(seconds)} · slow but live`,
      pickingUpWork: true,
    };
  }
  return {
    status: "live",
    secondsSinceTick: seconds,
    summary: `scheduler is live · last tick ${humanAgo(seconds)}`,
    pickingUpWork: true,
  };
}

function humanAgo(seconds: number): string {
  if (seconds < 1) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
