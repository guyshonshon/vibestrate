import path from "node:path";
import fs from "node:fs/promises";
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

/**
 * Branch + linked-worktree status for the status bar. A linked worktree
 * (created by `git worktree add`) has a `--git-dir` under the main repo's
 * `worktrees/` while `--git-common-dir` points at the shared `.git`; in the
 * primary worktree the two resolve to the same path. Best-effort: returns
 * nulls/false when git isn't available rather than throwing.
 */
export async function getWorktreeContext(
  cwd: string,
): Promise<{ branch: string | null; isLinkedWorktree: boolean }> {
  const branch = await getCurrentBranch(cwd);
  try {
    const [gitDir, commonDir] = await Promise.all([
      execa("git", ["rev-parse", "--absolute-git-dir"], { cwd, reject: false }),
      execa("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
        cwd,
        reject: false,
      }),
    ]);
    if (gitDir.exitCode !== 0 || commonDir.exitCode !== 0) {
      return { branch, isLinkedWorktree: false };
    }
    const g = path.resolve(gitDir.stdout.trim());
    const c = path.resolve(commonDir.stdout.trim());
    return { branch, isLinkedWorktree: g !== c };
  } catch {
    return { branch, isLinkedWorktree: false };
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
/**
 * Newly staged symlinks whose target resolves OUTSIDE the working tree.
 * A run worktree gets env dirs (node_modules, .venv) symlinked in from the
 * project root; a dir-only ignore pattern (`node_modules/`) does not match a
 * symlink, so `git add -A` happily stages it - a real run's reviewer caught
 * one. The exclude-file layer prevents that for the dirs Vibestrate links;
 * this check backs every `git add -A` boundary (commits here, snapshot/diff
 * capture in safety/diff-gate.ts) so an out-of-tree link can't enter a
 * commit OR a snapshot tree no matter how it appeared. In-repo symlinks
 * (relative, resolving inside the tree) stay committable.
 */
async function stagedOutOfTreeSymlinks(cwd: string): Promise<string[]> {
  const diff = await execa(
    "git",
    ["diff", "--cached", "--raw", "-z", "--no-renames"],
    { cwd, reject: false },
  );
  if (diff.exitCode !== 0) return [];
  // -z raw format: ":oldmode newmode oldsha newsha status\0path\0" repeated.
  const parts = diff.stdout.split("\0").filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const meta = parts[i]!;
    const rel = parts[i + 1]!;
    const newMode = meta.split(" ")[1] ?? "";
    if (newMode !== "120000") continue;
    try {
      const target = await fs.readlink(path.join(cwd, rel));
      // realpath BOTH sides - on macOS the tree may be reached via an alias
      // (/var -> /private/var) and a one-sided realpath misclassifies every
      // relative in-repo link as out-of-tree.
      const realCwd = await fs.realpath(cwd);
      const linkDirReal = await fs.realpath(path.dirname(path.join(cwd, rel)));
      const resolved = path.resolve(linkDirReal, target);
      const relToTree = path.relative(realCwd, resolved);
      if (relToTree.startsWith("..") || path.isAbsolute(relToTree)) {
        out.push(rel);
      }
    } catch {
      // Unreadable link: fail closed - keep it out of the commit.
      out.push(rel);
    }
  }
  return out;
}

/** Unstage every newly staged out-of-tree symlink; returns what was reset.
 *  Shared by the commit path and diff-gate's snapshot/patch staging. */
export async function resetOutOfTreeStagedSymlinks(
  cwd: string,
): Promise<string[]> {
  const links = await stagedOutOfTreeSymlinks(cwd);
  if (links.length === 0) return [];
  const reset = await execa("git", ["reset", "-q", "--", ...links], {
    cwd,
    reject: false,
  });
  if (reset.exitCode !== 0) {
    throw new GitError(
      `git reset of out-of-tree symlinks failed in ${cwd}: ${reset.stderr || reset.stdout}`,
    );
  }
  return links;
}

export async function stageAndCommitAll(input: {
  cwd: string;
  message: string;
  trailers?: Record<string, string>;
}): Promise<{ sha: string; excludedSymlinks: string[] } | null> {
  const { cwd, message, trailers } = input;
  if (!(await hasChanges(cwd))) return null;
  const add = await execa("git", ["add", "-A"], { cwd, reject: false });
  if (add.exitCode !== 0) {
    throw new GitError(`git add failed in ${cwd}: ${add.stderr || add.stdout}`);
  }
  const excludedSymlinks = await resetOutOfTreeStagedSymlinks(cwd);
  if (excludedSymlinks.length > 0) {
    // Nothing real left to commit? (the symlink was the only change)
    const staged = await execa("git", ["diff", "--cached", "--quiet"], {
      cwd,
      reject: false,
    });
    if (staged.exitCode === 0) return null;
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
  return sha ? { sha, excludedSymlinks } : null;
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
 *  On conflict the working tree is left mid-merge - call {@link abortMerge}. */
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

/** Commit a staged (no-commit) merge. Returns the new sha, or null. `trailers`
 *  are appended as `Key: value` lines (used to credit the integrator commit). */
export async function commitMerge(
  cwd: string,
  message: string,
  trailers?: Record<string, string>,
): Promise<{ sha: string } | null> {
  const args = ["commit", "--no-edit", "-m", message];
  for (const [key, value] of Object.entries(trailers ?? {})) {
    args.push("--trailer", `${key}: ${value.replace(/\n/g, " ")}`);
  }
  const r = await execa("git", args, { cwd, reject: false });
  if (r.exitCode !== 0) return null;
  const sha = await currentHeadSha(cwd);
  return sha ? { sha } : null;
}

// resolveWorktreePath moved to utils/paths.ts (pure path math; lets the run-id
// generator reuse it without importing this execa-heavy module).
