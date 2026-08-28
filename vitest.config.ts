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
    // Randomise order, files and tests both.
    //
    // Nothing else in this suite catches order-dependence: 33 files drive a
    // real Orchestrator against real git and real subprocesses, and a fixed
    // order lets one file leave state that the next one silently relies on.
    // That bug does not show up as a flake, it shows up as a test that has
    // never actually tested what it claims - until the day someone adds a file
    // above it.
    //
    // Vitest prints the seed on failure, and `--sequence.seed=<n>` replays that
    // exact order. A shuffled failure is therefore reproducible, which is the
    // difference between this and simply making the suite random.
    //
    // Turned on only after the suite survived five full runs under five
    // different seeds (1, 7, 42, 1337, 60013) - shuffle in a required gate is a
    // promise that the suite has no order-dependence, and it was worth checking
    // rather than asserting. .github/workflows/flake.yml keeps drawing seeds
    // nightly, because five clean runs is evidence, not proof.
    sequence: { shuffle: { files: true, tests: true } },

    // Note for anyone reading the two settings above together: the working
    // directory is per-PROCESS, and this pool gives each test FILE its own
    // child process - so a test that changes it cannot reach another file, but
    // it does reach every other test in its own file, including work still in
    // flight from one that already returned. Shuffling tests makes which test
    // that is unstable between runs. No test may change it; the rule and the
    // failure it was written for are in tests/no-chdir-in-tests.test.ts, which
    // fails the build if one comes back.

    // Reap leaked detached run-workers before and after the suite so test runs
    // can't accumulate zombie run-entry.js processes (see tests/global-setup.ts).
    globalSetup: ["./tests/global-setup.ts"],
  },
});
