// ── Interactive git-tree merge (predict / propose / apply / undo) ────────────

export type GitMergePrediction = {
  source: string;
  target: string;
  sourceSha: string;
  targetSha: string;
  clean: boolean;
  alreadyUpToDate: boolean;
  conflictedFiles: string[];
  note: string;
};

export type GitApplyResult = {
  source: string;
  target: string;
  preSha: string;
  mergedSha: string;
  alreadyUpToDate: boolean;
};

export type GitUndoResult =
  | { undone: true; target: string; preSha: string; from: string }
  | { undone: false; reason: string };

export type GitConflictHunk = {
  index: number;
  ours: string;
  theirs: string;
  base: string | null;
};

export type GitHunkProposal = GitConflictHunk & {
  proposed: string;
  rationale: string;
};

export type GitFileResolution = {
  file: string;
  status: "proposed" | "refusedSecret" | "binary" | "unparseable";
  hunks: GitHunkProposal[];
  /** Full proposed file (conflict regions resolved, context preserved). The UI
   *  seeds + applies THIS, not the joined hunks (which would truncate the file). */
  proposedFile: string | null;
  note?: string;
};

export type GitResolutionProposal = {
  source: string;
  target: string;
  clean: boolean;
  files: GitFileResolution[];
};

export type GitResolvedFile = { path: string; content: string };

export type RoleWorkRow = {
  roleId: string;
  stage: string;
  providerId: string;
  providerType: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  exitCode: number;
  skillsAttached: string[];
  skillsRequested: string[];
  artifacts: { kind: string; path: string }[];
  filesChangedAfter: number | null;
  diffInsertionsAfter: number | null;
  diffDeletionsAfter: number | null;
  validationSummary: { total: number; passed: number; failed: number } | null;
  reviewDecision: string | null;
  verificationDecision: string | null;
  notes: string[];
  bestEffort: boolean;
};

export type RoleWorkReport = {
  runId: string;
  available: boolean;
  bestEffort: true;
  totalDurationMs: number;
  totalCostUsd: number | null;
  rows: RoleWorkRow[];
  notice: string;
};
