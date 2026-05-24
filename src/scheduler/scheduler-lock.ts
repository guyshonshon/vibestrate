// Advisory exclusive lock for the scheduler loop. Lives at
// `.amaco/scheduler/lock` and contains `{ pid, host, startedAt }`.
//
// Why advisory: we don't try to enforce true OS-level exclusion
// (different platforms, different filesystems). Instead, every
// scheduler entry point reads the lock first; if a previous holder
// is still alive and its heartbeat is fresh, we refuse to start.
// Stale locks from crashed or wedged processes are detected and
// silently reclaimed.

import path from "node:path";
import { promises as fs } from "node:fs";
import os from "node:os";
import { pathExists } from "../utils/fs.js";
import { schedulerDir, schedulerStateFile } from "../utils/paths.js";
import { nowIso } from "../utils/time.js";

export type SchedulerLock = {
  pid: number;
  host: string;
  startedAt: string;
};

function lockPath(projectRoot: string): string {
  return path.join(schedulerDir(projectRoot), "lock");
}

export const LOCK_HEARTBEAT_STALE_MS = 15_000;
const LOCK_HOLDER_KILL_GRACE_MS = 3_000;

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
  | {
      ok: true;
      lock: SchedulerLock;
      reclaimed: boolean;
      reclaimReason?: "dead-pid" | "stale-heartbeat";
    }
  | { ok: false; reason: "already-held"; holder: SchedulerLock };

export type LockReclaimReason = "dead-pid" | "stale-heartbeat";

function ageMs(iso: string, now = Date.now()): number | null {
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, now - ms);
}

async function readHeartbeatAgeMs(
  projectRoot: string,
  now = Date.now(),
): Promise<number | null> {
  const file = schedulerStateFile(projectRoot);
  if (!(await pathExists(file))) return null;
  try {
    const raw = JSON.parse(await fs.readFile(file, "utf8")) as {
      lastUpdatedAt?: unknown;
    };
    if (typeof raw.lastUpdatedAt !== "string") return null;
    return ageMs(raw.lastUpdatedAt, now);
  } catch {
    return null;
  }
}

/**
 * Determine whether an existing local lock can be reclaimed without
 * user intervention. A live pid is not enough: the scheduler must
 * also keep touching `.amaco/scheduler/state.json`.
 */
export async function getLockReclaimReason(
  projectRoot: string,
  existing: SchedulerLock,
  newOwnerPid: number = process.pid,
  now = Date.now(),
): Promise<LockReclaimReason | null> {
  if (existing.host !== os.hostname()) return null;
  if (existing.pid === newOwnerPid) return null;
  if (!isProcessAlive(existing.pid)) return "dead-pid";

  const lockAge = ageMs(existing.startedAt, now);
  if (lockAge !== null && lockAge < LOCK_HEARTBEAT_STALE_MS) return null;

  const heartbeatAge = await readHeartbeatAgeMs(projectRoot, now);
  if (heartbeatAge === null) return "stale-heartbeat";
  if (heartbeatAge > LOCK_HEARTBEAT_STALE_MS) return "stale-heartbeat";
  return null;
}

async function waitForProcessExit(
  pid: number,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return !isProcessAlive(pid);
}

async function terminateLockHolder(pid: number): Promise<void> {
  if (pid <= 1 || pid === process.pid) return;
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return;
  }
  if (await waitForProcessExit(pid, LOCK_HOLDER_KILL_GRACE_MS)) return;
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    return;
  }
  await waitForProcessExit(pid, 1000);
}

/**
 * Try to acquire the lock for the current process. If a stale
 * lock from a crashed pid or stale heartbeat is present, reclaim it.
 * If a live, fresh holder is detected on the same host, refuse.
 *
 * Cross-host locks are honored conservatively: if `host` differs we
 * can't probe the pid, so we trust the file and refuse.
 */
export async function acquireLock(
  projectRoot: string,
  pid: number = process.pid,
): Promise<AcquireResult> {
  const existing = await readLock(projectRoot);
  let reclaimReason: LockReclaimReason | null = null;
  if (existing) {
    reclaimReason = await getLockReclaimReason(projectRoot, existing, pid);
    if (!reclaimReason) {
      return { ok: false, reason: "already-held", holder: existing };
    }
    if (reclaimReason === "stale-heartbeat") {
      await terminateLockHolder(existing.pid);
    }
  }
  const lock: SchedulerLock = {
    pid,
    host: os.hostname(),
    startedAt: nowIso(),
  };
  await fs.mkdir(schedulerDir(projectRoot), { recursive: true });
  await fs.writeFile(lockPath(projectRoot), JSON.stringify(lock), "utf8");
  return {
    ok: true,
    lock,
    reclaimed: existing !== null,
    ...(reclaimReason ? { reclaimReason } : {}),
  };
}

/** Release the lock if this process still owns it. */
export async function releaseLock(
  projectRoot: string,
  pid: number = process.pid,
): Promise<void> {
  try {
    const existing = await readLock(projectRoot);
    if (
      existing &&
      (existing.pid !== pid || existing.host !== os.hostname())
    ) {
      return;
    }
    await fs.unlink(lockPath(projectRoot));
  } catch {
    // already gone
  }
}
