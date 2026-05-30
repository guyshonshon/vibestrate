// ── Integration / merge-preview (Phase 5) ───────────────────────────────────
//
// Parallel runs already land on separate branches; this is the missing half —
// a *gated* surface to preview real git merges and then sequentially integrate
// selected branches into a dedicated integration branch. NEVER touches main,
// never pushes, never auto-merges. Conflicts are surfaced from real
// `git merge --no-ff --no-commit` dry-runs (a superset of the pre-run
// file-overlap detector), cumulatively, so branch-vs-branch conflicts show too.

import { randomUUID } from "node:crypto";
import { readDirSafe, pathExists } from "../utils/fs.js";
import { readJson } from "../utils/json.js";
import { projectRunsDir, runStatePath } from "../utils/paths.js";
import { runStateSchema } from "../core/state-machine.js";
import { loadConfig } from "../project/config-loader.js";
import {
  createWorktree,
  mergeNoCommit,
  abortMerge,
  commitMerge,
  removeWorktree,
  deleteBranch,
  refExists,
  resolveWorktreePath,
} from "../git/git.js";

export class IntegrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IntegrationError";
  }
}

export type MergeReadyRun = {
  runId: string;
  task: string;
  branchName: string;
  taskId: string | null;
};

export type BranchTarget = { branch: string; runId?: string };

export type BranchPreview = {
  branch: string;
  runId?: string;
  clean: boolean;
  conflictedFiles: string[];
  note: string;
};

export type MergePreviewResult = {
  baseBranch: string;
  results: BranchPreview[];
  allClean: boolean;
};

export type IntegrateResult = {
  integrationBranch: string;
  baseBranch: string;
  worktreePath: string;
  integrated: BranchPreview[];
  /** Branch where integration stopped on a conflict (null = all merged). */
  stoppedAt: string | null;
};

const SAFE_BRANCH_RE = /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,99}$/;

/** Runs in `merge_ready` with a branch — the candidates for integration. */
export async function listMergeReadyRuns(
  projectRoot: string,
): Promise<MergeReadyRun[]> {
  const ids = await readDirSafe(projectRunsDir(projectRoot));
  const out: MergeReadyRun[] = [];
  for (const id of ids.sort()) {
    const file = runStatePath(projectRoot, id);
    if (!(await pathExists(file))) continue;
    try {
      const parsed = runStateSchema.safeParse(await readJson(file));
      if (!parsed.success) continue;
      const s = parsed.data;
      if (s.status === "merge_ready" && s.branchName) {
        out.push({
          runId: s.runId,
          task: s.task,
          branchName: s.branchName,
          taskId: s.taskId,
        });
      }
    } catch {
      // skip unreadable state
    }
  }
  return out;
}

/**
 * Cumulative merge preview into a throwaway scratch branch off `baseBranch`.
 * Clean branches are committed onto the scratch so later previews see them;
 * a conflicting branch is aborted, recorded, and skipped. The scratch worktree
 * + branch are always cleaned up. Nothing the user keeps is mutated.
 */
export async function mergePreview(input: {
  projectRoot: string;
  branches: BranchTarget[];
  baseBranch?: string;
}): Promise<MergePreviewResult> {
  const loaded = await loadConfig(input.projectRoot);
  const baseBranch = input.baseBranch ?? loaded.config.git.mainBranch;
  const scratchBranch = `vibe-preview-${randomUUID().slice(0, 8)}`;
  const scratchPath = resolveWorktreePath(
    input.projectRoot,
    loaded.config.git.worktreeDir,
    scratchBranch,
  );
  const results: BranchPreview[] = [];

  await createWorktree({
    cwd: input.projectRoot,
    worktreePath: scratchPath,
    branchName: scratchBranch,
    startPoint: baseBranch,
  });
  try {
    for (const b of input.branches) {
      if (!(await refExists(scratchPath, b.branch))) {
        results.push({ ...b, clean: false, conflictedFiles: [], note: "branch not found" });
        continue;
      }
      const attempt = await mergeNoCommit(scratchPath, b.branch);
      if (attempt.clean) {
        await commitMerge(scratchPath, `preview: merge ${b.branch}`);
        results.push({ ...b, clean: true, conflictedFiles: [], note: attempt.message || "clean" });
      } else {
        await abortMerge(scratchPath);
        results.push({
          ...b,
          clean: false,
          conflictedFiles: attempt.conflictedFiles,
          note: attempt.conflictedFiles.length ? "conflicts" : "merge failed",
        });
      }
    }
  } finally {
    await removeWorktree(input.projectRoot, scratchPath);
    await deleteBranch(input.projectRoot, scratchBranch);
  }
  return { baseBranch, results, allClean: results.every((r) => r.clean) };
}

/**
 * Sequentially integrate `branches` into a NEW `integrationBranch` (off
 * `baseBranch`), committing each clean merge. Stops at the first conflict,
 * leaving the integration worktree at the last clean state for the human to
 * resolve. Refuses to use the main branch; never pushes.
 */
export async function integrate(input: {
  projectRoot: string;
  branches: BranchTarget[];
  integrationBranch: string;
  baseBranch?: string;
}): Promise<IntegrateResult> {
  const loaded = await loadConfig(input.projectRoot);
  const baseBranch = input.baseBranch ?? loaded.config.git.mainBranch;
  const target = input.integrationBranch.trim();

  if (!SAFE_BRANCH_RE.test(target)) {
    throw new IntegrationError(
      `Invalid integration branch name "${target}".`,
    );
  }
  if (target === loaded.config.git.mainBranch || target === baseBranch) {
    throw new IntegrationError(
      "Refusing to integrate into the main/base branch — use a dedicated integration branch.",
    );
  }
  if (await refExists(input.projectRoot, target)) {
    throw new IntegrationError(
      `Integration branch "${target}" already exists. Delete it or choose another name.`,
    );
  }

  const worktreePath = resolveWorktreePath(
    input.projectRoot,
    loaded.config.git.worktreeDir,
    `integration-${target.replace(/[/]/g, "-")}`,
  );
  await createWorktree({
    cwd: input.projectRoot,
    worktreePath,
    branchName: target,
    startPoint: baseBranch,
  });

  const integrated: BranchPreview[] = [];
  let stoppedAt: string | null = null;
  for (const b of input.branches) {
    if (!(await refExists(worktreePath, b.branch))) {
      integrated.push({ ...b, clean: false, conflictedFiles: [], note: "branch not found" });
      stoppedAt = b.branch;
      break;
    }
    const attempt = await mergeNoCommit(worktreePath, b.branch);
    if (attempt.clean) {
      await commitMerge(worktreePath, `integrate: merge ${b.branch}`);
      integrated.push({ ...b, clean: true, conflictedFiles: [], note: "merged" });
    } else {
      await abortMerge(worktreePath);
      integrated.push({
        ...b,
        clean: false,
        conflictedFiles: attempt.conflictedFiles,
        note: "stopped — conflicts (resolve in the integration worktree)",
      });
      stoppedAt = b.branch;
      break;
    }
  }

  return { integrationBranch: target, baseBranch, worktreePath, integrated, stoppedAt };
}
