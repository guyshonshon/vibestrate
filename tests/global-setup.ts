// Vitest global setup: reap leaked detached run-workers from any previous
// (possibly crashed) run before we start, and again after the suite finishes,
// so test runs can't pile up zombie `run-entry.js` processes across sessions.
// See ./reap-detached-runs.ts for the safety scoping.

import { reapStrayTestRuns } from "./reap-detached-runs.js";

export function setup(): void {
  const killed = reapStrayTestRuns();
  if (killed > 0) {
    // eslint-disable-next-line no-console
    console.log(`[reaper] cleared ${killed} stray test run-worker(s) before start`);
  }
}

export function teardown(): void {
  const killed = reapStrayTestRuns();
  if (killed > 0) {
    // eslint-disable-next-line no-console
    console.log(`[reaper] cleared ${killed} stray test run-worker(s) after suite`);
  }
}
