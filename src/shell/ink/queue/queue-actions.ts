// Thin {ok, message} wrappers for the panel — reuse the same on-disk
// writes the `amaco queue …` CLI uses so the scheduler picks them up.

import { RunQueue } from "../../../scheduler/run-queue.js";
import { RoadmapService } from "../../../roadmap/roadmap-service.js";

export type QueueActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

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
