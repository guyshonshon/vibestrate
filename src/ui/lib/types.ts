export type RunStatus =
  | "created"
  | "planning"
  | "planned"
  | "architecting"
  | "architected"
  | "executing"
  | "validating"
  | "reviewing"
  | "fixing"
  | "verifying"
  | "waiting_for_approval"
  | "merge_ready"
  | "blocked"
  | "failed"
  | "aborted";

export type ReviewDecision = "APPROVED" | "CHANGES_REQUESTED" | "BLOCKED";
export type VerificationDecision = "PASSED" | "FAILED" | "NEEDS_HUMAN";

export type RunState = {
  runId: string;
  task: string;
  status: RunStatus;
  projectRoot: string;
  worktreePath: string | null;
  branchName: string | null;
  reviewLoopCount: number;
  maxReviewLoops: number;
  startedAt: string;
  updatedAt: string;
  finalDecision: ReviewDecision | null;
  verification: VerificationDecision | null;
  error: string | null;
  pendingApprovalId?: string | null;
  approvalRequestedFromStatus?: RunStatus | null;
  taskId?: string | null;
};

export type Priority = "low" | "medium" | "high";

export type RoadmapItem = {
  id: string;
  title: string;
  description: string;
  status: "idea" | "planned" | "active" | "blocked" | "done" | "archived";
  priority: Priority;
  createdAt: string;
  updatedAt: string;
  linkedTaskIds: string[];
  notes: string;
};

export type TaskStatus =
  | "backlog"
  | "ready"
  | "queued"
  | "running"
  | "waiting_for_approval"
  | "blocked"
  | "review"
  | "done"
  | "failed"
  | "cancelled";

export type Task = {
  id: string;
  roadmapItemId: string | null;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  dependencies: string[];
  createdAt: string;
  updatedAt: string;
  assignedAgents: string[];
  requiredSkills: string[];
  validationProfile: string | null;
  branchName: string | null;
  worktreePath: string | null;
  runIds: string[];
  currentRunId: string | null;
  touchedFiles: string[];
  riskLevel: Priority;
  commentsCount: number;
  lastEventAt: string | null;
};

export type TaskComment = {
  id: string;
  taskId: string;
  createdAt: string;
  updatedAt: string;
  author: string;
  body: string;
  resolved: boolean;
  resolvedAt: string | null;
  target:
    | "task"
    | "step"
    | "artifact"
    | "file"
    | "diff"
    | "approval"
    | "run";
  targetRef: string | null;
};

export type MicroStep = {
  id: string;
  taskId: string;
  stage:
    | "planning"
    | "architecting"
    | "executing"
    | "validating"
    | "reviewing"
    | "fixing"
    | "verifying";
  status: "pending" | "running" | "passed" | "failed" | "blocked" | "skipped";
  agentId: string | null;
  startedAt: string | null;
  endedAt: string | null;
  artifactPaths: string[];
  diffSnapshotPath: string | null;
  validationResultPath: string | null;
  approvalIds: string[];
  notes: string[];
};

export type QueueEntry = {
  taskId: string;
  enqueuedAt: string;
  priority: Priority;
};

export type SchedulerState = {
  runningTaskIds: string[];
  paused: boolean;
  lastUpdatedAt: string;
  maxConcurrentRuns: number;
  conflictPolicy: "warn" | "block";
  queuePolicy: "fifo" | "priority";
};

export type ConflictWarning = {
  id: string;
  taskId: string;
  conflictsWith: string[];
  overlappingFiles: string[];
  policy: "warn" | "block";
  blocked: boolean;
  createdAt: string;
};

export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";

export type ApprovalRequest = {
  id: string;
  runId: string;
  stageId: string;
  agentId: string;
  createdAt: string;
  updatedAt: string;
  status: ApprovalStatus;
  reason: string | null;
  prompt: string | null;
  sourceArtifactPath: string | null;
  requestedAction: string | null;
  riskLevel: "low" | "medium" | "high";
  source: "agent" | "policy";
  alsoRequiredByPolicy: boolean;
  userMessage: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  decisionNote: string | null;
};

