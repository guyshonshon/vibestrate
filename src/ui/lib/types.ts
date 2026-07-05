// ── Spec-up phase: one CTO intake gap-question rendered as a form input. ──
export type SpecUpQuestionCategory =
  | "scope"
  | "users"
  | "data"
  | "constraints"
  | "success"
  | "integrations"
  | "other";

export type SpecUpQuestion = {
  id: string;
  question: string;
  why: string;
  kind: "choice" | "text";
  options: string[];
  // Which area of the spec this question scopes (model-judged). Drives the
  // per-category progress grouping in the deep-questioning loop.
  category: SpecUpQuestionCategory;
  // The round this question was raised in. Server-stamped chain state (never
  // model-emitted) - see spec-up-chain.ts.
  round: number;
};

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
  /** DAG dependencies (Slice 4); empty for linear flows. */
  needs?: string[];
  seat: string | null;
  resolvedRoleId: string | null;
  resolvedRoleLabel: string | null;
  profileId: string | null;
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
  seat: string;
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
  /** Friendly, editable run label (T6). Falls back to the task when absent. */
  displayName?: string | null;
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
  /** Crew the run resolved against (null = project.defaultCrew). */
  crewId?: string | null;
  /** Run-wide Profile override applied to every seated step. */
  profileOverride?: string | null;
  /** Per-step Profile overrides (step id → profile id). */
  stepProfileOverrides?: Record<string, string>;
  readOnly?: boolean;
  /** The resolved permission mode (P4) that governed this run. */
  permissionMode?: "read-only" | "ask" | "accept-edits" | "auto";
  /** Skill ids attached to every agent for this single run. */
  runtimeSkills?: string[];
  /** Brevity directive applied to every agent prompt for this run. */
  concise?: boolean;
  /** Live sequential Flow ledger, when this run uses a Flow recipe. */
  flow?: FlowRunState | null;
  /** Server-computed: a spec-up-intake run still awaiting the user's answers
   *  (questions present and not yet consumed). The honest "awaiting input"
   *  signal - do NOT infer awaiting from status. */
  awaitingInput?: boolean;
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

