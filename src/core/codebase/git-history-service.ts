import { execa } from "execa";
import { pathExists } from "../../utils/fs.js";
import { findGitRoot, getCurrentBranch } from "../../git/git.js";

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
  /** True when this branch's tip is already reachable from main (fully merged). */
  mergedIntoMain: boolean;
};

/** Aggregate diff size of one commit vs its (first) parent. */
export type GitCommitStats = {
  filesChanged: number;
  insertions: number;
  deletions: number;
};

/**
 * A node in the topology graph: a `GitCommit` plus its `--shortstat` diff size
 * (null for merge commits, which show no direct diff without `-m`).
 */
export type GitGraphCommit = GitCommit & { stats: GitCommitStats | null };

/** Per-file numstat row of a single commit ("-" for binary → nulls). */
export type GitCommitFileStat = {
  path: string;
  insertions: number | null;
  deletions: number | null;
};

/**
 * One branch's standing relative to main: how far ahead/behind, its own diff
 * size (vs the merge-base with main), and its tip. Powers the Branches panel,
 * which reads the same for a linear (ff-only) or a branching repo.
 */
export type GitBranchOverview = {
  name: string;
  hash: string;
  shortHash: string;
  isMain: boolean;
  mergedIntoMain: boolean;
  /** Commits on this branch not on main. */
  ahead: number;
  /** Commits on main not on this branch. */
  behind: number;
  /** Diff of the branch vs its merge-base with main (null for main itself / empty). */
  stats: GitCommitStats | null;
  subject: string;
  author: string;
  date: string;
};

export type GitBranchesOverview = {
  available: boolean;
  worktreePath: string;
  gitRoot: string | null;
  mainBranch: string;
  branches: GitBranchOverview[];
};

/** Full detail of one commit for the inspector: message body + per-file stats. */
export type GitCommitDetail = {
  available: boolean;
  hash: string;
  shortHash: string;
  subject: string;
  /** Full message body below the subject (may be empty). */
  body: string;
  author: string;
  authorEmail: string;
  date: string;
  refs: string[];
  parents: string[];
  files: GitCommitFileStat[];
  stats: GitCommitStats | null;
};

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

/** Parse a `--shortstat` line ("3 files changed, 10 insertions(+), 2 deletions(-)"). */
function parseShortstat(text: string): GitCommitStats | null {
  const files = /(\d+) files? changed/.exec(text);
  if (!files) return null;
  const ins = /(\d+) insertions?\(\+\)/.exec(text);
  const del = /(\d+) deletions?\(-\)/.exec(text);
  return {
    filesChanged: Number(files[1]),
    insertions: ins ? Number(ins[1]) : 0,
    deletions: del ? Number(del[1]) : 0,
  };
}

const SAFE_HASH = /^[0-9a-f]{7,40}$/i;

// A ref name safe to pass positionally to git (no leading dash, no `..`, no
// whitespace). Mirrors the route-level SAFE_BRANCH so a config `mainBranch`
// never reaches git argv unvalidated (defense in depth - it's a config value,
// not HTTP input, but this closes the one place raw config text hit git).
const SAFE_REF = /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,199}$/;

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

/**
 * Every local branch's standing vs main: ahead/behind counts, its own diff
 * size (vs the merge-base with main), merged flag, and tip metadata. Read-only.
 * Bounded to `maxBranches`; branch names come from `for-each-ref` (git's own
 * output) but are still guarded against leading-dash flag injection.
 */
