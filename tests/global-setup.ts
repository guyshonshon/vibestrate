// Vitest global setup: reap leaked detached run-workers from any previous
// (possibly crashed) run before we start, and again after the suite finishes,
// so test runs can't pile up zombie `run-entry.js` processes across sessions.
// See ./reap-detached-runs.ts for the safety scoping.
//
// Also purge the shared test worktree dir. Test projects mkdtemp under
// os.tmpdir(), and the default `git.worktreeDir` (`../.vibestrate-worktrees`)
// collapses to `<tmpdir>/.vibestrate-worktrees` - one namespace shared by every
// test project. Nothing removes those per-run worktrees, so they accumulate
// (tens of thousands seen in practice) and stale entries can collide with a
// freshly minted run id. Sweep the dir once before and once after the suite.

import os from "node:os";
import path from "node:path";
import { lstatSync, rmSync } from "node:fs";
import { reapStrayTestRuns } from "./reap-detached-runs.js";

// Only ever deletes `<os-tmpdir>/.vibestrate-worktrees`, and only when it is a
// real directory (not a symlink we'd traverse out of). Belt-and-suspenders so a
// bug here can never reach a real project.
function purgeStaleTestWorktrees(): void {
  const base = path.resolve(os.tmpdir());
  const target = path.join(base, ".vibestrate-worktrees");
  if (
    path.dirname(target) === base &&
    path.basename(target) === ".vibestrate-worktrees" &&
    lstatSync(target, { throwIfNoEntry: false })?.isDirectory()
  ) {
    rmSync(target, { recursive: true, force: true });
  }
}

export function setup(): void {
  const killed = reapStrayTestRuns();
  if (killed > 0) {
    // eslint-disable-next-line no-console
    console.log(`[reaper] cleared ${killed} stray test run-worker(s) before start`);
  }
  purgeStaleTestWorktrees();
}

export function teardown(): void {
  const killed = reapStrayTestRuns();
  if (killed > 0) {
    // eslint-disable-next-line no-console
    console.log(`[reaper] cleared ${killed} stray test run-worker(s) after suite`);
  }
  purgeStaleTestWorktrees();
}
