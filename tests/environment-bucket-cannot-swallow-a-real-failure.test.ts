import { describe, it, expect } from "vitest";
import { isEnvironmentFailure } from "../src/core/validation/validation-runner.js";
import { deriveTerminalCause } from "../src/core/run/terminal-cause.js";

/**
 * The `environment` bucket exists so a missing toolchain cannot masquerade as a
 * failing change. It is inferred from the command's own STDERR - which is
 * produced by the code under test - and `ValidationSummary.failed` is computed
 * by SUBTRACTING it. So anything that widens the bucket deletes real failures
 * from the count, silently.
 *
 * These pin the direction the classification must fail in: toward `failed`,
 * which blocks a run visibly, and never toward `environment`, which merges.
 */
describe("isEnvironmentFailure cannot be widened by the output it judges", () => {
  it("keeps a real failure that also spawned a missing binary", () => {
    // A suite that genuinely fails AND happens to shell out to something
    // absent. Matching on "contains an environment-shaped line" made the whole
    // suite environmental, so the assertion failure vanished from `failed`.
    const stderr =
      "FAIL tests/a.test.ts > adds numbers\n" +
      "AssertionError: expected 2 to be 3\n" +
      "sh: some-helper: command not found\n" +
      " Tests  1 failed | 40 passed\n";
    expect(isEnvironmentFailure(1, stderr)).toBe(false);
  });

  it("keeps a real failure when exit 127 carries real diagnostics", () => {
    // 127 short-circuited before stderr was read at all.
    expect(isEnvironmentFailure(127, "error TS2304: Cannot find name 'foo'.\n")).toBe(false);
  });

  it("still classifies a genuinely missing toolchain", () => {
    expect(isEnvironmentFailure(1, "sh: tsc: command not found\n")).toBe(true);
    expect(isEnvironmentFailure(127, "")).toBe(true);
    expect(isEnvironmentFailure(1, "env: node: No such file or directory\n")).toBe(true);
  });

  it("still classifies a missing toolchain reported with ordinary tool noise", () => {
    // A wrapper's own chatter must not turn an environment fault into a
    // failure: that direction burns a self-heal loop on something no code
    // change can fix.
    const stderr =
      " WARN  Unsupported engine: wanted node >=24\n" +
      "\n" +
      "sh: tsup: command not found\n";
    expect(isEnvironmentFailure(1, stderr)).toBe(true);
  });

  it("is not fooled by a test that merely prints the phrase", () => {
    expect(
      isEnvironmentFailure(1, "AssertionError: expected 'command not found' to be 'ok'\n"),
    ).toBe(false);
  });
});

describe("the run's own record decides, not the child's stderr", () => {
  // The record comes from linkWorktreeEnvironment at startup, before any
  // command runs, on a channel the code under test cannot write to.
  it("believes a missing toolchain when the environment really was degraded", () => {
    expect(isEnvironmentFailure(1, "sh: tsc: command not found\n", true)).toBe(true);
  });

  it("calls it a failure when the environment was fine, because the run broke it", () => {
    // node_modules linked cleanly and the binary is still gone: the run
    // deleted the dependency. That is a defect in the work, and scoring it
    // environmental let the change merge while the build was broken.
    expect(isEnvironmentFailure(1, "sh: tsup: command not found\n", false)).toBe(false);
    expect(isEnvironmentFailure(127, "", false)).toBe(false);
  });

  it("judges an unreachable daemon without the record, which is unrelated to links", () => {
    const stderr = "Cannot connect to the Docker daemon at unix:///var/run/docker.sock.\n";
    expect(isEnvironmentFailure(1, stderr, false)).toBe(true);
    expect(isEnvironmentFailure(1, stderr, true)).toBe(true);
  });

  it("keeps the old judgement when no record is offered", () => {
    expect(isEnvironmentFailure(1, "sh: tsc: command not found\n")).toBe(true);
  });
});

describe("a run with real failures does not report an environment cause", () => {
  const validation = (failed: number, environment: number) => ({
    commands: [],
    summary: { total: failed + environment, passed: 0, failed, environment },
  });

  it("names the real failures when both are present", () => {
    // `environment > 0` was checked first, so one command that could not start
    // relabelled a run with genuine failures as an environment fault.
    expect(
      deriveTerminalCause({
        status: "blocked",
        events: [],
        validation: validation(3, 1),
        reviewDecision: null,
      }),
    ).toBe("validation_failed");
  });

  it("still names the environment when nothing really failed", () => {
    expect(
      deriveTerminalCause({
        status: "blocked",
        events: [],
        validation: validation(0, 4),
        reviewDecision: null,
      }),
    ).toBe("validation_environment");
  });
});
