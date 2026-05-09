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
