import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { RoadmapService } from "../../roadmap/roadmap-service.js";
import { deriveMicroStepsForTask } from "../../roadmap/microstep-derivation.js";
import { HttpError } from "../security.js";
import { safeIdSchema } from "../../roadmap/roadmap-types.js";
import { RunQueue } from "../../scheduler/run-queue.js";
import { ensureSchedulerRunning } from "../../scheduler/ensure-running.js";
import { nowIso } from "../../utils/time.js";

const addBody = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  roadmapItemId: z.string().nullable().optional(),
  dependencies: z.array(z.string()).optional(),
  requiredSkills: z.array(z.string()).optional(),
  touchedFiles: z.array(z.string()).optional(),
  riskLevel: z.enum(["low", "medium", "high"]).optional(),
});

const commentBody = z.object({
  body: z.string().min(1),
  target: z
    .enum(["task", "step", "artifact", "file", "diff", "approval", "run"])
    .optional(),
  targetRef: z.string().nullable().optional(),
});

const checklistAddBody = z.object({ text: z.string().min(1) });
const checklistPatchBody = z
  .object({
    text: z.string().min(1).optional(),
    status: z.enum(["pending", "in_progress", "done", "blocked"]).optional(),
  })
  .refine((b) => b.text !== undefined || b.status !== undefined, {
    message: "Provide at least one of: text, status.",
  });
const checklistReorderBody = z.object({ order: z.array(z.string().min(1)) });
const enhanceBody = z.object({
  apply: z.boolean().optional(),
  profileId: z.string().min(1).nullable().optional(),
});

const patchBody = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  dependencies: z.array(z.string()).optional(),
  requiredSkills: z.array(z.string()).optional(),
  touchedFiles: z.array(z.string()).optional(),
  riskLevel: z.enum(["low", "medium", "high"]).optional(),
  validationProfile: z.string().nullable().optional(),
  // Phase A/B: per-task effort + provider override + read-only.
  effort: z.enum(["low", "medium", "high"]).nullable().optional(),
  providerOverride: z.string().nullable().optional(),
  readOnly: z.boolean().optional(),
});

export type TasksRoutesDeps = { projectRoot: string };

function assertSafeId(id: string): void {
  const r = safeIdSchema.safeParse(id);
  if (!r.success) throw new HttpError(400, "Invalid id.");
}

