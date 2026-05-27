import { z } from "zod";
import { mcpServerSchema } from "../mcp/mcp-schema.js";

export const roleConfigSchema = z.object({
  provider: z.string().min(1),
  prompt: z.string().min(1),
  permissions: z.string().min(1),
  skills: z.array(z.string()).default([]),
  // Optional MCP servers the agent declares directly. Merged with
  // servers contributed by its skills at run time (`src/mcp`).
  mcpServers: z.record(z.string().min(1), mcpServerSchema).default({}),
});

export type RoleConfig = z.infer<typeof roleConfigSchema>;

export const rolesConfigSchema = z.record(z.string(), roleConfigSchema);
export type RolesConfigMap = z.infer<typeof rolesConfigSchema>;

export const builtinRoleIds = [
  "planner",
  "architect",
  "executor",
  "fixer",
  "reviewer",
  "verifier",
] as const;

export type BuiltinRoleId = (typeof builtinRoleIds)[number];
