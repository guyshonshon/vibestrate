import { ConfigError } from "../utils/errors.js";
import type { AgentConfig, AgentsConfigMap } from "./agent-schema.js";

export function getAgentConfig(
  agents: AgentsConfigMap,
  agentId: string,
): AgentConfig {
  const cfg = agents[agentId];
  if (!cfg) {
    throw new ConfigError(`Agent "${agentId}" is not defined in project config.`);
  }
  return cfg;
}

export function listAgentIds(agents: AgentsConfigMap): string[] {
  return Object.keys(agents);
}
