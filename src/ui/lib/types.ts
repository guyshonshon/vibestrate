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
  | "paused"
  | "merge_ready"
  | "blocked"
  | "failed"
  | "aborted";

export type ReviewDecision = "APPROVED" | "CHANGES_REQUESTED" | "BLOCKED";
export type VerificationDecision = "PASSED" | "FAILED" | "NEEDS_HUMAN";

export type FlowRunStepStatus =
  | "pending"
  | "running"
  | "passed"
  | "blocked"
  | "failed"
  | "skipped";

export type FlowRunStepState = {
  id: string;
  label: string;
  kind: string;
  status: FlowRunStepStatus;
  optional: boolean;
  stage:
    | "planning"
    | "architecting"
    | "executing"
    | "reviewing"
    | "verifying"
    | null;
  slotId: string | null;
  roleId: string | null;
  providerId: string | null;
  promptArtifactPath: string | null;
  outputArtifactPath: string | null;
  contextPacketPath: string | null;
  validationArtifactPath: string | null;
  startedAt: string | null;
  endedAt: string | null;
  error: string | null;
};

export type FlowRunState = {
  flowId: string;
  flowVersion: number;
  label: string;
  snapshotPath: string;
  participantLedgerPath: string | null;
  participants: FlowRunParticipantState[];
  currentStepId: string | null;
  steps: FlowRunStepState[];
};

export type FlowContextRetentionMode =
  | "opened"
  | "reused"
  | "rehydrated"
  | "stateless";

export type FlowRunParticipantState = {
  slotId: string;
  label: string;
  providerId: string;
  providerType: string;
  sessionReuse: "none" | "resume";
  sessionId: string | null;
  turnCount: number;
  lastContextMode: FlowContextRetentionMode | null;
  lastFallbackReason: string | null;
};

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
  pauseRequested?: boolean;
  pausedAtStatus?: RunStatus | null;
  effort?: "low" | "medium" | "high" | null;
  providerOverride?: string | null;
  resolvedProviderId?: string | null;
  readOnly?: boolean;
  /** Skill ids attached to every agent for this single run. */
  runtimeSkills?: string[];
  /** Brevity directive applied to every agent prompt for this run. */
  concise?: boolean;
  /** Live sequential Flow ledger, when this run uses a Flow recipe. */
  flow?: FlowRunState | null;
};

export type RunControlDirective =
  | {
      id: string;
      createdAt: string;
      consumedAt: string | null;
      consumedByRole: string | null;
      kind: "inject-note";
      body: string;
    }
  | {
      id: string;
      createdAt: string;
      consumedAt: string | null;
      consumedByRole: string | null;
      kind: "compact";
      note?: string;
    };

export type FlowContextPolicy = "balanced" | "compact" | "artifact-heavy";

export type FlowSource = {
  kind: "builtin" | "project" | "fixture";
  ref: string;
};

export type FlowSlotDefinition = {
  label: string;
  description?: string;
  defaultRole: string;
};

export type FlowStepDefinition = {
  id: string;
  label: string;
  kind:
    | "agent-turn"
    | "review-turn"
    | "response-turn"
    | "validation"
    | "approval-gate"
    | "summary-turn";
  slot?: string;
  roleId?: string;
  inputs: string[];
  outputs: string[];
  optional: boolean;
  skipWhenReadOnly?: boolean;
  stage?: "planning" | "architecting" | "executing" | "reviewing" | "verifying";
  approval?: FlowApprovalGate;
  repeat?: { times: number };
};

export type FlowApprovalGate = {
  reason: string;
  requestedAction: string;
  userMessage?: string;
  riskLevel: "low" | "medium" | "high";
};

export type FlowLoop = {
  from: string;
  to: string;
  decisionStep: string;
  maxIterations: number;
};

export type FlowDefinition = {
  id: string;
  version: number;
  label: string;
  description: string;
  slots: Record<string, FlowSlotDefinition>;
  steps: FlowStepDefinition[];
  loop?: FlowLoop;
};

export type DiscoveredFlow = {
  id: string;
  version: number;
  label: string;
  description: string;
  source: FlowSource;
  definitionPath: string | null;
  definition: FlowDefinition;
};

export type ResolvedFlowSlot = {
  id: string;
  label: string;
  description: string | null;
  defaultRole: string;
  providerId: string;
};

export type ResolvedFlowStep = {
  id: string;
  label: string;
  kind: FlowStepDefinition["kind"];
  enabled: boolean;
  optional: boolean;
  slotId: string | null;
  roleId: string | null;
  providerId: string | null;
  inputs: string[];
  outputs: string[];
  approval: FlowApprovalGate | null;
  sourceStepId: string;
  repeatIteration: number;
  repeatCount: number;
};

