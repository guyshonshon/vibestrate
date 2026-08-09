/**
 * CLI surface for supervised tasks ("sagas"): sequencing one, reporting its
 * status, and pausing/resuming it.
 *
 * Sequencing does not drive the steps here - it flips the task's lifecycle to
 * "sequencing" and launches a single audited run, then attributes the outcome
 * from that run's exit code. Two rules keep that attribution honest and are
 * easy to break while editing: exit code 1 means the run never started (a
 * concurrent invocation may own this saga), so the lifecycle must be left
 * exactly as found; and a halt already recorded from inside the run is never
 * overwritten - only a task that came back un-halted gets "done" or a
 * run-level halt written from here.
 *
 * Pause and resume target the live run holding the task's run lock, so a
 * hard-crashed run that left a stale lock reports "nothing to pause" rather
 * than signalling a process that cannot honor it.
 */
import path from "node:path";
import { detectProject } from "../../project/project-detector.js";
import { RoadmapService } from "../../roadmap/roadmap-service.js";
import { color, header, indent, symbol } from "../ui/format.js";
import { isVibestrateError } from "../../utils/errors.js";
import { runRunCommand } from "./run.js";
import { readLiveTaskLockHolder } from "../../core/run/run-lock.js";
import { RunStateStore } from "../../core/state-machine.js";
import { EventLog } from "../../core/stores/event-log.js";
import {
  PauseError,
  requestPause,
  requestResume,
} from "../../core/run/pause-service.js";
import { getTaskRunStatus, NotSupervisedError } from "../../core/saga/saga-status.js";

async function svc() {
  const detected = await detectProject(process.cwd());
  return new RoadmapService(detected.projectRoot);
}

/** A saga + the project root, with kind/existence already validated. Resolves the
 *  common pre-flight every saga subcommand shares. */
async function loadSaga(
  taskId: string,
): Promise<
  | { ok: true; projectRoot: string; s: RoadmapService; task: import("../../roadmap/roadmap-types.js").Task }
  | { ok: false; code: number }
> {
  const detected = await detectProject(process.cwd());
  const s = new RoadmapService(detected.projectRoot);
  const task = await s.getTask(taskId).catch(() => null);
  if (!task) {
    console.error(`${symbol.fail()} Saga "${taskId}" not found.`);
    return { ok: false, code: 1 };
  }
  if (task.runMode !== "supervised") {
    console.error(
      `${symbol.fail()} Task "${taskId}" is not a saga (kind: ${task.runMode}).`,
    );
    return { ok: false, code: 1 };
  }
  return { ok: true, projectRoot: detected.projectRoot, s, task };
}

/** The LIVE run sequencing a saga (the run-lock holder, proven not stale), or
 *  null when none is running. The lock holder is authoritative mid-run;
 *  `task.currentRunId` is only written after a run ends. A hard-crashed run that
 *  left a stale lock resolves to null, so pause/resume don't lie about a process
 *  that can't honor them. */
async function liveRunId(
  projectRoot: string,
  taskId: string,
): Promise<string | null> {
  const holder = await readLiveTaskLockHolder(projectRoot, taskId).catch(
    () => null,
  );
  return holder?.runId ?? null;
}