export type AmacoEvent = {
  timestamp: string;
  type: string;
  message: string;
  data?: Record<string, unknown>;
};

export type ChangedFileStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "untracked"
  | "unknown";

export type ChangedFile = {
  path: string;
  status: ChangedFileStatus;
  insertions: number;
  deletions: number;
  isSecretLike: boolean;
  diffRedacted: boolean;
};

export type DiffSnapshot = {
  worktreePath: string;
  baseRef: string;
  files: ChangedFile[];
  totals: {
    files: number;
    insertions: number;
    deletions: number;
    redactedFiles: number;
  };
  generatedAt: string;
};

export type FileDiff = {
  path: string;
  status: ChangedFileStatus;
  body: string;
  redacted: boolean;
  redactionReason?: string;
};

export type ArtifactEntry = { path: string; size: number };

export type Note = {
  id: string;
  createdAt: string;
  updatedAt: string;
  scope: "run" | "artifact" | "file" | "validation" | "event" | "stage";
  target: string;
  message: string;
  resolved: boolean;
  resolvedAt: string | null;
};

export type DiscoveredSkill = {
  id: string;
  name: string;
  description: string | null;
  source: "amaco" | "claude" | "user";
  filePath: string;
  rootDir: string;
  bodyPreview: string;
  frontmatter: Record<string, unknown>;
};

export type SkillAssignmentSummary = {
  agentId: string;
  skills: string[];
};

export type AgentMetrics = {
  agentId: string;
  stageId: string;
  providerId: string;
  providerType: string;
  command: string;
  args: string[];
  cwd: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  exitCode: number;
  promptArtifactPath?: string;
  outputArtifactPath?: string;
  sessionId: string | null;
  model: string | null;
  totalCostUsd: number | null;
  perModelCost: { model: string; costUsd: number }[];
  tokenUsage: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheCreation?: number;
  } | null;
  toolCallCount: number | null;
  filesChangedAfter: number | null;
  diffInsertionsAfter: number | null;
  diffDeletionsAfter: number | null;
  validationSummary: { total: number; passed: number; failed: number } | null;
  reviewDecision: string | null;
  verificationDecision: string | null;
  skillsAttached: string[];
  skillsRequested: string[];
  notes: string[];
};

export type RuntimeMetrics = {
  runId: string;
  task: string;
  startedAt: string;
  updatedAt: string;
  finalStatus: RunStatus | null;
  totalDurationMs: number;
  totalProviderCalls: number;
  totalCostUsd: number | null;
  reviewLoopCount: number;
  filesChanged: number | null;
  diffInsertions: number | null;
  diffDeletions: number | null;
  validationSummary: { total: number; passed: number; failed: number } | null;
  agents: AgentMetrics[];
};

// ─── proposals ────────────────────────────────────────────────────────────────

export type ProposalSummary = {
  id: string;
  sourcePath: string;
  createdAt: string;
  modifiedAt: string;
  accepted: boolean;
  acceptedAt: string | null;
  byteSize: number;
};

export type ProposalRoadmapDraft = {
  title: string;
  description: string;
  priority: Priority;
  tags: string[];
};

export type ProposalTaskDraft = {
  title: string;
  description: string;
  roadmapTitle: string | null;
  priority: Priority;
  riskLevel: Priority;
  dependencies: string[];
  requiredSkills: string[];
  touchedFiles: string[];
  validationHints: string[];
  tags: string[];
};

export type ProposalParseSummary = {
  proposalId: string;
  sourcePath: string | null;
  roadmapItems: ProposalRoadmapDraft[];
  tasks: ProposalTaskDraft[];
  dependencyEdges: { from: string; to: string }[];
  warnings: { taskTitle?: string; roadmapTitle?: string; message: string }[];
  errors: { taskTitle?: string; roadmapTitle?: string; message: string }[];
  needsClarification: string | null;
};

export type ProposalDryRunResponse = {
  dryRun: true;
  willCreate: {
    roadmapItems: ProposalRoadmapDraft[];
    tasks: ProposalTaskDraft[];
    dependencyEdges: { from: string; to: string }[];
  };
  warnings: { message: string }[];
  errors: { message: string }[];
  cycle: string[];
  alreadyAccepted: boolean;
};

