import { spawn } from "node:child_process";
import { isWindows, type Platform } from "./platform.js";

export interface SpawnPlatformOptions {
  detached: boolean;
  windowsHide?: boolean;
}

/**
 * Spawn options for a child we may later need to tree-kill.
 * POSIX: `detached: true` puts the child in its own process group so
 *   killProcessTree can signal the whole group via a negative pid. This is
 *   identical to the prior inline `detached: process.platform !== "win32"`.
 * Windows: no process groups; do not detach, and hide the console window.
 */
export function detachedSpawnOptions(
  platform: Platform = process.platform,
): SpawnPlatformOptions {
  if (isWindows(platform)) return { detached: false, windowsHide: true };
  return { detached: true };
}

export interface ProcessControlDeps {
  platform?: Platform;
  /** Defaults to process.kill. Injected in tests. */
  kill?: (pid: number, signal: NodeJS.Signals) => void;
  /** Defaults to spawning `taskkill /T /F`. Injected in tests. */
  runTaskkill?: (pid: number) => void;
}

/**
 * Terminate a process AND its descendants, cross-platform. Throws on failure;
 * callers keep their existing direct-child fallback in a catch block.
 *
 * POSIX: signal the process *group* (negative pid) - identical to the prior
 *   inline `process.kill(-pid, signal)`. The child MUST have been spawned with
 *   detachedSpawnOptions() so a group exists.
 * Windows: `taskkill /PID <pid> /T /F` - no process groups, so /T walks the
 *   child tree, and we ALWAYS force: `/T` without `/F` only posts WM_CLOSE,
 *   which console processes (node, the provider CLIs) ignore, leaving a
 *   runaway/timed-out turn alive until the caller's SIGKILL escalation fires
 *   seconds later. The `signal` distinction is therefore POSIX-only. This
 *   REPLACES the prior Windows fallback of `child.kill(signal)` (direct child
 *   only), which orphaned provider subagents.
 */
export function killProcessTree(
  pid: number,
  signal: "SIGTERM" | "SIGKILL",
  deps: ProcessControlDeps = {},
): void {
  const platform = deps.platform ?? process.platform;
  if (isWindows(platform)) {
    const runTaskkill =
      deps.runTaskkill ??
      ((p: number): void => {
        // Don't fail silently (P1 Tier-2 follow-up): if taskkill can't be
        // SPAWNED at all (missing from PATH / unspawnable), fall back to a direct
        // single-process kill so the process isn't left alive unnoticed.
        // Best-effort and deliberately narrow: this does NOT cover taskkill
        // spawning but exiting non-zero (runtime access-denied / PID-already-gone).
        // The latter is harmless, and a single-process kill wouldn't beat an ACL
        // that already blocked the tree kill - so we only fall back on `error`.
        const fallback = (): void => {
          try {
            process.kill(p);
          } catch {
            /* already gone */
          }
        };
        try {
          const child = spawn("taskkill", ["/PID", String(p), "/T", "/F"], {
            stdio: "ignore",
            windowsHide: true,
          });
          child.on("error", fallback);
        } catch {
          fallback();
        }
      });
    runTaskkill(pid);
    return;
  }
  const kill =
    deps.kill ??
    ((p: number, s: NodeJS.Signals): void => {
      process.kill(p, s);
    });
  kill(-pid, signal);
}
