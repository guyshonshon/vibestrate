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
import type { ProjectConfig } from "../project/config-schema.js";

export type PolicyWarning = {
  code: string;
  message: string;
};

export type PolicyResult = {
  warnings: PolicyWarning[];
};

const ENV_FILES = [".env", ".env.local", ".env.development", ".env.production"];

export async function runPreflightChecks(input: {
  projectRoot: string;
  config: ProjectConfig;
  isGitRepo: boolean;
}): Promise<PolicyResult> {
  const { projectRoot, config, isGitRepo } = input;
  const warnings: PolicyWarning[] = [];

  if (!isGitRepo) {
    throw new PolicyError(
      `Vibestrate requires a git repository. ${projectRoot} is not inside a git repo.`,
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

  return { warnings };
}
