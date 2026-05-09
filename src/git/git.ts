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
