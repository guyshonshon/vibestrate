// Saga conductor STATUS - the single source both the CLI (`vibe saga status`)
// and the dashboard (`GET /api/sagas/:taskId/status`) read, so the two surfaces
// can never drift (UI<->CLI parity). Pure data: it resolves the saga's lifecycle,
// the LIVE run sequencing it (the run-lock holder, proven not stale - distinct
// from `task.currentRunId`, which is only written after a run ends), step
// progress, the halt record, and the non-folding invariants ledger.

import { RoadmapService } from "../roadmap/roadmap-service.js";
import { readLiveTaskLockHolder } from "../core/run-lock.js";
import type { ChecklistItem, SupervisedHalt, SupervisedState } from "../roadmap/roadmap-types.js";

export type SagaStepStatus = {
  id: string;
  text: string;
  status: ChecklistItem["status"];
  commitSha: string | null;
  runId: string | null;
  outcomeSummary: string;
};

export type TaskRunStatus = {
  taskId: string;
  title: string;
  supervisedState: SupervisedState;
  /** The run sequencing this saga right now (lock holder, not stale), else null. */
  liveRunId: string | null;
  /** Last run recorded on the task (written after a run ends). */
  currentRunId: string | null;
  progress: { done: number; total: number };
  supervisedHalt: SupervisedHalt | null;
  supervisedInvariants: string[];
  steps: SagaStepStatus[];
};

export class NotSupervisedError extends Error {
  constructor(public readonly taskId: string, public readonly reason: "not-found" | "wrong-kind") {
    super(
      reason === "not-found"
        ? `Saga "${taskId}" not found.`
        : `Task "${taskId}" is not a saga.`,
    );
    this.name = "NotSupervisedError";
  }
}

/**
 * Resolve a saga's live conductor status. Throws `NotSupervisedError` when the id is
 * missing or not a `kind:"saga"` task, so callers map it to an exit code / HTTP
 * status uniformly.
 */
export async function getTaskRunStatus(
  projectRoot: string,
  taskId: string,
): Promise<TaskRunStatus> {
  const svc = new RoadmapService(projectRoot);
  const task = await svc.getTask(taskId).catch(() => null);
  if (!task) throw new NotSupervisedError(taskId, "not-found");
  if (task.runMode !== "supervised") throw new NotSupervisedError(taskId, "wrong-kind");

  const holder = await readLiveTaskLockHolder(projectRoot, taskId).catch(() => null);
  const total = task.checklist.length;
  const done = task.checklist.filter((c) => c.status === "done").length;

  return {
    taskId,
    title: task.title,
    supervisedState: task.supervised.state,
    liveRunId: holder?.runId ?? null,
    currentRunId: task.currentRunId ?? null,
    progress: { done, total },
    supervisedHalt: task.supervised.halt,
    supervisedInvariants: task.supervised.invariants,
    steps: task.checklist.map((c) => ({
      id: c.id,
      text: c.text,
      status: c.status,
      commitSha: c.commitSha,
      runId: c.runId,
      outcomeSummary: c.outcomeSummary,
    })),
  };
}
