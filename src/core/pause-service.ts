// Pause / resume primitive shared by the orchestrator, the CLI, and the
// server routes. Lives next to the state machine because pause is a state
// concern, not a workflow concern — every stage transition in the
// orchestrator passes through this guard exactly once before continuing.

import { EventLog } from "./event-log.js";
import {
  applyTransition,
  type RunState,
  type RunStateStore,
} from "./state-machine.js";
import { isTerminal } from "./state-machine.js";
import { nowIso } from "../utils/time.js";
import { PAUSABLE_STATUSES, TERMINAL_STATUSES } from "../workflow/workflow-types.js";
import type { RunStatus } from "../workflow/workflow-types.js";

const DEFAULT_POLL_MS = 1500;

/**
 * The error a write-side caller (CLI / route) sees when the requested
 * action is invalid for the current run state. Carries an HTTP-friendly
 * status code so the route handler can map it directly.
 */
export class PauseError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "PauseError";
  }
}

/**
 * Read-side check: is `status` allowed to carry a pauseRequested flag?
 * Pause has no effect on terminal runs (merge_ready / blocked / failed /
 * aborted) and is redundant on an already-paused run.
 */
export function canRequestPause(state: RunState): boolean {
  if (state.status === "paused") return false;
  if (isTerminal(state.status)) return false;
  return PAUSABLE_STATUSES.includes(state.status as RunStatus);
}

export function canRequestResume(state: RunState): boolean {
  // We accept resume on a paused run; we also accept it as a no-op clear
  // on a non-paused run that still has pauseRequested=true (the user
  // changed their mind before the orchestrator picked it up).
  return state.status === "paused" || state.pauseRequested;
}

/**
 * Write-side: set pauseRequested=true. Used by `amaco pause` and the
 * dashboard's Pause button. Does NOT itself transition status — the
 * orchestrator will do that at the next stage boundary via
 * `applyPauseIfRequested`.
 */
export async function requestPause(
  store: RunStateStore,
  events: EventLog,
): Promise<RunState> {
  const state = await store.read();
  if (!canRequestPause(state)) {
    if (state.status === "paused") {
      throw new PauseError(409, "Run is already paused.");
    }
    if (isTerminal(state.status)) {
      throw new PauseError(
        409,
        `Run is in terminal state "${state.status}"; pause has no effect.`,
      );
    }
    throw new PauseError(409, `Run cannot be paused from status "${state.status}".`);
  }
  if (state.pauseRequested) {
    // Idempotent: the flag is already set; just hand the state back.
    return state;
  }
  const next: RunState = { ...state, pauseRequested: true, updatedAt: nowIso() };
  await store.write(next);
  await events.append({
    type: "run.pause_requested",
    message: `Pause requested for run ${state.runId} (will take effect at the next stage boundary).`,
    data: { fromStatus: state.status },
  });
  return next;
}

/**
 * Write-side: clear pauseRequested. If the run is currently paused, the
 * orchestrator's polling loop will pick up the cleared flag and transition
 * back to pausedAtStatus. If the run had a pending pause-request that
 * hadn't taken effect yet, this is a clean cancel.
 */
export async function requestResume(
  store: RunStateStore,
  events: EventLog,
): Promise<RunState> {
  const state = await store.read();
  if (!canRequestResume(state)) {
    if (isTerminal(state.status)) {
      throw new PauseError(
        409,
        `Run is in terminal state "${state.status}"; resume has no effect.`,
      );
    }
    throw new PauseError(
      409,
      `Run is not paused and has no pending pause request; nothing to resume.`,
    );
  }
  if (!state.pauseRequested && state.status === "paused") {
    // Defensive: the run was paused but pauseRequested is already false
    // (shouldn't happen via the normal CLI/route path but handle it).
    return state;
  }
  const next: RunState = { ...state, pauseRequested: false, updatedAt: nowIso() };
  await store.write(next);
  await events.append({
    type: "run.resume_requested",
    message: `Resume requested for run ${state.runId}.`,
    data: { currentStatus: state.status },
  });
  return next;
}

/**
 * The orchestrator calls this between stages. If the on-disk state has
 * pauseRequested=true, we transition into `paused`, persist, emit
 * `run.paused`, and poll until the flag is cleared (or the run is
 * aborted externally — which writes a terminal status that we detect
 * here and surface back to the caller).
 *
 * Returns the latest in-memory state for the orchestrator to continue
 * from. If the run was aborted while paused, the returned state's
 * `status` will be terminal and the orchestrator's caller should bail
 * out via the normal terminal-status path.
 */
export async function applyPauseIfRequested(input: {
  state: RunState;
  store: RunStateStore;
  events: EventLog;
  pollMs?: number;
  /** Optional cancellation hook — used by tests so the poll loop can be
   * unstuck without writing a real terminal status. */
  shouldStop?: () => boolean;
}): Promise<RunState> {
  // Read fresh from disk so an external `amaco pause` is observed even
  // though the orchestrator's in-memory state hasn't been re-loaded.
  let onDisk: RunState;
  try {
    onDisk = await input.store.read();
  } catch {
    // If we can't read the state for whatever reason (corruption, etc.),
    // fall back to the in-memory state. The next stage boundary will try
    // again.
    return input.state;
  }
  if (!onDisk.pauseRequested) return onDisk;
  if (!canRequestPause(onDisk)) {
    // The state changed under us (e.g., transitioned to terminal). Clear
    // the orphaned flag so future writes don't leave the run in an
    // inconsistent shape, and continue with the on-disk state.
    if (onDisk.pauseRequested) {
      const cleared: RunState = {
        ...onDisk,
        pauseRequested: false,
        updatedAt: nowIso(),
      };
      await input.store.write(cleared);
      return cleared;
    }
    return onDisk;
  }

  // Enter paused. Remember the status we were entering so resume knows
  // where to round-trip back to (mirrors approvalRequestedFromStatus).
  const pausedFrom: RunStatus = onDisk.status as RunStatus;
  const paused = applyTransition(onDisk, "paused");
  const pausedWithMemo: RunState = {
    ...paused,
    pausedAtStatus: pausedFrom,
  };
  await input.store.write(pausedWithMemo);
  await input.events.append({
    type: "run.paused",
    message: `Run paused at ${pausedFrom}.`,
    data: { fromStatus: pausedFrom },
  });

  const pollMs = input.pollMs ?? DEFAULT_POLL_MS;
  // Poll until pauseRequested clears OR the run is aborted/failed
  // externally OR the test hook signals stop.
  while (true) {
    if (input.shouldStop?.()) {
      return pausedWithMemo;
    }
    await sleep(pollMs);
    let latest: RunState;
    try {
      latest = await input.store.read();
    } catch {
      continue;
    }
    if (TERMINAL_STATUSES.includes(latest.status as RunStatus)) {
      // Run was aborted while paused. Surface the terminal state up so
      // the orchestrator can exit cleanly via its normal terminal path.
      return latest;
    }
    if (latest.pauseRequested === false) {
      // Resume. Transition back to the saved pausedAtStatus, clear the
      // memo, persist, emit run.resumed, and hand the state back.
      const resumeTarget: RunStatus = (latest.pausedAtStatus ??
        pausedFrom) as RunStatus;
      const resumed = applyTransition(latest, resumeTarget);
      const cleared: RunState = {
        ...resumed,
        pausedAtStatus: null,
      };
      await input.store.write(cleared);
      await input.events.append({
        type: "run.resumed",
        message: `Run resumed; continuing from ${resumeTarget}.`,
        data: { fromStatus: "paused", toStatus: resumeTarget },
      });
      return cleared;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
