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
import { redactSecretsInText } from "../diff-service.js";
import { ownerIsAlive } from "./abort-service.js";

/** How many notes may wait at once. See the cap check in `queueGuidance`. */
export const MAX_PENDING = 20;

/** Bound on the joined block one step receives, in characters. */
const MAX_JOINED = 8000;

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
    const existing = fresh.pendingGuidance ?? [];
    // Every queued note is joined into one step's prompt, and nothing else
    // bounds the total. Without a depth cap a Send button with a retry path
    // grows state.json and the prompt without limit - reachable by accident,
    // not only by an attacker.
    if (existing.length >= MAX_PENDING) {
      throw new GuidanceError(
        409,
        `${MAX_PENDING} notes are already waiting on this run; let it drain them first.`,
      );
    }
    const pendingGuidance = [
      ...existing,
      { note: text, at: nowIso(), stepId: opts?.stepId ?? null },
    ];
    const next: RunState = { ...fresh, pendingGuidance, updatedAt: nowIso() };
    return {
      next,
      result: {
        state: next,
        queued: pendingGuidance.length,
        // Probed, not read off `ownerPid`: that field is never cleared, so a
        // crashed run would report live and the caller's warning never fire.
        live: ownerIsAlive(fresh),
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

/**
 * Take the notes waiting for `stepId` and remove them, atomically.
 *
 * The removal is a `mutate` rather than a field on the caller's in-memory
 * state for the same reason the append is: the orchestrator persists state
 * whole-object from a snapshot that predates anything queued during a turn, so
 * a drain written that way would race every note sent while a step was
 * running. `RunStateStore.write` now defers this field to disk outright, which
 * leaves this function and `queueGuidance` as the only writers.
 *
 * Redaction happens HERE, at consumption, exactly where the approval gate
 * redacts a change-request (see approval-gate.ts). Not at queue time: the
 * assignment matcher fires on ordinary English - "the pass: throughRate metric
 * is mislabelled" reads as a secret assignment - and redacting at rest would
 * destroy the note with no second copy to recover it. At rest the raw note is
 * kept, the same as `approval-service.ts` keeps raw guidance.
 */
export async function drainGuidance(
  store: RunStateStore,
  stepId: string,
): Promise<string | null> {
  return await store.mutate<string | null>((fresh) => {
    const { text, remaining } = drainGuidanceFor(fresh.pendingGuidance, stepId);
    // `next: null` means no write at all, so a step with nothing waiting for it
    // costs one read rather than a write on every step boundary.
    if (text === null) return { next: null, result: null };
    const bounded = text.length > MAX_JOINED ? `${text.slice(0, MAX_JOINED)}\n\n[...truncated]` : text;
    return {
      next: { ...fresh, pendingGuidance: remaining, updatedAt: nowIso() },
      result: redactSecretsInText(bounded).redacted,
    };
  });
}
