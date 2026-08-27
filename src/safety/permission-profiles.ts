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
    // ADVISORY, not enforcement. These two lists are rendered into the agent's
    // prompt (prompt-builder.ts) and read by nothing else - a seat with
    // `allowShell` can run whatever it likes, and intercepting that would mean
    // sandboxing the process, which is what the Docker execution backend is
    // for. Naming them "forbidden" and stopping there would be worse than
    // omitting them, because they surface as configuration and read as gates.
    //
    // What actually holds these lines is structural and elsewhere:
    //   push   - no code path in Vibestrate runs `git push`, pinned by
    //            tests/no-push-path.test.ts
    //   merge  - a merge to main is refused without an explicit confirmation
    //            (integration-service.ts), and the broker treats `git.merge` as
    //            its most irreversible effect
    //   .env   - secret-like paths are refused on read (isSecretLikePath) and
    //            secret-shaped patches on write (checkPatchSafety)
    // tests/permission-profiles.test.ts pins that this field is advisory, so
    // nobody later builds a guarantee on top of it.
    forbiddenPaths: [".env", ".env.*"],
    forbiddenOperations: ["push", "merge", "delete-worktree"],
  },
  review_only: {
    allowWrite: false,
    allowShell: false,
    cwd: "worktree",
  },
  // A reviewer that can RUN the work it judges: shell yes, writes no. For the
  // claude-code provider this is enforced at the tool layer (the edit tools are
  // disallowed on the CLI invocation), not by prompt discipline. Honest limit:
  // a shell can still write files through redirection - the worktree is
  // disposable and the diff is the audit trail; the hard lines (no push, no
  // merge) are held structurally elsewhere, see the code_write comment above.
  review_exec: {
    allowWrite: false,
    allowShell: true,
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
