// Auto-spawn the scheduler loop when the user queues something
// and nobody's listening. Idempotent: looks at the current
// scheduler-state liveness first and only spawns when offline /
// never-started.
//
// Keeps the philosophy "queueing = work starts" — the user should
// never have to remember to run `amaco queue run` in another
// terminal just to make their queued tasks move. Also: every spawn
// is observable (`.amaco/scheduler/scheduler.log` for stdout/stderr,
// `scheduler-spawns.ndjson` for spawn+exit events) so failures are
// never silent.

import path from "node:path";
import { spawn } from "node:child_process";
import { existsSync, closeSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { RunQueue } from "./run-queue.js";
import {
  deriveSchedulerLiveness,
  type SchedulerLiveness,
} from "./scheduler-liveness.js";
import {
  openLogForAppend,
  recordExit,
  recordSpawn,
} from "./scheduler-log.js";
import { recordIssue } from "../core/issues-store.js";

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
 * Visibility:
 *   - stdout + stderr stream into `.amaco/scheduler/scheduler.log`
 *     (appended; tailable from the dashboard)
 *   - the spawn is recorded in `scheduler-spawns.ndjson` immediately
 *   - if the child exits within 3s the exit code + a short tail are
 *     recorded into the issues stream so the user sees a red
 *     attention badge instead of a silent failure
 */
export async function ensureSchedulerRunning(input: {
  projectRoot: string;
  /** Use for auto-starts caused by queueing work. The scheduler exits
   * once the queue drains instead of becoming a permanent background daemon. */
  exitWhenDrained?: boolean;
  /** Optional owner process. If it exits, the scheduler exits too. */
  parentPid?: number;
  /** Audit label written to scheduler-spawns.ndjson. */
  source?: string;
}): Promise<EnsureRunningResult> {
  const queue = new RunQueue(input.projectRoot);
  const state = await queue.readState().catch(() => null);
  const liveness = deriveSchedulerLiveness(state);

  if (liveness.status === "paused") {
    return { action: "paused", liveness };
  }
  if (liveness.pickingUpWork) {
    return { action: "already-live", liveness };
  }
  try {
    const bin = resolveAmacoBin();
    const logFd = openLogForAppend(input.projectRoot);
    const args = ["queue", "run"];
    if (input.exitWhenDrained) args.push("--exit-when-drained");
    const source = input.source ?? "auto-queue";
    const child = spawn(process.execPath, [bin, ...args], {
      cwd: input.projectRoot,
      env: {
        ...process.env,
        AMACO_SPAWNED_BY: source,
        ...(input.parentPid ? { AMACO_PARENT_PID: String(input.parentPid) } : {}),
        NO_COLOR: "1",
      },
      // stdout + stderr land in the log file; stdin is discarded.
      stdio: ["ignore", logFd, logFd],
      detached: true,
    });
    // The child now owns the fd reference; close our copy so the
    // parent doesn't hold the file open forever.
    try {
      closeSync(logFd);
    } catch {
      /* ignore — child already owns it */
    }
    const pid = child.pid ?? null;
    await recordSpawn(input.projectRoot, { pid, source });

    // Watch for fast exits so we can flip them into the issues stream
    // *before* the user wonders why nothing is moving. A normal
    // long-running scheduler will outlive this watcher; that's fine —
    // we don't attach forever.
    const watchUntil = setTimeout(() => {
      child.removeAllListeners("exit");
      child.removeAllListeners("error");
      child.unref();
    }, 3000);
    child.on("error", (err) => {
      clearTimeout(watchUntil);
      void recordExit(input.projectRoot, pid, null, String(err));
      void recordIssue(input.projectRoot, {
        kind: "scheduler-spawn-error",
        message: `Scheduler failed to start: ${err.message}`,
        detail: String(err),
        fix: "Open the scheduler log in Mission Control's Task Control panel.",
      }).catch(() => undefined);
    });
    child.on("exit", (code) => {
      clearTimeout(watchUntil);
      void recordExit(input.projectRoot, pid, code, null);
      if (code !== 0) {
        void recordIssue(input.projectRoot, {
          kind: "scheduler-exit-nonzero",
          message: `Scheduler exited with code ${code} shortly after starting.`,
          detail:
            "Open the scheduler log in Mission Control's Task Control panel for the full traceback.",
          fix: "Check `.amaco/scheduler/scheduler.log` (or the Task Control panel) for the stack.",
        }).catch(() => undefined);
      }
    });

    return {
      action: "spawned",
      liveness,
      ...(pid !== null ? { pid } : {}),
      message: `started \`amaco ${args.join(" ")}\` (pid ${pid ?? "—"}); logs at .amaco/scheduler/scheduler.log`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await recordIssue(input.projectRoot, {
      kind: "scheduler-spawn-error",
      message: `Failed to spawn scheduler: ${msg}`,
    }).catch(() => undefined);
    return { action: "spawn-failed", liveness, message: msg };
  }
}
