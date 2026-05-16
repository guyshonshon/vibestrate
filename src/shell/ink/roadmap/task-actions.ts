// Service-layer wrappers used by the Roadmap page. Each returns a
// `{ ok, message }` shape so the panel can render a toast without
// catching exceptions itself.

import { RoadmapService } from "../../../roadmap/roadmap-service.js";
import { RunQueue } from "../../../scheduler/run-queue.js";
import { nowIso } from "../../../utils/time.js";
import type { TaskFormReady } from "./form.js";

export type TaskActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export async function createTask(
  projectRoot: string,
  form: TaskFormReady,
): Promise<TaskActionResult> {
  try {
    const svc = new RoadmapService(projectRoot);
    const task = await svc.addTask({
      title: form.title,
      description: form.description,
      priority: form.priority,
      effort: form.effort,
      providerOverride: form.providerOverride,
      readOnly: form.readOnly,
    });
    return { ok: true, message: `Created task ${task.id}.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function editTask(
  projectRoot: string,
  taskId: string,
  form: TaskFormReady,
): Promise<TaskActionResult> {
  try {
    const svc = new RoadmapService(projectRoot);
    await svc.patchTask(taskId, {
      title: form.title,
      description: form.description,
      priority: form.priority,
      effort: form.effort,
      providerOverride: form.providerOverride,
      readOnly: form.readOnly,
    });
    return { ok: true, message: `Updated task ${taskId}.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function deleteTask(
  projectRoot: string,
  taskId: string,
): Promise<TaskActionResult> {
  try {
    const svc = new RoadmapService(projectRoot);
    await svc.deleteTask(taskId);
    return { ok: true, message: `Deleted task ${taskId}.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function queueTask(
  projectRoot: string,
  taskId: string,
): Promise<TaskActionResult> {
  try {
    const svc = new RoadmapService(projectRoot);
    const task = await svc.getTask(taskId);
    if (!task) return { ok: false, message: `Task ${taskId} not found.` };
    const queue = new RunQueue(projectRoot);
    await queue.enqueue({
      taskId,
      enqueuedAt: nowIso(),
      priority: task.priority,
      source: "user",
    });
    await svc.updateTaskStatus(taskId, "queued");
    return { ok: true, message: `Queued ${taskId}.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

/** Cycle a task forward through a "manual" status: backlog → ready. */
export async function markReady(
  projectRoot: string,
  taskId: string,
): Promise<TaskActionResult> {
  try {
    const svc = new RoadmapService(projectRoot);
    await svc.updateTaskStatus(taskId, "ready");
    return { ok: true, message: `Marked ${taskId} ready.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
