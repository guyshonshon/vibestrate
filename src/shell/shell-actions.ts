// Thin wrappers used by the TUI to act on a run. Each action reuses
// the same on-disk write paths the existing CLI / dashboard already
// use, so the orchestrator picks them up via its normal polling.

import { RunStateStore } from "../core/state-machine.js";
import { EventLog } from "../core/event-log.js";
import { requestPause, requestResume } from "../core/pause-service.js";
import {
  applyTransition,
  isTerminal,
  runStateSchema,
} from "../core/state-machine.js";
import { pathExists } from "../utils/fs.js";
import { runStatePath } from "../utils/paths.js";
import { readJson, writeJson } from "../utils/json.js";

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
    const raw = await readJson<unknown>(file);
    const parsed = runStateSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, message: `state.json for ${runId} is invalid.` };
    }
    if (isTerminal(parsed.data.status)) {
      return {
        ok: false,
        message: `Run ${runId} is already terminal (${parsed.data.status}).`,
      };
    }
    const next = applyTransition(parsed.data, "aborted");
    await writeJson(file, next);
    const events = new EventLog(projectRoot, runId);
    await events.append({
      type: "run.aborted",
      message: `Run ${runId} aborted from vibestrate shell.`,
    });
    return { ok: true, message: `${runId} marked as aborted.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
