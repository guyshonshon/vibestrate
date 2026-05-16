import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { RoadmapService } from "../../roadmap/roadmap-service.js";
import { deriveMicroStepsForTask } from "../../roadmap/microstep-derivation.js";
import { HttpError } from "../security.js";
import { safeIdSchema } from "../../roadmap/roadmap-types.js";
import { RunQueue } from "../../scheduler/run-queue.js";
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
      });
      const updated = await svc.updateTaskStatus(task.id, "queued");
      return { task: updated };
    },
  );

  app.post<{ Params: { taskId: string } }>(
    "/api/tasks/:taskId/cancel",
    async (req) => {
      assertSafeId(req.params.taskId);
      const task = await svc.getTask(req.params.taskId);
      if (!task) throw new HttpError(404, "Task not found.");
      const q = new RunQueue(deps.projectRoot);
      await q.remove(task.id);
      const updated = await svc.updateTaskStatus(task.id, "cancelled");
      return { task: updated };
    },
  );

  // Note: there is intentionally no POST /api/tasks/:taskId/run endpoint.
  // Spawning a child amaco process from the dashboard would be an
  // arbitrary-shell vector. The dashboard surfaces "amaco tasks run <id>" as
  // copy-paste guidance instead.
}
