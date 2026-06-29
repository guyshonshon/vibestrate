// Atomic per-task RUN LOCK - the first real concurrency primitive in Vibestrate.
//
// A saga is one long orchestrator run that mutates a task's persisted checklist
// step-by-step on a shared feature branch. Two runs operating the same task at
// once (two sagas, or a saga + a normal run) would corrupt that checklist and
// branch. `Task.currentRunId` is post-hoc display bookkeeping written AFTER a run
// ends, so it cannot prevent a concurrent start. This lock can: it is claimed
// BEFORE any task work and released in a `finally` on every exit.
//
// Why a lockfile and not a JSON store: a file-based store cannot do a safe
// read-modify-write compare-and-set across processes (two readers both see "no
// holder" and both write). An exclusive-create lockfile is the OS-level atomic
// primitive that gives a real cross-process claim.
//
// Correctness (mirrors the hardened file-mutex, adapted to a long-held claim):
//   1. ATOMIC, BORN-POPULATED acquire. Write the lock body to a unique temp, then
//      `link()` it into place. `link` is an atomic exclusive-create (EEXIST if
//      held) AND the target is born already containing the holder info - so a
//      concurrent reader never sees a half-written / empty lock. (The brief calls
//      for `O_EXCL` / `wx`; `link()` is the same exclusive-create with no empty
//      "created-but-not-yet-written" window, and is this repo's established
//      pattern - see src/utils/file-mutex.ts.)
//   2. FAIL FAST on a live holder. Unlike the write-mutex we do NOT wait/poll: a
//      held task throws `TaskLockedError` naming the holder run. A noisy refusal
//      is recoverable; a silent double-run corrupts.
//   3. STALE RECLAIM only from a provably-finished holder. Reclaim (unlink +
//      re-create) when the holder pid is dead OR the holder run reached a terminal
//      status. A LIVE holder whose state.json is merely not written yet (a run
//      still starting up) is NEVER stolen - that would let a second run in while
//      the first is live. Reclaim re-attempts the exclusive create after unlink;
//      if it loses that race, the task is treated as held.
//
// LOCAL FILESYSTEM ONLY: `link`/O_EXCL exclusive-create is not reliable on NFS.
// The lockfile lives under `.vibestrate/locks/` on the local disk.

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { isProcessAlive } from "../scheduler/scheduler-lock.js";
import { runStatePath } from "../utils/paths.js";
import { isTerminal } from "./state-machine.js";
import type { RunStatus } from "../workflow/workflow-types.js";

export const LOCKS_DIRNAME = "locks";

/** On-disk body of a task lockfile. */
type TaskLockBody = {
  runId: string;
  pid: number;
  host: string;
  startedAt: string;
};

/** Returned by `acquireTaskLock`; pass it back to `releaseTaskLock`. */
export type TaskLockHandle = {
  projectRoot: string;
  taskId: string;
  runId: string;
};

/** Thrown when a task is already locked by a LIVE, non-terminal run. Carries the
 *  holder's runId so callers can print an actionable refusal. */
export class TaskLockedError extends Error {
  constructor(
    public readonly taskId: string,
    public readonly holderRunId: string,
    public readonly holderPid: number,
  ) {
    super(
      `Task "${taskId}" is already locked by run "${holderRunId}" (pid ${holderPid}). ` +
        `Refusing to start a concurrent run on the same task.`,
    );
    this.name = "TaskLockedError";
  }
}

/** A run id may contain only filesystem-safe chars already (validated upstream),
 *  but task ids are looser. Make a stable, collision-resistant safe filename. */
function safeSegment(id: string): string {
  const cleaned = id.replace(/[^a-zA-Z0-9._-]/g, "_");
  // Guard against two distinct ids colliding after cleaning by appending a short
  // hash of the original. Cheap, deterministic, no crypto import beyond what we
  // already have.
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  const suffix = (hash >>> 0).toString(36);
  return `${cleaned.slice(0, 100)}-${suffix}`;
}

export function locksDir(projectRoot: string): string {
  return path.join(projectRoot, ".vibestrate", LOCKS_DIRNAME);
}

export function taskLockPath(projectRoot: string, taskId: string): string {
  return path.join(locksDir(projectRoot), `task-${safeSegment(taskId)}.lock`);
}

