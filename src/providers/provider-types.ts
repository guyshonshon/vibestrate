export type ProviderRunResult = {
  providerId: string;
  command: string;
  args: string[];
  cwd: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  startedAt: string;
  endedAt: string;
};

export type ProviderRunInput = {
  providerId: string;
  prompt: string;
  cwd: string;
  env?: Record<string, string>;
  /**
   * Absolute path to a materialized `mcp.json` (see `src/mcp/mcp-config-writer`).
   * When set, providers wire it through to the underlying CLI:
   *  - `claude-code` adds `--mcp-config <path>` automatically,
   *  - every provider also exports `AMACO_MCP_CONFIG=<path>` in the
   *    child environment so custom CLI providers can opt in via env.
   */
  mcpConfigPath?: string;
};
