// ── Per-project UI server runtime lock ──────────────────────────────────────
//
// Runtime state for a project's running `vibe ui` lives HERE - a per-project
// lockfile at `<root>/.vibestrate/ui.lock` - not in the shared workspace
// registry. The registry holds durable intent (which projects exist + labels);
// the lock holds the ephemeral fact "this project's dashboard is running, on
// this port, as this pid." Each running server is the SINGLE writer of its own
// lock, so there are no shared-file races, and liveness self-heals: a crashed
// process leaves a stale lock that `isProcessAlive` flags as not-running and the
// next start reclaims.
//
// This mirrors the scheduler's own lock (`scheduler-lock.ts`) - the established
// pattern in this codebase for "is that process still alive?" without a daemon.

import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";
import { pathExists } from "../utils/fs.js";
import { vibestrateRoot } from "../utils/paths.js";
import { nowIso } from "../utils/time.js";
import { isProcessAlive } from "../scheduler/scheduler-lock.js";

export type UiLock = {
  pid: number;
  port: number;
  host: string;
  startedAt: string;
};

function uiLockPath(projectRoot: string): string {
  return path.join(vibestrateRoot(projectRoot), "ui.lock");
}

/** Read the lock, or null when absent / malformed. */
export async function readUiLock(projectRoot: string): Promise<UiLock | null> {
  const file = uiLockPath(projectRoot);
  if (!(await pathExists(file))) return null;
  try {
    const parsed = JSON.parse(await fs.readFile(file, "utf8")) as Partial<UiLock>;
    if (typeof parsed.pid !== "number" || typeof parsed.port !== "number") return null;
    return {
      pid: parsed.pid,
      port: parsed.port,
      host: typeof parsed.host === "string" ? parsed.host : os.hostname(),
      startedAt: typeof parsed.startedAt === "string" ? parsed.startedAt : nowIso(),
    };
  } catch {
    return null;
  }
}

/** Write/refresh this process's lock for `projectRoot`. */
export async function writeUiLock(
  projectRoot: string,
  input: { pid: number; port: number },
): Promise<UiLock> {
  const lock: UiLock = {
    pid: input.pid,
    port: input.port,
    host: os.hostname(),
    startedAt: nowIso(),
  };
  await fs.mkdir(vibestrateRoot(projectRoot), { recursive: true });
  await fs.writeFile(uiLockPath(projectRoot), JSON.stringify(lock), "utf8");
  return lock;
}

/**
 * Remove the lock if this process (pid + host) still owns it. A server calls
 * this on graceful shutdown; the navigator calls it after a force-kill, since
 * the killed process couldn't clean up after itself.
 */
export async function releaseUiLock(
  projectRoot: string,
  owner: { pid: number; force?: boolean } = { pid: process.pid },
): Promise<void> {
  try {
    const existing = await readUiLock(projectRoot);
    if (
      existing &&
      !owner.force &&
      (existing.pid !== owner.pid || existing.host !== os.hostname())
    ) {
      return; // not ours - leave it
    }
    await fs.unlink(uiLockPath(projectRoot));
  } catch {
    // already gone
  }
}

/** Reuse the kernel-backed liveness check used by the scheduler lock. */
export { isProcessAlive };
