import { z } from "zod";

export const agentConfigSchema = z.object({
  provider: z.string().min(1),
  prompt: z.string().min(1),
  permissions: z.string().min(1),
  skills: z.array(z.string()).default([]),
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