export async function cmdSequence(
  taskId: string,
  opts: { json?: boolean },
): Promise<number> {
  // Pre-flight: load + validate the saga BEFORE flipping any lifecycle state, so
  // a bad id leaves the task untouched.
  let s: RoadmapService;
  try {
    s = await svc();
  } catch (err) {
    console.error(`${symbol.fail()} ${isVibestrateError(err) ? err.message : String(err)}`);
    return 1;
  }
  const task = await s.getTask(taskId);
  if (!task) {
    console.error(`${symbol.fail()} Saga "${taskId}" not found.`);
    return 1;
  }
  if (task.runMode !== "supervised") {
    console.error(
      `${symbol.fail()} Task "${taskId}" is not a saga (kind: ${task.runMode}). Sequence only runs kind=saga tasks.`,
    );
    return 1;
  }
  if (task.checklist.length === 0) {
    console.error(
      `${symbol.fail()} Task "${taskId}" has no steps. Add steps with ${color.bold(`vibe tasks checklist add ${taskId} "<text>"`)}.`,
    );
    return 1;
  }

  // Mark the lifecycle as sequencing. The run owns the transition to "halted"
  // (from inside the run); we never overwrite that.
  await s.setSagaState(taskId, "sequencing");

  if (!opts.json) {
    console.log(
      `${symbol.bullet()} Sequencing saga ${color.bold(taskId)} (${task.checklist.length} steps): ${task.title}`,
    );
    console.log("");
  }

  // Launch through the AUDITED run path. sagaMode flows into the existing
  // Orchestrator, which provides clean halt-with-reset + the between-steps
  // budget + the per-task run lock. No raw command spawn, no shell-out.
  const code = await runRunCommand(task.title, {
    taskId,
    flowId: "saga",
    checklistMode: "continuous",
    sagaMode: true,
  });

  // Attribute the outcome by the run's exit code (runRunCommand contract):
  //   0 = merge_ready (clean)                  -> "done"
  //   1 = the run never STARTED (the task is locked by a concurrent run, or a
  //       pre-run failure) -> a complete state NO-OP. Another invocation may own
  //       this saga's lifecycle; we must not touch it or claim any outcome.
  //   2 = the run threw; 3 = blocked/failed/aborted. The run executed but did
  //       NOT complete, and the orchestrator recorded no step-level halt (e.g.
  //       the holistic review blocked, a policy block, or an abort). Record a
  //       clean halt so the lifecycle is honest + resumable instead of being
  //       stranded at "sequencing" or - the old bug - mislabeled "done".
  // A real step/budget halt already set supervisedState="halted" from inside the run;
  // we never overwrite that.
  if (code === 1) {
    // runRunCommand already printed the reason (e.g. TaskLockedError). Leave the
    // lifecycle exactly as we found it.
    return 1;
  }
  const after = await s.getTask(taskId);
  let halted = after?.supervised.state === "halted";
  if (!halted) {
    if (code === 0) {
      // Enhance: fold any conductor-revised pending plan back into the
      // checklist and clear the overlay (a no-op when none). Only on CLEAN
      // completion - a halt keeps the overlay so a re-sequence continues the
      // revised plan (the orchestrator re-applies it on start).
      await s.reconcileSagaPendingRevision(taskId);
      await s.setSagaState(taskId, "done");
    } else {
      await s.recordSagaHalt(taskId, {
        reason: `run ended ${code === 2 ? "failed" : "blocked"} before completing the saga`,
        atStepId: null,
        summary:
          "The saga run did not complete cleanly (the holistic review blocked, a policy block, or an abort). Committed steps are kept; re-run to continue.",
      });
      halted = true;
    }
  }
  const final = await s.getTask(taskId);

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          taskId,
          supervisedState: final?.supervised.state ?? null,
          supervisedHalt: final?.supervised.halt ?? null,
          runExitCode: code,
        },
        null,
        2,
      ),
    );
    // A halt is a real, reportable outcome - not a tool failure. Exit 0 on a
    // clean halt-with-reason; only a genuine run failure (exit 2) propagates.
    return code === 2 ? 2 : 0;
  }

  console.log("");
  if (halted) {
    console.log(
      `${symbol.warn()} ${header("Saga halted")} ${color.yellow(color.bold(final?.supervised.halt?.reason ?? "halted"))}`,
    );
    if (final?.supervised.halt?.summary) {
      console.log(indent(final.supervised.halt.summary));
    }
    // A step-level halt reset one step to pending (resume re-attempts it from the
    // clean tip); a run-level block/abort halt (atStepId null) reset no step.
    const resumeHint = final?.supervised.halt?.atStepId
      ? `The failed step is reset to pending - fix it, then re-run ${color.bold(`vibe tasks sequence ${taskId}`)} to resume from the clean tip.`
      : `Address the issue, then re-run ${color.bold(`vibe tasks sequence ${taskId}`)} to continue.`;
    console.log(indent(`${symbol.arrow()} ${resumeHint}`));
  } else {
    console.log(`${symbol.ok()} ${header("Saga done")} all ${final?.checklist.length ?? task.checklist.length} steps completed.`);
  }
  return code === 2 ? 2 : 0;
}

