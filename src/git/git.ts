import path from "node:path";
import { execa } from "execa";
import { GitError } from "../utils/errors.js";
import { pathExists } from "../utils/fs.js";

export async function isGitAvailable(): Promise<boolean> {
  try {
    const result = await execa("git", ["--version"], { reject: false });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

export async function findGitRoot(cwd: string): Promise<string | null> {
  try {
    const result = await execa("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      reject: false,
    });
    if (result.exitCode !== 0) return null;
    return result.stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function getCurrentBranch(cwd: string): Promise<string | null> {
  try {
    const result = await execa("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd,
      reject: false,
    });
    if (result.exitCode !== 0) return null;
    const out = result.stdout.trim();
    return out || null;
  } catch {
    return null;
  }
}

export async function branchExists(cwd: string, branch: string): Promise<boolean> {
  const result = await execa(
    "git",
    ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`],
    { cwd, reject: false },
  );
  return result.exitCode === 0;
}

export async function createWorktree(input: {
  cwd: string;
  worktreePath: string;
  branchName: string;
  startPoint?: string;
}): Promise<void> {
  const { cwd, worktreePath, branchName, startPoint } = input;

  if (await pathExists(worktreePath)) {
    throw new GitError(`Worktree path already exists: ${worktreePath}`);
  }

  if (await branchExists(cwd, branchName)) {
    throw new GitError(`Branch already exists: ${branchName}`);
  }

  const args = ["worktree", "add", "-b", branchName, worktreePath];
  if (startPoint) args.push(startPoint);

  const result = await execa("git", args, { cwd, reject: false });
  if (result.exitCode !== 0) {
    throw new GitError(
      `Failed to create worktree at ${worktreePath}: ${result.stderr || result.stdout}`,
    );
  }
}

/** True if the worktree has any staged or unstaged changes (incl. untracked). */
export async function hasChanges(cwd: string): Promise<boolean> {
  const result = await execa("git", ["status", "--porcelain"], {
    cwd,
    reject: false,
  });
  if (result.exitCode !== 0) {
    throw new GitError(`git status failed in ${cwd}: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim().length > 0;
}

/** The current HEAD commit sha (full), or null when there are no commits. */
export async function currentHeadSha(cwd: string): Promise<string | null> {
  const result = await execa("git", ["rev-parse", "HEAD"], { cwd, reject: false });
  if (result.exitCode !== 0) return null;
  return result.stdout.trim() || null;
}

/**
 * Stage everything and commit. Returns the new commit sha, or null when there
 * was nothing to commit. `trailers` are appended as `Key: value` lines (used to
 * stamp the checklist item id onto a per-item commit for attribution/revert).
 */
export async function stageAndCommitAll(input: {
  cwd: string;
  message: string;
  trailers?: Record<string, string>;
}): Promise<{ sha: string } | null> {
  const { cwd, message, trailers } = input;
  if (!(await hasChanges(cwd))) return null;
  const add = await execa("git", ["add", "-A"], { cwd, reject: false });
  if (add.exitCode !== 0) {
    throw new GitError(`git add failed in ${cwd}: ${add.stderr || add.stdout}`);
  }
  const args = ["commit", "-m", message];
  for (const [key, value] of Object.entries(trailers ?? {})) {
    // One-line trailer values only (git trailers are line-oriented).
    args.push("--trailer", `${key}: ${value.replace(/\n/g, " ")}`);
  }
  const commit = await execa("git", args, { cwd, reject: false });
  if (commit.exitCode !== 0) {
    throw new GitError(
      `git commit failed in ${cwd}: ${commit.stderr || commit.stdout}`,
    );
  }
  const sha = await currentHeadSha(cwd);
  return sha ? { sha } : null;
}

/** Paths changed by a single commit (best-effort; empty on any error). */
export async function filesInCommit(cwd: string, sha: string): Promise<string[]> {
  const result = await execa(
    "git",
    ["show", "--name-only", "--pretty=format:", sha],
    { cwd, reject: false },
  );
  if (result.exitCode !== 0) return [];
  return result.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** True when a local branch (or ref) exists / is resolvable. */
export async function refExists(cwd: string, ref: string): Promise<boolean> {
  const r = await execa("git", ["rev-parse", "--verify", "--quiet", ref], {
    cwd,
    reject: false,
  });
  return r.exitCode === 0;
}

/** Remove a worktree (force) and prune. Best-effort. */
export async function removeWorktree(cwd: string, worktreePath: string): Promise<void> {
  await execa("git", ["worktree", "remove", "--force", worktreePath], {
    cwd,
    reject: false,
  });
  await execa("git", ["worktree", "prune"], { cwd, reject: false });
}

/** Delete a local branch (force). Best-effort. */
export async function deleteBranch(cwd: string, branch: string): Promise<void> {
  await execa("git", ["branch", "-D", branch], { cwd, reject: false });
}

export type MergeAttempt = {
  clean: boolean;
  /** Files left with merge conflicts (unmerged), when not clean. */
  conflictedFiles: string[];
  /** Raw git message (first line), for surfacing. */
  message: string;
};

/** Attempt `git merge --no-ff --no-commit <branch>` in `cwd`. Does NOT commit.
 *  On conflict the working tree is left mid-merge — call {@link abortMerge}. */
export async function mergeNoCommit(
  cwd: string,
  branch: string,
): Promise<MergeAttempt> {
  const r = await execa(
    "git",
    ["merge", "--no-ff", "--no-commit", branch],
    { cwd, reject: false },
  );
  const conflicted = await execa(
    "git",
    ["diff", "--name-only", "--diff-filter=U"],
    { cwd, reject: false },
  );
  const conflictedFiles = conflicted.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const clean = r.exitCode === 0 && conflictedFiles.length === 0;
  return {
    clean,
    conflictedFiles,
    message: (r.stdout || r.stderr || "").split("\n")[0] ?? "",
  };
}

/** Abort an in-progress merge (best-effort). */
export async function abortMerge(cwd: string): Promise<void> {
  await execa("git", ["merge", "--abort"], { cwd, reject: false });
}

/** Commit a staged (no-commit) merge. Returns the new sha, or null. */
export async function commitMerge(
  cwd: string,
  message: string,
): Promise<{ sha: string } | null> {
  const r = await execa("git", ["commit", "--no-edit", "-m", message], {
    cwd,
    reject: false,
  });
  if (r.exitCode !== 0) return null;
  const sha = await currentHeadSha(cwd);
  return sha ? { sha } : null;
}

export function resolveWorktreePath(
  projectRoot: string,
  worktreeDir: string,
  runId: string,
): string {
  const base = path.isAbsolute(worktreeDir)
    ? worktreeDir
    : path.resolve(projectRoot, worktreeDir);
  return path.join(base, runId);
}
