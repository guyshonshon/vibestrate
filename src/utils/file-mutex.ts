// A short-held, cross-process advisory MUTEX for serializing writes to a shared
// file (the project ledger, STATE.md, VIBESTRATE.md). Distinct from
// scheduler-lock: that is a long-lived SINGLETON that TERMINATES the other holder
// on stale detection - catastrophic for a write mutex, which peers contend for
// briefly and must never kill mid-write.
//
// Correctness rests on three things (all hardened after an adversarial review):
//   1. ATOMIC, FULLY-POPULATED acquire: write the lock body to a unique temp,
//      then `link()` it into place. `link` is an atomic exclusive-create (EEXIST
//      if held) AND the target is born already containing the owner info - so
//      there is no "empty file" window where a reader sees a half-made lock.
//   2. FAIL-CLOSED release: only unlink a lock whose pid + host + per-acquire
//      NONCE all match ours. An unreadable/foreign/re-acquired lock is never
//      touched - so a release can never delete a peer's lock.
//   3. NEVER reclaim a LIVE same-host holder. Reclaim only a provably-dead pid
//      (crash recovery) or a foreign-host lock past a high mtime ceiling. A slow
//      (not dead) holder is waited out, not stolen - so two peers never hold it.
//
// LOCAL FILESYSTEM ONLY: `link`/O_EXCL exclusive-create is not reliable on NFS.
// All call sites write under `.vibestrate/` on the local disk.

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { isProcessAlive } from "../scheduler/scheduler-lock.js";

type LockInfo = { pid: number; host: string; token: string; at: string };

/** Total time to wait for the lock before giving up. */
const DEFAULT_TIMEOUT_MS = 5_000;
/** A FOREIGN-HOST lock older than this (by mtime) is treated as abandoned. Set
 *  far above any plausible critical section: same-host crashes are reclaimed by
 *  dead-pid immediately; this ceiling only catches cross-host crashes. */
const DEFAULT_STALE_CEILING_MS = 60_000;
const DEFAULT_POLL_MS = 25;

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

async function readLockInfo(lockPath: string): Promise<LockInfo | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(lockPath, "utf8")) as LockInfo;
    if (
      typeof parsed.pid === "number" &&
      typeof parsed.host === "string" &&
      typeof parsed.token === "string"
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/** Born-populated exclusive create: write the body to a temp, then atomically
 *  link it to `lockPath`. Throws EEXIST (via link) if the lock is already held.
 *  The temp is always cleaned up. */
async function createLockAtomically(lockPath: string, me: LockInfo): Promise<void> {
  const tmp = `${lockPath}.acq.${me.pid}.${me.token}`;
  await fs.writeFile(tmp, JSON.stringify(me), "utf8");
  try {
    await fs.link(tmp, lockPath); // atomic; EEXIST if the lock exists
  } finally {
    await fs.unlink(tmp).catch(() => undefined);
  }
}

/**
 * Reclaim an existing lock IFF its owner is provably gone. Returns true when it
 * removed a reclaimable lock (caller retries the create). NEVER reclaims a live
 * same-host holder (would let a peer in while it's still writing). Never signals
 * a peer.
 */
async function tryReclaimStale(lockPath: string, ceilingMs: number): Promise<boolean> {
  let mtimeMs: number;
  try {
    mtimeMs = (await fs.stat(lockPath)).mtimeMs;
  } catch {
    return true; // vanished between EEXIST and here -> retry the create
  }
  const info = await readLockInfo(lockPath);
  const sameHost = info !== null && info.host === os.hostname();
  const deadPid = sameHost && !isProcessAlive(info!.pid);
  // Same-host + alive = a slow holder; wait it out, do not steal. Foreign/unknown
  // host can only be judged by the (high) mtime ceiling.
  const foreignStale = !sameHost && Date.now() - mtimeMs > ceilingMs;
  if (!deadPid && !foreignStale) return false;
  try {
    const fresh = await fs.stat(lockPath);
    if (fresh.mtimeMs !== mtimeMs) return false; // refreshed under us; back off
    await fs.unlink(lockPath);
  } catch {
    // already gone
  }
  return true;
}

async function releaseIfOwner(lockPath: string, me: LockInfo): Promise<void> {
  try {
    const info = await readLockInfo(lockPath);
    // FAIL CLOSED: only ever unlink a lock proven to be exactly ours (pid + host
    // + nonce). Unreadable/foreign/re-acquired -> leave it alone.
    if (!info || info.pid !== me.pid || info.host !== me.host || info.token !== me.token) {
      return;
    }
    await fs.unlink(lockPath);
  } catch {
    // already gone
  }
}

/**
 * Run `fn` while holding an exclusive advisory lock at `lockPath` (local FS).
 * Acquired before `fn`, released after (success OR throw). Throws if the lock
 * can't be acquired within `timeoutMs`. Keep `fn` short - it's a write mutex.
 */
export async function withFileMutex<T>(
  lockPath: string,
  fn: () => Promise<T>,
  opts: { timeoutMs?: number; staleCeilingMs?: number; pollMs?: number } = {},
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const ceilingMs = opts.staleCeilingMs ?? DEFAULT_STALE_CEILING_MS;
  const pollMs = opts.pollMs ?? DEFAULT_POLL_MS;
  const deadline = Date.now() + timeoutMs;
  const me: LockInfo = {
    pid: process.pid,
    host: os.hostname(),
    token: randomUUID(),
    at: new Date().toISOString(),
  };
  await fs.mkdir(path.dirname(lockPath), { recursive: true });

  for (;;) {
    try {
      await createLockAtomically(lockPath, me);
      break; // acquired
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      const reclaimed = await tryReclaimStale(lockPath, ceilingMs);
      if (reclaimed) continue;
      if (Date.now() >= deadline) {
        const holder = await readLockInfo(lockPath);
        throw new Error(
          `Timed out acquiring file mutex at ${lockPath}` +
            (holder ? ` (held by pid ${holder.pid} on ${holder.host})` : ""),
        );
      }
      await sleep(pollMs * (0.5 + Math.random())); // jitter: avoid thundering herd
    }
  }

  try {
    return await fn();
  } finally {
    await releaseIfOwner(lockPath, me);
  }
}
