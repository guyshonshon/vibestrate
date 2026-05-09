import type { FastifyInstance } from "fastify";
import { RunQueue } from "../../scheduler/run-queue.js";
import { ConflictsStore } from "../../scheduler/conflict-detector.js";

export type QueueRoutesDeps = { projectRoot: string };

export async function registerQueueRoutes(
  app: FastifyInstance,
  deps: QueueRoutesDeps,
): Promise<void> {
  app.get("/api/queue", async () => {
    const q = new RunQueue(deps.projectRoot);
    const file = await q.readQueue();
    const state = await q.readState();
    return { queue: file.entries, state };
  });

  app.get("/api/scheduler/conflicts", async () => {
    const store = new ConflictsStore(deps.projectRoot);
    const file = await store.read();
    return { warnings: file.warnings };
  });
}
