import type { PermissionProfile, PermissionProfilesMap } from "./permission-schema.js";

export const builtinPermissionProfiles: PermissionProfilesMap = {
  read_only: {
    allowWrite: false,
    allowShell: false,
    cwd: "worktree",
  },
  code_write: {
    allowWrite: true,
    allowShell: true,
    cwd: "worktree",
    forbiddenPaths: [".env", ".env.*"],
    forbiddenOperations: ["push", "merge", "delete-worktree"],
  },
  review_only: {
    allowWrite: false,
    allowShell: false,
    cwd: "worktree",
  },
  verify_only: {
    allowWrite: false,
    allowShell: false,
    cwd: "worktree",
  },
};

export function resolveProfile(
  profiles: PermissionProfilesMap,
  name: string,
): PermissionProfile {
  const fromConfig = profiles[name];
  if (fromConfig) return fromConfig;
  const builtin = builtinPermissionProfiles[name];
  if (builtin) return builtin;
  throw new Error(`Unknown permission profile: ${name}`);
}