export async function getBranchesOverview(input: {
  worktreePath: string;
  mainBranch: string;
  maxBranches?: number;
}): Promise<GitBranchesOverview> {
  const maxBranches = Math.max(1, Math.min(input.maxBranches ?? 100, 500));
  const empty: GitBranchesOverview = {
    available: false,
    worktreePath: input.worktreePath,
    gitRoot: null,
    mainBranch: input.mainBranch,
    branches: [],
  };
  if (!(await pathExists(input.worktreePath))) return empty;
  const gitRoot = await findGitRoot(input.worktreePath);
  if (!gitRoot) return empty;

  // One call for name/hash/short/author/date/subject (subject last so a tab
  // inside it can't shift the earlier columns).
  const refs = await git(input.worktreePath, [
    "for-each-ref",
    "refs/heads/",
    `--count=${maxBranches}`,
    "--sort=-committerdate",
    "--format=%(refname:short)\t%(objectname)\t%(objectname:short)\t%(authorname)\t%(committerdate:iso-strict)\t%(contents:subject)",
  ]);
  if (refs.exitCode !== 0) {
    return { ...empty, available: true, gitRoot };
  }

  // Does main exist? ahead/behind + diffstat only make sense against it.
  const mainExists = await git(input.worktreePath, [
    "rev-parse",
    "--verify",
    "--quiet",
    `refs/heads/${input.mainBranch}`,
  ]);
  const haveMain =
    mainExists.exitCode === 0 && SAFE_REF.test(input.mainBranch);

  // Which branches are already fully merged into main.
  const mergedSet = new Set<string>();
  if (haveMain) {
    const merged = await git(input.worktreePath, [
      "branch",
      "--format=%(refname:short)",
      "--merged",
      input.mainBranch,
    ]);
    if (merged.exitCode === 0) {
      for (const l of merged.stdout.split("\n")) {
        const t = l.trim();
        if (t) mergedSet.add(t);
      }
    }
  }

  // Parse the ref rows first (cheap), then fetch ahead/behind + diffstat with
  // bounded concurrency so a wide repo can't pin a worker for minutes on the
  // serial 2-calls-per-branch path (each git call has its own 4s timeout).
  type Row = { name: string; hash: string; shortHash: string; author: string; date: string; subject: string; isMain: boolean };
  const rows: Row[] = [];
  for (const line of refs.stdout.split("\n")) {
    if (!line.trim()) continue;
    const cols = line.split("\t");
    const name = (cols[0] ?? "").trim();
    const hash = (cols[1] ?? "").trim();
    if (!name || !hash || !SAFE_REF.test(name)) continue;
    rows.push({
      name,
      hash,
      shortHash: (cols[2] ?? "").trim(),
      author: (cols[3] ?? "").trim(),
      date: (cols[4] ?? "").trim(),
      subject: cols.slice(5).join("\t").trim(),
      isMain: name === input.mainBranch,
    });
  }

  const toBranch = async (r: Row): Promise<GitBranchOverview> => {
    let ahead = 0;
    let behind = 0;
    let stats: GitCommitStats | null = null;
    if (haveMain && !r.isMain) {
      const range = `${input.mainBranch}...${r.name}`;
      const counts = await git(input.worktreePath, [
        "rev-list",
        "--left-right",
        "--count",
        range,
      ]);
      if (counts.exitCode === 0) {
        // left = main-only (behind), right = branch-only (ahead).
        const [left, right] = counts.stdout.trim().split(/\s+/).map(Number);
        if (Number.isFinite(left)) behind = left as number;
        if (Number.isFinite(right)) ahead = right as number;
      }
      const diff = await git(input.worktreePath, ["diff", "--shortstat", range]);
      if (diff.exitCode === 0) stats = parseShortstat(diff.stdout);
    }
    return {
      name: r.name,
      hash: r.hash,
      shortHash: r.shortHash,
      isMain: r.isMain,
      mergedIntoMain: !r.isMain && mergedSet.has(r.name),
      ahead,
      behind,
      stats,
      subject: r.subject,
      author: r.author,
      date: r.date,
    };
  };

  const branches: GitBranchOverview[] = [];
  const CONCURRENCY = 8;
  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const chunk = rows.slice(i, i + CONCURRENCY);
    branches.push(...(await Promise.all(chunk.map(toBranch))));
  }

  // Main first, then most-recently-committed (for-each-ref already sorted).
  branches.sort((a, b) => (a.isMain === b.isMain ? 0 : a.isMain ? -1 : 1));

  return {
    available: true,
    worktreePath: input.worktreePath,
    gitRoot,
    mainBranch: input.mainBranch,
    branches,
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
        branchHeads.push({
          name: n,
          hash: h,
          isMain: n === input.mainBranch,
          mergedIntoMain: false,
        });
      }
    }
  }

  // Which branches are already fully merged into main - one git call, so the
  // merge planner can tell "already landed" from "still open" up front.
  if (branchHeads.some((b) => b.isMain) && SAFE_REF.test(input.mainBranch)) {
    const merged = await git(input.worktreePath, [
      "branch",
      "--format=%(refname:short)",
      "--merged",
      input.mainBranch,
    ]);
    if (merged.exitCode === 0) {
      const mergedSet = new Set(
        merged.stdout
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
      );
      for (const b of branchHeads) {
        b.mergedIntoMain = !b.isMain && mergedSet.has(b.name);
      }
    }
  }

  // Commits across all refs, bounded, WITH per-commit shortstat - one pass.
  // With `--shortstat` git prints the stat line after each record's \x1e, so
  // splitting on \x1e yields: [fields(c1), stat(c1)+fields(c2), ..., stat(cn)].
  // The fields line is the one containing the \x1f field separator; anything
  // before it belongs to the PREVIOUS commit. Merge commits print no stat.
  const fmt = COMMIT_FIELDS.join(FIELD);
  const log = await git(input.worktreePath, [
    "log",
    "--all",
    `--max-count=${maxNodes + 1}`,
    `--pretty=format:${fmt}${RECORD}`,
    "--shortstat",
  ]);
  if (log.exitCode !== 0) {
    // Repo with no commits yet, or log unavailable: still a valid git root.
    return { ...empty, available: true, gitRoot, branchHeads };
  }
  const commitsAll: GitGraphCommit[] = [];
  for (const chunk of log.stdout.split(RECORD)) {
    const lines = chunk.split("\n");
    const fieldIdx = lines.findIndex((l) => l.includes(FIELD));
    const statText = lines
      .slice(0, fieldIdx === -1 ? lines.length : fieldIdx)
      .join(" ");
    const stat = parseShortstat(statText);
    if (stat && commitsAll.length > 0) {
      commitsAll[commitsAll.length - 1]!.stats = stat;
    }
    if (fieldIdx !== -1) {
      const rec = lines.slice(fieldIdx).join("\n").trim();
      if (rec) {
        commitsAll.push({ ...parseCommitRecord(rec, FIELD), stats: null });
      }
    }
  }
  const bounded = commitsAll.length > maxNodes;
  const commits = commitsAll.slice(0, maxNodes);

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

