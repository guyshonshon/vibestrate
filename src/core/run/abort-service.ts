import type { EventLog } from "../stores/event-log.js";
import type { RunState, RunStateStore } from "../state-machine.js";
import { applyTransition, isTerminal } from "../state-machine.js";
import type { RunStatus } from "../workflow/workflow-types.js";
import { nowIso } from "../../utils/time.js";

export class AbortError extends Error {
  readonly code = "ABORT_REFUSED";
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "AbortError";
  }
}

export type AbortRequestResult = {
  run: RunState;
  alreadyTerminal: boolean;
  /** True when the run ended here, because no live process was left to do it. */
  finalized: boolean;
};

/** Is the recorded owner still running? A run whose orchestrator died has
 *  nobody left to honour the flag, so the requester has to finish the job. */
/**
 * Whether the process that owns this run is still there.
 *
 * `ownerPid` is written once at start and never cleared, so its mere presence
 * reports a crashed run as live. Anything that reports liveness to a human
 * must probe, not read the field.
 */
export function ownerIsAlive(state: RunState): boolean {
  if (state.ownerPid === null) return false;
  if (state.ownerPid === process.pid) return true;
  try {
    // Signal 0 tests for existence without delivering anything.
    process.kill(state.ownerPid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ask a run to stop.
 *
 * The live case does NOT write a terminal status. It raises `abortRequested`
 * and returns; the orchestrator observes it and ends the run through its own
 * abort path, so the final report, assurance record and ledger entry are all
 * written exactly as they are for any other ending. Writing the status here
 * instead is what used to race the orchestrator's whole-object write and get
 * silently reverted - a stop control the user had already been told worked.
 *
 * The orphaned case is the exception, and it is safe precisely because it is
 * not concurrent: if the owning process is gone, nothing else will ever move
 * this run, so the requester transitions it directly rather than leaving a run
 * stuck "executing" forever.
 */
export async function requestAbort(
  store: RunStateStore,
  events: EventLog,
  opts: { reason: string } = { reason: "user request" },
): Promise<AbortRequestResult> {
  // Every branch is chosen inside the lock, against state nothing can have
  // superseded. Deciding outside it and writing inside means "not terminal yet"
  // can become "terminal" in between, and the aborted transition then throws a
  // raw state-machine error at a user who only asked a finished run to stop.
  const outcome = await store.mutate<
    AbortRequestResult & { announce: "requested" | "orphaned" | null; fromStatus: RunStatus }
  >((fresh) => {
    const fromStatus = fresh.status;
    if (isTerminal(fresh.status)) {
      return {
        next: null,
        result: { run: fresh, alreadyTerminal: true, finalized: false, announce: null, fromStatus },
      };
    }
    if (ownerIsAlive(fresh)) {
      if (fresh.abortRequested) {
        // Idempotent: a second abort while the first is in flight is not an error.
        return {
          next: null,
          result: { run: fresh, alreadyTerminal: false, finalized: false, announce: null, fromStatus },
        };
      }
      const next: RunState = { ...fresh, abortRequested: true, updatedAt: nowIso() };
      return {
        next,
        result: { run: next, alreadyTerminal: false, finalized: false, announce: "requested", fromStatus },
      };
    }
    const next = applyTransition(
      { ...fresh, abortRequested: true, updatedAt: nowIso() },
      "aborted",
    );
    return {
      next,
      result: { run: next, alreadyTerminal: false, finalized: true, announce: "orphaned", fromStatus },
    };
  });

  // Outside the lock on purpose: the event log is a separate file with its own
  // append, and taking a second lock inside the critical section is how an
  // AB-BA deadlock gets built.
  if (outcome.announce === "requested") {
    await events.append({
      type: "run.abort_requested",
      message: `Abort requested for run ${outcome.run.runId} (${opts.reason}); the run will stop at its next checkpoint.`,
      data: { fromStatus: outcome.fromStatus },
    });
  } else if (outcome.announce === "orphaned") {
    await events.append({
      type: "run.aborted",
      message: `Run ${outcome.run.runId} aborted (${opts.reason}); its process was no longer running, so it was closed out directly.`,
      data: { fromStatus: outcome.fromStatus, ownerPid: outcome.run.ownerPid },
    });
  }
  return {
    run: outcome.run,
    alreadyTerminal: outcome.alreadyTerminal,
    finalized: outcome.finalized,
  };
}

/** The orchestrator's read side. True when someone has asked this run to stop. */
export async function isAbortRequested(store: RunStateStore): Promise<boolean> {
  try {
    const cur = await store.read();
    // The status check keeps a run started before this flag existed, or aborted
    // by an older CLI, stoppable.
    return cur.abortRequested === true || cur.status === "aborted";
  } catch {
    // Unreadable mid-write: the next poll decides. Never abort on a bad read.
    return false;
  }
}
