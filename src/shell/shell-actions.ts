// Thin wrappers used by the TUI to act on a run. Each action reuses
// the same on-disk write paths the existing CLI / dashboard already
// use, so the orchestrator picks them up via its normal polling.

import { RunStateStore } from "../core/state-machine.js";
import { requestAbort } from "../core/run/abort-service.js";
import { EventLog } from "../core/stores/event-log.js";
import { requestPause, requestResume } from "../core/run/pause-service.js";
import { pathExists } from "../utils/fs.js";
import { runStatePath } from "../utils/paths.js";

export type ShellActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export async function pauseRun(
  projectRoot: string,
  runId: string,
): Promise<ShellActionResult> {
  try {
    const store = new RunStateStore(projectRoot, runId);
    const events = new EventLog(projectRoot, runId);
    await requestPause(store, events);
    return { ok: true, message: `Pause requested for ${runId}.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function resumeRun(
  projectRoot: string,
  runId: string,
): Promise<ShellActionResult> {
  try {
    const store = new RunStateStore(projectRoot, runId);
    const events = new EventLog(projectRoot, runId);
    await requestResume(store, events);
    return { ok: true, message: `Resume requested for ${runId}.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function abortRun(
  projectRoot: string,
  runId: string,
): Promise<ShellActionResult> {
  try {
    const file = runStatePath(projectRoot, runId);
    if (!(await pathExists(file))) {
      return { ok: false, message: `Run ${runId} not found.` };
    }
    const store = new RunStateStore(projectRoot, runId);
    const events = new EventLog(projectRoot, runId);
    const res = await requestAbort(store, events, { reason: "vibe shell" });
    if (res.alreadyTerminal) {
      return {
        ok: false,
        message: `Run ${runId} is already terminal (${res.run.status}).`,
      };
    }
    return {
      ok: true,
      // Say what actually happened. The run stops at its next checkpoint rather
      // than the moment this returns, and claiming otherwise is the same lie the
      // old direct write told.
      message: res.finalized
        ? `${runId} marked as aborted (its process was gone).`
        : `${runId}: abort requested, stopping at the next checkpoint.`,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
