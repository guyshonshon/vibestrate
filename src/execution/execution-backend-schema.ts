import { z } from "zod";

export const executionBackendIdSchema = z.enum([
  "local-worktree",
  "docker",
  "remote-sandbox",
  "cloud-runner",
]);

export type ExecutionBackendId = z.infer<typeof executionBackendIdSchema>;

// Provider-native OS sandbox posture. "off" = today's behavior:
// the run is isolated by the git worktree + the post-turn diff gate, but the
// provider's own shell tools can read/write anywhere the host user can. When
// "sandboxed", the orchestrator asks each turn's provider for an OS-level
// filesystem sandbox where the provider actually enforces one (codex's Seatbelt
// `--sandbox`); providers without a real sandbox flag run unsandboxed and the
// run warns once rather than pretending. Default OFF - confinement is opt-in.
export const isolationModeSchema = z.enum(["off", "sandboxed"]);

export type IsolationMode = z.infer<typeof isolationModeSchema>;

// Container backend. Opt-in disposable-container execution: the
// agent's provider turns run inside a throwaway Docker container whose blast
// radius is the container, independent of the provider (the model-agnostic
// isolation a provider-native sandbox can't give - that only covers its OWN
// process). `image` must carry the provider CLI(s) the run uses (the host binary
// is the wrong arch). `onUnavailable` is FAIL by construction: if Docker is
// absent/down we refuse rather than silently run on the host while claiming a
// sandbox (that would be theater). Set it to "degrade" to opt into host fallback.
export const containerConfigSchema = z.object({
  image: z.string().min(1).max(400).default("node:22-bookworm-slim"),
  onUnavailable: z.enum(["fail", "degrade"]).default("fail"),
  // Hardening. `readonlyRoot` mounts the container root read-only (only the
  // worktree, tmpfs /tmp, and a tmpfs HOME are writable), so a rogue agent's
  // blast radius shrinks to disposable surfaces. Default on for the stock
  // node:22 image; a custom image whose CLI writes outside /tmp or $HOME may
  // need it off. `pidsLimit` caps in-container processes (fork-bomb guard).
  readonlyRoot: z
    .boolean()
    .default(true)
    .describe(
      "Mount the run container root filesystem read-only (default on). Writable: the worktree, tmpfs /tmp, and tmpfs /root (the stock node:22 image HOME). Set false for a custom image that runs as a non-root user or writes outside /tmp and $HOME - the run start probes HOME writability and fails loudly otherwise.",
    ),
  pidsLimit: z
    .number()
    .int()
    .min(1)
    .max(100000)
    .default(512)
    .describe("Max processes inside the run container (fork-bomb guard; default 512)."),
});

export type ContainerConfig = z.infer<typeof containerConfigSchema>;

export const executionConfigSchema = z.object({
  backend: executionBackendIdSchema.default("local-worktree").describe("Where runs execute (default local-worktree)."),
  isolation: isolationModeSchema.default("off").describe("OS sandbox posture: off or sandboxed (default off)."),
  container: containerConfigSchema.default({}).describe("Container backend settings (used when backend=docker)."),
});

export type ExecutionConfig = z.infer<typeof executionConfigSchema>;

/** The intended in-environment spawn a turn wants to run. */
export type ExecSpec = {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
};

/**
 * How a backend actually runs a command. `local-worktree` returns none (runs on
 * the host, unchanged). `docker` returns a strategy that rewrites the spawn into
 * `docker exec` against the run's container. A future `cloud-runner` returns one
 * that runs it remotely - the orchestrator stays backend-agnostic. `location` is
 * the HONEST record of where the command ran (for the assurance posture).
 */
export type ExecStrategy = {
  location: "host" | "container" | "remote";
  /** Rewrite an intended in-environment spawn into the actual host spawn. */
  wrap(spec: ExecSpec): { command: string; args: string[]; env: Record<string, string> };
};

export type PreparedExecution = {
  worktreePath: string;
  branchName: string;
  /** Set by backends that run commands off-host (docker/cloud); the orchestrator
   *  threads it into every provider turn. Absent ⇒ run on the host as before. */
  exec?: ExecStrategy;
  /** Backend-owned teardown handle (e.g. the container id) for cleanup. */
  teardown?: () => Promise<void>;
};

export type ExecutionBackend = {
  id: ExecutionBackendId;
  prepareRun(input: PrepareRunInput): Promise<PreparedExecution>;
  cleanup?(input: CleanupInput): Promise<void>;
};

export type PrepareRunInput = {
  projectRoot: string;
  runId: string;
  branchPrefix: string;
  worktreeDir: string;
  mainBranch: string;
};

export type CleanupInput = {
  projectRoot: string;
  worktreePath: string;
};
