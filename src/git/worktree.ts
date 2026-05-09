import { createWorktree, resolveWorktreePath } from "./git.js";

export type WorktreePreparation = {
  worktreePath: string;
  branchName: string;
};

export async function prepareWorktree(input: {
  projectRoot: string;
  runId: string;
  branchPrefix: string;
  worktreeDir: string;
  startPoint?: string;
}): Promise<WorktreePreparation> {
  const branchName = `${input.branchPrefix}${input.runId}`;
  const worktreePath = resolveWorktreePath(
    input.projectRoot,
    input.worktreeDir,
    input.runId,
  );

  await createWorktree({
    cwd: input.projectRoot,
    worktreePath,
    branchName,
    startPoint: input.startPoint,
  });

  return { worktreePath, branchName };
}
