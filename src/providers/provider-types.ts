import type { ResolvedCatalog } from "./provider-apply.js";

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
  /**
   * Session reuse is opt-in per provider adapter. One-shot generic CLIs
   * leave this unset and the Flow runner falls back to artifact handoffs.
   */
  session?: ProviderSessionResult | null;
};

export type ProviderStreamChunk = {
  stream: "stdout" | "stderr";
  chunk: string;
  at: string;
};

export type ProviderSessionReuse = "none" | "resume";

export type ProviderCapabilities = {
  providerType: string;
  sessionReuse: ProviderSessionReuse;
  interactiveSessions: boolean;
  reportsSessionId: boolean;
  reportsTokenUsage: boolean;
};

export type ProviderSessionRequest = {
  action: "open" | "resume";
  sessionId: string;
};

export type ProviderSessionResult = {
  action: "opened" | "reused";
  sessionId: string | null;
};

export type ProviderRunInput = {
  providerId: string;
  prompt: string;
  cwd: string;
  env?: Record<string, string>;
  /** Resolved profile knobs for this turn, applied to the spawn where the
   *  provider supports it (see provider-apply.ts). Advisory otherwise. */
  model?: string | null;
  effort?: string | null;
  maxTokens?: number | null;
  /** Resolved capability catalog (built-in merged with the project's
   *  `.vibestrate/providers-catalog.yml` overlay). When set, the provider applies
   *  model/effort from this instead of the built-in defaults. Omitted = built-in. */
  catalog?: ResolvedCatalog;
  /** Provider-native session turn request for a Flow participant. */
  session?: ProviderSessionRequest;
  /**
   * Absolute path to a materialized `mcp.json` (see `src/mcp/mcp-config-writer`).
   * When set, providers wire it through to the underlying CLI:
   *  - `claude-code` adds `--mcp-config <path>` automatically,
   *  - every provider also exports `VIBESTRATE_MCP_CONFIG=<path>` in the
   *    child environment so custom CLI providers can opt in via env.
   */
  mcpConfigPath?: string;
  /**
   * Optional hook fired as the provider's CLI writes output. Each
   * call carries a small chunk that has *not* been parsed or trimmed
   * - callers can use it to materialize a live log file or stream
   * the bytes to a connected UI in real time.
   *
   * The provider runner still returns the full buffered stdout/stderr
   * on completion, so this is additive and never lossy.
   */
  onChunk?: (chunk: ProviderStreamChunk) => void;
  /**
   * Optional AbortSignal - when it fires, the provider CLI subprocess
   * is killed (SIGTERM). Used by the orchestrator to honor "vibe abort"
   * mid-stage instead of waiting for the current provider call to
   * finish on its own.
   */
  signal?: AbortSignal;
};
