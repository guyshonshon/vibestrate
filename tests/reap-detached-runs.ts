// Test-suite reaper for leaked detached run workers.
//
// `startDetachedRun` (src/core/detached-run.ts) spawns `dist/run-entry.js` with
// `detached: true` + `unref()` - correct for production, where a run must
// outlive the dashboard request that started it. But tests that hit
// `POST /api/runs` never kill those children, and when a vitest worker exits
// the run-entry process is reparented to init and lingers. Over many runs they
// pile up and starve the machine (load spikes, integration tests time out).
//
// We can't change the production detach semantics, and we don't want to wire a
// kill into 80+ test files. Instead we reap once before and once after the
// whole suite. The safety hinge: we only kill run workers whose run-spec lives
// under `os.tmpdir()`. A real user's run lives under their actual project root,
// so this can never touch a developer's live run - only the temp-dir runs the
// tests themselves spawned.

import { execFileSync } from "node:child_process";
import os from "node:os";

/**
 * Decide whether a single `ps` line is a reapable test run-worker, returning
 * its pid (or null). Pure, so the matching rules are unit-tested without
 * spawning anything. A line qualifies when it is a `dist/run-entry.js` worker
 * whose run-spec path sits under `tmpDir` - i.e. a test run, never a real one.
 */
export function parseReapablePid(
  psLine: string,
  opts: { tmpDir: string; selfPid: number },
): number | null {
  if (!psLine.includes("dist/run-entry.js")) return null;
  if (!psLine.includes(opts.tmpDir)) return null;
  const match = psLine.trim().match(/^(\d+)\s/);
  if (!match) return null;
  const pid = Number(match[1]);
  if (!Number.isInteger(pid) || pid <= 1 || pid === opts.selfPid) return null;
  return pid;
}

/**
 * Kill every stray test run-worker (see module note). POSIX only - it relies on
 * `process.kill(-pid)` to take out the detached child's whole process group;
 * Windows group-kill is a separate gap. Best-effort and never throws, so it's
 * safe to call from vitest global setup/teardown. Returns the count killed.
 */
export function reapStrayTestRuns(): number {
  if (process.platform === "win32") return 0;
  const tmpDir = os.tmpdir();
  let listing = "";
  try {
    listing = execFileSync("ps", ["-axo", "pid=,command="], {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch {
    return 0; // ps unavailable - nothing we can safely do
  }
  let killed = 0;
  for (const line of listing.split("\n")) {
    const pid = parseReapablePid(line, { tmpDir, selfPid: process.pid });
    if (pid === null) continue;
    try {
      process.kill(-pid, "SIGKILL"); // the detached child is its own group leader
      killed++;
    } catch {
      try {
        process.kill(pid, "SIGKILL");
        killed++;
      } catch {
        // already gone - fine
      }
    }
  }
  return killed;
}
