import path from "node:path";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { RunQueue } from "../../scheduler/run-queue.js";
import { ConflictsStore } from "../../scheduler/conflict-detector.js";
import { deriveSchedulerLiveness } from "../../scheduler/scheduler-liveness.js";
import { HttpError } from "../security.js";

export type QueueRoutesDeps = { projectRoot: string };

function resolveAmacoBin(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, "..", "..", "..", "dist", "index.js"),
    path.resolve(here, "..", "..", "..", "..", "dist", "index.js"),
    path.resolve(here, "index.js"),
  ];
  return candidates.find((p) => existsSync(p)) ?? candidates[0]!;
}

export async function registerQueueRoutes(
  app: FastifyInstance,
  deps: QueueRoutesDeps,
): Promise<void> {
  app.get("/api/queue", async () => {
    const q = new RunQueue(deps.projectRoot);
    const file = await q.readQueue();
    const state = await q.readState();
    // Liveness is derived server-side so the UI gets the same
    // verdict the panel uses, with no extra round-trip.
    const liveness = deriveSchedulerLiveness(state);
    return { queue: file.entries, state, liveness };
  });

  app.get("/api/scheduler/conflicts", async () => {
    const store = new ConflictsStore(deps.projectRoot);
    const file = await store.read();
    return { warnings: file.warnings };
  });

  // POST /api/scheduler/start — spawn `amaco queue run` in the
  // background. Argv-only, no shell, pinned to the served project
  // root. The dashboard uses this when the user clicks "Start
  // scheduler" on the queue card.
  app.post("/api/scheduler/start", async () => {
    const bin = resolveAmacoBin();
    try {
      const child = spawn(process.execPath, [bin, "queue", "run"], {
        cwd: deps.projectRoot,
        env: {
          ...process.env,
          AMACO_SPAWNED_BY: "dashboard",
          NO_COLOR: "1",
        },
        stdio: "ignore",
        detached: true,
      });
      child.unref();
      return {
        ok: true,
        pid: child.pid ?? null,
        message: `spawned \`amaco queue run\` (pid ${child.pid ?? "—"}). State updates will appear within ~1s.`,
      };
    } catch (err) {
      throw new HttpError(
        500,
        `Failed to spawn amaco queue run: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  });
}