export async function cmdStatus(
  taskId: string,
  opts: { json?: boolean },
): Promise<number> {
  const detected = await detectProject(process.cwd());
  let status;
  try {
    // Shared with GET /api/sagas/:taskId/status - one source, no UI<->CLI drift.
    status = await getTaskRunStatus(detected.projectRoot, taskId);
  } catch (err) {
    if (err instanceof NotSupervisedError) {
      console.error(`${symbol.fail()} ${err.message}`);
      return 1;
    }
    throw err;
  }

  if (opts.json) {
    console.log(JSON.stringify(status, null, 2));
    return 0;
  }

  const { done, total } = status.progress;
  console.log(
    `${symbol.bullet()} ${color.bold(taskId)} ${status.title} ${color.dim(`(${status.supervisedState})`)}`,
  );
  console.log(
    indent(
      `Progress: ${done}/${total} steps done${status.liveRunId ? `  ${color.dim(`· running: ${status.liveRunId}`)}` : ""}`,
    ),
  );
  for (const [i, c] of status.steps.entries()) {
    const mark =
      c.status === "done" ? symbol.ok() : c.status === "in_progress" ? symbol.arrow() : symbol.bullet();
    const summary = c.outcomeSummary ? color.dim(` - ${c.outcomeSummary}`) : "";
    console.log(indent(`${mark} ${i + 1}. ${c.text} ${color.dim(`[${c.status}]`)}${summary}`));
  }
  if (status.supervisedHalt) {
    console.log("");
    console.log(
      `${symbol.warn()} ${header("Halted")} ${color.yellow(color.bold(status.supervisedHalt.reason))}`,
    );
    if (status.supervisedHalt.summary) console.log(indent(status.supervisedHalt.summary));
  }
  if (status.supervisedInvariants.length > 0) {
    console.log("");
    console.log(`${symbol.bullet()} ${header("Invariants")} (${status.supervisedInvariants.length})`);
    for (const inv of status.supervisedInvariants) console.log(indent(`- ${inv}`));
  }
  return 0;
}

export async function cmdPause(taskId: string): Promise<number> {
  const loaded = await loadSaga(taskId);
  if (!loaded.ok) return loaded.code;
  const { projectRoot } = loaded;
  const runId = await liveRunId(projectRoot, taskId);
  if (!runId) {
    console.error(
      `${symbol.fail()} No run is currently sequencing saga "${taskId}" (nothing to pause).`,
    );
    return 1;
  }
  const store = new RunStateStore(projectRoot, runId);
  const events = new EventLog(projectRoot, runId);
  try {
    const next = await requestPause(store, events);
    console.log(
      `${symbol.ok()} Pause requested for saga ${color.bold(taskId)} (run ${runId}). It halts at the next step boundary (currently ${next.status}).`,
    );
    return 0;
  } catch (err) {
    if (err instanceof PauseError) {
      console.error(color.yellow(err.message));
      return 2;
    }
    throw err;
  }
}

export async function cmdResume(taskId: string): Promise<number> {
  const loaded = await loadSaga(taskId);
  if (!loaded.ok) return loaded.code;
  const { projectRoot, task } = loaded;
  const runId = await liveRunId(projectRoot, taskId);
  // A live (paused) run: clear its pause flag. No live run but halted: the
  // resume path is a fresh sequence from the clean tip (2a), not a pause-clear.
  if (!runId) {
    if (task.supervised.state === "halted") {
      console.log(
        `${symbol.arrow()} Saga "${taskId}" is halted. Re-attempt from the clean tip with ${color.bold(`vibe tasks sequence ${taskId}`)}.`,
      );
      return 0;
    }
    console.error(
      `${symbol.fail()} No paused run for saga "${taskId}" (nothing to resume).`,
    );
    return 1;
  }
  const store = new RunStateStore(projectRoot, runId);
  const events = new EventLog(projectRoot, runId);
  try {
    const next = await requestResume(store, events);
    console.log(
      `${symbol.ok()} Resume requested for saga ${color.bold(taskId)} (run ${runId}); continuing from ${next.pausedAtStatus ?? next.status}.`,
    );
    return 0;
  } catch (err) {
    if (err instanceof PauseError) {
      console.error(color.yellow(err.message));
      return 2;
    }
    throw err;
  }
}
