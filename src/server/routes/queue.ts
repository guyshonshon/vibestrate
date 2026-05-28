import type { FastifyInstance } from "fastify";
import { RunQueue } from "../../scheduler/run-queue.js";
import { ConflictsStore } from "../../scheduler/conflict-detector.js";
import { deriveSchedulerLiveness } from "../../scheduler/scheduler-liveness.js";
import { ensureSchedulerRunning } from "../../scheduler/ensure-running.js";
import {
  listSpawnRecords,
  readLogTail,
} from "../../scheduler/scheduler-log.js";
import { HttpError } from "../security.js";

export type QueueRoutesDeps = { projectRoot: string };

export async function registerQueueRoutes(
  app: FastifyInstance,
  deps: QueueRoutesDeps,
): Promise<void> {
  app.get("/api/queue", async () => {
    const q = new RunQueue(deps.projectRoot);
    const file = await q.readQueue();
    const state = await q.readState();
    const liveness = deriveSchedulerLiveness(state);
    return { queue: file.entries, state, liveness };
  });

  app.get("/api/scheduler/conflicts", async () => {
    const store = new ConflictsStore(deps.projectRoot);
    const file = await store.read();
    return { warnings: file.warnings };
  });

  // Spawn `vibestrate queue run` in the background. Routes through
  // `ensureSchedulerRunning` so the dashboard, the auto-queue path,
  // and the eventual UI-managed scheduler all share one code path —
  // and the same visibility (log file + spawn-event stream).
  app.post("/api/scheduler/start", async () => {
    const r = await ensureSchedulerRunning({
      projectRoot: deps.projectRoot,
      parentPid: process.pid,
      source: "dashboard-start",
    });
    if (r.action === "spawn-failed") {
      throw new HttpError(500, r.message ?? "Failed to spawn scheduler.");
    }
    return {
      ok: true,
      action: r.action,
      pid: r.pid ?? null,
      liveness: r.liveness,
      message: r.message ?? `scheduler ${r.action}`,
    };
  });

  // Tail of the captured stdout/stderr from every recent scheduler
  // run. Used by the Task Control panel's "show errors" drawer when
  // a spawn fails or the scheduler exits non-zero.
  app.get<{ Querystring: { bytes?: string } }>(
    "/api/scheduler/log",
    async (req) => {
      const raw = req.query?.bytes;
      const bytes =
        raw && /^\d+$/.test(raw) ? Math.min(parseInt(raw, 10), 1_000_000) : undefined;
      const tail = await readLogTail(deps.projectRoot, bytes);
      return tail;
    },
  );

  // Recent spawn / exit records: when did we try to start the
  // scheduler, with what pid, and what was the exit code if we
  // observed it within the watcher window.
  app.get("/api/scheduler/spawns", async () => {
    const records = await listSpawnRecords(deps.projectRoot);
    return { records };
  });
}
