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
import type { RunStatus } from "./workflow/workflow-types.js";

export const LOCKS_DIRNAME = "locks";

/** On-disk body of a task lockfile. */
export type TaskLockBody = {
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

/**
 * Read the current holder of a task's run lock, or null when unheld/unreadable.
 * Lets a CLI (`vibe saga pause|status`) find the LIVE run sequencing a saga - the
 * lock holder is the authoritative live runId (unlike `Task.currentRunId`, which
 * is written only AFTER a run ends). Best-effort: a missing/garbage lock is null.
 * NOTE: this does NOT prove the holder is alive - a hard-crashed run can leave a
 * stale lock. Use `readLiveTaskLockHolder` when you need a holder that is
 * actually running (e.g. before requesting a pause that a dead run can't honor).
 */
export async function readTaskLockHolder(
  projectRoot: string,
  taskId: string,
): Promise<TaskLockBody | null> {
  return readLockBody(taskLockPath(projectRoot, taskId));
}

/**
 * Like `readTaskLockHolder`, but returns the holder ONLY when it is provably
 * LIVE - the same staleness test the acquire path uses (dead pid on this host,
 * or a terminal run state, => not live). A hard-crashed run that left `state.json`
 * stuck at a non-terminal status would otherwise look "running" to a CLI and let
 * `vibe saga pause` report a confident lie about a process that will never read
 * the flag. Returns null when unheld, unreadable, or stale.
 */
export async function readLiveTaskLockHolder(
  projectRoot: string,
  taskId: string,
): Promise<TaskLockBody | null> {
  const holder = await readLockBody(taskLockPath(projectRoot, taskId));
  if (!holder) return null;
  return (await holderIsStale(projectRoot, holder)) ? null : holder;
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

/** TEST-ONLY fault-injection seam. Invoked inside the stale-reclaim path AFTER a
 *  racer has read the holder + witnessed the lockfile's mtime, but BEFORE it
 *  unlinks. A test sets this to yield the event loop, widening the otherwise
 *  sub-microsecond window so the bare-unlink TOCTOU is deterministically
 *  exercised. Default no-op: zero effect in production. Not exported on the
 *  public surface beyond this hook. */
let reclaimRaceHook: (() => Promise<void>) | null = null;

/** Install (or clear with `null`) the stale-reclaim fault-injection hook. TEST
 *  ONLY - production never calls this. */
export function __setReclaimRaceHookForTests(
  hook: (() => Promise<void>) | null,
): void {
  reclaimRaceHook = hook;
}

/**
 * Re-stat the lockfile and unlink it ONLY if it is unchanged since the caller
 * witnessed its mtime at EEXIST-read time. Mirrors file-mutex's `tryReclaimStale`
 * guard: if the lock was refreshed or replaced under us (mtime changed) we do NOT
 * unlink - returning false so the caller re-reads the (possibly now-live) holder
 * instead of deleting a fresh lock a winning racer just created. A vanished lock
 * (ENOENT) counts as "gone" -> proceed. Without this guard two racers that both
 * judged a STALE lock reclaimable would both unlink and both acquire (the loser's
 * unlink deleting the winner's fresh live lock).
 */
async function reclaimStaleLock(
  lockPath: string,
  witnessedMtimeMs: number,
): Promise<boolean> {
  // Test seam: deterministically widen the read->unlink window.
  if (reclaimRaceHook) await reclaimRaceHook();
  let fresh: import("node:fs").Stats;
  try {
    fresh = await fs.stat(lockPath);
  } catch {
    return true; // already gone -> the next create attempt settles it
  }
  if (fresh.mtimeMs !== witnessedMtimeMs) {
    // Refreshed / replaced under us. Back off and re-read the holder; if it is
    // now a live lock the caller treats the task as held.
    return false;
  }
  try {
    await fs.unlink(lockPath);
  } catch {
    // already gone between the re-stat and here - still safe to re-attempt create
  }
  return true;
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

  // A bounded retry loop. Most acquires settle in one or two passes: the create
  // either wins outright, or hits a holder that is judged held (throw) or stale
  // (reclaim once, then re-create). The cap is generous enough that a racer which
  // backs OFF a reclaim (because a peer refreshed the lock under it) still gets a
  // pass to re-read the now-live holder and throw TaskLockedError - while still
  // terminating. A FREE-lock race never loops here (losers see a live holder and
  // throw at once); only stale-reclaim contention needs the extra passes.
  const MAX_ATTEMPTS = 8;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      await createLockAtomically(lockPath, body);
      return { projectRoot, taskId, runId };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      // Witness the lockfile's mtime TOGETHER with the holder read, so the later
      // re-stat in reclaimStaleLock can detect a refresh/replace under us. A
      // vanished lock here means the next create attempt will settle it.
      let witnessedMtimeMs: number;
      try {
        witnessedMtimeMs = (await fs.stat(lockPath)).mtimeMs;
      } catch {
        continue; // gone between EEXIST and stat -> retry the create
      }
      const holder = await readLockBody(lockPath);
      if (!holder) {
        // Unreadable/garbage lock that still exists: vanished or half-removed.
        // Re-loop to retry the create; if it persists as EEXIST on the last
        // attempt we fall through to the held error below.
        continue;
      }
      const stale = await holderIsStale(projectRoot, holder);
      if (!stale) {
        throw new TaskLockedError(taskId, holder.runId, holder.pid);
      }
      // Reclaim, but ONLY if the lock is still the one we just witnessed. If a
      // peer reclaimed + recreated under us, reclaimStaleLock returns false and
      // we loop to re-read the (now live) holder rather than delete its lock.
      await reclaimStaleLock(lockPath, witnessedMtimeMs);
      // loop continues to the next create attempt
    }
  }
  // Every attempt lost to a concurrent holder/reclaimer.
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
