import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 20_000,
    // Reap leaked detached run-workers before and after the suite so test runs
    // can't accumulate zombie run-entry.js processes (see tests/global-setup.ts).
    globalSetup: ["./tests/global-setup.ts"],
  },
});
