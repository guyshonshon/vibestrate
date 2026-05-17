// Auto-spawn the scheduler loop when the user queues something
// and nobody's listening. Idempotent: looks at the current
// scheduler-state liveness first and only spawns when offline /
// never-started.
//
// Keeps the philosophy "queueing = work starts" — the user should
// never have to remember to run `amaco queue run` in another
// terminal just to make their queued tasks move.

import path from "node:path";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { RunQueue } from "./run-queue.js";
import {
  deriveSchedulerLiveness,
  type SchedulerLiveness,
} from "./scheduler-liveness.js";

export type EnsureRunningResult = {
  /** What we did. */
  action: "already-live" | "paused" | "spawned" | "spawn-failed";
  liveness: SchedulerLiveness;
  /** PID when we spawned a new loop. */
  pid?: number;
  /** Detail / error message when relevant. */
  message?: string;
};

const HERE = path.dirname(fileURLToPath(import.meta.url));

function resolveAmacoBin(): string {
  const candidates = [
    // Bundled: dist/index.js
    path.resolve(HERE, "..", "..", "..", "dist", "index.js"),
    path.resolve(HERE, "..", "..", "..", "..", "dist", "index.js"),
    path.resolve(HERE, "index.js"),
  ];
  return candidates.find((p) => existsSync(p)) ?? candidates[0]!;
}

/**
 * If the scheduler isn't actively picking up work, spawn
 * `amaco queue run` detached. Returns what happened so the caller
 * can surface it (toast / response body) — never silent.
 *
 * Idempotent + non-blocking: detached spawn, unref'd, stdio=ignore.
 */
export async function ensureSchedulerRunning(input: {
  projectRoot: string;
}): Promise<EnsureRunningResult> {
  const queue = new RunQueue(input.projectRoot);
  const state = await queue.readState().catch(() => null);
  const liveness = deriveSchedulerLiveness(state);

  if (liveness.status === "paused") {
    // The user explicitly paused — don't override that decision.
    // Surface the fact instead so the caller can toast "queued but
    // scheduler is paused, run `amaco queue resume`".
    return { action: "paused", liveness };
  }
  if (liveness.pickingUpWork) {
    return { action: "already-live", liveness };
  }
  try {
    const bin = resolveAmacoBin();
    const child = spawn(process.execPath, [bin, "queue", "run"], {
      cwd: input.projectRoot,
      env: {
        ...process.env,
        AMACO_SPAWNED_BY: "auto-queue",
        NO_COLOR: "1",
      },
      stdio: "ignore",
      detached: true,
    });
    child.unref();
    return {
      action: "spawned",
      liveness,
      ...(child.pid !== undefined ? { pid: child.pid } : {}),
      message: `auto-started \`amaco queue run\` (pid ${child.pid ?? "—"})`,
    };
  } catch (err) {
    return {
      action: "spawn-failed",
      liveness,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
