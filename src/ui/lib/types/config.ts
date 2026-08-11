import type {
  FlowContextRetentionMode,
  RunStatus,
} from "./runs.js";

// ─── Config view (readable, grouped projection of project.yml) ─────────────
// Mirrors src/setup/config-view.ts. Kept self-contained here (types.ts ships
// with zero cross-package imports); the server route builds the canonical
// shape and this is the wire contract the dashboard reads.
export type ConfigRowTone = "default" | "on" | "off" | "warn";
export type ConfigRow = {
  label: string;
  value: string;
  hint?: string;
  tone?: ConfigRowTone;
};
export type ConfigSectionEditable = {
  surface: string | null;
  route: string | null;
  cli: string[];
  live: boolean;
};
export type ConfigSection = {
  id: string;
  title: string;
  summary: string;
  editable: ConfigSectionEditable;
  rows: ConfigRow[];
};
export type ConfigView = {
  project: { name: string; type: string };
  sections: ConfigSection[];
};
export type ConfigViewResponse = {
  configPath: string;
  valid: boolean;
  error: string | null;
  view: ConfigView;
};

// ─── Config fields (schema-driven editor) ──────────────────────────────────
// Mirrors GET /api/config/fields. Every settable leaf key with its type/enum/
// default/description (off the Zod schema) + its CURRENT value. Record-container
// leaves (providers/crews/profiles/personas/permissions.profiles) are flagged so
// the UI links out to their dedicated editor rather than raw-editing.
export type ConfigFieldDto = {
  fullKey: string;
  /** e.g. "string", "number", "boolean", "enum", "array<string>", "record<...>". */
  type: string;
  enum: string[] | null;
  default: unknown;
  description: string | null;
  required: boolean;
  isRecordContainer: boolean;
  /** Shell/executable-valued (commands.validate, editor.command): read-only in
   *  the UI, CLI-authored for safety - the server rejects a write to these. */
  execGuarded: boolean;
  /** Current effective value (falls back to the schema default). */
  current: unknown;
};
export type ConfigFieldsResponse = {
  configPath: string;
  fields: ConfigFieldDto[];
};

/** Result of probing CLI providers (codex `debug models` JSON, else `--help`)
 *  to refresh the overlay. */
export type CatalogProbeFinding = {
  providerId: string;
  status:
    | "added"
    | "skipped-overlay"
    | "skipped-builtin"
    | "nothing-found"
    | "probe-failed"
    | "not-cli";
  effort?: { flag: string; levels: string[] };
  models?: string[];
  detail?: string;
  /** Structured-probe model deltas vs the prior list. */
  added?: string[];
  removed?: string[];
  /** How the knobs were obtained ("--help" or "codex debug models"). */
  source?: string;
};
export type CatalogRefreshResult = {
  findings: CatalogProbeFinding[];
  wrote: boolean;
  overlayPath: string;
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
  runMode?: "plain" | "supervised";
  roadmapItemId: string | null;
  title: string;
  description: string;
  // Spec-up phase: prose acceptance criteria + a rough size estimate.
  acceptanceCriteria?: string;
  // User-authored machine-checkable acceptance commands (extra validation
  // pass on the card's run). Prose criteria are LLM-judged; these are machine-run.
  acceptanceCommands?: string[];
  est?: string;
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
  profileOverride?: string | null;
  readOnly?: boolean;
  checklist?: ChecklistItem[];
  // Supervised run (the Conductor). Grouped to mirror the backend Task shape.
  supervised?: {
    state?: SupervisedState;
    halt?: SupervisedHalt | null;
    invariants?: string[];
    pendingRevision?: unknown;
  };
  runOptions?: { budget?: { maxSpendUsd: number | null; maxSteps: number | null } };
  needsTesting?: boolean;
  needsTestingReason?: string | null;
  derivedFrom?: { taskId: string; itemId: string } | null;
  archived?: boolean;
  contextSources?: ContextSource[];
};

export type ContextSource = {
  kind: "file" | "url";
  ref: string;
  label?: string;
};

export type TaskSuggestion = {
  taskId: string;
  title: string;
  ready: boolean;
  priority: Priority;
  openBlockers: string[];
  reason: string;
};

export type ChecklistItemStatus = "pending" | "in_progress" | "done" | "blocked";

// Per-item review verdict (Shape B, pickup-review flow). Mirrors PerItemVerdict
// in src/flows/runtime/per-item-verdicts.ts - kept in sync manually.
export type PerItemVerdict = {
  itemIndex: number;
  verdict: "approved" | "changes_requested" | "none";
  openFindingCount: number;
  /** Fix-loop iterations before the final verdict. Defaults to 0 when read
   * back from the arbitration ledger (not stored there). */
  fixIterations: number;
};

export type ChecklistItem = {
  id: string;
  text: string;
  status: ChecklistItemStatus;
  createdAt: string;
  updatedAt: string;
  commitSha: string | null;
  promotedTaskId: string | null;
  // Saga step fields
  objective?: string;
  acceptanceCheck?: string;
  fileHints?: string[];
  // Saga conductor: the run that executed this step + its one-line outcome.
  runId?: string | null;
  outcomeSummary?: string;
  // Saga conductor: who authored the step - "owner" (human) or
  // "conductor" (the autonomous Enhance pass).
  provenance?: "owner" | "conductor";
};

// Saga conductor lifecycle + halt. Mirrors src/roadmap/roadmap-types.ts.
export type SupervisedState = "idle" | "sequencing" | "paused" | "halted" | "done";
export type SupervisedHalt = {
  reason: string;
  atStepId: string | null;
  summary: string;
};

// The live conductor status served by GET /api/sagas/:taskId/status (and
// `vibe saga status`). `liveRunId` is the run sequencing the saga right now.
export type TaskRunStatus = {
  taskId: string;
  title: string;
  supervisedState: SupervisedState;
  liveRunId: string | null;
  currentRunId: string | null;
  progress: { done: number; total: number };
  supervisedHalt: SupervisedHalt | null;
  supervisedInvariants: string[];
  steps: Array<{
    id: string;
    text: string;
    status: ChecklistItemStatus;
    commitSha: string | null;
    runId: string | null;
    outcomeSummary: string;
  }>;
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
  /** Worktree-relative paths this gate is about (post-turn diff gate). */
  files: string[];
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
   * server config (command/args/env) is not echoed to the UI - it can
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
  flowSeat: string | null;
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
