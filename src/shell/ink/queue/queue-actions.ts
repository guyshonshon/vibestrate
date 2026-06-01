// Thin {ok, message} wrappers for the panel — reuse the same on-disk
// writes the `vibe queue …` CLI uses so the scheduler picks them up.

import { RunQueue } from "../../../scheduler/run-queue.js";
import { RoadmapService } from "../../../roadmap/roadmap-service.js";
import { setConfigValue } from "../../../setup/config-update-service.js";

export type QueueActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

/** Scheduler dispatch order, in cycle order. */
export const QUEUE_POLICIES = ["fifo", "priority", "fair"] as const;
export type QueuePolicyName = (typeof QUEUE_POLICIES)[number];

/** Next policy after `current`, wrapping. Pure — exported for tests. */
export function nextQueuePolicy(current: string): QueuePolicyName {
  const i = QUEUE_POLICIES.indexOf(current as QueuePolicyName);
  return QUEUE_POLICIES[(i + 1) % QUEUE_POLICIES.length]!;
}

/** Cycle `scheduler.queuePolicy` in project.yml. Takes effect on the next
 *  scheduler cycle (the running loop re-reads config). */
export async function cycleQueuePolicy(
  projectRoot: string,
  current: string,
): Promise<QueueActionResult> {
  try {
    const next = nextQueuePolicy(current);
    await setConfigValue(projectRoot, "scheduler.queuePolicy", next);
    return { ok: true, message: `Queue policy → ${next}.` };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function pauseScheduler(
  projectRoot: string,
): Promise<QueueActionResult> {
  try {
    const queue = new RunQueue(projectRoot);
    const state = await queue.readState();
    await queue.writeState({ ...state, paused: true });
    return { ok: true, message: "Scheduler paused." };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function resumeScheduler(
  projectRoot: string,
): Promise<QueueActionResult> {
  try {
    const queue = new RunQueue(projectRoot);
    const state = await queue.readState();
    await queue.writeState({ ...state, paused: false });
    return { ok: true, message: "Scheduler resumed." };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function removeQueueEntry(
  projectRoot: string,
  taskId: string,
): Promise<QueueActionResult> {
  try {
    const queue = new RunQueue(projectRoot);
    await queue.remove(taskId);
    const roadmap = new RoadmapService(projectRoot);
    const task = await roadmap.getTask(taskId);
    if (task && task.status === "queued") {
      await roadmap.updateTaskStatus(taskId, "ready");
    }
    return { ok: true, message: `Removed ${taskId} from queue.` };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
