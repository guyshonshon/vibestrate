// Pre-run preflight gate: refuses a run whose configuration would let an agent
// write outside an isolated git worktree, and returns everything else it finds
// as warnings for the caller to surface.
//
// The two refusals are deliberate rather than advisory. A role whose permission
// profile grants writes but whose cwd is not "worktree" would edit the project
// checkout directly, and a non-git project has no worktree to isolate into - in
// both cases a warning would arrive after the damage. Warnings carry a `code`
// next to the message so a caller can branch on it without matching prose.

import path from "node:path";
import { PolicyError } from "../utils/errors.js";
import { pathExists } from "../utils/fs.js";
import { resolveProfile } from "../safety/permission-profiles.js";
import { loadPolicySnapshot } from "../policies/policy-store.js";
import type { ProjectConfig } from "../project/config-schema.js";

export type PolicyWarning = {
  code: string;
  message: string;
};

export type PolicyResult = {
  warnings: PolicyWarning[];
};

const ENV_FILES = [".env", ".env.local", ".env.development", ".env.production"];

/**
 * Describe a run that will execute with nothing bounding it: unattended (no
 * human at any gate), no budget ceiling, and no OS/container confinement. None
 * of those is wrong on its own - unattended runs are a feature and confinement
 * is opt-in by design - but all three at once means an overnight run has no
 * automatic stop and only the worktree + diff gate between it and the machine.
 *
 * Pure and exported so the preflight (event log, dashboard) and the CLI
 * (printed BEFORE the run starts, while the user can still act on it) say the
 * same thing from one source instead of drifting.
 */
export function describeUnboundedRun(input: {
  config: ProjectConfig;
  unattended: boolean;
}): PolicyWarning | null {
  if (!input.unattended) return null;
  const { budget, execution } = input.config;
  const hasCeiling =
    budget.spendCapDailyUsd !== null ||
    budget.maxTurnsPerRun !== null ||
    budget.maxWallClockMinPerRun !== null ||
    budget.maxTurnsPerDay !== null ||
    budget.maxWallClockMinPerDay !== null;
  const confined =
    execution.backend !== "local-worktree" || execution.isolation !== "off";
  if (hasCeiling || confined) return null;
  return {
    code: "UNBOUNDED_UNATTENDED_RUN",
    message:
      "Unattended run with no budget ceiling and no confinement: nothing will stop it automatically, and only the worktree + diff gate bound what it touches. Set a ceiling (`vibe budget set --max-turns-run 40`) or turn on confinement (`vibe config set execution.isolation sandboxed`, or `execution.backend docker`).",
  };
}

export async function runPreflightChecks(input: {
  projectRoot: string;
  config: ProjectConfig;
  isGitRepo: boolean;
  /** Unattended runs answer no gate; used for the unbounded-run advisory. */
  unattended?: boolean;
}): Promise<PolicyResult> {
  const { projectRoot, config, isGitRepo } = input;
  const warnings: PolicyWarning[] = [];

  if (!isGitRepo) {
    throw new PolicyError(
      `Vibestrate requires a git repository. ${projectRoot} is not inside a git repo.`,
    );
  }

  // A policy set that did not fully load is a SILENT loss of protection: a
  // malformed file contributes no rules, and a duplicate id drops the later
  // definition (first occurrence wins) - so the stricter rule someone just
  // added can vanish while `vibe policies list` still looks populated. Nothing
  // downstream can detect this: the broker only ever sees the rules that DID
  // load, and a rule that never loaded leaves no trace in the action log or the
  // assurance verdict. Refuse the run instead, and name the fix.
  const policySet = await loadPolicySnapshot(projectRoot);
  if (policySet.malformedFiles.length > 0 || policySet.duplicateIds.length > 0) {
    const problems: string[] = [];
    for (const m of policySet.malformedFiles) {
      problems.push(`  ${path.basename(m.file)}: ${m.reason}`);
    }
    if (policySet.duplicateIds.length > 0) {
      problems.push(
        `  duplicate id(s) defined more than once (only the first is loaded): ${policySet.duplicateIds.join(", ")}`,
      );
    }
    throw new PolicyError(
      `Refusing to start: the policy set in .vibestrate/policies/ did not fully load, so rules you think are active may not be.\n${problems.join("\n")}\nFix them (details: \`vibe policies doctor\`), then start the run again.`,
    );
  }

  for (const [crewId, crew] of Object.entries(config.crews)) {
    for (const [roleId, role] of Object.entries(crew.roles)) {
      const profile = resolveProfile(config.permissions.profiles, role.permissions);
      if (profile.allowWrite && profile.cwd !== "worktree") {
        throw new PolicyError(
          `Role "${roleId}" (crew "${crewId}") can write code, but its permission profile "${role.permissions}" runs in "${profile.cwd}". Write-enabled roles must run inside the worktree to keep changes isolated. Run \`vibe config set permissions.profiles.${role.permissions}.cwd worktree\`.`,
        );
      }
    }
  }

  for (const envFile of ENV_FILES) {
    const candidate = path.join(projectRoot, envFile);
    if (await pathExists(candidate)) {
      warnings.push({
        code: "ENV_FILE_PRESENT",
        message: `${envFile} is present. Vibestrate never reads its contents into prompts; just be sure your agents do not edit it.`,
      });
    }
  }

  if (config.commands.validate.length === 0) {
    warnings.push({
      code: "NO_VALIDATION_COMMANDS",
      message:
        "No validation commands configured. Reviews are stronger when Vibestrate can run your real checks. Add some with `vibe doctor --fix` or `vibe config set commands.validate \"[...]\"`.",
    });
  }

  const unbounded = describeUnboundedRun({
    config,
    unattended: input.unattended ?? false,
  });
  if (unbounded) warnings.push(unbounded);

  return { warnings };
}