export type FlowSeatDefinition = {
  label: string;
  description?: string;
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
  seat?: string;
  inputs: string[];
  outputs: string[];
  /** DAG dependencies (Slice 4). Steps sharing a `needs` set can fan out. */
  needs?: string[];
  /** Step-specific prompt instruction (e.g. a reviewer's lens). */
  instructions?: string;
  /** Per-step skills (P2): skill ids injected into this turn's prompt. */
  skills?: string[];
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

/** A declared flow parameter (T11). */
export type FlowParam = {
  type: "string" | "number" | "boolean" | "enum" | "path";
  description?: string;
  required?: boolean;
  default?: string | number | boolean;
  values?: string[];
  secret?: boolean;
  /** Durable param memory: project-global (shared) vs flow-namespaced storage. */
  shared?: boolean;
  /** Optional model-independent "generate a default" hint (P4). */
  generate?: { instruction: string };
};

export type FlowDefinition = {
  id: string;
  version: number;
  label: string;
  description: string;
  seats: Record<string, FlowSeatDefinition>;
  steps: FlowStepDefinition[];
  /** Caller-filled params (T11), keyed by name. */
  params?: Record<string, FlowParam>;
  loop?: FlowLoop;
  // The per-item band (Phase 3 pick-up + Phase D checklist DAGs); from/to step ids.
  checklistSegment?: { from: string; to: string };
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

export type ResolvedFlowSeat = {
  id: string;
  label: string;
  description: string | null;
};

export type ResolvedFlowStep = {
  id: string;
  label: string;
  kind: FlowStepDefinition["kind"];
  enabled: boolean;
  optional: boolean;
  /** Seat the step needs (null for validation / approval-gate). */
  seat: string | null;
  /** Resolved from the run's Crew. All null for seatless steps. */
  resolvedRoleId: string | null;
  resolvedRoleLabel: string | null;
  profileId: string | null;
  providerId: string | null;
  inputs: string[];
  outputs: string[];
  /** DAG dependencies (Slice 4); empty for linear flows. */
  needs?: string[];
  /** A3 express deterministic review descent (P4b). NOTE: this type is a
   *  hand-maintained mirror of resolvedFlowStepSchema - keep them tracking. */
  skipWhen?: "inert_diff" | null;
  /** Step-specific prompt instruction (e.g. a reviewer's lens), or null. */
  instructions?: string | null;
  approval: FlowApprovalGate | null;
  sourceStepId: string;
  repeatIteration: number;
  repeatCount: number;
};

export type SeatCoverageStatus = "filled" | "gap" | "ambiguous";

export type SeatCoverage = {
  seatId: string;
  label: string;
  status: SeatCoverageStatus;
  candidateRoleIds: string[];
  resolvedRoleId: string | null;
  usedByStep: boolean;
};

export type FlowCoverage = {
  crewId: string;
  seats: SeatCoverage[];
  runnable: boolean;
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
  crewId: string;
  seats: ResolvedFlowSeat[];
  steps: ResolvedFlowStep[];
  // The per-item band (Phase 3 pick-up + Phase D checklist DAGs): the runner
  // repeats from..to once per checklist item. null when not checklist-aware.
  checklistSegment?: { from: string; to: string } | null;
};

// ─── crews / profiles (the new run-composition model) ───────────────────────

export type CrewRoleView = {
  id: string;
  label: string;
  /** Seats this role can take. */
  seats: string[];
  profile: string;
  profileConfigured: boolean;
  /** Provider behind the role's profile (null if profile missing). */
  provider: string | null;
  providerConfigured: boolean;
  permissions: string;
  skills: string[];
};

export type CrewView = {
  id: string;
  label: string;
  /** Per-crew override of the global review-loop count; null = inherit. */
  maxReviewLoops: number | null;
  roles: CrewRoleView[];
};

export type WorkflowSelectionView = {
  flowId: string;
  crewId: string | null;
  source:
    | "forced"
    | "default"
    | "selected"
    | "only-flow"
    | "sized"
    | "spec-up"
    | "supervisor-upgraded";
  /** Adaptive spec-up (P1): the brief is under-specified, so the run is spec'd up
   *  first and then `flowId` executes seeded with the derived spec. */
  needsSpecUp?: boolean;
  confidence: "low" | "medium" | "high";
  reasons: string[];
  risks: string[];
  posture: "normal" | "sandbox-suggested" | "approval-suggested";
  advisory: string | null;
  /** Active supervisor persona id (orchestrator-personas.md). */
  personaId?: string | null;
  /** Set when the persona upgraded the flow for a risk-tagged task. */
  personaUpgrade?: { from: string; to: string; signals: string[] } | null;
};

export type ConsultActionKind =
  | "run"
  | "select_flow"
  | "annotate"
  | "propose_config"
  | "propose_vibestrate"
  | "request_sandbox"
  | "explain_block"
  | "other";

export type ConsultAnswer = {
  answer: string;
  confidence: "low" | "medium" | "high";
  caveats: string[];
  usedContext: string[];
  recommendedActions: { kind: ConsultActionKind; detail: string }[];
  proposedManualUpdate: { rationale: string; evidence: string; suggestedText: string } | null;
};

/** Deterministic, code-computed consult sections (T10). */
/** What a computed consult item links to (run -> run detail, task -> board). */
export type ConsultRef =
  | { kind: "run"; id: string }
  | { kind: "task"; id: string };
/** A computed item: human text + an optional reference to open. */
export type ConsultSectionItem = { text: string; ref?: ConsultRef };

export type ConsultSections = {
  recentActivity: ConsultSectionItem[];
  openIntents: ConsultSectionItem[];
  mentionedNeverWorked: ConsultSectionItem[];
  suggestedNextSteps: ConsultSectionItem[];
  /** Maintenance tips (e.g. rewind-snapshot growth). Surfaced, never auto-applied.
   *  Plain text (no ref). Optional: older consult responses predate it. */
  housekeeping?: string[];
};

export type ConsultResult = {
  answer: ConsultAnswer;
  usedSources: string[];
  notes: string[];
  /** Deterministic project-state sections - same state => same sections (T10). */
  sections?: ConsultSections;
  providerId: string;
  profileId: string;
  /** Model + effort actually used (null = the provider's own default). */
  model: string | null;
  effort: string | null;
  /** Id of the persisted VIBESTRATE.md proposal, when the answer proposed one. */
  proposalId?: string | null;
};

export type ProfileView = {
  id: string;
  provider: string;
  providerConfigured: boolean;
  label: string;
  model: string | null;
  power: string | null;
  maxTokens: number | null;
  timeoutMs: number | null;
  /** Crew roles that point at this profile (empty = unused). */
  usedBy: { crewId: string; roleId: string }[];
};

export type ProviderCapabilities = {
  models: string[];
  /** Whether model selection actually applies (UI hides the field if false). */
  modelEnabled: boolean;
  powerLevels: string[];
};
/** Per-provider suggestion lists for the Profile editor (keyed by provider id). */
export type ProviderCatalog = Record<string, ProviderCapabilities>;

/** Full catalog response: the merged capabilities, the overlay status, and where
 *  each provider's spec came from (built-in vs the project overlay). */
export type ProviderCatalogResponse = {
  catalog: ProviderCatalog;
  overlay: { present: boolean; path: string };
  sources: Record<string, "overlay" | "built-in">;
};

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
  // Spec-up phase (M4): prose acceptance criteria + a rough size estimate.
  acceptanceCriteria?: string;
  // P5: user-authored machine-checkable acceptance commands (extra validation
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
  // Saga step fields (Phase 1)
  objective?: string;
  acceptanceCheck?: string;
  fileHints?: string[];
  // Saga conductor (Phase 2): the run that executed this step + its one-line outcome.
  runId?: string | null;
  outcomeSummary?: string;
  // Saga conductor (Phase 3): who authored the step - "owner" (human) or
  // "conductor" (the autonomous Enhance pass).
  provenance?: "owner" | "conductor";
};

// Saga conductor lifecycle + halt (Phase 2). Mirrors src/roadmap/roadmap-types.ts.
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
  /** Legacy audits written before the rename feature have no `kind` - readers should default them to "migrate_references". */
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

export type PolicyActionKind =
  | "provider.spawn"
  | "command.run"
  | "file.patch"
  | "file.write"
  | "terminal.create"
  | "run.complete";

export type ActionPolicySummary = {
  id: string;
  description: string;
  on: PolicyActionKind[];
  match?: {
    providerId?: string;
    commandRegex?: string;
    commandFlags?: string;
    pathGlob?: string;
    status?: string;
  };
  effect: "deny" | "require_approval";
  message: string;
};

export type MalformedPolicyFile = {
  file: string;
  reason: string;
};

export type PolicyStoreSnapshot = {
  rules: PolicyRuleSummary[];
  actions: ActionPolicySummary[];
  ruleFiles: { file: string; ruleIds: string[]; actionIds: string[] }[];
  malformedFiles: MalformedPolicyFile[];
  duplicateIds: string[];
};

/** The editable `policies.*` safety toggles (Advanced - Safety panel). */
export type SafetyPoliciesConfig = {
  strictApplyOnly: boolean;
  hardenReadOnlySeats: boolean;
  allowInteractiveTerminal: boolean;
  forbidMainBranchWrites: boolean;
  forbidSecretsAccess: boolean;
  forbidAutoPush: boolean;
  forbidAutoMerge: boolean;
  requireApprovalAtStages: string[];
  /** Posture auto-apply (Slice 2b). Carried by the safety endpoint, persisted
   *  to `posture.*`. Both default off. */
  autoApplySandbox: boolean;
  autoApplyApproval: boolean;
};

/** A flow row from the live hub search (mirrors hub-client's normalized
 *  HubFlowSummary - `description`/`author` are filled from their live-contract
 *  synonyms server-side). */
export interface HubPublishResult {
  ok: boolean;
  ref?: string;
  version?: string;
  sha256?: string;
  verified?: boolean;
  alreadyExisted?: boolean;
  diagnosis?: { verdict?: string; findings?: Array<{ severity?: string; message?: string; path?: string }> };
}

export type HubFlowRow = {
  ref: string;
  name?: string | null;
  handle?: string | null;
  /** The hub's curation claim - render as "hub-curated", never "verified". */
  verified?: boolean | null;
  version?: string | null;
  label?: string | null;
  description?: string | null;
  tags?: string[] | null;
  author?: string | null;
  installs?: number | null;
  steps?: number | null;
  diagnosis?: unknown;
};

export type RunAssuranceVerdict =
  | "blocked"
  | "unsafe"
  | "unverified"
  | "partially_verified"
  | "verified";

export type RunAssurance = {
  schemaVersion: 1;
  runId: string;
  verdict: RunAssuranceVerdict;
  summary: string;
  generatedAt: string;
  policy: {
    status: "passed" | "held" | "violated";
    rulesEvaluated: string[];
    violations: { kind: string; ruleIds: string[]; reason: string }[];
  };
  validation: {
    /** "environment" = commands could not run (toolchain missing in the
     *  worktree); nothing was validated, but nothing failed either.
     *  "not_applicable" = no validation was required (no step / no commands /
     *  inert-diff scope-skip) - distinct from "missing" (expected, no evidence). */
    status: "passed" | "failed" | "environment" | "missing" | "not_applicable";
    total: number;
    passed: number;
    failed: number;
    environment: number;
  };
  review: {
    status:
      | "approved"
      | "changes_requested"
      | "missing"
      | "skipped_inert_diff"
      | "not_applicable";
  };
  verification: { status: "passed" | "failed" | "not_run" | "not_applicable" };
  coverage: { toleratedStepFailures: number };
  /** Root causes for a blocked/unsafe run (provider give-ups, failed steps).
   *  Optional: older assurance artifacts predate it. */
  blockers?: {
    stepId: string | null;
    kind: "provider" | "step" | "policy";
    class: string | null;
    detail: string;
  }[];
  caps: string[];
  /** Informational context that does NOT cap the verdict (not-applicable lanes,
   *  inert-diff review skip). Optional: older artifacts predate it. */
  notes?: string[];
  /** True iff a real check ran and passed (vs "nothing was required"). Lets a
   *  `verified` run be told apart from a "nothing to check" run. Optional:
   *  older artifacts predate it. */
  anyRealCheckPassed?: boolean;
  // Supervisor persona + how independent its review was (orchestrator-personas.md).
  // independence is honest, NOT a confidence source.
  supervisor?: {
    persona: string | null;
    independence: "cross-model" | "single-profile";
  };
  /** How confined the run's agents actually were (from per-turn provider events,
   *  not config). Informational - never caps the verdict; "none" is the default
   *  baseline (worktree + diff gate). Optional: older artifacts predate it. */
  isolation?: {
    posture: "sandboxed" | "hardened" | "partial" | "none";
    osSandboxedTurns: number;
    hardenedTurns: number;
    unconfinedRequestedTurns: number;
  };
};

// Supervisor personas (orchestrator-personas.md) - the run composer's selector.
export type PersonaSummary = {
  id: string;
  label: string;
  description?: string;
  reviewLenses: string[];
  /** Flows this persona favors for risky work (upgrade-only bias). */
  prefersFlows?: string[];
  /** Review seats run this Profile when set (the supervisor's cost lever). */
  reviewerProfile?: string | null;
  /** Advisory posture this persona suggests for risky tasks (null = none). */
  prefersPosture?: string | null;
  /** Free-text CTO posture injected into the spec-up planning agents (null = none). */
  specUpPosture?: string | null;
  builtin: boolean;
};
/** A project policy (docs/design/policy-consolidation.md): the consolidated,
 *  project-scoped tiered rule surface (advise = reviewer-checked; block =
 *  deterministic merge-cap). */
export type ProjectPolicy = {
  id: string;
  statement: string;
  correction: string | null;
  scope: { lenses: string[] };
  source: "owner" | "supervisor-proposed";
  confirmedAt: string | null;
  tier: "advise" | "block";
  matcher: string | null;
};
export type PersonasResponse = {
  defaultPersona: string;
  personas: PersonaSummary[];
};

// A curated supervisor archetype (server-owned; the client adopts one by id).
export type SupervisorArchetypeView = {
  id: string;
  label: string;
  description?: string;
  reviewLenses: string[];
  prefersFlows: string[];
  reviewerProfile: string | null;
  prefersPosture: string | null;
  specUpPosture: string | null;
  /** This archetype's id is already present in config.personas. */
  adopted: boolean;
};

// Run audit tree (see src/core/run-audit.ts).
export type AuditAttemptOutcome =
  | "success"
  | "rate-limit"
  | "transient"
  | "fallback"
  | "paused"
  | "tolerated-failure"
  | "failed";

export type AuditAttempt = {
  index: number;
  outcome: AuditAttemptOutcome;
  detail: string | null;
};

export type AuditStep = {
  id: string;
  label: string;
  kind: string;
  seat: string | null;
  status: string;
  stage: string | null;
  roleId: string | null;
  roleLabel: string | null;
  profileId: string | null;
  needs: string[];
  provider: string | null;
  model: string | null;
  costUsd: number | null;
  durationMs: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  toolCallCount: number | null;
  retries: number;
  fellBack: boolean;
  decision: string | null;
  attempts: AuditAttempt[];
  tools: { name: string; count: number }[];
  subAgents: { name: string; description: string | null }[];
  internalsOpaque: boolean;
};

export type EngagementClass = "judgment" | "enforced" | "structural";
export type EngagementTone = "ok" | "warn" | "bad" | "info";
export type EngagementAnchor = "root" | "fanout" | "step" | "run";

export type EngagementEntry = {
  seq: number;
  timestamp: string;
  type: string;
  cls: EngagementClass;
  anchor: EngagementAnchor;
  stepId: string | null;
  title: string;
  detail: string | null;
  tone: EngagementTone;
};

export type RunAudit = {
  schemaVersion: 1;
  runId: string;
  task: string;
  status: string;
  flow: { id: string; label: string } | null;
  assuranceVerdict: string | null;
  steps: AuditStep[];
  control: { type: string; message: string }[];
  engagement: EngagementEntry[];
  totals: {
    turns: number;
    retries: number;
    fallbacks: number;
    costUsd: number | null;
  };
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

// ── Supervisor-assisted policy authoring / dry-run (draft / suggest / test) ────
// A model-proposed, EDITABLE draft. Nothing here is committed - the owner adopts
// it by an explicit addProjectPolicy() Save. `suggestedTier`/`matcher` are hints.
export type PolicyDraft = {
  statement: string;
  message: string;
  suggestedTier: "advise" | "block";
  matcher: { regex: string; flags: string } | null;
  glob: string | null;
  appliesTo: PolicySurface[];
};

export type PolicyTestMatch = {
  file: string | null;
  /** Redacted + truncated matched line (never raw diff content). */
  line: string | null;
  runId?: string;
};

export type PolicyTestResult = {
  matches: PolicyTestMatch[];
  evaluatedCount: number;
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
    seat: string;
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
