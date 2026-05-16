import { z } from "zod";
import { mcpServerSchema } from "../mcp/mcp-schema.js";

export const agentConfigSchema = z.object({
  provider: z.string().min(1),
  prompt: z.string().min(1),
  permissions: z.string().min(1),
  skills: z.array(z.string()).default([]),
  // Optional MCP servers the agent declares directly. Merged with
  // servers contributed by its skills at run time (`src/mcp`).
  mcpServers: z.record(z.string().min(1), mcpServerSchema).default({}),
});

export type AgentConfig = z.infer<typeof agentConfigSchema>;

export const agentsConfigSchema = z.record(z.string(), agentConfigSchema);
export type AgentsConfigMap = z.infer<typeof agentsConfigSchema>;

export const builtinAgentIds = [
  "planner",
  "architect",
  "executor",
  "fixer",
  "reviewer",
  "verifier",
] as const;

export type BuiltinAgentId = (typeof builtinAgentIds)[number];
