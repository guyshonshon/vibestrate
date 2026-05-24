// Lifecycle-managed scheduler subprocess: spawned as a real child of
// `amaco ui` (not detached), pipes stdout/stderr to the same
// scheduler.log other entry points use, and gets a polite SIGTERM
// followed by a hard SIGKILL when the UI shuts down.
//
// On unexpected exit (non-zero, not a clean SIGTERM), the manager
// restarts the child with exponential backoff up to a cap. Each
// attempt is recorded in the scheduler-spawns ndjson so the dashboard
// log drawer can show the user the whole history.

import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { closeSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  openLogForAppend,
  recordExit,
  recordSpawn,
} from "./scheduler-log.js";
import {
  getLockReclaimReason,
  isProcessAlive,
  readLock,
} from "./scheduler-lock.js";
import os from "node:os";
import { recordIssue } from "../core/issues-store.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));

function resolveAmacoBin(): string {
  const candidates = [
    path.resolve(HERE, "..", "..", "..", "dist", "index.js"),
    path.resolve(HERE, "..", "..", "..", "..", "dist", "index.js"),
    path.resolve(HERE, "index.js"),
  ];
  return candidates.find((p) => existsSync(p)) ?? candidates[0]!;
}

export type ManagedSchedulerHandle = {
  /** Politely stop the scheduler (SIGTERM, then SIGKILL after grace). */
  stop: () => Promise<void>;
  /** Last observed pid. null when no child is currently alive. */
  pid: () => number | null;
};

const MAX_BACKOFF_MS = 30_000;
const SHUTDOWN_GRACE_MS = 3_000;

export async function startManagedScheduler(input: {
  projectRoot: string;
  /** When non-null, called once per spawned attempt — useful for tests. */
  onSpawn?: (pid: number | null) => void;
}): Promise<ManagedSchedulerHandle> {
  let currentChild: ChildProcess | null = null;
  let currentPid: number | null = null;
  let stopped = false;
  let backoff = 1_000;
  let nextRestart: NodeJS.Timeout | null = null;

  // Refuse to manage only when a live, fresh scheduler owns the lock.
  // If the heartbeat has gone stale, the queue runner we spawn below
  // will reclaim the lock and stop the old owner.
  const existingLock = await readLock(input.projectRoot);
  if (existingLock) {
    const sameHost = existingLock.host === os.hostname();
    const stillAlive = sameHost && isProcessAlive(existingLock.pid);
    const reclaimReason = await getLockReclaimReason(
      input.projectRoot,
      existingLock,
    );
    if (!reclaimReason) {
      try {
        const logFd = openLogForAppend(input.projectRoot);
        try {
          const { writeSync } = await import("node:fs");
          writeSync(
            logFd,
            `[managed] UI not starting a managed scheduler; lock held by ${stillAlive ? "live" : "remote"} pid ${existingLock.pid} on ${existingLock.host} since ${existingLock.startedAt}.\n`,
          );
        } finally {
          closeSync(logFd);
        }
      } catch {
        /* log is best-effort */
      }
      return {
        stop: async () => {},
        pid: () => null,
      };
    }
    try {
      const logFd = openLogForAppend(input.projectRoot);
      try {
        const { writeSync } = await import("node:fs");
        writeSync(
          logFd,
          `[managed] spawning scheduler to reclaim stale lock (${reclaimReason}) held by pid ${existingLock.pid} on ${existingLock.host}.\n`,
        );
      } finally {
        closeSync(logFd);
      }
    } catch {
      /* log is best-effort */
    }
  }

  const spawnOnce = async (): Promise<void> => {
    if (stopped) return;
    const bin = resolveAmacoBin();
    const logFd = openLogForAppend(input.projectRoot);
    const child = spawn(process.execPath, [bin, "queue", "run"], {
      cwd: input.projectRoot,
      env: {
        ...process.env,
        AMACO_SPAWNED_BY: "ui-managed",
        AMACO_PARENT_PID: String(process.pid),
        NO_COLOR: "1",
      },
      stdio: ["ignore", logFd, logFd],
      // Not detached — explicit child of the UI process so it dies
      // with the parent on a Ctrl+C / crash.
      detached: false,
    });
    try {
      closeSync(logFd);
    } catch {
      /* ignore */
    }

    currentChild = child;
    currentPid = child.pid ?? null;
    input.onSpawn?.(currentPid);
    await recordSpawn(input.projectRoot, {
      pid: currentPid,
      source: "ui-managed",
    });

    child.on("error", (err) => {
      void recordExit(input.projectRoot, currentPid, null, String(err));
      void recordIssue(input.projectRoot, {
        kind: "scheduler-managed-error",
        message: `Managed scheduler error: ${err.message}`,
      }).catch(() => undefined);
    });

    child.on("exit", (code) => {
      const wasOurs = child === currentChild;
      void recordExit(input.projectRoot, currentPid, code, null);
      currentChild = null;
      currentPid = null;

      if (stopped || !wasOurs) return;

      // Unexpected exit — restart with exponential backoff. Non-zero
      // also lights up the issues stream so the user sees it.
      if (code !== 0) {
        void recordIssue(input.projectRoot, {
          kind: "scheduler-managed-restart",
          message: `Managed scheduler exited ${code}; restarting in ${Math.round(
            backoff / 1000,
          )}s.`,
          detail:
            "Tail of `.amaco/scheduler/scheduler.log` in the Task Control panel.",
        }).catch(() => undefined);
      }
      nextRestart = setTimeout(() => {
        nextRestart = null;
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
        void spawnOnce();
      }, backoff);
    });

    // Successful liveness — slowly reset backoff so a long-running
    // child doesn't keep "punishing" the next restart.
    setTimeout(() => {
      if (!stopped && currentChild === child) backoff = 1_000;
    }, 30_000);
  };

  await spawnOnce();

  const stop = async (): Promise<void> => {
    stopped = true;
    if (nextRestart) {
      clearTimeout(nextRestart);
      nextRestart = null;
    }
    const child = currentChild;
    if (!child) return;
    child.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          /* ignore */
        }
        resolve();
      }, SHUTDOWN_GRACE_MS);
      child.once("exit", () => {
        clearTimeout(t);
        resolve();
      });
    });
  };

  return { stop, pid: () => currentPid };
}