export type ProposalAcceptResponse = {
  dryRun: false;
  result: {
    proposalId: string;
    createdRoadmapItemIds: string[];
    createdTaskIds: string[];
    dependencyCount: number;
    warnings: { message: string }[];
    acceptedAt: string;
    auditFilePath: string;
  };
};

// ─── notifications ────────────────────────────────────────────────────────────

export type NotificationSeverity =
  | "info"
  | "success"
  | "warning"
  | "attention"
  | "critical";

export type NotificationCategory =
  | "run"
  | "approval"
  | "task"
  | "scheduler"
  | "conflict"
  | "validation"
  | "review"
  | "system"
  | "gateway";

export type NotificationRecord = {
  id: string;
  createdAt: string;
  updatedAt: string;
  severity: NotificationSeverity;
  category: NotificationCategory;
  title: string;
  message: string;
  runId: string | null;
  taskId: string | null;
  roadmapItemId: string | null;
  approvalId: string | null;
  eventId: string | null;
  sourceEventType: string | null;
  actionRequired: boolean;
  actionLabel: string | null;
  actionUrl: string | null;
  readAt: string | null;
  resolvedAt: string | null;
  metadata: Record<string, unknown>;
};

export type NotificationSettings = {
  enabled: boolean;
  cli: { enabled: boolean };
  inApp: { enabled: boolean };
  browser: { enabled: boolean };
  desktop: { enabled: boolean };
  defaultMinSeverity: NotificationSeverity;
  enabledCategories: NotificationCategory[];
  quietCategories: NotificationCategory[];
  notifyOnApprovalRequested: boolean;
  notifyOnRunCompleted: boolean;
  notifyOnRunBlocked: boolean;
  notifyOnRunFailed: boolean;
  notifyOnValidationFailed: boolean;
  notifyOnSchedulerConflict: boolean;
  notifyOnTaskBlocked: boolean;
};

export type GatewayConfigView = {
  enabled: boolean;
  minSeverity: NotificationSeverity;
  categories: NotificationCategory[];
  url:
    | { kind: "env-ref"; envVar: string; envVarSet: boolean }
    | { kind: "literal"; hasValue: boolean }
    | null;
  token:
    | { kind: "env-ref"; envVar: string; envVarSet: boolean }
    | { kind: "literal"; hasValue: boolean }
    | null;
  target:
    | { kind: "env-ref"; envVar: string; envVarSet: boolean }
    | { kind: "literal"; hasValue: boolean }
    | null;
};

export type GatewayView = {
  id: string;
  type: string;
  channel: string;
  displayName: string;
  supportsTest: boolean;
  config: GatewayConfigView;
  valid: boolean;
  validationReason?: string | null;
  envVarsReferenced?: string[];
  missingEnvVars: string[];
};

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
  amacoRoot: string;
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
  agents: {
    id: string;
    provider: string;
    permissions: string;
    skills: string[];
  }[];
  skills: {
    id: string;
    name: string;
    source: string;
    filePath: string;
  }[];
  scheduler: {
    maxConcurrentRuns: number;
    maxConcurrentWriteAgents: number;
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
};

export type GitHistory = {
  available: boolean;
  worktreePath: string;
  gitRoot: string | null;
  branch: string | null;
  commits: GitCommit[];
  truncated: boolean;
};

