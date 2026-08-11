import { defineConfig } from "vitest/config";
import { cpus } from "node:os";

// The windows-latest CI runner spawns processes far slower than POSIX (the git
// and server integration tests do a lot of it), so a healthy run can still tip
// past the default timeouts intermittently. Give Windows generous timeouts and
// let the Windows CI leg retry a transient timeout once. POSIX and local runs
// are byte-identical (isWindows/onCI both false there); the ubuntu CI leg stays
// strict (no retry) so it never masks a real flake.
const isWindows = process.platform === "win32";
const onCI = !!process.env.CI;

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: isWindows ? 60_000 : 20_000,
    hookTimeout: isWindows ? 30_000 : 10_000,
    retry: isWindows && onCI ? 1 : 0,
    // Bound the worker pool to roughly half the cores.
    //
    // 33 of these files drive a real Orchestrator, which spawns provider
    // subprocesses - so the machine's actual load is workers TIMES the children
    // each one starts, not workers. At vitest's default (~cores-1) that
    // oversubscribes badly, and a test that finishes in 2s alone can exceed the
    // 20s timeout while waiting for CPU. Measured on a 10-core machine: 1 of 3
    // full runs failed uncapped, 0 of 3 at this cap, for ~70s -> ~100s.
    //
    // Three clean runs is not proof - a 33% flake passes three in a row about
    // 30% of the time - but the mechanism is the one the Windows note below
    // already describes, and a slower gate that means something beats a faster
    // one that trains you to re-run until green.
    maxWorkers: Math.max(2, Math.floor(cpus().length / 2)),
    // Reap leaked detached run-workers before and after the suite so test runs
    // can't accumulate zombie run-entry.js processes (see tests/global-setup.ts).
    globalSetup: ["./tests/global-setup.ts"],
  },
});
