// Human guidance on a live run. Someone watching a run needs to be able to
// redirect it, not only read it - advice you cannot act on is a spectator seat.
//
// Same contract as pause/abort, for the same reason: the requester only ever
// APPENDS to `pendingGuidance`, and the orchestrator decides when it lands.
// Writing into a step directly would race the orchestrator's whole-object state
// write, which is exactly the bug that turned abort into a flag.
//
// The note lands at the next STEP BOUNDARY, never mid-turn. A code-writing seat
// holds an open worktree, and interrupting it between two writes leaves half-
// written files for the re-run to reconcile. A boundary costs at most one step
// of latency and cannot corrupt the tree.
import { type RunState, type RunStateStore } from "../state-machine.js";
import { nowIso } from "../../utils/time.js";

export class GuidanceError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "GuidanceError";
  }
}

/** Statuses past which a queued note could never be acted on. */
const TERMINAL = new Set<RunState["status"]>([
  "merge_ready",
  "failed",
  "aborted",
  "blocked",
]);

export type QueuedGuidance = {
  state: RunState;
  /** How many notes are now waiting. */
  queued: number;
  /** Whether a live orchestrator is still there to drain it. */
  live: boolean;
};

/**
 * Append a human note to a run. `stepId` null aims it at whichever step runs
 * next; naming a step holds it until that step runs.
 *
 * `live` reports whether an orchestrator process is still around to honour it:
 * a note queued on a crashed run is stored but will never be drained, and the
 * caller must say so rather than implying it landed.
 */
export async function queueGuidance(
  store: RunStateStore,
  note: string,
  opts?: { stepId?: string | null },
): Promise<QueuedGuidance> {
  const text = note.trim();
  if (!text) throw new GuidanceError(400, "Guidance cannot be empty.");
  if (text.length > 4000) {
    throw new GuidanceError(400, "Guidance is capped at 4000 characters.");
  }
  // The terminal guard runs INSIDE the lock with the append, for the same
  // reason pause checks pausability there: a run the orchestrator has already
  // finished must not come back carrying a note nobody will read.
  return await store.mutate<QueuedGuidance>((fresh) => {
    if (TERMINAL.has(fresh.status)) {
      throw new GuidanceError(
        409,
        `Run is in terminal state "${fresh.status}"; guidance would never be read.`,
      );
    }
    const pendingGuidance = [
      ...(fresh.pendingGuidance ?? []),
      { note: text, at: nowIso(), stepId: opts?.stepId ?? null },
    ];
    const next: RunState = { ...fresh, pendingGuidance, updatedAt: nowIso() };
    return {
      next,
      result: {
        state: next,
        queued: pendingGuidance.length,
        live: fresh.ownerPid != null,
      },
    };
  });
}

/**
 * Pure. Split a run's queued notes into the ones that apply to `stepId` now and
 * the ones that stay queued. A note with no stepId applies to whatever runs
 * next; a named one waits for its step.
 */
export function drainGuidanceFor(
  pending: RunState["pendingGuidance"],
  stepId: string,
): { text: string | null; remaining: RunState["pendingGuidance"] } {
  const all = pending ?? [];
  const applies = (g: (typeof all)[number]) => g.stepId == null || g.stepId === stepId;
  const mine = all.filter(applies);
  const remaining = all.filter((g) => !applies(g));
  return {
    text: mine.length === 0 ? null : mine.map((g) => g.note).join("\n\n"),
    remaining,
  };
}
