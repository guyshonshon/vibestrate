import { z } from "zod";

export const cwdPolicySchema = z.enum(["project-root", "worktree"]);
export type CwdPolicy = z.infer<typeof cwdPolicySchema>;

export const permissionProfileSchema = z.object({
  allowWrite: z.boolean().default(false),
  allowShell: z.boolean().default(false),
  cwd: cwdPolicySchema.default("worktree"),
  forbiddenPaths: z.array(z.string()).optional(),
  forbiddenOperations: z.array(z.string()).optional(),
});

export type PermissionProfile = z.infer<typeof permissionProfileSchema>;

export const permissionProfilesSchema = z.record(z.string(), permissionProfileSchema);
export type PermissionProfilesMap = z.infer<typeof permissionProfilesSchema>;
