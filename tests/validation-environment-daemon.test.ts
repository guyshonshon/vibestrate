import { describe, it, expect } from "vitest";
import { isEnvironmentFailure } from "../src/core/validation/validation-runner.js";

/**
 * A tool that is installed but whose daemon is not running is an ENVIRONMENT
 * fault, not a defect in the work.
 *
 * Found on a real benchmark run: Docker was down, `docker compose build`
 * failed, and the run recorded `validation_failed`. That is the label for a
 * real defect, so the Supervisor would have proposed sending correct work back
 * for rework. The command never looked at the code.
 *
 * The opposite mistake is worse, so the patterns are narrow: if a genuine test
 * failure were called environmental, an autonomous supervisor could retry
 * broken code forever.
 */
describe("a daemon that is not running is an environment fault", () => {
  it("recognises the container runtimes saying their daemon is unreachable", () => {
    for (const stderr of [
      "unable to get image 'postgres:16-alpine': failed to connect to the docker API at unix:///",
      "Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?",
      "docker: error during connect: Get http://%2Fvar%2Frun%2Fdocker.sock/v1.24/version: dial unix",
      "Cannot connect to the Podman socket",
    ]) {
      expect(isEnvironmentFailure(1, stderr), stderr.slice(0, 40)).toBe(true);
    }
  });

  it("still recognises a missing binary", () => {
    expect(isEnvironmentFailure(127, "")).toBe(true);
    expect(isEnvironmentFailure(1, "sh: tsc: command not found")).toBe(true);
  });

  it("does NOT call a real test failure environmental", () => {
    // The dangerous direction. An app whose own test could not reach a service
    // it was meant to start has a genuine defect, and auto-retrying it would
    // burn a budget on code nobody has fixed.
    for (const stderr of [
      "Error: connect ECONNREFUSED 127.0.0.1:5432",
      "AssertionError: expected 200 to equal 500",
      "FAIL src/api.test.ts > creates a booking",
      "psql: error: connection to server failed",
    ]) {
      expect(isEnvironmentFailure(1, stderr), stderr.slice(0, 40)).toBe(false);
    }
  });

  it("a passing command is never an environment fault", () => {
    expect(isEnvironmentFailure(0, "Cannot connect to the Docker daemon")).toBe(false);
  });
});
