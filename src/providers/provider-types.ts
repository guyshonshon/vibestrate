import type { ResolvedCatalog, SandboxMode } from "./provider-apply.js";

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
  /**
   * The OS-level filesystem sandbox that was ACTUALLY applied to this turn, or
   * null/absent when none was. Set only when the provider injected a real,
   * verified sandbox flag (codex `--sandbox`) - never when a sandbox was
   * requested but the provider has none. Downstream audit/UI reports isolation
   * from this, so it can't over-claim confinement that didn't happen.
   */
  appliedSandbox?: SandboxMode | null;
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
  /**
   * Whether this turn's resolved (post-override) permission profile allows
   * writes (`profile.allowWrite`). Providers that gate file edits behind their
   * own permission system translate this into the right CLI flag - e.g. the
   * `claude-code` provider injects `--permission-mode acceptEdits` so a headless
   * `claude -p` can apply edits without an interactive grant. Read-only,
   * investigation, and strict-apply-only turns resolve to `false` here, so they
   * get no write grant. Omitted = treat as not write-capable (no grant), which
   * preserves behavior for non-orchestrator callers (assist, setup probe, etc.).
   */
  allowWrite?: boolean;
  /**
   * Harden a READ-ONLY turn at the CLI's own permission layer (opt-in,
   * `policies.hardenReadOnlySeats`). When true AND this turn is not write-capable
   * (`allowWrite` falsy), a provider that has a read-only/plan permission mode
   * runs in it - the `claude-code` provider injects `--permission-mode plan` so
   * the CLI enforces no-write rather than relying on its headless default.
   * Ignored by providers without such a mode, and a no-op on write-capable turns
   * (those resolve their write grant from `allowWrite`). Omitted = off.
   */
  hardenReadOnly?: boolean;
  /**
   * Requested OS-level filesystem sandbox for this turn (T14 slice 1), or
   * null/omitted for none. Set by the orchestrator only when
   * `execution.isolation` is "sandboxed": a write-capable seat asks for
   * "workspace-write" (writes confined to the worktree/cwd), a read-only seat
   * for "read-only". Providers that enforce a real OS sandbox (codex) translate
   * this into their flag; providers without one ignore it and the run warns
   * once - it is a request, honored only where verifiably real.
   */
  sandbox?: SandboxMode | null;
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
  /**
   * Resolved wall-clock timeout for this turn (the profile's `timeoutMs`).
   * When set, the provider CLI's whole process group is tree-killed if it
   * exceeds this - so an internally-fanned-out turn ("opaque box") can't hang
   * unbounded. Omitted = no wall-clock cap.
   */
  timeoutMs?: number | null;
};
