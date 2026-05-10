import { execa } from "execa";
import { pathExists } from "../utils/fs.js";
import { findGitRoot, getCurrentBranch } from "../git/git.js";

export type GitChangedFile = {
  path: string;
  status: string;
};

export type GitStatus = {
  available: boolean;
  worktreePath: string;
  gitRoot: string | null;
  branch: string | null;
  upstream: string | null;
  ahead: number | null;
  behind: number | null;
  isDirty: boolean;
  headHash: string | null;
  headSubject: string | null;
  changedFiles: GitChangedFile[];
};

export type GitCommit = {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  authorEmail: string;
  date: string;
  refs: string[];
};

export type GitHistory = {
  available: boolean;
  worktreePath: string;
  gitRoot: string | null;
  branch: string | null;
  commits: GitCommit[];
  truncated: boolean;
};

const TIMEOUT_MS = 4_000;

async function git(
  cwd: string,
  args: string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const r = await execa("git", args, {
    cwd,
    reject: false,
    timeout: TIMEOUT_MS,
    stdin: "ignore",
  });
  return {
    exitCode: r.exitCode ?? -1,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
  };
}

export async function getGitStatus(worktreePath: string): Promise<GitStatus> {
  const empty: GitStatus = {
    available: false,
    worktreePath,
    gitRoot: null,
    branch: null,
    upstream: null,
    ahead: null,
    behind: null,
    isDirty: false,
    headHash: null,
    headSubject: null,
    changedFiles: [],
  };
  if (!(await pathExists(worktreePath))) return empty;
  const gitRoot = await findGitRoot(worktreePath);
  if (!gitRoot) return empty;
  const branch = await getCurrentBranch(worktreePath);

  // Upstream + ahead/behind are best-effort. Failure is fine.
  let upstream: string | null = null;
  let ahead: number | null = null;
  let behind: number | null = null;
  const upRes = await git(worktreePath, [
    "rev-parse",
    "--abbrev-ref",
    "--symbolic-full-name",
    "@{u}",
  ]);
  if (upRes.exitCode === 0) {
    upstream = upRes.stdout.trim() || null;
    const ab = await git(worktreePath, ["rev-list", "--left-right", "--count", "HEAD...@{u}"]);
    if (ab.exitCode === 0) {
      const [a, b] = ab.stdout.trim().split(/\s+/).map((n) => Number(n));
      if (Number.isFinite(a)) ahead = a as number;
      if (Number.isFinite(b)) behind = b as number;
    }
  }

  const head = await git(worktreePath, [
    "log",
    "-1",
    "--pretty=format:%H%n%h%n%s",
    "HEAD",
  ]);
  let headHash: string | null = null;
  let headSubject: string | null = null;
  if (head.exitCode === 0) {
    const [, sh, subj] = head.stdout.split("\n");
    headHash = (sh ?? "").trim() || null;
    headSubject = (subj ?? "").trim() || null;
  }

  const status = await git(worktreePath, ["status", "--porcelain=v1"]);
  const changedFiles: GitChangedFile[] = [];
  if (status.exitCode === 0) {
    for (const line of status.stdout.split("\n")) {
      if (!line.trim()) continue;
      const code = line.slice(0, 2).trim() || "??";
      const file = line.slice(3).trim();
      if (file) changedFiles.push({ path: file, status: code });
    }
  }

  return {
    available: true,
    worktreePath,
    gitRoot,
    branch,
    upstream,
    ahead,
    behind,
    isDirty: changedFiles.length > 0,
    headHash,
    headSubject,
    changedFiles,
  };
}

export async function getGitHistory(input: {
  worktreePath: string;
  limit?: number;
}): Promise<GitHistory> {
  const limit = Math.max(1, Math.min(input.limit ?? 20, 200));
  const empty: GitHistory = {
    available: false,
    worktreePath: input.worktreePath,
    gitRoot: null,
    branch: null,
    commits: [],
    truncated: false,
  };
  if (!(await pathExists(input.worktreePath))) return empty;
  const gitRoot = await findGitRoot(input.worktreePath);
  if (!gitRoot) return empty;
  const branch = await getCurrentBranch(input.worktreePath);

  // Format with ASCII unit separators so we can split safely.
  const FIELD = "";
  const RECORD = "";
  const fmt = ["%H", "%h", "%s", "%an", "%ae", "%aI", "%D"].join(FIELD);

  const r = await git(input.worktreePath, [
    "log",
    `--max-count=${limit + 1}`,
    `--pretty=format:${fmt}${RECORD}`,
    "HEAD",
  ]);
  if (r.exitCode !== 0) {
    return { ...empty, available: true, gitRoot, branch };
  }
  const records = r.stdout
    .split(RECORD)
    .map((s) => s.trim())
    .filter(Boolean);
  const truncated = records.length > limit;
  const commits: GitCommit[] = records
    .slice(0, limit)
    .map((rec): GitCommit => {
      const [hash, shortHash, subject, author, authorEmail, date, refs] = rec.split(
        FIELD,
      );
      return {
        hash: (hash ?? "").trim(),
        shortHash: (shortHash ?? "").trim(),
        subject: (subject ?? "").trim(),
        author: (author ?? "").trim(),
        authorEmail: (authorEmail ?? "").trim(),
        date: (date ?? "").trim(),
        refs: (refs ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      };
    });

  return {
    available: true,
    worktreePath: input.worktreePath,
    gitRoot,
    branch,
    commits,
    truncated,
  };
}