export type AgentWorkRow = {
  agentId: string;
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

export type AgentWorkReport = {
  runId: string;
  available: boolean;
  bestEffort: true;
  totalDurationMs: number;
  totalCostUsd: number | null;
  rows: AgentWorkRow[];
  notice: string;
};

// ─── editor / suggestions / freshness ────────────────────────────────────────

export type EditorCandidate = {
  command: string;
  displayName: string;
  description: string;
  available: boolean;
};

export type EditorStatus = {
  candidates: EditorCandidate[];
  configured: {
    config: { enabled: boolean; command: string; args: string[] };
    validation: {
      ok: boolean;
      reason?: string;
      resolvedPlaceholders: string[];
    };
  } | null;
};

export type SuggestionStatus =
  | "open"
  | "approved"
  | "rejected"
  | "applying"
  | "applied"
  | "validation_passed"
  | "validation_failed"
  | "revert_failed"
  | "reverted"
  | "reverted_after_validation_failed"
  | "validation_failed_revert_failed"
  | "failed"
  | "resolved";

export type SuggestionSource = "reviewer" | "verifier" | "user" | "artifact";

export type ReviewSuggestion = {
  id: string;
  runId: string;
  createdAt: string;
  updatedAt: string;
  source: SuggestionSource;
  sourceArtifactPath: string | null;
  file: string | null;
  lineStart: number | null;
  lineEnd: number | null;
  title: string;
  body: string;
  status: SuggestionStatus;
  proposedPatch: string | null;
  requiresApproval: boolean;
  approvalId: string | null;
  decisionNote: string | null;
  errorMessage: string | null;
  bundleId: string | null;
  appliedPatchPath: string | null;
  reversePatchPath: string | null;
  validationResultPath: string | null;
};

export type SuggestionValidationCommand = {
  command: string;
  exitCode: number;
  durationMs: number;
  status: "passed" | "failed";
  stdoutHead: string;
  stderrHead: string;
};

export type SuggestionValidationResult = {
  scope: string;
  scopeKind: "suggestion" | "bundle";
  scopeId: string;
  runId: string;
  worktreePath: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  status: "passed" | "failed" | "no_commands_configured";
  summary: { total: number; passed: number; failed: number };
  commands: SuggestionValidationCommand[];
  resultPath: string;
};

export type BundleStatus =
  | "draft"
  | "approved"
  | "applying"
  | "applied"
  | "partially_applied"
  | "failed"
  | "validation_passed"
  | "validation_failed"
  | "reverted"
  | "reverted_after_validation_failed"
  | "validation_failed_revert_failed"
  | "revert_failed"
  | "rejected"
  | "smart_applying"
  | "smart_applied"
  | "smart_stopped"
  | "smart_reverted_failing"
  | "smart_failed";

export type SmartApplyStep = {
  suggestionId: string;
  applyStatus: "applied" | "failed" | "skipped";
  applyError: string | null;
  validation:
    | {
        status: "passed" | "failed" | "no_commands_configured";
        passed: number;
        failed: number;
      }
    | null;
  revertStatus: "reverted" | "revert_failed" | null;
  revertError: string | null;
};

export type SmartApplyResult = {
  bundleId: string;
  runId: string;
  startedAt: string;
  endedAt: string;
  mode: { validateEachStep: boolean; autoRevertFailing: boolean };
  steps: SmartApplyStep[];
  finalStatus: BundleStatus;
  failedAt: number | null;
  resultPath: string;
};

export type SuggestionBundle = {
  id: string;
  runId: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  status: BundleStatus;
  suggestionIds: string[];
  approvalId: string | null;
  validationResultPath: string | null;
  createdBy: string;
  decisionNote: string | null;
  appliedAt: string | null;
  revertedAt: string | null;
  errorMessage: string | null;
  appliedPatchPath: string | null;
  reversePatchPath: string | null;
  touchedFiles: string[];
  sameFileWarnings: { file: string; suggestionIds: string[] }[];
};

export type BundlePreflightResult = {
  ok: boolean;
  findings: {
    suggestionId: string;
    reason: string | null;
    touchedFiles: string[];
  }[];
  sameFileWarnings: { file: string; suggestionIds: string[] }[];
};

export type CodebaseEvent =
  | {
      kind: "project.git.changed";
      timestamp: string;
      summary: GitStatusSummary;
    }
  | {
      kind: "run.git.changed";
      runId: string;
      timestamp: string;
      summary: GitStatusSummary;
    }
  | {
      kind: "filetree.changed";
      rootKind: "project" | "worktree";
      runId?: string;
      timestamp: string;
      changedPaths: string[];
    }
  | {
      kind: "codebase.snapshot.updated";
      timestamp: string;
      summary: GitStatusSummary | null;
    };

export type GitStatusSummary = {
  branch: string | null;
  isDirty: boolean;
  changedFileCount: number;
  headHash: string | null;
};
