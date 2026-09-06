import { describe, it, expect } from "vitest";
import { validationSatisfied, computeMergeReady } from "../src/core/run/merge-readiness.js";
import type { ValidationSummary } from "../src/core/validation/validation-runner.js";

/**
 * The invariant: a run that verified NOTHING must not read as a run that passed.
 *
 * `ValidationSummary.failed` is `total - passed - environment`, so a bare
 * worktree - every command exiting "command not found" - produced `failed === 0`
 * and merged on evidence it never gathered. Nothing tested either predicate
 * before this file: every prior test set `validationPassed` as a literal.
 */
const summary = (p: Partial<ValidationSummary>): ValidationSummary => ({
  total: 0,
  passed: 0,
  failed: 0,
  environment: 0,
  ...p,
});

describe("validationSatisfied", () => {
  it("refuses a run where every command could not start", () => {
    // A bare worktree: 4 configured commands, all "command not found".
    expect(validationSatisfied(summary({ total: 4, environment: 4 }))).toBe(false);
  });

  it("refuses one where a command genuinely failed", () => {
    expect(validationSatisfied(summary({ total: 2, passed: 1, failed: 1 }))).toBe(false);
  });

  it("accepts a clean run", () => {
    expect(validationSatisfied(summary({ total: 3, passed: 3 }))).toBe(true);
  });

  it("accepts a partial run: weak evidence is still evidence", () => {
    // A JS suite ran and passed; a Python one had no virtualenv. The count
    // reaches the reviewer's prompt, so the weakness is judged, not hidden.
    expect(validationSatisfied(summary({ total: 3, passed: 2, environment: 1 }))).toBe(true);
  });

  it("accepts no validation at all, which is a real answer and not a vacuous one", () => {
    expect(validationSatisfied(null)).toBe(true);
    expect(validationSatisfied(summary({}))).toBe(true);
  });
});

describe("merge readiness with nothing checked", () => {
  const base = {
    readOnly: false,
    reviewDecision: "APPROVED" as const,
    hasReviewStep: true,
    reviewTurnRan: true,
    reviewSkipEvidence: null,
    verified: false,
    // Irrelevant while `verified` is false; the predicate under test is
    // validation, not verification.
    verificationDecision: "PASSED" as const,
  };

  it("does not merge a run whose whole toolchain was missing", () => {
    const nothingRan = summary({ total: 4, environment: 4 });
    expect(
      computeMergeReady({ ...base, validationPassed: validationSatisfied(nothingRan) }),
    ).toBe(false);
  });

  it("still merges the same run once its commands actually pass", () => {
    const allPassed = summary({ total: 4, passed: 4 });
    expect(
      computeMergeReady({ ...base, validationPassed: validationSatisfied(allPassed) }),
    ).toBe(true);
  });
});

describe("the env-link exposure is stated at preflight", () => {
  it("warns when links are on, a run can write, and there is something to link", async () => {
    const { runPreflightChecks } = await import("../src/core/policy-engine.js");
    const { loadConfig } = await import("../src/project/config-loader.js");
    const os = await import("node:os");
    const path = await import("node:path");
    const fs = await import("node:fs/promises");

    const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "vibe-pf-")));
    try {
      const { applySetup } = await import("../src/setup/setup-service.js");
      await applySetup({
        options: { projectRoot: dir },
        detectionRunner: async () => ({ stdout: "", stderr: "", exitCode: 1, durationMs: 0 }),
      });
      // Something to link. The warning is about a real exposure, so it stays
      // quiet on a project with no environment directory to link.
      await fs.mkdir(path.join(dir, "node_modules"), { recursive: true });
      const { config } = await loadConfig(dir);

      const on = await runPreflightChecks({ projectRoot: dir, config, isGitRepo: true });
      expect(on.warnings.map((w) => w.code)).toContain("ENV_LINK_WRITABLE");

      // Off: nothing is linked, so there is nothing to say.
      const off = await runPreflightChecks({
        projectRoot: dir,
        config: { ...config, git: { ...config.git, linkEnvironment: "off" as const } },
        isGitRepo: true,
      });
      expect(off.warnings.map((w) => w.code)).not.toContain("ENV_LINK_WRITABLE");

      // Read-only: the run cannot write through the link, so neither is there.
      const ro = await runPreflightChecks({
        projectRoot: dir,
        config: {
          ...config,
          policies: { ...config.policies, defaultPermissionMode: "read-only" as const },
        },
        isGitRepo: true,
      });
      expect(ro.warnings.map((w) => w.code)).not.toContain("ENV_LINK_WRITABLE");
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
