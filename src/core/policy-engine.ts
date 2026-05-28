import path from "node:path";
import { PolicyError } from "../utils/errors.js";
import { pathExists } from "../utils/fs.js";
import { resolveProfile } from "../permissions/permission-profiles.js";
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

  if (config.policies.forbidAutoPush && config.git.allowAutoPush) {
    throw new PolicyError(
      "Auto-push is enabled in git config but policies forbid it. Run `vibestrate config set git.allowAutoPush false`. Vibestrate never pushes for you.",
    );
  }
  if (config.policies.forbidAutoMerge && config.git.allowAutoMerge) {
    throw new PolicyError(
      "Auto-merge is enabled in git config but policies forbid it. Run `vibestrate config set git.allowAutoMerge false`. Vibestrate never merges for you.",
    );
  }

  for (const [roleId, agent] of Object.entries(config.roles)) {
    const profile = resolveProfile(config.permissions.profiles, agent.permissions);
    if (profile.allowWrite && profile.cwd !== "worktree") {
      throw new PolicyError(
        `Agent "${roleId}" can write code, but its permission profile "${agent.permissions}" runs in "${profile.cwd}". Write-enabled agents must run inside the worktree to keep changes isolated. Run \`vibestrate config set permissions.profiles.${agent.permissions}.cwd worktree\`.`,
      );
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
        "No validation commands configured. Reviews are stronger when Vibestrate can run your real checks. Add some with `vibestrate doctor --fix` or `vibestrate config set commands.validate \"[...]\"`.",
    });
  }

  return { warnings };
}