export type ResolvedFlowSnapshot = {
  schemaVersion: 1;
  flowId: string;
  flowVersion: number;
  label: string;
  description: string;
  source: FlowSource;
  task: string;
  brief: string | null;
  contextPolicy: FlowContextPolicy;
  resolvedAt: string;
  slots: ResolvedFlowSlot[];
  steps: ResolvedFlowStep[];
};

export type FlowSuggestion = {
  flowId: string;
  label: string;
  confidence: number;
  reasons: string[];
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
  assignedRoles: string[];
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
  effort?: "low" | "medium" | "high" | null;
  providerOverride?: string | null;
  readOnly?: boolean;
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
  roleId: string | null;
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
  source: string;
};

export type SchedulerState = {
  runningTaskIds: string[];
  paused: boolean;
  lastUpdatedAt: string;
  maxConcurrentRuns: number;
  conflictPolicy: "warn" | "block";
  queuePolicy: "fifo" | "priority" | "fair";
  sourceQuotas: Record<string, number>;
  defaultSourceConcurrency?: number;
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
  roleId: string;
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

export type VibestrateEvent = {
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
  source: "vibestrate" | "claude" | "user";
  filePath: string;
  rootDir: string;
  bodyPreview: string;
  frontmatter: Record<string, unknown>;
  /**
   * Names of MCP servers declared by a sibling `.mcp.json`. The full
   * server config (command/args/env) is not echoed to the UI — it can
   * carry tokens. The chip just signals "this skill brings N servers".
   */
  mcpServers: Record<string, { command: string }>;
  mcpError: string | null;
};

export type SkillAssignmentSummary = {
  roleId: string;
  skills: string[];
};

export type RoleMetrics = {
  roleId: string;
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
  flowSlotId: string | null;
  flowContextMode: FlowContextRetentionMode | null;
  flowContextFallbackReason: string | null;
  model: string | null;
  totalCostUsd: number | null;
  /** True when cost was computed locally (tokens × list price), not CLI-reported. */
  costEstimated?: boolean;
  perModelCost: { model: string; costUsd: number }[];
  tokenUsage: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheCreation?: number;
  } | null;
  /** True when tokenUsage was estimated from text (provider reported none). */
  tokensEstimated?: boolean;
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
  roles: RoleMetrics[];
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
  roles: {
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
  baseRef: string | null;
  commits: GitCommit[];
  truncated: boolean;
};

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
  validationProfile: string | null;
};

export type SuggestionValidationCommand = {
  command: string;
  exitCode: number;
  durationMs: number;
  status: "passed" | "failed";
  stdoutHead: string;
  stderrHead: string;
};

export type ValidationProfileSource =
  | "default"
  | "named"
  | "suggestion"
  | "bundle"
  | "override";

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
  profileName: string;
  profileSource: ValidationProfileSource;
  profileCommands: string[];
};

export type ValidationProfileSummary = {
  profileName: string;
  source: ValidationProfileSource;
  commands: string[];
  description: string | null;
  hasCommands: boolean;
};

export type ProfileMigrationScope =
  | { kind: "recent"; limit?: number }
  | { kind: "all" }
  | { kind: "run"; runId: string };

export type ProfileMigrationAffected = {
  runId: string;
  kind: "suggestion" | "bundle";
  id: string;
  currentProfile: string;
  nextProfile: string | null;
  sourceFile: string;
};

export type ProfileMigrationPreview = {
  fromProfile: string;
  toProfile: string | null;
  scope: ProfileMigrationScope;
  scannedRuns: number;
  affectedSuggestions: ProfileMigrationAffected[];
  affectedBundles: ProfileMigrationAffected[];
  malformedFiles: string[];
};

export type ProfileMigrationAuditKind =
  | "migrate_references"
  | "clear_references"
  | "rename_profile";

export type ProfileMigrationAudit = {
  id: string;
  /** Legacy audits written before the rename feature have no `kind` — readers should default them to "migrate_references". */
  kind?: ProfileMigrationAuditKind;
  createdAt: string;
  appliedAt: string | null;
  fromProfile: string;
  toProfile: string | null;
  scope: ProfileMigrationScope;
  affectedSuggestions: ProfileMigrationAffected[];
  affectedBundles: ProfileMigrationAffected[];
  malformedFiles: string[];
  dryRun: boolean;
  appliedBy: string;
  renamedProfile?: boolean;
  preservedDescription?: string | null;
  preservedCommandCount?: number;
};

export type ProfileRenamePreview = {
  fromProfile: string;
  toProfile: string;
  preservedDescription: string | null;
  preservedCommandCount: number;
  scope: ProfileMigrationScope;
  scannedRuns: number;
  affectedSuggestions: ProfileMigrationAffected[];
  affectedBundles: ProfileMigrationAffected[];
  malformedFiles: string[];
  warnings: string[];
};

