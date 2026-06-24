import { defineConfig } from "vitest/config";

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
    // Reap leaked detached run-workers before and after the suite so test runs
    // can't accumulate zombie run-entry.js processes (see tests/global-setup.ts).
    globalSetup: ["./tests/global-setup.ts"],
  },
});
