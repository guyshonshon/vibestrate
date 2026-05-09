import { z } from "zod";

export const executionBackendIdSchema = z.enum([
  "local-worktree",
  "docker",
  "remote-sandbox",
  "cloud-runner",
]);

export type ExecutionBackendId = z.infer<typeof executionBackendIdSchema>;

export const executionConfigSchema = z.object({
  backend: executionBackendIdSchema.default("local-worktree"),
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