export type ValidationProfileUsageEntry = {
  profileName: string;
  source: "default" | "named";
  totalUses: number;
  lastUsedAt: string | null;
  lastRunId: string | null;
  lastSuggestionId: string | null;
  lastBundleId: string | null;
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
        profileName: string;
        profileSource: ValidationProfileSource;
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
  mode: {
    validateEachStep: boolean;
    autoRevertFailing: boolean;
    profileOverride: string | null;
    useSuggestionProfiles: boolean;
  };
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
  validationProfile: string | null;
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

export type TerminalAvailability = {
  policyEnabled: boolean;
  driverAvailable: boolean;
  reason: string | null;
};

export type TerminalSession = {
  id: string;
  runId: string;
  cwd: string;
  cols: number;
  rows: number;
  shell: string;
  createdAt: string;
  closedAt: string | null;
  exitCode: number | null;
};

export type PolicySurface = "suggestion-apply" | "bundle-apply";

export type PolicyRuleSummary = {
  id: string;
  description: string;
  appliesTo: PolicySurface[];
  matchAddedContent?: { regex: string; flags?: string };
  matchTouchedFiles?: { glob: string };
  message: string;
};

export type MalformedPolicyFile = {
  file: string;
  reason: string;
};

export type PolicyStoreSnapshot = {
  rules: PolicyRuleSummary[];
  ruleFiles: { file: string; ruleIds: string[] }[];
  malformedFiles: MalformedPolicyFile[];
  duplicateIds: string[];
};

export type PolicyDoctorResult = {
  ruleCount: number;
  fileCount: number;
  malformedFiles: MalformedPolicyFile[];
  duplicateIds: string[];
};

export type PolicyViolation = {
  ruleId: string;
  message: string;
  matchedFile: string | null;
};

export type PolicyCheckResult = {
  surface: PolicySurface;
  evaluatedRuleIds: string[];
  violations: PolicyViolation[];
  ruleCountTotal: number;
  ruleCountForSurface: number;
  limits: { maxScanItemLength: number; maxPatchBytes: number };
};

export type ReplayPhaseKey =
  | "flows"
  | "planning"
  | "architecting"
  | "executing"
  | "validating"
  | "reviewing"
  | "fixing"
  | "verifying"
  | "approvals"
  | "suggestions"
  | "policies"
  | "notifications"
  | "terminal"
  | "other";

export type ReplayEvent = {
  index: number;
  timestamp: string;
  source: "event" | "synthetic";
  type: string;
  message: string;
  data: Record<string, unknown> | null;
  phaseKey: ReplayPhaseKey;
  artifactRefs: string[];
};

export type ReplayPhase = {
  key: ReplayPhaseKey;
  label: string;
  eventIndices: number[];
  startTimestamp: string | null;
  endTimestamp: string | null;
};

export type ReplayStateSnapshot = {
  timestamp: string;
  status: string;
  previousStatus: string | null;
};

export type ReplayApproval = {
  id: string;
  stageId: string;
  roleId: string;
  status: string;
  riskLevel: string;
  source: string;
  reason: string | null;
  createdAt: string;
  resolvedAt: string | null;
  decisionNote: string | null;
};

export type ReplaySuggestion = {
  id: string;
  title: string;
  source: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  file: string | null;
  validationProfile: string | null;
  bundleId: string | null;
  errorMessage: string | null;
};

export type ReplayBundle = {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  suggestionIds: string[];
  validationProfile: string | null;
  errorMessage: string | null;
};

export type ReplayPolicyRefusal = {
  timestamp: string;
  surface: "suggestion-apply" | "bundle-apply" | "unknown";
  ruleId: string;
  message: string;
  targetId: string | null;
};

export type ReplayNotification = {
  id: string;
  createdAt: string;
  severity: string;
  category: string;
  title: string;
  message: string;
  runId: string | null;
  taskId: string | null;
  approvalId: string | null;
};

export type ReplayTerminalSession = {
  id: string;
  runId: string;
  cwd: string;
  cols: number;
  rows: number;
  shell: string;
  createdAt: string;
  closedAt: string | null;
  exitCode: number | null;
};

export type ReplayMetricsSummary = {
  totalDurationMs: number;
  totalProviderCalls: number;
  totalCostUsd: number | null;
  reviewLoopCount: number;
  filesChanged: number | null;
  diffInsertions: number | null;
  diffDeletions: number | null;
  roleStageOrder: string[];
};

export type ReplayFlowSummary = {
  flowId: string;
  label: string;
  currentStepId: string | null;
  participants: {
    slotId: string;
    label: string;
    providerId: string;
    providerType: string;
    lastContextMode: string | null;
    turnCount: number;
  }[];
  steps: {
    id: string;
    label: string;
    kind: string;
    status: FlowRunStepStatus;
  }[];
};

export type ReplayTruncation = {
  truncated: boolean;
  totalEventCount: number;
  keptEventCount: number;
  keptKind: "latest";
  note: string;
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
