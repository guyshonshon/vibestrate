import type { PermissionProfile, PermissionProfilesMap } from "./permission-schema.js";

export const builtinPermissionProfiles: PermissionProfilesMap = {
  read_only: {
    allowWrite: false,
    allowShell: false,
    cwd: "worktree",
    allowedCommands: null,
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
    allowedCommands: null,
  },
  review_only: {
    allowWrite: false,
    allowShell: false,
    cwd: "worktree",
    allowedCommands: null,
  },
  // A reviewer that can RUN the work it judges: shell yes, edit tools no.
  //
  // HONEST LIMIT, stated precisely because an earlier version of this comment
  // overclaimed: this is NOT "shell without writes". Dropping Edit/Write from
  // the invocation removes the ergonomic path and keeps intent legible in the
  // transcript, but `echo > f` or `sed -i` writes just fine - it is friction,
  // not a boundary. What actually holds the line is that a shell-capable turn
  // is diff-gated exactly like a write-capable one (role-turn.ts snapshots on
  // `allowWrite || allowShell`), so its changes are captured, secret-scanned,
  // brokered and rollback-able. Containment of what a command can reach on the
  // host is `execution.isolation`, not this field.
  review_exec: {
    allowWrite: false,
    allowShell: true,
    cwd: "worktree",
    // null = derive from the project's own commands.validate plus read-only
    // inspection (see command-grants.ts). A project can widen it per profile.
    allowedCommands: null,
  },
  verify_only: {
    allowWrite: false,
    allowShell: false,
    cwd: "worktree",
    allowedCommands: null,
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
