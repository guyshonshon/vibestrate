import { z } from "zod";

export const executionBackendIdSchema = z.enum([
  "local-worktree",
  "docker",
  "remote-sandbox",
  "cloud-runner",
]);

export type ExecutionBackendId = z.infer<typeof executionBackendIdSchema>;

// Provider-native OS sandbox posture (T14 slice 1). "off" = today's behavior:
// the run is isolated by the git worktree + the post-turn diff gate, but the
// provider's own shell tools can read/write anywhere the host user can. When
// "sandboxed", the orchestrator asks each turn's provider for an OS-level
// filesystem sandbox where the provider actually enforces one (codex's Seatbelt
// `--sandbox`); providers without a real sandbox flag run unsandboxed and the
// run warns once rather than pretending. Default OFF - confinement is opt-in.
export const isolationModeSchema = z.enum(["off", "sandboxed"]);

export type IsolationMode = z.infer<typeof isolationModeSchema>;

export const executionConfigSchema = z.object({
  backend: executionBackendIdSchema.default("local-worktree").describe("Where runs execute (default local-worktree)."),
  isolation: isolationModeSchema.default("off").describe("OS sandbox posture: off or sandboxed (default off)."),
});

export type ExecutionConfig = z.infer<typeof executionConfigSchema>;

export type PreparedExecution = {
  worktreePath: string;
  branchName: string;
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