async function readLockBody(lockPath: string): Promise<TaskLockBody | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(lockPath, "utf8")) as TaskLockBody;
    if (
      typeof parsed.runId === "string" &&
      typeof parsed.pid === "number" &&
      typeof parsed.host === "string"
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/** Read a holder run's terminal-ness from its state.json. Returns true only when
 *  the file exists AND parses to a terminal status. A missing/unreadable state
 *  file returns false here (the pid check decides staleness in that case). */
async function holderRunIsTerminal(
  projectRoot: string,
  runId: string,
): Promise<boolean> {
  try {
    const raw = JSON.parse(
      await fs.readFile(runStatePath(projectRoot, runId), "utf8"),
    ) as { status?: unknown };
    if (typeof raw.status !== "string") return false;
    return isTerminal(raw.status as RunStatus);
  } catch {
    return false; // missing or unreadable - not proof of terminal
  }
}

/**
 * Decide whether an existing lock is stale (its holder is provably finished) and,
 * if so, the holder is dead/done. A LIVE holder on this host whose run is not
 * terminal is NEVER stale - even if its state.json has not been written yet.
 */
async function holderIsStale(
  projectRoot: string,
  body: TaskLockBody,
): Promise<boolean> {
  const sameHost = body.host === os.hostname();
  // Cross-host: we cannot signal the pid, so we can only trust a terminal run
  // state. (We do not steal a foreign-host lock on a liveness guess.)
  if (sameHost && !isProcessAlive(body.pid)) return true;
  if (await holderRunIsTerminal(projectRoot, body.runId)) return true;
  return false;
}

/** Born-populated exclusive create: write the body to a temp, then atomically
 *  link it to `lockPath`. Throws EEXIST (via link) if the lock already exists.
 *  The temp is always cleaned up. */
async function createLockAtomically(
  lockPath: string,
  body: TaskLockBody,
): Promise<void> {
  const tmp = `${lockPath}.acq.${body.pid}.${randomUUID()}`;
  await fs.writeFile(tmp, JSON.stringify(body), "utf8");
  try {
    await fs.link(tmp, lockPath); // atomic; EEXIST if the lock exists
  } finally {
    await fs.unlink(tmp).catch(() => undefined);
  }
}

/**
 * Atomically claim the run lock for `taskId`. Resolves with a handle on success.
 * Throws `TaskLockedError` (naming the holder) if a LIVE, non-terminal run holds
 * it - does NOT wait. Reclaims a stale lock (dead pid or terminal holder run)
 * race-safely. Local filesystem only.
 */
export async function acquireTaskLock(
  projectRoot: string,
  taskId: string,
  runId: string,
): Promise<TaskLockHandle> {
  const lockPath = taskLockPath(projectRoot, taskId);
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  const body: TaskLockBody = {
    runId,
    pid: process.pid,
    host: os.hostname(),
    startedAt: new Date().toISOString(),
  };

  // Two attempts: the first may hit an existing-but-stale lock that we reclaim;
  // the reclaim re-attempts the create. If the second create still hits EEXIST,
  // someone else won the reclaim race - treat as held.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await createLockAtomically(lockPath, body);
      return { projectRoot, taskId, runId };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      const holder = await readLockBody(lockPath);
      if (!holder) {
        // Unreadable/garbage lock that still exists: vanished or half-removed.
        // Re-loop to retry the create; if it persists as EEXIST on the last
        // attempt we fall through to the held error below.
        if (attempt === 0) continue;
        throw new TaskLockedError(taskId, "unknown", -1);
      }
      const stale = await holderIsStale(projectRoot, holder);
      if (!stale) {
        throw new TaskLockedError(taskId, holder.runId, holder.pid);
      }
      // Reclaim: remove the stale lock, then loop to re-attempt the create.
      // re-stat to avoid unlinking a lock a third party just refreshed under us.
      try {
        await fs.unlink(lockPath);
      } catch {
        // already gone - the next create attempt will settle it
      }
      // loop continues to the next create attempt
    }
  }
  // Both create attempts lost to a concurrent holder/reclaimer.
  const holder = await readLockBody(lockPath);
  throw new TaskLockedError(
    taskId,
    holder?.runId ?? "unknown",
    holder?.pid ?? -1,
  );
}

/**
 * Release the run lock. Removes the lockfile ONLY if it still belongs to `runId`
 * (read-check-unlink) - it NEVER deletes another run's lock. Idempotent and
 * best-effort: a missing or foreign lock is a no-op. Accepts a handle or the
 * raw `{ projectRoot, taskId, runId }`.
 */
export async function releaseTaskLock(handle: TaskLockHandle): Promise<void> {
  const lockPath = taskLockPath(handle.projectRoot, handle.taskId);
  try {
    const holder = await readLockBody(lockPath);
    // FAIL CLOSED: only unlink a lock proven to be ours. A missing, unreadable,
    // foreign, or re-acquired lock is left untouched.
    if (!holder || holder.runId !== handle.runId) return;
    await fs.unlink(lockPath);
  } catch {
    // already gone / unreadable - nothing to release
  }
}
