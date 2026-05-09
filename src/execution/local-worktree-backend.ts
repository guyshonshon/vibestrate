import type {
  ExecutionBackend,
  PrepareRunInput,
  PreparedExecution,
} from "./execution-backend-schema.js";
import { prepareWorktree } from "../git/worktree.js";

export const localWorktreeBackend: ExecutionBackend = {
  id: "local-worktree",
  async prepareRun(input: PrepareRunInput): Promise<PreparedExecution> {
    return prepareWorktree({
      projectRoot: input.projectRoot,
      runId: input.runId,
      branchPrefix: input.branchPrefix,
      worktreeDir: input.worktreeDir,
      startPoint: input.mainBranch,
    });
  },
};