/**
 * Full detail of a single commit for the inspector: message body plus per-file
 * numstat rows. Read-only; the hash is strictly validated (no ref expressions,
 * no path traversal into `git show` arguments).
 */
export async function getCommitDetail(input: {
  worktreePath: string;
  hash: string;
}): Promise<GitCommitDetail | null> {
  if (!SAFE_HASH.test(input.hash)) return null;
  if (!(await pathExists(input.worktreePath))) return null;
  const gitRoot = await findGitRoot(input.worktreePath);
  if (!gitRoot) return null;

  // Explicit escapes (not literal control bytes) so the separators can never
  // be silently lost in an edit - the tests caught exactly that once.
  const FIELD = "\x1f";
  const RECORD = "\x1e";
  // Fields, then %b (multi-line body) last, then the record sep, then numstat
  // rows. Split on the record sep first so body newlines can't break parsing.
  const fmt = [...COMMIT_FIELDS, "%b"].join(FIELD);
  const r = await git(input.worktreePath, [
    "show",
    input.hash,
    "--no-color",
    "--numstat",
    `--format=${fmt}${RECORD}`,
  ]);
  if (r.exitCode !== 0) return null;

  const sepIdx = r.stdout.indexOf(RECORD);
  if (sepIdx === -1) return null;
  const head = r.stdout.slice(0, sepIdx);
  const tail = r.stdout.slice(sepIdx + RECORD.length);

  const parts = head.split(FIELD);
  const body = (parts[COMMIT_FIELDS.length] ?? "").trim();
  const base = parseCommitRecord(parts.slice(0, COMMIT_FIELDS.length).join(FIELD), FIELD);

  const files: GitCommitFileStat[] = [];
  let insertions = 0;
  let deletions = 0;
  for (const line of tail.split("\n")) {
    const m = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line.trim());
    if (!m) continue;
    const ins = m[1] === "-" ? null : Number(m[1]);
    const del = m[2] === "-" ? null : Number(m[2]);
    files.push({ path: m[3]!, insertions: ins, deletions: del });
    insertions += ins ?? 0;
    deletions += del ?? 0;
  }

  return {
    available: true,
    ...base,
    body,
    files,
    stats:
      files.length > 0
        ? { filesChanged: files.length, insertions, deletions }
        : null,
  };
}
