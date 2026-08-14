import type {
  ReplayApproval,
  ReplayBundle,
  ReplayEvent,
  ReplayFlowSummary,
  ReplayMetricsSummary,
  ReplayNotification,
  ReplayPhase,
  ReplayPolicyRefusal,
  ReplayStateSnapshot,
  ReplaySuggestion,
  ReplayTerminalSession,
  ReplayTruncation,
} from "./policies.js";
import type { RunState } from "./runs.js";

// ─── codebase / project context ──────────────────────────────────────────────

export type PackageManager = "pnpm" | "npm" | "yarn" | "bun" | "unknown";
export type ProjectType =
  | "nextjs"
  | "vite"
  | "typescript"
  | "node"
  | "generic";

export type ProjectMetadata = {
  status: {
    initialised: boolean;
    isGitRepo: boolean;
    hasNotifications: boolean;
  };
  projectRoot: string;
  vibestrateRoot: string;
  worktreeDir: string;
  projectName: string;
  projectType: ProjectType;
  projectTypeLabel: string;
  packageManager: PackageManager;
  git: {
    isGitRepo: boolean;
    gitRoot: string | null;
    mainBranch: string | null;
    currentBranch: string | null;
    headHash: string | null;
    headSubject: string | null;
  };
  validationCommands: string[];
  providers: { id: string; type: string; command: string | null }[];
  defaultCrew: string | null;
  profiles: {
    id: string;
    provider: string;
    model: string | null;
    power: string | null;
  }[];
  crews: {
    id: string;
    label: string;
    roles: {
      id: string;
      label: string;
      seats: string[];
      profile: string;
      permissions: string;
      skills: string[];
    }[];
  }[];
  skills: {
    id: string;
    name: string;
    source: string;
    filePath: string;
  }[];
  scheduler: {
    maxConcurrentRuns: number;
    maxConcurrentWriteRoles: number;
    conflictPolicy: "warn" | "block";
    queuePolicy: "fifo" | "priority";
  };
  policies: {
    forbidMainBranchWrites: boolean;
    forbidSecretsAccess: boolean;
    forbidAutoPush: boolean;
    forbidAutoMerge: boolean;
    requireApprovalAtStages: string[];
  };
  counts: {
    runs: number;
    activeRuns: number;
    runningTaskIds: string[];
    queueLength: number;
    roadmapItems: number;
    tasks: number;
    pendingApprovals: number;
  };
  recentRuns: RunState[];
};

export type FileTreeEntry = {
  name: string;
  path: string;
  kind: "file" | "directory";
  size: number | null;
  isSecretLike: boolean;
  truncated?: boolean;
  children?: FileTreeEntry[];
};

export type FileTreeResult = {
  root: string;
  rootKind: "project" | "worktree";
  rootLabel: string;
  depth: number;
  maxEntries: number;
  truncated: boolean;
  totalCount: number;
  tree: FileTreeEntry;
};

// ── Codebase content + supervisor search ────────────────────────────────────

export type CodeSearchMatch = { line: number; text: string };

export type CodeSearchFileResult = {
  path: string;
  matches: CodeSearchMatch[];
  matchCount: number;
  matchesTruncated: boolean;
};

export type CodeSearchResult = {
  available: boolean;
  error: string | null;
  query: string;
  regex: boolean;
  files: CodeSearchFileResult[];
  totalMatches: number;
  totalFiles: number;
  truncated: boolean;
  redactedCount: number;
};

export type SupervisorSearchFile = { path: string; reason: string };

export type SupervisorSearchResult = {
  result: {
    files: SupervisorSearchFile[];
    searchTerms: string[];
    summary: string;
    confidence: "low" | "medium" | "high";
    caveats: string[];
  };
  providerId: string;
  profileId: string;
  model: string | null;
  effort: string | null;
  candidateCount: number;
  candidatesTruncated: boolean;
};

export type FileViewLine = { number: number; text: string };

export type FileView = {
  path: string;
  rootKind: "project" | "worktree";
  rootLabel: string;
  language: string;
  size: number;
  isBinary: boolean;
  isSecretLike: boolean;
  isTruncated: boolean;
  totalLines: number | null;
  lineStart: number | null;
  lineEnd: number | null;
  notice?: string;
  lines: FileViewLine[];
};

export type CodeReference = {
  raw: string;
  file: string;
  lineStart: number | null;
  lineEnd: number | null;
  existsInProject?: boolean;
  existsInWorktree?: boolean;
  targetUrl: string;
  startIndex: number;
  endIndex: number;
};

export type GitChangedFile = { path: string; status: string };

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
  name: string;
  hash: string;
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

/** One branch's standing vs main - powers the Branches panel. */
export type GitBranchOverview = {
  name: string;
  hash: string;
  shortHash: string;
  isMain: boolean;
  mergedIntoMain: boolean;
  ahead: number;
  behind: number;
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

/** A node in the topology graph: a commit + its shortstat (null for merges). */
export type GitGraphCommit = GitCommit & { stats: GitCommitStats | null };

/** Per-file numstat row of a single commit ("-" for binary → nulls). */
export type GitCommitFileStat = {
  path: string;
  insertions: number | null;
  deletions: number | null;
};

/** Full single-commit detail for the inspector. */
export type GitCommitDetail = {
  available: boolean;
  hash: string;
  shortHash: string;
  subject: string;
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
  mainBranch: string;
  commits: GitGraphCommit[];
  branchHeads: GitBranchHead[];
  /** True when the commit set was truncated to `maxNodes`. */
  bounded: boolean;
};

// ── Codebase map ──────────────────────────────────────────────────────────
// Mirrors `CodebaseMap` in src/project/codebase-map.ts. Kept as a separate UI
// type (this file's own convention) rather than importing the server/zod
// type directly.
export type CodebaseMapView = {
  schemaVersion: 2;
  generatedAt: string;
  rev: string | null;
  project: {
    name: string;
    packageManager: string | null;
    type: string;
    scripts: Record<string, string>;
    validationCommands: string[];
  };
  layout: Array<{ dir: string; files: number }>;
  languages: Array<{ ext: string; files: number }>;
  entryPoints: string[];
  httpRoutes: {
    detected: Array<{ method: string; route: string; file: string }>;
    conventionFiles: string[];
    truncated: boolean;
  };
  tooling: string[];
  /** Harvested TODO marker COUNTS. The markers themselves live in the harvest
   *  artifact, not here. `null` means the scan did not run - never zero, so a
   *  failed scan cannot be shown as a clean codebase. */
  todos: {
    counts: Record<string, number>;
    total: number;
    truncated: boolean;
  } | null;
  totalTrackedFiles: number;
  truncated: boolean;
  notes: string[];
};

export type CodebaseMapResult = {
  present: boolean;
  stale: boolean;
  map: CodebaseMapView | null;
};

export type RunReplay = {
  runId: string;
  task: string;
  taskId: string | null;
  finalStatus: string;
  branchName: string | null;
  worktreePath: string | null;
  startedAt: string;
  updatedAt: string;
  events: ReplayEvent[];
  phases: ReplayPhase[];
  snapshots: ReplayStateSnapshot[];
  truncation: ReplayTruncation;
  approvals: ReplayApproval[];
  suggestions: ReplaySuggestion[];
  bundles: ReplayBundle[];
  policyRefusals: ReplayPolicyRefusal[];
  notifications: ReplayNotification[];
  terminalSessions: ReplayTerminalSession[];
  flow: ReplayFlowSummary | null;
  artifacts: { path: string }[];
  metrics: ReplayMetricsSummary | null;
  missingOrMalformed: { file: string; reason: string }[];
};