export async function registerTasksRoutes(
  app: FastifyInstance,
  deps: TasksRoutesDeps,
): Promise<void> {
  const svc = new RoadmapService(deps.projectRoot);

  app.get("/api/tasks", async () => {
    await svc.init();
    const tasks = await svc.listTasks();
    return { tasks };
  });

  // Phase C: heuristic effort suggestion. Pure, free, deterministic —
  // safe to expose without any rate limit. The dashboard's task-add /
  // task-detail surface a "Suggested: …" panel that calls this.
  app.post<{
    Body: { text?: string; files?: string[] };
  }>("/api/effort/classify", async (req) => {
    const text = typeof req.body?.text === "string" ? req.body.text : "";
    const files = Array.isArray(req.body?.files)
      ? req.body.files.filter((f): f is string => typeof f === "string")
      : [];
    const { classifyEffort } = await import(
      "../../core/effort-heuristic.js"
    );
    return classifyEffort({ text, files });
  });

  app.post<{ Body: unknown }>("/api/tasks", async (req) => {
    const parsed = addBody.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.message);
    }
    await svc.init();
    try {
      const task = await svc.addTask(parsed.data);
      return { task };
    } catch (err) {
      throw new HttpError(400, err instanceof Error ? err.message : String(err));
    }
  });

  app.get<{ Params: { taskId: string } }>(
    "/api/tasks/:taskId",
    async (req) => {
      assertSafeId(req.params.taskId);
      const task = await svc.getTask(req.params.taskId);
      if (!task) throw new HttpError(404, "Task not found.");
      const comments = await svc.listComments(req.params.taskId);
      const microSteps = await deriveMicroStepsForTask({
        projectRoot: deps.projectRoot,
        taskId: task.id,
        runIds: task.runIds,
      });
      return { task, comments, microSteps };
    },
  );

  app.patch<{ Params: { taskId: string }; Body: unknown }>(
    "/api/tasks/:taskId",
    async (req) => {
      assertSafeId(req.params.taskId);
      const parsed = patchBody.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw new HttpError(400, parsed.error.message);
      }
      try {
        const task = await svc.patchTask(req.params.taskId, parsed.data);
        return { task };
      } catch (err) {
        throw new HttpError(
          404,
          err instanceof Error ? err.message : String(err),
        );
      }
    },
  );

  app.post<{ Params: { taskId: string }; Body: unknown }>(
    "/api/tasks/:taskId/comments",
    async (req) => {
      assertSafeId(req.params.taskId);
      const parsed = commentBody.safeParse(req.body);
      if (!parsed.success) {
        throw new HttpError(400, parsed.error.message);
      }
      try {
        const comment = await svc.addComment(req.params.taskId, parsed.data);
        return { comment };
      } catch (err) {
        throw new HttpError(
          400,
          err instanceof Error ? err.message : String(err),
        );
      }
    },
  );

  app.post<{ Params: { taskId: string; commentId: string } }>(
    "/api/tasks/:taskId/comments/:commentId/resolve",
    async (req) => {
      assertSafeId(req.params.taskId);
      const c = await svc.resolveComment(req.params.taskId, req.params.commentId);
      if (!c) throw new HttpError(404, "Comment not found.");
      return { comment: c };
    },
  );

  // ─── checklist (the ordered breakdown inside a card) ──────────────────────

  app.post<{ Params: { taskId: string }; Body: unknown }>(
    "/api/tasks/:taskId/checklist",
    async (req) => {
      assertSafeId(req.params.taskId);
      const parsed = checklistAddBody.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, parsed.error.message);
      try {
        const { task, item } = await svc.addChecklistItem(
          req.params.taskId,
          parsed.data.text,
        );
        return { task, item };
      } catch (err) {
        throw new HttpError(404, err instanceof Error ? err.message : String(err));
      }
    },
  );

  app.patch<{ Params: { taskId: string; itemId: string }; Body: unknown }>(
    "/api/tasks/:taskId/checklist/:itemId",
    async (req) => {
      assertSafeId(req.params.taskId);
      const parsed = checklistPatchBody.safeParse(req.body ?? {});
      if (!parsed.success) throw new HttpError(400, parsed.error.message);
      try {
        const { task, item } = await svc.updateChecklistItem(
          req.params.taskId,
          req.params.itemId,
          parsed.data,
        );
        return { task, item };
      } catch (err) {
        throw new HttpError(404, err instanceof Error ? err.message : String(err));
      }
    },
  );

  app.delete<{ Params: { taskId: string; itemId: string } }>(
    "/api/tasks/:taskId/checklist/:itemId",
    async (req) => {
      assertSafeId(req.params.taskId);
      try {
        const task = await svc.removeChecklistItem(
          req.params.taskId,
          req.params.itemId,
        );
        return { task };
      } catch (err) {
        throw new HttpError(404, err instanceof Error ? err.message : String(err));
      }
    },
  );

  app.put<{ Params: { taskId: string }; Body: unknown }>(
    "/api/tasks/:taskId/checklist",
    async (req) => {
      assertSafeId(req.params.taskId);
      const parsed = checklistReorderBody.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, parsed.error.message);
      try {
        const task = await svc.reorderChecklist(
          req.params.taskId,
          parsed.data.order,
        );
        return { task };
      } catch (err) {
        throw new HttpError(400, err instanceof Error ? err.message : String(err));
      }
    },
  );

  // Enhance: an AI assist (read-only, structured output) proposes a checklist
  // for the task. `apply: false` (default) is a dry-run preview that mutates
  // nothing; `apply: true` appends the proposed items. The model never writes
  // to the board on its own — accepting is an explicit, separate step.
  app.post<{ Params: { taskId: string }; Body: unknown }>(
    "/api/tasks/:taskId/enhance",
    async (req) => {
      assertSafeId(req.params.taskId);
      const parsed = enhanceBody.safeParse(req.body ?? {});
      if (!parsed.success) throw new HttpError(400, parsed.error.message);
      const { proposeChecklist, enhanceChecklist } = await import(
        "../../assist/enhance.js"
      );
      try {
        if (parsed.data.apply) {
          const { task, added, proposal } = await enhanceChecklist(
            deps.projectRoot,
            req.params.taskId,
            { profileId: parsed.data.profileId ?? null },
          );
          return { applied: true, task, added, proposal };
        }
        const proposal = await proposeChecklist(
          deps.projectRoot,
          req.params.taskId,
          { profileId: parsed.data.profileId ?? null },
        );
        return { applied: false, proposal };
      } catch (err) {
        throw new HttpError(400, err instanceof Error ? err.message : String(err));
      }
    },
  );

  app.post<{ Params: { taskId: string } }>(
    "/api/tasks/:taskId/queue",
    async (req) => {
      assertSafeId(req.params.taskId);
      const task = await svc.getTask(req.params.taskId);
      if (!task) throw new HttpError(404, "Task not found.");
      const q = new RunQueue(deps.projectRoot);
      await q.enqueue({
        taskId: task.id,
        enqueuedAt: nowIso(),
        priority: task.priority,
        source: "user",
      });
      const updated = await svc.updateTaskStatus(task.id, "queued");
      // Queueing = work starts. Auto-spawn the scheduler loop if
      // nothing is currently picking up work. Honors an explicit
      // pause (caller still sees the verdict and can resume).
      const ensure = await ensureSchedulerRunning({
        projectRoot: deps.projectRoot,
        exitWhenDrained: true,
        source: "auto-queue",
      });
      return { task: updated, scheduler: ensure };
    },
  );

  app.post<{ Params: { taskId: string } }>(
    "/api/tasks/:taskId/cancel",
    async (req) => {
      assertSafeId(req.params.taskId);
      const task = await svc.getTask(req.params.taskId);
      if (!task) throw new HttpError(404, "Task not found.");
      if (task.currentRunId) {
        throw new HttpError(
          409,
          `Task is linked to active run ${task.currentRunId}; abort that run first (or call /terminate to do both).`,
        );
      }
      try {
        const q = new RunQueue(deps.projectRoot);
        await q.remove(task.id);
        const updated = await svc.updateTaskStatus(task.id, "cancelled");
        return { task: updated };
      } catch (err) {
        throw new HttpError(
          400,
          err instanceof Error ? err.message : String(err),
        );
      }
    },
  );

  // Force-terminate: abort the linked active run (if any), then
  // cancel the task. Idempotent and best-effort — partial success
  // returns 200 with `aborted`/`cancelled` flags so the UI can show
  // an honest summary instead of an opaque error.
  app.post<{ Params: { taskId: string } }>(
    "/api/tasks/:taskId/terminate",
    async (req) => {
      assertSafeId(req.params.taskId);
      const task = await svc.getTask(req.params.taskId);
      if (!task) throw new HttpError(404, "Task not found.");

      let aborted = false;
      let abortError: string | null = null;
      if (task.currentRunId) {
        try {
          const { runStatePath } = await import("../../utils/paths.js");
          const { RunStateStore, applyTransition } = await import(
            "../../core/state-machine.js"
          );
          const { EventLog } = await import("../../core/event-log.js");
          const { pathExists } = await import("../../utils/fs.js");
          const stateFile = runStatePath(deps.projectRoot, task.currentRunId);
          if (await pathExists(stateFile)) {
            const store = new RunStateStore(
              deps.projectRoot,
              task.currentRunId,
            );
            const events = new EventLog(deps.projectRoot, task.currentRunId);
            const cur = await store.read();
            if (
              cur &&
              cur.status !== "merge_ready" &&
              cur.status !== "failed" &&
              cur.status !== "aborted"
            ) {
              const next = applyTransition(cur, "aborted");
              await store.write(next);
              await events.append({
                type: "run.aborted",
                message: `Run aborted via task /terminate on ${task.id}.`,
                data: { taskId: task.id },
              });
              aborted = true;
            }
          }
        } catch (err) {
          abortError = err instanceof Error ? err.message : String(err);
        }
      }

      let cancelled = false;
      try {
        const q = new RunQueue(deps.projectRoot);
        await q.remove(task.id);
        await svc.updateTaskStatus(task.id, "cancelled");
        cancelled = true;
      } catch (err) {
        // If both pieces failed, surface a 400 — otherwise return
        // the partial-success summary so the user knows what happened.
        if (!aborted) {
          throw new HttpError(
            400,
            err instanceof Error ? err.message : String(err),
          );
        }
        abortError =
          abortError ?? (err instanceof Error ? err.message : String(err));
      }

      const updated = await svc.getTask(task.id);
      return {
        task: updated,
        aborted,
        cancelled,
        abortError,
      };
    },
  );

  // Note: there is intentionally no POST /api/tasks/:taskId/run endpoint.
  // Spawning a child vibestrate process from the dashboard would be an
  // arbitrary-shell vector. The dashboard surfaces "vibe tasks run <id>" as
  // copy-paste guidance instead.
}
