import type { EventLog } from "../stores/event-log.js";
import type { RunState, RunStateStore } from "../state-machine.js";
import { applyTransition, isTerminal } from "../state-machine.js";
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
function ownerIsAlive(state: RunState): boolean {
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
  const state = await store.read();
  if (isTerminal(state.status)) {
    return { run: state, alreadyTerminal: true, finalized: false };
  }

  if (ownerIsAlive(state)) {
    if (state.abortRequested) {
      // Idempotent: a second abort while the first is in flight is not an error.
      return { run: state, alreadyTerminal: false, finalized: false };
    }
    const next: RunState = { ...state, abortRequested: true, updatedAt: nowIso() };
    await store.write(next);
    await events.append({
      type: "run.abort_requested",
      message: `Abort requested for run ${state.runId} (${opts.reason}); the run will stop at its next checkpoint.`,
      data: { fromStatus: state.status },
    });
    return { run: next, alreadyTerminal: false, finalized: false };
  }

  const next = applyTransition(
    { ...state, abortRequested: true, updatedAt: nowIso() },
    "aborted",
  );
  await store.write(next);
  await events.append({
    type: "run.aborted",
    message: `Run ${state.runId} aborted (${opts.reason}); its process was no longer running, so it was closed out directly.`,
    data: { fromStatus: state.status, ownerPid: state.ownerPid },
  });
  return { run: next, alreadyTerminal: false, finalized: true };
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
