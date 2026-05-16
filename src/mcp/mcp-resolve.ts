import path from "node:path";
import { pathExists, readText } from "../utils/fs.js";
import {
  mcpServersFileSchema,
  type McpServerConfig,
  type McpServersMap,
} from "./mcp-schema.js";

export type McpSource = "agent" | `skill:${string}`;

export type ResolvedMcpServer = {
  name: string;
  source: McpSource;
  config: McpServerConfig;
};

export type McpResolveInput = {
  agentServers: McpServersMap | undefined;
  skills: ReadonlyArray<{ name: string; servers: McpServersMap }>;
};

export type McpResolveResult = {
  servers: ResolvedMcpServer[];
  /**
   * Names where multiple sources supplied a server with the same key.
   * We keep the first writer (agent > earlier-listed skill) and report
   * the rest in `collisions` so the orchestrator can surface them.
   */
  collisions: Array<{ name: string; keptSource: McpSource; ignoredSource: McpSource }>;
};

/**
 * Merge MCP server declarations from the agent and its attached skills
 * into a single name → config map. Pure: no I/O.
 *
 * Precedence: agent definitions win over skill definitions; earlier
 * skills in the input array win over later ones. Same precedence the
 * `agent.skills` list already uses elsewhere.
 */
export function resolveMcpServers(input: McpResolveInput): McpResolveResult {
  const servers: ResolvedMcpServer[] = [];
  const collisions: McpResolveResult["collisions"] = [];
  const seen = new Map<string, McpSource>();

  const add = (name: string, source: McpSource, config: McpServerConfig): void => {
    const existing = seen.get(name);
    if (existing) {
      collisions.push({ name, keptSource: existing, ignoredSource: source });
      return;
    }
    seen.set(name, source);
    servers.push({ name, source, config });
  };

  for (const [name, cfg] of Object.entries(input.agentServers ?? {})) {
    add(name, "agent", cfg);
  }
  for (const skill of input.skills) {
    for (const [name, cfg] of Object.entries(skill.servers)) {
      add(name, `skill:${skill.name}`, cfg);
    }
  }
  return { servers, collisions };
}

/**
 * Read a `.mcp.json` file next to a skill's `SKILL.md`. Returns an empty
 * map when the file is absent. Validates against the schema; invalid
 * files throw so misconfiguration surfaces as a config error rather
 * than silently launching nothing.
 */
export async function readSkillMcpServers(
  skillFilePath: string,
): Promise<McpServersMap> {
  const dir = path.dirname(skillFilePath);
  const candidate = path.join(dir, ".mcp.json");
  if (!(await pathExists(candidate))) return {};
  const raw = await readText(candidate);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Skill .mcp.json at ${candidate} is not valid JSON: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  const result = mcpServersFileSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Skill .mcp.json at ${candidate} failed validation: ${result.error.message}`,
    );
  }
  return result.data.mcpServers;
}

/**
 * Serialize a resolved server set back to the `.mcp.json` on-disk shape.
 * Pure helper used by the config-writer; exposed for tests.
 */
export function buildMcpConfigFile(servers: ReadonlyArray<ResolvedMcpServer>): {
  mcpServers: McpServersMap;
} {
  const out: McpServersMap = {};
  for (const s of servers) out[s.name] = s.config;
  return { mcpServers: out };
}
