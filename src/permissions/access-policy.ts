import { PolicyError } from "../utils/errors.js";
import type { PermissionProfile } from "./permission-schema.js";

export type AccessContext = {
  agentId: string;
  profile: PermissionProfile;
  projectRoot: string;
  worktreePath: string | null;
};

export function assertExecutableContext(ctx: AccessContext): void {
  if (ctx.profile.allowWrite && ctx.profile.cwd !== "worktree") {
    throw new PolicyError(
      `Agent "${ctx.agentId}" has write permissions but is configured to run in ${ctx.profile.cwd}. Write-enabled agents must run inside the worktree.`,
    );
  }

  if (ctx.profile.cwd === "worktree" && !ctx.worktreePath) {
    throw new PolicyError(
      `Agent "${ctx.agentId}" requires a worktree but none has been prepared.`,
    );
  }
}

export function resolveCwd(ctx: AccessContext): string {
  if (ctx.profile.cwd === "worktree") {
    if (!ctx.worktreePath) {
      throw new PolicyError(`Worktree not prepared for agent "${ctx.agentId}".`);
    }
    return ctx.worktreePath;
  }
  return ctx.projectRoot;
}
