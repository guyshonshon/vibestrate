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
  /** Parent commit shas. Empty for a root commit; >1 for a merge commit. */
  parents: string[];
};

export type GitHistory = {
  available: boolean;
  worktreePath: string;
  gitRoot: string | null;
  branch: string | null;
  baseRef: string | null;
  commits: GitCommit[];
  truncated: boolean;
};

/** A local branch ref and the commit it currently points at. */
export type GitBranchHead = {
  /** `refname:short`, e.g. "main" or "feat/x". */
  name: string;
  /** Tip commit sha. */
  hash: string;
  /** True only for the configured main/trunk branch. */
  isMain: boolean;
};

/** A node in the topology graph. Identical to `GitCommit`; edges are the `parents`. */
export type GitGraphCommit = GitCommit;

/** Branch topology across all refs: commits (with parents) + branch heads. */
export type GitGraph = {
  available: boolean;
  worktreePath: string;
  gitRoot: string | null;
  /** The configured main branch name, echoed for the client. */
  mainBranch: string;
  commits: GitGraphCommit[];
  branchHeads: GitBranchHead[];
  /** True when the commit set was truncated to `maxNodes` (older history elided). */
  bounded: boolean;
};

/**
 * Field order for the commit `--pretty` format, shared by history + graph so
 * the parser below can never drift from the producers. Trailing `%P` = parents.
 */
const COMMIT_FIELDS = ["%H", "%h", "%s", "%an", "%ae", "%aI", "%D", "%P"];

function parseCommitRecord(rec: string, fieldSep: string): GitCommit {
  const [hash, shortHash, subject, author, authorEmail, date, refs, parents] =
    rec.split(fieldSep);
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
    parents: (parents ?? "")
      .split(" ")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

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
  /** When set, show commits reachable from HEAD but not from this ref. */
  baseRef?: string | null;
}): Promise<GitHistory> {
  const limit = Math.max(1, Math.min(input.limit ?? 20, 200));
  const empty: GitHistory = {
    available: false,
    worktreePath: input.worktreePath,
    gitRoot: null,
    branch: null,
    baseRef: input.baseRef ?? null,
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
  const fmt = COMMIT_FIELDS.join(FIELD);
  const baseRef = await resolveBaseRef(input.worktreePath, input.baseRef);

  const args = [
    "log",
    `--max-count=${limit + 1}`,
    `--pretty=format:${fmt}${RECORD}`,
    "HEAD",
  ];
  if (baseRef) args.push("--not", baseRef);

  const r = await git(input.worktreePath, args);
  if (r.exitCode !== 0) {
    return { ...empty, available: true, gitRoot, branch, baseRef };
  }
  const records = r.stdout
    .split(RECORD)
    .map((s) => s.trim())
    .filter(Boolean);
  const truncated = records.length > limit;
  const commits: GitCommit[] = records
    .slice(0, limit)
    .map((rec) => parseCommitRecord(rec, FIELD));

  return {
    available: true,
    worktreePath: input.worktreePath,
    gitRoot,
    branch,
    baseRef,
    commits,
    truncated,
  };
}

async function resolveBaseRef(
  worktreePath: string,
  baseRef: string | null | undefined,
): Promise<string | null> {
  const candidate = baseRef?.trim();
  if (!candidate) return null;
  const verified = await git(worktreePath, [
    "rev-parse",
    "--verify",
    "--quiet",
    candidate,
  ]);
  return verified.exitCode === 0 ? candidate : null;
}

/**
 * Read-only branch topology: every local branch head plus a bounded set of
 * commits across all refs, each with its parent shas so the client can draw the
 * DAG. Edges are implicit in `commit.parents`; a parent outside the returned set
 * is a "stub" the UI renders as a boundary node.
 */
export async function getGitGraph(input: {
  worktreePath: string;
  /** Max commits returned (older history elided, `bounded=true`). */
  maxNodes?: number;
  /** Configured main branch; the only head flagged `isMain`. */
  mainBranch: string;
}): Promise<GitGraph> {
  const maxNodes = Math.max(1, Math.min(input.maxNodes ?? 300, 2000));
  const empty: GitGraph = {
    available: false,
    worktreePath: input.worktreePath,
    gitRoot: null,
    mainBranch: input.mainBranch,
    commits: [],
    branchHeads: [],
    bounded: false,
  };
  if (!(await pathExists(input.worktreePath))) return empty;
  const gitRoot = await findGitRoot(input.worktreePath);
  if (!gitRoot) return empty;

  // ASCII unit/record separators, same convention as getGitHistory.
  const FIELD = "";
  const RECORD = "";

  // Branch heads: `name<TAB>tip-sha` for every local branch (no %D parsing).
  const branchHeads: GitBranchHead[] = [];
  const refs = await git(input.worktreePath, [
    "for-each-ref",
    "refs/heads/",
    "--format=%(refname:short)\t%(objectname)",
  ]);
  if (refs.exitCode === 0) {
    for (const line of refs.stdout.split("\n")) {
      if (!line.trim()) continue;
      const [name, hash] = line.split("\t");
      const n = (name ?? "").trim();
      const h = (hash ?? "").trim();
      if (n && h) {
        branchHeads.push({ name: n, hash: h, isMain: n === input.mainBranch });
      }
    }
  }

  // Commits across all refs, bounded. Fetch one extra to detect truncation.
  const fmt = COMMIT_FIELDS.join(FIELD);
  const log = await git(input.worktreePath, [
    "log",
    "--all",
    `--max-count=${maxNodes + 1}`,
    `--pretty=format:${fmt}${RECORD}`,
  ]);
  if (log.exitCode !== 0) {
    // Repo with no commits yet, or log unavailable: still a valid git root.
    return { ...empty, available: true, gitRoot, branchHeads };
  }
  const records = log.stdout
    .split(RECORD)
    .map((s) => s.trim())
    .filter(Boolean);
  const bounded = records.length > maxNodes;
  const commits = records
    .slice(0, maxNodes)
    .map((rec) => parseCommitRecord(rec, FIELD));

  return {
    available: true,
    worktreePath: input.worktreePath,
    gitRoot,
    mainBranch: input.mainBranch,
    commits,
    branchHeads,
    bounded,
  };
}
