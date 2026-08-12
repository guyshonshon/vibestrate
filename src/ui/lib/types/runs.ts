// ── Spec-up phase: one intake gap-question rendered as a form input. ──
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
  /** DAG dependencies; empty for linear flows. */
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
  /** Present on a checklist run: where the band has got to. Mirrors
   *  runStateSchema.checklistProgress, which the server already sends. */
  checklistProgress?: {
    total: number;
    completed: number;
    currentItemId: string | null;
    currentIndex: number;
  } | null;
  runId: string;
  task: string;
  /** Friendly, editable run label. Falls back to the task when absent. */
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
  /** The resolved permission mode that governed this run. */
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
  /** DAG dependencies. Steps sharing a `needs` set can fan out. */
  needs?: string[];
  /** Step-specific prompt instruction (e.g. a reviewer's lens). */
  instructions?: string;
  /** Per-step skills: skill ids injected into this turn's prompt. */
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

/** A declared flow parameter. */
export type FlowParam = {
  type: "string" | "number" | "boolean" | "enum" | "path";
  description?: string;
  required?: boolean;
  default?: string | number | boolean;
  values?: string[];
  secret?: boolean;
  /** Durable param memory: project-global (shared) vs flow-namespaced storage. */
  shared?: boolean;
  /** Optional model-independent "generate a default" hint. */
  generate?: { instruction: string };
};

export type FlowDefinition = {
  id: string;
  version: number;
  label: string;
  description: string;
  seats: Record<string, FlowSeatDefinition>;
  steps: FlowStepDefinition[];
  /** Caller-filled params, keyed by name. */
  params?: Record<string, FlowParam>;
  loop?: FlowLoop;
  // The per-item band (pick-up + checklist DAGs); from/to step ids.
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
  /** DAG dependencies; empty for linear flows. */
  needs?: string[];
  /** Express deterministic review descent. NOTE: this type is a
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
  // The per-item band (pick-up + checklist DAGs): the runner
  // repeats from..to once per checklist item. null when not checklist-aware.
  checklistSegment?: { from: string; to: string } | null;
};
