// Advisory exclusive lock for the scheduler loop. Lives at
// `.amaco/scheduler/lock` and contains `{ pid, host, startedAt }`.
//
// Why advisory: we don't try to enforce true OS-level exclusion
// (different platforms, different filesystems). Instead, every
// scheduler entry point reads the lock first; if a previous holder
// is still alive (process.kill(pid, 0) succeeds locally) we refuse
// to start. Stale locks from crashed processes are detected and
// silently reclaimed.

import path from "node:path";
import { promises as fs } from "node:fs";
import os from "node:os";
import { pathExists } from "../utils/fs.js";
import { schedulerDir } from "../utils/paths.js";
import { nowIso } from "../utils/time.js";

export type SchedulerLock = {
  pid: number;
  host: string;
  startedAt: string;
};

function lockPath(projectRoot: string): string {
  return path.join(schedulerDir(projectRoot), "lock");
}

export async function readLock(
  projectRoot: string,
): Promise<SchedulerLock | null> {
  const file = lockPath(projectRoot);
  if (!(await pathExists(file))) return null;
  try {
    const text = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(text) as SchedulerLock;
    if (typeof parsed.pid !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * On localhost, ask the kernel whether the pid is still alive.
 * `process.kill(pid, 0)` throws ESRCH when no such process exists,
 * EPERM when it exists but we lack permission to signal — both mean
 * "exists somewhere". We treat ESRCH as dead, anything else as alive.
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ESRCH") return false;
    // EPERM ⇒ process exists, we just can't signal it. Treat as alive.
    return true;
  }
}

/** Result of an acquireLock call. */
export type AcquireResult =
  | { ok: true; lock: SchedulerLock; reclaimed: boolean }
  | { ok: false; reason: "already-held"; holder: SchedulerLock };

/**
 * Try to acquire the lock for the current process. If a stale
 * lock from a crashed pid is present, reclaim it. If a live holder
 * is detected on the same host, refuse.
 *
 * Cross-host locks are honored conservatively: if `host` differs we
 * can't probe the pid, so we trust the file — refuse. The UI can
 * surface "scheduler held by <host>:<pid>" so the user can decide.
 */
export async function acquireLock(
  projectRoot: string,
  pid: number = process.pid,
): Promise<AcquireResult> {
  const existing = await readLock(projectRoot);
  const sameHost = existing && existing.host === os.hostname();
  if (existing) {
    if (sameHost && !isProcessAlive(existing.pid)) {
      // Stale local lock — fall through to write a fresh one.
    } else {
      return { ok: false, reason: "already-held", holder: existing };
    }
  }
  const lock: SchedulerLock = {
    pid,
    host: os.hostname(),
    startedAt: nowIso(),
  };
  await fs.mkdir(schedulerDir(projectRoot), { recursive: true });
  await fs.writeFile(lockPath(projectRoot), JSON.stringify(lock), "utf8");
  return { ok: true, lock, reclaimed: existing !== null };
}

/** Release the lock — best-effort; nothing crashes if the file is gone. */
export async function releaseLock(projectRoot: string): Promise<void> {
  try {
    await fs.unlink(lockPath(projectRoot));
  } catch {
    // already gone
  }
}
