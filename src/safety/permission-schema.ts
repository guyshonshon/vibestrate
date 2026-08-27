import { z } from "zod";

export const cwdPolicySchema = z.enum(["project-root", "worktree"]);
export type CwdPolicy = z.infer<typeof cwdPolicySchema>;

export const permissionProfileSchema = z.object({
  allowWrite: z.boolean().default(false),
  allowShell: z.boolean().default(false),
  cwd: cwdPolicySchema.default("worktree"),
  forbiddenPaths: z.array(z.string()).optional(),
  forbiddenOperations: z.array(z.string()).optional(),
  /**
   * Command grants for a shell-capable seat, as claude-code tool rules
   * (`Bash(pnpm test:*)`, or bare `Bash` for everything). Omitted =
   * derive the grant from the project's own `commands.validate`, so a seat can
   * run the checks the project already declares and nothing else by default.
   *
   * This is a GRANT, not a sandbox: any interpreter in the list is a full
   * shell (`node -e ...`), so the value here is blast-radius-by-default and an
   * auditable record of what a seat was allowed to run - never containment.
   * Real containment is `execution.isolation` and the container backend.
   */
  allowedCommands: z.array(z.string().min(1)).nullable().default(null),
});

export type PermissionProfile = z.infer<typeof permissionProfileSchema>;

export const permissionProfilesSchema = z.record(z.string(), permissionProfileSchema);
export type PermissionProfilesMap = z.infer<typeof permissionProfilesSchema>;
