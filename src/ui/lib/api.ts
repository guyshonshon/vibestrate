import type { EditorProviderConfig } from "./provider-yaml.js";
import type {
  RoleWorkReport,
  VibestrateEvent,
  ShapeQuestion,
  ApprovalRequest,
  ArtifactEntry,
  ChecklistItem,
  ConsultResult,
  WorkflowSelectionView,
  ChecklistItemStatus,
  CodeReference,
  ConflictWarning,
  CrewView,
  ProfileView,
  ProviderCatalog,
  ProviderCatalogResponse,
  ConfigViewResponse,
  CatalogRefreshResult,
  DiffSnapshot,
  DiscoveredSkill,
  DiscoveredFlow,
  EditorStatus,
  FileDiff,
  FileTreeResult,
  FileView,
  GatewayView,
  GitHistory,
  GitStatus,
  MicroStep,
  NotificationRecord,
  NotificationSettings,
  Note,
  ProjectMetadata,
  ReviewSuggestion,
  SmartApplyResult,
  SuggestionBundle,
  SuggestionValidationResult,
  BundlePreflightResult,
  ValidationProfileSummary,
  ProfileMigrationPreview,
  ProfileMigrationAudit,
  ProfileRenamePreview,
  ValidationProfileUsageEntry,
  ProposalAcceptResponse,
  ProposalDryRunResponse,
  ProposalParseSummary,
  ProposalSummary,
  QueueEntry,
  RoadmapItem,
  EngagementEntry,
  RunAssurance,
  PersonasResponse,
  RunAudit,
  RunControlDirective,
  RunState,
  RuntimeMetrics,
  SchedulerState,
  SkillAssignmentSummary,
  Task,
  TaskComment,
  TaskSuggestion,
  TerminalAvailability,
  TerminalSession,
  PolicyStoreSnapshot,
  PolicyDoctorResult,
  SafetyPoliciesConfig,
  PolicyCheckResult,
  PolicySurface,
  RunReplay,
  FlowContextPolicy,
  FlowSuggestion,
  FlowLoop,
  ResolvedFlowSnapshot,
  FlowCoverage,
  HubFlowRow,
} from "./types.js";

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

async function jsonGet<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    throw new ApiError(res.status, await readErrorMessage(res));
  }
  return (await res.json()) as T;
}

async function readErrorMessage(res: Response): Promise<string> {
  // Server routes now return `{ error, kind, title, hint }` (see
  // setErrorHandler in src/server/server.ts). Prefer `title - hint`
  // when present so the user sees a sentence they can act on instead
  // of a raw exception message. Falls back to `error`, then to body
  // text, then to the status line.
  try {
    const body = (await res.clone().json()) as {
      error?: string;
      title?: string;
      hint?: string;
    };
    if (typeof body.title === "string" && body.title.length > 0) {
      return body.hint ? `${body.title} - ${body.hint}` : body.title;
    }
    if (typeof body.error === "string" && body.error.length > 0) {
      return body.error;
    }
  } catch {
    /* fall through */
  }
  try {
    const text = await res.text();
    if (text.trim().length > 0) return text.trim();
  } catch {
    /* fall through */
  }
  return `${res.status} ${res.statusText}`;
}

async function jsonPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : "{}",
  });
  if (!res.ok) {
    throw new ApiError(res.status, await readErrorMessage(res));
  }
  return (await res.json()) as T;
}

async function jsonPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new ApiError(res.status, await readErrorMessage(res));
  }
  return (await res.json()) as T;
}

async function jsonPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new ApiError(res.status, await readErrorMessage(res));
  }
  return (await res.json()) as T;
}

async function jsonDelete<T>(path: string): Promise<T> {
  const res = await fetch(path, { method: "DELETE" });
  if (!res.ok) {
    throw new ApiError(res.status, await readErrorMessage(res));
  }
  return (await res.json()) as T;
}

export type OverviewRange = "24h" | "7d" | "30d" | "90d";

export type CrewPresetView = {
  id: string;
  label: string;
  description: string;
  installed: boolean;
  available: boolean;
  reason?: string;
  effect?: {
    provider: string;
    model: string | null;
    power: string | null;
    maxReviewLoops: number | null;
  };
};

export type DailyOutcomeBucket = {
  date: string;
  label: string;
  merged: number;
  changes: number;
  failed: number;
};

export type SpendByRoleEntry = {
  providerId: string;
  label: string;
  dollars: number;
  runs: number;
};

export type PhaseLatencyEntry = {
  phase: string;
  p50: number;
  p95: number;
  samples: number;
};

export type HeatmapRow = { day: string; cells: number[] };

export type LeaderboardEntry = {
  providerId: string;
  label: string;
  vendor: string | null;
  runs: number;
  successRate: number | null;
  avgDurSeconds: number | null;
  p95Seconds: number | null;
  costUsd: number;
  delta: number;
};

export type KpiSparks = {
  runs: number[];
  success: number[];
  duration: number[];
  spend: number[];
};

export type BudgetSettings = {
  spendCapDailyUsd: number | null;
  capAction: "stop" | "downgrade-model" | "reduce-effort";
  warnThresholdPct: number;
  fallbackProfile?: string | null;
  // Count/time ceilings (bind without measured cost). null = off.
  maxTurnsPerRun?: number | null;
  maxWallClockMinPerRun?: number | null;
  maxTurnsPerDay?: number | null;
  maxWallClockMinPerDay?: number | null;
  onLimit?: "stop" | "pause";
};

export type MetricsOverview = {
  range: OverviewRange;
  generatedAt: string;
  daily: DailyOutcomeBucket[];
  spendByRole: SpendByRoleEntry[];
  phaseLatency: PhaseLatencyEntry[];
  heatmap: HeatmapRow[];
  leaderboard: LeaderboardEntry[];
  kpiSparks: KpiSparks;
  perModel: { model: string; calls: number; tokens: number; costUsd: number }[];
  tokensByRole: { role: string; tokens: number }[];
  totals: {
    runs: number;
    merged: number;
    failed: number;
    changes: number;
    costUsd: number;
    tokens: number;
    tokensDelta: number;
    successRate: number | null;
    avgDurationSeconds: number | null;
    medianDurationSeconds: number | null;
    spendCapDailyUsd: number | null;
  };
};

export type ProviderProfile = {
  providerId: string;
  label: string;
  vendor: string | null;
  available: boolean;
  configured: boolean;
  runs: number;
  costUsd: number;
  latencyP50Ms: number | null;
  latencyP95Ms: number | null;
  successRate: number | null;
  lastSeenAt: string | null;
  throughputSpark: number[];
  skills: string[];
};

/** An agent *role* (planner, architect, …) and its bindings. The role is the
 *  seat in the workflow; `provider` is the CLI engine it runs on. */
export type Role = {
  id: string;
  provider: string;
  providerConfigured: boolean;
  permissions: string;
  skills: string[];
};

export type ProvidersOverview = {
  generatedAt: string;
  providers: ProviderProfile[];
  kpi: {
    onlineCount: number;
    totalCount: number;
    runs24h: number;
    spend24hUsd: number;
    avgP95Seconds: number | null;
  };
};

// ── Cross-project "All projects" overview (Multi-project slice c) ──────────
export type WorkspaceRecentRun = {
  runId: string;
  task: string;
  status: RunState["status"];
  updatedAt: string;
};

export type WorkspaceProjectSummary = {
  root: string;
  label: string;
  current: boolean;
  lastPort: number | null;
  lastOpenedAt: string | null;
  initialized: boolean;
  live: boolean;
  unreadable: boolean;
  totalRuns: number;
  activeRuns: number;
  needsTesting: number;
  lastActivityAt: string | null;
  window: {
    runs: number;
    merged: number;
    failed: number;
    changes: number;
    costUsd: number;
    tokens: number;
    successRate: number | null;
  };
  recentRuns: WorkspaceRecentRun[];
};

export type WorkspaceOverview = {
  generatedAt: string;
  range: OverviewRange;
  projects: WorkspaceProjectSummary[];
  totals: {
    projects: number;
    runs: number;
    activeRuns: number;
    windowRuns: number;
    merged: number;
    failed: number;
    needsTesting: number;
    costUsd: number;
    tokens: number;
  };
};

// Navigator: starting/opening another project's own dashboard.
export type EnsureServerResult = {
  root: string;
  label: string;
  url: string;
  port: number;
  started: boolean;
};

export type WorkspaceBusyStatus = {
  project: { root: string; label: string };
  activeRuns: number;
  queueDepth: number;
  runningTaskIds: string[];
  schedulerPickingUp: boolean;
  schedulerStatus: string;
  busy: boolean;
};

export type WorkspaceCloseResult = {
  root: string;
  label: string;
  closed: boolean;
  alreadyStopped: boolean;
  forced: boolean;
  method: "graceful" | "graceful-unverified" | "sigterm" | "sigkill" | "unreachable" | "none";
  port: number | null;
  pid: number | null;
};

export type ProviderRow = {
  id: string;
  label: string;
  command: string;
  available: boolean;
  version: string | null;
  confidence: "ready" | "detected-needs-setup" | "missing";
  recommended: boolean;
  popular: boolean;
  installHint: string | null;
  notes: string[];
  configured: boolean;
  loginCommand: string | null;
  loginNote: string;
  /** True when the destination is an external network service (cloud http-api). */
  external?: boolean;
  /** Which editor shape this provider uses. */
  kind: "cli" | "http-api" | "localhost-proxy";
  /** Ids of the profiles that run on this provider (the reverse map). */
  profilesUsing: string[];
};

/** T9 project continuity ledger - the folded state surfaced read-only. */
export type LedgerEntryDto = {
  id: string;
  kind: "shipped" | "intent" | "decision" | "mention" | "residual" | "flag";
  title: string;
  detail: string | null;
  status: "open" | "shipped" | "abandoned" | "superseded";
  sourceRunId: string | null;
  /** `flag` entries: the relation + the id of the entry they link. */
  relation: "duplicate" | "conflict" | null;
  relatesTo: string | null;
  createdAt: string;
  tags: string[];
};
export type LedgerStateDto = {
  shipped: LedgerEntryDto[];
  intents: LedgerEntryDto[];
  residuals: LedgerEntryDto[];
  mentions: LedgerEntryDto[];
  decisions: LedgerEntryDto[];
  /** Suspected duplicate/conflict flags (T9) - never auto-resolved. */
  flags: LedgerEntryDto[];
};

export type CodebaseAnnotation = {
  id: string;
  path: string;
  /** Anchor line (1-based) or null for a whole-file note. */
  line: number | null;
  /** End line for a range or null. */
  endLine: number | null;
  body: string;
  /** When true, injected into agent prompts during runs. */
  shareWithRoles: boolean;
  status: "open" | "resolved";
  createdAt: string;
  updatedAt: string;
};

export type FlowStepKind =
  | "agent-turn"
  | "review-turn"
  | "response-turn"
  | "validation"
  | "approval-gate"
  | "summary-turn";

export type FlowApprovalRiskLevel = "low" | "medium" | "high";

export type FlowApprovalGatePatch = {
  reason: string;
  requestedAction: string;
  userMessage?: string;
  riskLevel: FlowApprovalRiskLevel;
};

/** Per-step patch - `undefined` keeps the current value, `null` clears
 *  the optional field. */
export type FlowStepPatch = {
  id: string;
  label?: string;
  optional?: boolean;
  kind?: FlowStepKind;
  seat?: string | null;
  approval?: FlowApprovalGatePatch | null;
  /** Per-step skills (P2). */
  skills?: string[];
};

/** Full step shape - accepted by `replaceSteps`. Mirrors the server's
 *  `flowStepSchema`, but inputs/outputs default to []. */
export type FlowStepFull = {
  id: string;
  label: string;
  kind: FlowStepKind;
  seat?: string;
  stage?: "planning" | "architecting" | "executing" | "reviewing" | "verifying";
  skipWhenReadOnly?: boolean;
  inputs?: string[];
  outputs?: string[];
  optional?: boolean;
  approval?: FlowApprovalGatePatch;
  repeat?: { times: number };
  /** Per-step skills (P2). */
  skills?: string[];
};

export type FlowSeatFull = {
  label: string;
  description?: string;
};

export type FlowPatch = {
  label?: string;
  description?: string;
  steps?: FlowStepPatch[];
  /** Replace the entire ordered step list (used for add / remove / reorder). */
  replaceSteps?: FlowStepFull[];
  /** Replace the seat map wholesale. */
  replaceSeats?: Record<string, FlowSeatFull>;
  /** Set the adaptive loop, or null to clear it. */
  loop?: FlowLoop | null;
};

export type ComposerPreset = {
  name: string;
  kind: "crew" | "template";
  brief: string | null;
  flow: {
    id: string;
    contextPolicy: "balanced" | "compact" | "artifact-heavy";
    stepProfileOverrides: Record<string, string>;
    skippedOptionalSteps: string[];
  } | null;
  crewId: string | null;
  profileOverride: string | null;
  skills: string[];
  readOnly: boolean;
  createdAt?: string;
  updatedAt?: string;
};

/** T13 merge advice (design/merge-advisor.md). Structural mirror of the
 *  server's MergeAdvice - deterministic advisory data, no model output. */
/** T13 hub-list row: facts only (no preview, no recommendation - those come
 *  from the full advice on drill-in). */
export type MergeOverviewRowDto = {
  runId: string;
  task: string;
  branchName: string;
  taskId: string | null;
  branchExists: boolean;
  topology: MergeAdviceDto["topology"];
  assurance: MergeAdviceDto["assurance"];
};

/** T13 slice 2: the analyze-deeper result. Advisory prose + the deterministic
 *  context that was fed to the model; never a merge verdict. */
export type MergeAnalysisDto = {
  runId: string;
  analysis: {
    summary: string;
    findings: { area: string; severity: "info" | "caution" | "concern"; detail: string }[];
    confidence: "low" | "medium" | "high";
    caveats: string[];
  };
  context: {
    branchName: string;
    filesInDiff: number;
    suppressedSecretFiles: string[];
    redactedTokenCount: number;
    truncated: boolean;
    overlaps: { file: string; otherRunIds: string[] }[];
    validation: { configured: boolean; commandCount: number };
  };
  markdown: string;
  cachedArtifactPath: string;
  providerId: string;
  model: string | null;
  effort: string | null;
  notes: string[];
};

export type MergeAdviceDto = {
  runId: string;
  task: string;
  topology: {
    branchName: string;
    aheadOfMain: number;
    behindMain: number;
    filesTouched: number;
    protectedPathHits: string[];
  };
  preview: {
    branch: string;
    runId?: string;
    clean: boolean;
    conflictedFiles: string[];
    note: string;
  } | null;
  assurance: {
    verdict: string;
    lanes: { validation: string; review: string; verification: string };
    anyRealCheckPassed: boolean;
    toleratedStepFailures: number;
  } | null;
  recommendation: "finish-now" | "stage-on-integration-branch" | "resolve-first";
  recommendationReason: string;
  predictedShape: "fast-forward" | "merge-commit-if-main-moves";
  flags: {
    id: string;
    severity: "warning" | "caution";
    summary: string;
    detail: string;
  }[];
  headline: string;
  detail: string;
  personaId: string;
  manualSteps: string[] | null;
};

export type RestorePreviewFile = {
  status: "added" | "modified" | "deleted" | "type-changed" | "other";
  path: string;
  insertions: number;
  deletions: number;
};

export type RestorePreview = {
  sourceRunId: string;
  fromStage: "reviewing" | "fixing" | "verifying";
  seq: number;
  stage: string;
  treeSha: string;
  baseRef: string;
  files: RestorePreviewFile[];
  filesChanged: number;
  insertions: number;
  deletions: number;
};

export type SnapshotPrunePlan = {
  orphanRuns: string[];
  retentionRuns: string[];
  explicitRuns: string[];
  runs: string[];
  totalRunsWithSnapshots: number;
};

export const api = {
  async listRuns(): Promise<RunState[]> {
    const r = await jsonGet<{ runs: RunState[] }>("/api/runs");
    return r.runs;
  },
  async spawnRun(input: {
    task: string;
    taskId?: string;
    crewId?: string;
    profileOverride?: string;
    seatRoleOverrides?: Record<string, string>;
    readOnly?: boolean;
    permissionMode?: "read-only" | "ask" | "accept-edits" | "auto";
    unattended?: boolean;
    checklistMode?: "continuous" | "step" | null;
    skills?: string[];
    concise?: boolean;
    /** Force orchestrator flow selection even when a default flow is set. */
    select?: boolean;
    /** Flow parameter values (T11), name -> raw string. */
    params?: Record<string, string>;
    /** Supervisor persona (judgment posture); default = project.defaultPersona. */
    persona?: string;
    flow?: {
      id: string;
      brief?: string | null;
      contextPolicy?: FlowContextPolicy;
      stepProfileOverrides?: Record<string, string>;
      skippedOptionalSteps?: string[];
    };
    /** Context sources (files/URLs) injected into every agent prompt. */
    contextSources?: { kind: "file" | "url"; ref: string; label?: string }[];
    resumeFrom?: {
      sourceRunId: string;
      // Mirrors the core ResumeStage + the route enum; "planning" is in sync.
      fromStage:
        | "planning"
        | "architecting"
        | "executing"
        | "reviewing"
        | "fixing"
        | "verifying";
    };
  }): Promise<{
    ok: true;
    pid: number | null;
    runId: string;
    argv: string[];
    message: string;
  }> {
    return jsonPost("/api/runs", input);
  },
  // ── Shape phase (docs/design/shape-phase.md): the CTO planning chain. ──
  /** Start the Shape phase from a brief: launch the read-only intake run that
   *  asks the gap questions (the UI "Plan" action; mirrors `vibe shape start`).
   *  `flowId` is the flow to BUILD once the spec is approved (carried forward). */
  async shapeIntake(input: {
    task: string;
    persona?: string;
    flowId?: string;
  }): Promise<{ ok: true; runId: string; pid: number | null }> {
    return jsonPost("/api/shape/intake", input);
  },
  /** Read an intake run's pending gap questions (null = not an intake run). */
  async getShapeQuestions(
    runId: string,
  ): Promise<{
    questions: ShapeQuestion[] | null;
    hasBrief?: boolean;
    targetFlowId?: string | null;
    round?: number;
    coverageComplete?: boolean;
  }> {
    return jsonGet(`/api/runs/${encodeURIComponent(runId)}/shape-questions`);
  },
  /** Submit a round's answers -> either a gap-check round or the shape run.
   *  `proceed` finalizes now (skip further gap-checks). */
  async submitShapeAnswers(input: {
    sourceRunId: string;
    answers: { id: string; answer: string }[];
    proceed?: boolean;
  }): Promise<{ ok: true; runId: string; pid: number | null; action: "gap-check" | "finalize" }> {
    return jsonPost("/api/shape/answers", input);
  },
  /** "Proceed to spec" with no new answers: finalize the accumulated set. */
  async proceedShape(
    sourceRunId: string,
  ): Promise<{ ok: true; runId: string; pid: number | null }> {
    return jsonPost("/api/shape/proceed", { sourceRunId });
  },
  /** Per-question assist (read-only, draft-only): Simplify / Suggest / Suggest-all. */
  async shapeAssist(input: {
    sourceRunId: string;
    mode: "simplify" | "suggest" | "suggest-all";
    questionId?: string;
    questionIds?: string[];
    forNonDeveloper?: boolean;
  }): Promise<{
    ok: true;
    mode: string;
    // simplify
    text?: string;
    affects?: string;
    analogy?: string;
    // suggest
    suggestedValue?: string;
    why?: string;
    // suggest-all
    items?: { questionId: string; suggestedValue: string; why: string }[];
  }> {
    return jsonPost("/api/shape/assist", input);
  },
  /** Approve the shaped draft -> launch the roadmap synthesis run. */
  async approveShapeRoadmap(
    shapeRunId: string,
  ): Promise<{ ok: true; runId: string; pid: number | null }> {
    return jsonPost("/api/shape/roadmap", { shapeRunId });
  },
  /** Approve the shaped draft -> BUILD it: run the chosen flow seeded with the
   *  approved spec as context (P1). `flowId` overrides the carried target. */
  async buildShape(
    shapeRunId: string,
    flowId?: string | null,
  ): Promise<{ ok: true; runId: string; pid: number | null; flowId: string }> {
    return jsonPost("/api/shape/build", {
      shapeRunId,
      ...(flowId ? { flowId } : {}),
    });
  },
  /** Turn a finished shape-roadmap run into a reviewable proposal. */
  async createShapeRoadmapProposal(
    runId: string,
  ): Promise<{ ok: true; proposalId: string }> {
    return jsonPost("/api/shape/roadmap-proposal", { runId });
  },
  /** Dry-run a downstream rewind: the file overwrite/remove set the restore
   *  would apply. `preview: null` = nothing to restore for that stage. */
  async restorePreview(
    sourceRunId: string,
    stage: "reviewing" | "fixing" | "verifying",
  ): Promise<{ preview: RestorePreview | null }> {
    return jsonGet(
      `/api/runs/${encodeURIComponent(sourceRunId)}/restore-preview?stage=${stage}`,
    );
  },
  /** Prune rewind-snapshot refs. `dryRun: true` previews without deleting. */
  async pruneSnapshots(body: {
    keep?: number;
    orphans?: boolean;
    runId?: string;
    dryRun?: boolean;
  }): Promise<{ plan: SnapshotPrunePlan; pruned: string[] | null }> {
    return jsonPost("/api/runs/snapshots/prune", body);
  },
  async getProviderConfig(providerId: string): Promise<{
    providerId: string;
    configured: boolean;
    config: EditorProviderConfig;
    profilesUsing: string[];
  }> {
    return jsonGet(
      `/api/providers/${encodeURIComponent(providerId)}/config`,
    );
  },
  async setupProvider(
    providerId: string,
    opts: {
      setAsDefault?: boolean;
      // A type-less config is treated as CLI by the server (legacy shape). The
      // raw-YAML editor sends an arbitrary object (env, claude-code settings,
      // extraArgs, ...) which the server validates against the full schema.
      config?:
        | EditorProviderConfig
        | { command: string; args?: string[]; input?: "stdin" | "arg" }
        | Record<string, unknown>;
    } = {},
  ): Promise<{ ok: true; providerId: string; configured: true }> {
    return jsonPost(
      `/api/providers/${encodeURIComponent(providerId)}/setup`,
      opts,
    );
  },
  async setDefaultProvider(
    providerId: string,
  ): Promise<{ ok: true; providerId: string; profilesUpdated: string[] }> {
    return jsonPost(
      `/api/providers/${encodeURIComponent(providerId)}/default`,
    );
  },
  async removeProvider(
    providerId: string,
  ): Promise<{ ok: true; providerId: string }> {
    return jsonDelete(`/api/providers/${encodeURIComponent(providerId)}`);
  },
  async testProvider(providerId: string): Promise<{
    ok: boolean;
    providerId: string;
    command: string;
    args: string[];
    durationMs: number;
    exitCode: number;
    stdout: string;
    stderr: string;
    matchedMagic: boolean;
    hint?: string;
    needsLogin: boolean;
    loginCommand?: string | null;
  }> {
    return jsonPost(
      `/api/providers/${encodeURIComponent(providerId)}/test`,
    );
  },
  async listProviders(): Promise<{
    providers: ProviderRow[];
  }> {
    return jsonGet("/api/providers");
  },
  async getRun(runId: string): Promise<RunState> {
    const r = await jsonGet<{ run: RunState }>(`/api/runs/${runId}`);
    return r.run;
  },
  async listPersonas(): Promise<PersonasResponse> {
    return jsonGet<PersonasResponse>("/api/personas");
  },
  async getRunAssurance(runId: string): Promise<RunAssurance> {
    const r = await jsonGet<{ assurance: RunAssurance }>(
      `/api/runs/${runId}/assurance`,
    );
    return r.assurance;
  },
  async getRunAudit(runId: string): Promise<RunAudit> {
    const r = await jsonGet<{ audit: RunAudit }>(`/api/runs/${runId}/audit`);
    return r.audit;
  },
  async getRunArbitration(
    runId: string,
  ): Promise<Record<string, unknown> | null> {
    const r = await jsonGet<{ arbitration: Record<string, unknown> | null }>(
      `/api/runs/${encodeURIComponent(runId)}/arbitration`,
    );
    return r.arbitration;
  },
  async getRunEngagement(runId: string): Promise<EngagementEntry[]> {
    const r = await jsonGet<{ engagement: EngagementEntry[] }>(
      `/api/runs/${runId}/engagement`,
    );
    return r.engagement;
  },
  async getRunSelection(runId: string): Promise<WorkflowSelectionView | null> {
    const r = await jsonGet<{ selection: WorkflowSelectionView | null }>(
      `/api/runs/${runId}/selection`,
    );
    return r.selection;
  },
  async listEvents(runId: string): Promise<VibestrateEvent[]> {
    const r = await jsonGet<{ events: VibestrateEvent[] }>(
      `/api/runs/${runId}/events`,
    );
    return r.events;
  },
  async listArtifacts(runId: string): Promise<ArtifactEntry[]> {
    const r = await jsonGet<{ artifacts: ArtifactEntry[] }>(
      `/api/runs/${runId}/artifacts`,
    );
    return r.artifacts;
  },
  async readArtifact(runId: string, relPath: string): Promise<string> {
    const url = `/api/runs/${runId}/artifacts/${relPath
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`;
    const res = await fetch(url);
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return res.text();
  },
  async getDiff(runId: string): Promise<DiffSnapshot | null> {
    const r = await jsonGet<{ snapshot: DiffSnapshot | null }>(
      `/api/runs/${runId}/diff`,
    );
    return r.snapshot;
  },
  async getFileDiff(runId: string, filePath: string): Promise<FileDiff> {
    const r = await jsonGet<{ fileDiff: FileDiff }>(
      `/api/runs/${runId}/diff/file?path=${encodeURIComponent(filePath)}`,
    );
    return r.fileDiff;
  },
  async listNotes(runId: string, includeResolved = true): Promise<Note[]> {
    const r = await jsonGet<{ notes: Note[] }>(
      `/api/runs/${runId}/notes?includeResolved=${includeResolved}`,
    );
    return r.notes;
  },
  async addNote(input: {
    runId: string;
    scope: Note["scope"];
    target: string;
    message: string;
  }): Promise<Note> {
    const r = await jsonPost<{ note: Note }>(`/api/runs/${input.runId}/notes`, {
      scope: input.scope,
      target: input.target,
      message: input.message,
    });
    return r.note;
  },
  async resolveNote(runId: string, noteId: string): Promise<Note> {
    const r = await jsonPost<{ note: Note }>(
      `/api/runs/${runId}/notes/${noteId}/resolve`,
    );
    return r.note;
  },
  async abortRun(runId: string): Promise<RunState> {
    const r = await jsonPost<{ run: RunState }>(
      `/api/runs/${runId}/abort`,
    );
    return r.run;
  },
  async pauseRun(runId: string): Promise<RunState> {
    const r = await jsonPost<{ run: RunState }>(
      `/api/runs/${runId}/pause`,
    );
    return r.run;
  },
  async resumeRun(runId: string): Promise<RunState> {
    const r = await jsonPost<{ run: RunState }>(
      `/api/runs/${runId}/resume`,
    );
    return r.run;
  },
  async renameRun(runId: string, displayName: string): Promise<RunState> {
    const r = await jsonPost<{ run: RunState }>(
      `/api/runs/${runId}/rename`,
      { displayName },
    );
    return r.run;
  },
  async listRunControl(runId: string): Promise<{
    directives: RunControlDirective[];
    pending: RunControlDirective[];
  }> {
    return jsonGet(`/api/runs/${runId}/control`);
  },
  async sendRunControl(
    runId: string,
    input: { kind: "inject-note"; body: string } | { kind: "compact"; note?: string },
  ): Promise<{ ok: true; directive: RunControlDirective }> {
    return jsonPost(`/api/runs/${runId}/control`, input);
  },
  async retryRun(runId: string): Promise<{
    ok: boolean;
    pid: number | null;
    argv: string[];
    retryOf: string;
    message: string;
  }> {
    return jsonPost(`/api/runs/${runId}/retry`);
  },
  async listSkills(): Promise<{
    skills: DiscoveredSkill[];
    assignments: SkillAssignmentSummary[];
  }> {
    return jsonGet("/api/skills");
  },
  async listFlows(): Promise<{
    flows: DiscoveredFlow[];
    invalid: { path: string; message: string }[];
    defaultFlow?: string | null;
  }> {
    return jsonGet("/api/flows");
  },
  async patchFlow(
    flowId: string,
    patch: FlowPatch,
  ): Promise<{ ok: true; flow: DiscoveredFlow; definitionPath: string }> {
    return jsonPatch(`/api/flows/${encodeURIComponent(flowId)}`, patch);
  },
  async forkFlowToProject(flowId: string): Promise<{
    ok: true;
    flowId: string;
    definitionPath: string;
    alreadyForked: boolean;
    flow: DiscoveredFlow;
  }> {
    return jsonPost(`/api/flows/${encodeURIComponent(flowId)}/fork`);
  },
  async deleteFlow(flowId: string): Promise<{ ok: true; flowId: string }> {
    return jsonDelete(`/api/flows/${encodeURIComponent(flowId)}`);
  },
  /** Export a flow as canonical YAML for sharing / backup. */
  async exportFlow(flowId: string): Promise<{
    flowId: string;
    source: { kind: string; ref: string };
    yaml: string;
  }> {
    return jsonGet(`/api/flows/${encodeURIComponent(flowId)}/export`);
  },
  /** Import a single flow from raw YAML or a URL into .vibestrate/flows/. */
  async importFlow(input: {
    yaml?: string;
    url?: string;
    overwrite?: boolean;
  }): Promise<{
    ok: true;
    flowId: string;
    definitionPath: string;
    overwritten: boolean;
    flow: DiscoveredFlow;
  }> {
    return jsonPost("/api/flows/import", input);
  },
  // ─── hub (real API, P3) ──────────────────────────────────────────────────
  async listHubFlows(q?: string): Promise<{ flows: HubFlowRow[] }> {
    return jsonGet(`/api/flows/hub${q ? `?q=${encodeURIComponent(q)}` : ""}`);
  },
  /** Errors surface as thrown ApiError (the route maps install refusals to
   *  4xx/5xx with the reasons in the message). */
  async installHubFlow(input: {
    ref: string;
    overwrite?: boolean;
  }): Promise<{
    result: { ok: true; flowId: string; overwritten: boolean };
  }> {
    return jsonPost("/api/flows/hub/install", input);
  },
  /** Create a project flow from a full definition (the flow-creator API). */
  async createFlow(
    flow: unknown,
    overwrite?: boolean,
  ): Promise<{
    ok: true;
    flowId: string;
    definitionPath: string;
    overwritten: boolean;
    flow: DiscoveredFlow;
  }> {
    return jsonPost("/api/flows", { flow, overwrite });
  },
  async listComposerPresets(): Promise<{ presets: ComposerPreset[] }> {
    return jsonGet("/api/composer/presets");
  },
  async saveComposerPreset(input: ComposerPreset): Promise<{
    ok: true;
    preset: ComposerPreset;
  }> {
    return jsonPost("/api/composer/presets", input);
  },
  async deleteComposerPreset(name: string): Promise<{ ok: true }> {
    return jsonDelete(`/api/composer/presets/${encodeURIComponent(name)}`);
  },
  async getMetricsOverview(range: OverviewRange): Promise<MetricsOverview> {
    return jsonGet(`/api/metrics/overview?range=${encodeURIComponent(range)}`);
  },
  async getBudget(): Promise<{ budget: BudgetSettings; todaySpendUsd: number }> {
    return jsonGet("/api/budget");
  },
  async consult(input: {
    question: string;
    taskId?: string | null;
    runId?: string | null;
    files?: string[];
    profileId?: string | null;
    providerId?: string | null;
    model?: string | null;
    effort?: string | null;
    /** Screen-aware orb: a snapshot of the current screen (redacted server-side). */
    viewContext?: { screen: string; details: string } | null;
  }): Promise<ConsultResult> {
    return jsonPost("/api/consult", input);
  },
  async applyManualProposal(id: string): Promise<{ ok: true; created: boolean }> {
    return jsonPost(`/api/vibestrate/proposals/${encodeURIComponent(id)}/apply`);
  },
  async rejectManualProposal(id: string): Promise<{ ok: true }> {
    return jsonPost(`/api/vibestrate/proposals/${encodeURIComponent(id)}/reject`);
  },
  async updateBudget(
    patch: Partial<BudgetSettings>,
  ): Promise<{ ok: true; budget: BudgetSettings }> {
    return jsonPatch("/api/budget", patch);
  },
  async getProvidersOverview(): Promise<ProvidersOverview> {
    return jsonGet("/api/providers/overview");
  },
  // ─── crews ────────────────────────────────────────────────────────────
  async getCrews(): Promise<{ crews: CrewView[]; defaultCrew: string | null }> {
    return jsonGet("/api/crews");
  },
  /** T9: the project continuity ledger - folded state + a plain-text brief. */
  async getLedger(): Promise<{ state: LedgerStateDto; brief: string }> {
    return jsonGet("/api/ledger");
  },
  async getCrew(crewId: string): Promise<{ crew: CrewView }> {
    return jsonGet(`/api/crews/${encodeURIComponent(crewId)}`);
  },
  /** Set the project's default ("active") crew - parity with `vibe crew use`. */
  async setDefaultCrew(crewId: string): Promise<{ ok: true; defaultCrew: string }> {
    return jsonPost("/api/crews/default", { crewId });
  },
  /** Crew presets, each with install-state, whether it applies here, and what
   *  it would do (or why it can't). */
  async getCrewPresets(): Promise<{ presets: CrewPresetView[] }> {
    return jsonGet("/api/crews/presets");
  },
  /** Install a preset crew (+ its profile) - parity with `vibe crew presets add`. */
  async installCrewPreset(id: string): Promise<{
    ok: true;
    crewId: string;
    profileId: string;
    ref: string;
    power: string | null;
    model: string | null;
    maxReviewLoops: number | null;
  }> {
    return jsonPost("/api/crews/presets/install", { id });
  },
  async patchCrewRole(
    crewId: string,
    roleId: string,
    patch: {
      profile?: string;
      seats?: string[];
      permissions?: string;
      label?: string;
      skills?: string[];
    },
  ): Promise<{ ok: true; crewId: string; roleId: string }> {
    return jsonPatch(
      `/api/crews/${encodeURIComponent(crewId)}/roles/${encodeURIComponent(roleId)}`,
      patch,
    );
  },
  async getCrewRoleContext(
    crewId: string,
    roleId: string,
  ): Promise<{
    crewId: string;
    roleId: string;
    profile: string;
    seats: string[];
    permissions: string;
    skills: string[];
    promptPath: string;
    content: string;
  }> {
    return jsonGet(
      `/api/crews/${encodeURIComponent(crewId)}/roles/${encodeURIComponent(roleId)}/context`,
    );
  },
  async setCrewRoleContext(
    crewId: string,
    roleId: string,
    content: string,
  ): Promise<{ ok: true; crewId: string; roleId: string; promptPath: string }> {
    return jsonPut(
      `/api/crews/${encodeURIComponent(crewId)}/roles/${encodeURIComponent(roleId)}/context`,
      { content },
    );
  },
  // ─── profiles ─────────────────────────────────────────────────────────
  async getProfiles(): Promise<{ profiles: ProfileView[] }> {
    return jsonGet("/api/profiles");
  },
  async getProviderCatalog(): Promise<ProviderCatalogResponse> {
    return jsonGet("/api/providers/catalog");
  },
  async refreshProviderCatalog(
    body: { providerId?: string; force?: boolean; dryRun?: boolean } = {},
  ): Promise<CatalogRefreshResult> {
    return jsonPost("/api/providers/catalog/refresh", body);
  },
  async patchProfile(
    profileId: string,
    patch: {
      provider?: string;
      label?: string;
      model?: string | null;
      power?: string | null;
      maxTokens?: number | null;
      timeoutMs?: number | null;
    },
  ): Promise<{ ok: true; profileId: string }> {
    return jsonPatch(`/api/profiles/${encodeURIComponent(profileId)}`, patch);
  },
  async createProfile(input: {
    id: string;
    provider: string;
    label?: string;
    model?: string;
    power?: string;
    maxTokens?: number;
    timeoutMs?: number;
  }): Promise<{ ok: true; profileId: string }> {
    return jsonPost("/api/profiles", input);
  },
  async duplicateProfile(
    profileId: string,
    input: { newId: string; label?: string },
  ): Promise<{ ok: true; profileId: string }> {
    return jsonPost(
      `/api/profiles/${encodeURIComponent(profileId)}/duplicate`,
      input,
    );
  },
  async deleteProfile(
    profileId: string,
    opts: { force?: boolean } = {},
  ): Promise<{ ok: true; profileId: string }> {
    const q = opts.force ? "?force=1" : "";
    return jsonDelete(`/api/profiles/${encodeURIComponent(profileId)}${q}`);
  },
  async resolveFlow(
    flowId: string,
    input: {
      task: string;
      brief?: string | null;
      contextPolicy?: FlowContextPolicy;
      crewId?: string;
      profileOverride?: string;
      seatRoleOverrides?: Record<string, string>;
      stepProfileOverrides?: Record<string, string>;
      skippedOptionalSteps?: string[];
    },
  ): Promise<ResolvedFlowSnapshot> {
    const r = await jsonPost<{ snapshot: ResolvedFlowSnapshot }>(
      `/api/flows/${encodeURIComponent(flowId)}/resolve`,
      input,
    );
    return r.snapshot;
  },
  async flowCoverage(
    flowId: string,
    input: { crewId?: string | null; seatRoleOverrides?: Record<string, string> } = {},
  ): Promise<FlowCoverage> {
    const r = await jsonPost<{ coverage: FlowCoverage }>(
      `/api/flows/${encodeURIComponent(flowId)}/coverage`,
      input,
    );
    return r.coverage;
  },
  async setDefaultFlow(flowId: string): Promise<{ ok: true; defaultFlow: string }> {
    return jsonPost(`/api/flows/default`, { flowId });
  },
  async suggestFlows(input: {
    task: string;
    files?: string[];
    riskLevel?: "low" | "medium" | "high" | null;
  }): Promise<FlowSuggestion[]> {
    const r = await jsonPost<{ suggestions: FlowSuggestion[] }>(
      "/api/flows/suggest",
      input,
    );
    return r.suggestions;
  },
  async getMetrics(runId: string): Promise<RuntimeMetrics | null> {
    try {
      const r = await jsonGet<{ metrics: RuntimeMetrics }>(
        `/api/runs/${runId}/metrics`,
      );
      return r.metrics;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  },
  async listApprovals(runId: string): Promise<ApprovalRequest[]> {
    const r = await jsonGet<{ approvals: ApprovalRequest[] }>(
      `/api/runs/${runId}/approvals`,
    );
    return r.approvals;
  },
  async approveApproval(input: {
    runId: string;
    approvalId: string;
    note?: string;
  }): Promise<ApprovalRequest> {
    const r = await jsonPost<{ approval: ApprovalRequest }>(
      `/api/runs/${input.runId}/approvals/${input.approvalId}/approve`,
      { note: input.note },
    );
    return r.approval;
  },
  async rejectApproval(input: {
    runId: string;
    approvalId: string;
    note?: string;
  }): Promise<ApprovalRequest> {
    const r = await jsonPost<{ approval: ApprovalRequest }>(
      `/api/runs/${input.runId}/approvals/${input.approvalId}/reject`,
      { note: input.note },
    );
    return r.approval;
  },
  async assignSkill(input: {
    skillId: string;
    roleId: string;
  }): Promise<{ assignments: SkillAssignmentSummary[] }> {
    const r = await jsonPost<{ assignments: SkillAssignmentSummary[] }>(
      `/api/skills/${encodeURIComponent(input.skillId)}/assign`,
      { roleId: input.roleId },
    );
    return r;
  },
  async unassignSkill(input: {
    skillId: string;
    roleId: string;
  }): Promise<{ assignments: SkillAssignmentSummary[] }> {
    const r = await jsonPost<{ assignments: SkillAssignmentSummary[] }>(
      `/api/skills/${encodeURIComponent(input.skillId)}/unassign`,
      { roleId: input.roleId },
    );
    return r;
  },

  // ─── roadmap ──────────────────────────────────────────────────────────────
  async listRoadmap(): Promise<RoadmapItem[]> {
    const r = await jsonGet<{ items: RoadmapItem[] }>("/api/roadmap");
    return r.items;
  },
  async addRoadmapItem(input: {
    title: string;
    description?: string;
    priority?: "low" | "medium" | "high";
  }): Promise<RoadmapItem> {
    const r = await jsonPost<{ item: RoadmapItem }>(
      "/api/roadmap/items",
      input,
    );
    return r.item;
  },

  // ─── tasks ────────────────────────────────────────────────────────────────
  async listTasks(): Promise<Task[]> {
    const r = await jsonGet<{ tasks: Task[] }>("/api/tasks");
    return r.tasks;
  },
  // ─── integration (Phase 5) ──────────────────────────────────────────────
  async listMergeReady(): Promise<
    { runId: string; task: string; branchName: string; taskId: string | null }[]
  > {
    const r = await jsonGet<{
      mergeReady: { runId: string; task: string; branchName: string; taskId: string | null }[];
    }>("/api/integration");
    return r.mergeReady;
  },
  async previewIntegration(runIds?: string[]): Promise<{
    baseBranch: string;
    allClean: boolean;
    results: { branch: string; runId?: string; clean: boolean; conflictedFiles: string[]; note: string }[];
  }> {
    const r = await jsonPost<{ preview: {
      baseBranch: string;
      allClean: boolean;
      results: { branch: string; runId?: string; clean: boolean; conflictedFiles: string[]; note: string }[];
    } }>("/api/integration/preview", { runIds });
    return r.preview;
  },
  async applyIntegration(
    into: string,
    runIds?: string[],
  ): Promise<{
    integrationBranch: string;
    baseBranch: string;
    worktreePath: string;
    stoppedAt: string | null;
    integrated: { branch: string; clean: boolean; note: string }[];
  }> {
    const r = await jsonPost<{ result: {
      integrationBranch: string;
      baseBranch: string;
      worktreePath: string;
      stoppedAt: string | null;
      integrated: { branch: string; clean: boolean; note: string }[];
    } }>("/api/integration/apply", { into, runIds });
    return r.result;
  },
  /** T13: cheap hub-list projection - lanes + topology, no preview, no
   *  recommendation. Safe per page load. */
  async integrationOverview(): Promise<{ rows: MergeOverviewRowDto[] }> {
    return jsonGet<{ rows: MergeOverviewRowDto[] }>("/api/integration/overview");
  },
  /** T13: read-only merge advice (deterministic - no model output). Same
   *  cost class as preview; call it on drill-in, not per hub-list row. */
  async adviseIntegration(runIds?: string[]): Promise<{
    advice: MergeAdviceDto[];
    missing: string[];
  }> {
    return jsonPost<{ advice: MergeAdviceDto[]; missing: string[] }>(
      "/api/integration/advice",
      { runIds },
    );
  },
  /** T13 slice 2: optional read-only LLM pass over the run's redacted diff.
   *  Spawns a local provider (same exposure class as /api/consult); advisory
   *  prose only, never changes the deterministic advice. */
  async analyzeIntegration(runId: string): Promise<{ result: MergeAnalysisDto }> {
    return jsonPost<{ result: MergeAnalysisDto }>("/api/integration/analyze", {
      runId,
    });
  },
  /** P7b: merge a complete integration branch into main, locally (never
   *  pushed). The confirm token guards against accidental invocation. */
  async finishIntegration(integrationBranch: string): Promise<{
    mergedSha: string;
    intoBranch: string;
    integrationBranch: string;
  }> {
    const r = await jsonPost<{ result: {
      mergedSha: string;
      intoBranch: string;
      integrationBranch: string;
    } }>("/api/integration/finish", {
      integrationBranch,
      confirm: "merge-to-main",
    });
    return r.result;
  },
  async listWorkspace(): Promise<{
    current: string;
    projects: {
      root: string;
      label: string;
      lastPort: number | null;
      lastOpenedAt: string;
      current: boolean;
      live: boolean;
    }[];
  }> {
    return jsonGet("/api/workspace");
  },
  /** Ensure a project's own dashboard is live (starting it if dormant) and
   *  return its URL so the caller can open a new tab. */
  async openWorkspaceProject(project: string): Promise<EnsureServerResult> {
    return jsonPost("/api/workspace/open", { project });
  },
  /** What a project is currently doing (for the Close confirmation). */
  async getWorkspaceStatus(project: string): Promise<WorkspaceBusyStatus> {
    return jsonGet(`/api/workspace/status?project=${encodeURIComponent(project)}`);
  },
  /** Shut down a project's own dashboard + scheduler. */
  async closeWorkspaceProject(project: string): Promise<WorkspaceCloseResult> {
    return jsonPost("/api/workspace/close", { project });
  },
  async getWorkspaceOverview(range: OverviewRange): Promise<WorkspaceOverview> {
    return jsonGet(`/api/workspace/overview?range=${encodeURIComponent(range)}`);
  },
  async suggestNext(): Promise<TaskSuggestion[]> {
    const r = await jsonGet<{ suggestions: TaskSuggestion[] }>(
      "/api/tasks/suggest",
    );
    return r.suggestions;
  },
  async addTask(input: {
    title: string;
    description?: string;
    priority?: "low" | "medium" | "high";
    roadmapItemId?: string | null;
    dependencies?: string[];
    requiredSkills?: string[];
    touchedFiles?: string[];
    riskLevel?: "low" | "medium" | "high";
  }): Promise<Task> {
    const r = await jsonPost<{ task: Task }>("/api/tasks", input);
    return r.task;
  },
  async getTask(taskId: string): Promise<{
    task: Task;
    comments: TaskComment[];
    microSteps: { runId: string; steps: MicroStep[] }[];
  }> {
    return jsonGet(`/api/tasks/${encodeURIComponent(taskId)}`);
  },
  async addTaskComment(input: {
    taskId: string;
    body: string;
    target?: TaskComment["target"];
    targetRef?: string | null;
  }): Promise<TaskComment> {
    const r = await jsonPost<{ comment: TaskComment }>(
      `/api/tasks/${encodeURIComponent(input.taskId)}/comments`,
      {
        body: input.body,
        target: input.target,
        targetRef: input.targetRef ?? null,
      },
    );
    return r.comment;
  },
  async resolveTaskComment(input: {
    taskId: string;
    commentId: string;
  }): Promise<TaskComment> {
    const r = await jsonPost<{ comment: TaskComment }>(
      `/api/tasks/${encodeURIComponent(input.taskId)}/comments/${encodeURIComponent(input.commentId)}/resolve`,
    );
    return r.comment;
  },
  async patchTask(
    taskId: string,
    patch: Partial<{
      title: string;
      description: string;
      acceptanceCriteria: string;
      est: string;
      priority: "low" | "medium" | "high";
      dependencies: string[];
      validationProfile: string | null;
      profileOverride: string | null;
      readOnly: boolean;
    }>,
  ): Promise<Task> {
    const r = await jsonPatch<{ task: Task }>(
      `/api/tasks/${encodeURIComponent(taskId)}`,
      patch,
    );
    return r.task;
  },
  // ─── checklist ────────────────────────────────────────────────────────────
  async addChecklistItem(
    taskId: string,
    text: string,
  ): Promise<{ task: Task; item: ChecklistItem }> {
    return jsonPost(
      `/api/tasks/${encodeURIComponent(taskId)}/checklist`,
      { text },
    );
  },
  async updateChecklistItem(
    taskId: string,
    itemId: string,
    patch: { text?: string; status?: ChecklistItemStatus },
  ): Promise<{ task: Task; item: ChecklistItem }> {
    return jsonPatch(
      `/api/tasks/${encodeURIComponent(taskId)}/checklist/${encodeURIComponent(itemId)}`,
      patch,
    );
  },
  async promoteChecklistItem(
    taskId: string,
    itemId: string,
  ): Promise<{ task: Task; card: Task }> {
    return jsonPost(
      `/api/tasks/${encodeURIComponent(taskId)}/checklist/${encodeURIComponent(itemId)}/promote`,
    );
  },
  async removeChecklistItem(taskId: string, itemId: string): Promise<Task> {
    const r = await jsonDelete<{ task: Task }>(
      `/api/tasks/${encodeURIComponent(taskId)}/checklist/${encodeURIComponent(itemId)}`,
    );
    return r.task;
  },
  async reorderChecklist(taskId: string, order: string[]): Promise<Task> {
    const r = await jsonPut<{ task: Task }>(
      `/api/tasks/${encodeURIComponent(taskId)}/checklist`,
      { order },
    );
    return r.task;
  },
  async enhanceChecklist(
    taskId: string,
    opts: { apply?: boolean; profileId?: string | null } = {},
  ): Promise<{
    applied: boolean;
    proposal: {
      taskId: string;
      items: string[];
      providerId: string;
      profileId: string;
      attempts: number;
    };
    task?: Task;
    added?: ChecklistItem[];
  }> {
    return jsonPost(`/api/tasks/${encodeURIComponent(taskId)}/enhance`, {
      apply: opts.apply ?? false,
      profileId: opts.profileId ?? null,
    });
  },
  async resolveNeedsTesting(
    taskId: string,
    verdict: "pass" | "fail",
  ): Promise<Task> {
    const r = await jsonPost<{ task: Task }>(
      `/api/tasks/${encodeURIComponent(taskId)}/needs-testing/verdict`,
      { verdict },
    );
    return r.task;
  },
  async setTaskContextSources(
    taskId: string,
    sources: import("./types.js").ContextSource[],
  ): Promise<Task> {
    const r = await jsonPost<{ task: Task }>(
      `/api/tasks/${encodeURIComponent(taskId)}/context`,
      { sources },
    );
    return r.task;
  },
  async setTaskArchived(taskId: string, archived: boolean): Promise<Task> {
    const r = await jsonPost<{ task: Task }>(
      `/api/tasks/${encodeURIComponent(taskId)}/archive`,
      { archived },
    );
    return r.task;
  },
  async queueTask(taskId: string): Promise<Task> {
    const r = await jsonPost<{ task: Task }>(
      `/api/tasks/${encodeURIComponent(taskId)}/queue`,
    );
    return r.task;
  },
  /** Permanently remove a task card. 409 if the task is live (terminate first).
   *  The git worktree, if any, is left in place; its path comes back so the
   *  caller can tell the user it's still there. */
  async deleteTask(
    taskId: string,
  ): Promise<{ ok: true; task: Task; worktreePath: string | null }> {
    return jsonDelete(`/api/tasks/${encodeURIComponent(taskId)}`);
  },
  async cancelTask(taskId: string): Promise<Task> {
    const r = await jsonPost<{ task: Task }>(
      `/api/tasks/${encodeURIComponent(taskId)}/cancel`,
    );
    return r.task;
  },
  async terminateTask(taskId: string): Promise<{
    task: Task;
    aborted: boolean;
    cancelled: boolean;
    abortError: string | null;
  }> {
    return jsonPost(
      `/api/tasks/${encodeURIComponent(taskId)}/terminate`,
    );
  },

  // ─── queue ────────────────────────────────────────────────────────────────
  async getQueue(): Promise<{
    queue: QueueEntry[];
    state: SchedulerState;
  }> {
    return jsonGet("/api/queue");
  },
  async startScheduler(): Promise<{
    ok: true;
    pid: number | null;
    message: string;
  }> {
    return jsonPost("/api/scheduler/start");
  },
  async listRunStreams(runId: string): Promise<{
    streams: { promptName: string; bytes: number; updatedAt: string }[];
  }> {
    return jsonGet(`/api/runs/${encodeURIComponent(runId)}/streams`);
  },
  async readRunStream(
    runId: string,
    name: string,
  ): Promise<{
    lines: { stream: "stdout" | "stderr"; chunk: string; at: string }[];
  }> {
    return jsonGet(
      `/api/runs/${encodeURIComponent(runId)}/streams/${encodeURIComponent(name)}`,
    );
  },
  async getSchedulerLog(bytes?: number): Promise<{
    bytes: number;
    truncated: boolean;
    text: string;
  }> {
    const qs = bytes ? `?bytes=${bytes}` : "";
    return jsonGet(`/api/scheduler/log${qs}`);
  },
  async getSchedulerSpawns(): Promise<{
    records: {
      at: string;
      pid: number | null;
      source: string;
      exitedAt: string | null;
      exitCode: number | null;
      exitError: string | null;
    }[];
  }> {
    return jsonGet(`/api/scheduler/spawns`);
  },
  async listIssues(): Promise<{
    issues: Array<{
      id: string;
      createdAt: string;
      kind: string;
      message: string;
      detail?: string;
      fix?: string;
      context?: Record<string, unknown>;
      resolved: boolean;
    }>;
    unresolved: number;
  }> {
    return jsonGet("/api/issues");
  },
  async resolveIssue(id: string): Promise<{ ok: true }> {
    return jsonPost(`/api/issues/${encodeURIComponent(id)}/resolve`);
  },
  async listConflicts(): Promise<ConflictWarning[]> {
    const r = await jsonGet<{ warnings: ConflictWarning[] }>(
      "/api/scheduler/conflicts",
    );
    return r.warnings;
  },

  // ─── proposals ────────────────────────────────────────────────────────────
  async listProposals(): Promise<ProposalSummary[]> {
    const r = await jsonGet<{ proposals: ProposalSummary[] }>(
      "/api/roadmap/proposals",
    );
    return r.proposals;
  },
  async getProposal(id: string): Promise<{
    proposalId: string;
    body: string;
    accepted: { acceptedAt: string } | null;
  }> {
    return jsonGet(
      `/api/roadmap/proposals/${encodeURIComponent(id)}`,
    );
  },
  async parseProposal(id: string): Promise<ProposalParseSummary> {
    return jsonGet(`/api/roadmap/proposals/${encodeURIComponent(id)}/parse`);
  },
  async dryRunProposal(input: {
    id: string;
    allowUnresolvedDependencies?: boolean;
  }): Promise<ProposalDryRunResponse> {
    return jsonPost(
      `/api/roadmap/proposals/${encodeURIComponent(input.id)}/accept`,
      {
        dryRun: true,
        allowUnresolvedDependencies: input.allowUnresolvedDependencies,
      },
    );
  },
  async acceptProposal(input: {
    id: string;
    allowUnresolvedDependencies?: boolean;
  }): Promise<ProposalAcceptResponse> {
    return jsonPost(
      `/api/roadmap/proposals/${encodeURIComponent(input.id)}/accept`,
      {
        dryRun: false,
        allowUnresolvedDependencies: input.allowUnresolvedDependencies,
      },
    );
  },

  // ─── notifications ────────────────────────────────────────────────────────
  async listNotifications(): Promise<{
    notifications: NotificationRecord[];
    unread: number;
  }> {
    return jsonGet("/api/notifications");
  },
  async markNotificationRead(id: string): Promise<NotificationRecord> {
    const r = await jsonPost<{ notification: NotificationRecord }>(
      `/api/notifications/${encodeURIComponent(id)}/read`,
    );
    return r.notification;
  },
  async resolveNotification(id: string): Promise<NotificationRecord> {
    const r = await jsonPost<{ notification: NotificationRecord }>(
      `/api/notifications/${encodeURIComponent(id)}/resolve`,
    );
    return r.notification;
  },
  async markAllNotificationsRead(): Promise<{ read: number }> {
    return jsonPost("/api/notifications/read-all");
  },
  async getNotificationSettings(): Promise<{
    settings: NotificationSettings;
    gateways: GatewayView[];
  }> {
    return jsonGet("/api/notifications/settings");
  },
  async patchNotificationSettings(
    patch: Partial<NotificationSettings>,
  ): Promise<{ settings: NotificationSettings }> {
    return jsonPatch("/api/notifications/settings", patch);
  },
  async testGateway(id: string): Promise<{ ok: boolean; message: string }> {
    return jsonPost(`/api/gateways/${encodeURIComponent(id)}/test`);
  },

  // ─── config (read-only grouped view) ──────────────────────────────────────
  async getConfigView(): Promise<ConfigViewResponse> {
    return jsonGet("/api/config/view");
  },

  // ─── project / codebase / git / agent-work ────────────────────────────────
  async getProjectMetadata(): Promise<ProjectMetadata> {
    const r = await jsonGet<{ metadata: ProjectMetadata }>(
      "/api/project/metadata",
    );
    return r.metadata;
  },
  async getSetupStatus(): Promise<{
    initialized: boolean;
    isGitRepo: boolean;
    projectName: string;
    projectRoot: string;
  }> {
    return jsonGet("/api/setup/status");
  },
  async initProject(input?: { gitInit?: boolean }): Promise<{
    ok: true;
    /** Set when gitInit was requested: what the guarded git-init did. */
    git: {
      ok: boolean;
      initialized: boolean;
      gitignoreWritten: boolean;
      commitSha: string | null;
      commitSkippedReason: string | null;
      error: string | null;
    } | null;
    created: string[];
    detections: {
      id: string;
      label: string;
      available: boolean;
      confidence: "ready" | "detected-needs-setup" | "missing";
      recommended: boolean;
    }[];
    recommendedProvider: string | null;
    providerComplete: boolean;
  }> {
    return jsonPost("/api/setup/init", input ?? {});
  },
  async getProjectTree(input?: {
    depth?: number;
    maxEntries?: number;
    includeHidden?: boolean;
    includeVibestrate?: boolean;
  }): Promise<FileTreeResult> {
    const q = new URLSearchParams();
    if (input?.depth !== undefined) q.set("depth", String(input.depth));
    if (input?.maxEntries !== undefined)
      q.set("maxEntries", String(input.maxEntries));
    if (input?.includeHidden) q.set("includeHidden", "true");
    if (input?.includeVibestrate) q.set("includeVibestrate", "true");
    const qs = q.toString();
    const r = await jsonGet<{ tree: FileTreeResult }>(
      `/api/project/tree${qs ? `?${qs}` : ""}`,
    );
    return r.tree;
  },
  async getProjectFile(input: {
    path: string;
    lineStart?: number;
    lineEnd?: number;
  }): Promise<FileView> {
    const q = new URLSearchParams({ path: input.path });
    if (input.lineStart !== undefined) q.set("lineStart", String(input.lineStart));
    if (input.lineEnd !== undefined) q.set("lineEnd", String(input.lineEnd));
    const r = await jsonGet<{ file: FileView }>(
      `/api/project/file?${q.toString()}`,
    );
    return r.file;
  },
  async listAnnotations(input?: {
    path?: string;
    status?: "open" | "resolved";
  }): Promise<CodebaseAnnotation[]> {
    const q = new URLSearchParams();
    if (input?.path) q.set("path", input.path);
    if (input?.status) q.set("status", input.status);
    const qs = q.toString();
    const r = await jsonGet<{ annotations: CodebaseAnnotation[] }>(
      `/api/annotations${qs ? `?${qs}` : ""}`,
    );
    return r.annotations;
  },
  async addAnnotation(input: {
    path: string;
    line?: number | null;
    endLine?: number | null;
    body: string;
    shareWithRoles?: boolean;
  }): Promise<CodebaseAnnotation> {
    const r = await jsonPost<{ annotation: CodebaseAnnotation }>(
      "/api/annotations",
      input,
    );
    return r.annotation;
  },
  async updateAnnotation(
    id: string,
    patch: {
      body?: string;
      shareWithRoles?: boolean;
      status?: "open" | "resolved";
    },
  ): Promise<CodebaseAnnotation> {
    const r = await jsonPatch<{ annotation: CodebaseAnnotation }>(
      `/api/annotations/${encodeURIComponent(id)}`,
      patch,
    );
    return r.annotation;
  },
  async deleteAnnotation(id: string): Promise<void> {
    await jsonDelete<{ ok: true }>(`/api/annotations/${encodeURIComponent(id)}`);
  },
  async getRunTree(runId: string): Promise<FileTreeResult> {
    const r = await jsonGet<{ tree: FileTreeResult }>(
      `/api/runs/${encodeURIComponent(runId)}/tree`,
    );
    return r.tree;
  },
  async getRunFile(input: {
    runId: string;
    path: string;
    lineStart?: number;
    lineEnd?: number;
  }): Promise<FileView> {
    const q = new URLSearchParams({ path: input.path });
    if (input.lineStart !== undefined) q.set("lineStart", String(input.lineStart));
    if (input.lineEnd !== undefined) q.set("lineEnd", String(input.lineEnd));
    const r = await jsonGet<{ file: FileView }>(
      `/api/runs/${encodeURIComponent(input.runId)}/file?${q.toString()}`,
    );
    return r.file;
  },
  async getProjectGitStatus(): Promise<GitStatus> {
    const r = await jsonGet<{ status: GitStatus }>(
      "/api/project/git/status",
    );
    return r.status;
  },
  async getProjectGitHistory(limit = 20): Promise<GitHistory> {
    const r = await jsonGet<{ history: GitHistory }>(
      `/api/project/git/history?limit=${limit}`,
    );
    return r.history;
  },
  async getRunGitStatus(runId: string): Promise<GitStatus> {
    const r = await jsonGet<{ status: GitStatus }>(
      `/api/runs/${encodeURIComponent(runId)}/git/status`,
    );
    return r.status;
  },
  async getRunGitHistory(runId: string, limit = 20): Promise<GitHistory> {
    const r = await jsonGet<{ history: GitHistory }>(
      `/api/runs/${encodeURIComponent(runId)}/git/history?limit=${limit}`,
    );
    return r.history;
  },
  async getRoleWork(runId: string): Promise<RoleWorkReport> {
    const r = await jsonGet<{ report: RoleWorkReport }>(
      `/api/runs/${encodeURIComponent(runId)}/agent-work`,
    );
    return r.report;
  },
  async parseCodeReferences(input: {
    text: string;
    runId?: string | null;
  }): Promise<CodeReference[]> {
    const r = await jsonPost<{ references: CodeReference[] }>(
      "/api/code-references",
      input,
    );
    return r.references;
  },

  // ─── editor / suggestions ─────────────────────────────────────────────────
  async getEditorStatus(): Promise<EditorStatus> {
    return jsonGet("/api/editor/status");
  },
  async openInEditor(input: {
    path: string;
    runId?: string | null;
    line?: number | null;
    column?: number | null;
  }): Promise<{ ok: boolean; command?: string; path?: string; message?: string }> {
    return jsonPost("/api/editor/open", input);
  },
  async listSuggestions(runId: string): Promise<ReviewSuggestion[]> {
    const r = await jsonGet<{ suggestions: ReviewSuggestion[] }>(
      `/api/runs/${encodeURIComponent(runId)}/suggestions`,
    );
    return r.suggestions;
  },
  async createSuggestion(input: {
    runId: string;
    title: string;
    body?: string;
    file?: string | null;
    lineStart?: number | null;
    lineEnd?: number | null;
    proposedPatch?: string | null;
  }): Promise<ReviewSuggestion> {
    const r = await jsonPost<{ suggestion: ReviewSuggestion }>(
      `/api/runs/${encodeURIComponent(input.runId)}/suggestions`,
      input,
    );
    return r.suggestion;
  },
  async approveSuggestion(input: {
    runId: string;
    suggestionId: string;
    note?: string;
  }): Promise<ReviewSuggestion> {
    const r = await jsonPost<{ suggestion: ReviewSuggestion }>(
      `/api/runs/${encodeURIComponent(input.runId)}/suggestions/${encodeURIComponent(input.suggestionId)}/approve`,
      { note: input.note },
    );
    return r.suggestion;
  },
  async rejectSuggestion(input: {
    runId: string;
    suggestionId: string;
    note?: string;
  }): Promise<ReviewSuggestion> {
    const r = await jsonPost<{ suggestion: ReviewSuggestion }>(
      `/api/runs/${encodeURIComponent(input.runId)}/suggestions/${encodeURIComponent(input.suggestionId)}/reject`,
      { note: input.note },
    );
    return r.suggestion;
  },
  async applySuggestion(input: {
    runId: string;
    suggestionId: string;
    validateAfterApply?: boolean;
    autoRevertOnValidationFail?: boolean;
    validationProfile?: string | null;
  }): Promise<ReviewSuggestion> {
    const r = await jsonPost<{ suggestion: ReviewSuggestion }>(
      `/api/runs/${encodeURIComponent(input.runId)}/suggestions/${encodeURIComponent(input.suggestionId)}/apply`,
      {
        validateAfterApply: input.validateAfterApply,
        autoRevertOnValidationFail: input.autoRevertOnValidationFail,
        validationProfile: input.validationProfile,
      },
    );
    return r.suggestion;
  },
  async validateSuggestion(input: {
    runId: string;
    suggestionId: string;
    validationProfile?: string | null;
  }): Promise<{
    suggestion: ReviewSuggestion;
    result: SuggestionValidationResult;
  }> {
    return jsonPost(
      `/api/runs/${encodeURIComponent(input.runId)}/suggestions/${encodeURIComponent(input.suggestionId)}/validate`,
      { validationProfile: input.validationProfile },
    );
  },
  async revertSuggestion(input: {
    runId: string;
    suggestionId: string;
  }): Promise<ReviewSuggestion> {
    const r = await jsonPost<{ suggestion: ReviewSuggestion }>(
      `/api/runs/${encodeURIComponent(input.runId)}/suggestions/${encodeURIComponent(input.suggestionId)}/revert`,
    );
    return r.suggestion;
  },

  // ─── bundles (review passes) ──────────────────────────────────────────────
  async listBundles(runId: string): Promise<SuggestionBundle[]> {
    const r = await jsonGet<{ bundles: SuggestionBundle[] }>(
      `/api/runs/${encodeURIComponent(runId)}/suggestion-bundles`,
    );
    return r.bundles;
  },
  async getBundle(runId: string, bundleId: string): Promise<SuggestionBundle> {
    const r = await jsonGet<{ bundle: SuggestionBundle }>(
      `/api/runs/${encodeURIComponent(runId)}/suggestion-bundles/${encodeURIComponent(bundleId)}`,
    );
    return r.bundle;
  },
  async createBundle(input: {
    runId: string;
    title: string;
    description?: string;
    suggestionIds?: string[];
  }): Promise<SuggestionBundle> {
    const r = await jsonPost<{ bundle: SuggestionBundle }>(
      `/api/runs/${encodeURIComponent(input.runId)}/suggestion-bundles`,
      input,
    );
    return r.bundle;
  },
  async addToBundle(input: {
    runId: string;
    bundleId: string;
    suggestionId: string;
  }): Promise<SuggestionBundle> {
    const r = await jsonPost<{ bundle: SuggestionBundle }>(
      `/api/runs/${encodeURIComponent(input.runId)}/suggestion-bundles/${encodeURIComponent(input.bundleId)}/add`,
      { suggestionId: input.suggestionId },
    );
    return r.bundle;
  },
  async removeFromBundle(input: {
    runId: string;
    bundleId: string;
    suggestionId: string;
  }): Promise<SuggestionBundle> {
    const r = await jsonPost<{ bundle: SuggestionBundle }>(
      `/api/runs/${encodeURIComponent(input.runId)}/suggestion-bundles/${encodeURIComponent(input.bundleId)}/remove`,
      { suggestionId: input.suggestionId },
    );
    return r.bundle;
  },
  async approveBundle(input: {
    runId: string;
    bundleId: string;
    note?: string;
  }): Promise<SuggestionBundle> {
    const r = await jsonPost<{ bundle: SuggestionBundle }>(
      `/api/runs/${encodeURIComponent(input.runId)}/suggestion-bundles/${encodeURIComponent(input.bundleId)}/approve`,
      { note: input.note },
    );
    return r.bundle;
  },
  async rejectBundle(input: {
    runId: string;
    bundleId: string;
    note?: string;
  }): Promise<SuggestionBundle> {
    const r = await jsonPost<{ bundle: SuggestionBundle }>(
      `/api/runs/${encodeURIComponent(input.runId)}/suggestion-bundles/${encodeURIComponent(input.bundleId)}/reject`,
      { note: input.note },
    );
    return r.bundle;
  },
  async applyBundle(input: {
    runId: string;
    bundleId: string;
    validateAfterApply?: boolean;
    autoRevertOnValidationFail?: boolean;
    validationProfile?: string | null;
  }): Promise<{ bundle: SuggestionBundle; preflight: BundlePreflightResult }> {
    return jsonPost(
      `/api/runs/${encodeURIComponent(input.runId)}/suggestion-bundles/${encodeURIComponent(input.bundleId)}/apply`,
      {
        validateAfterApply: input.validateAfterApply,
        autoRevertOnValidationFail: input.autoRevertOnValidationFail,
        validationProfile: input.validationProfile,
      },
    );
  },
  async smartApplyBundle(input: {
    runId: string;
    bundleId: string;
    validateEachStep?: boolean;
    autoRevertFailing?: boolean;
    validationProfile?: string | null;
    useSuggestionProfiles?: boolean;
  }): Promise<{ bundle: SuggestionBundle; result: SmartApplyResult }> {
    return jsonPost(
      `/api/runs/${encodeURIComponent(input.runId)}/suggestion-bundles/${encodeURIComponent(input.bundleId)}/smart-apply`,
      {
        validateEachStep: input.validateEachStep,
        autoRevertFailing: input.autoRevertFailing,
        validationProfile: input.validationProfile,
        useSuggestionProfiles: input.useSuggestionProfiles,
      },
    );
  },
  async validateBundle(input: {
    runId: string;
    bundleId: string;
    validationProfile?: string | null;
  }): Promise<{
    bundle: SuggestionBundle;
    result: SuggestionValidationResult;
  }> {
    return jsonPost(
      `/api/runs/${encodeURIComponent(input.runId)}/suggestion-bundles/${encodeURIComponent(input.bundleId)}/validate`,
      { validationProfile: input.validationProfile },
    );
  },
  async listValidationProfiles(): Promise<ValidationProfileSummary[]> {
    const r = await jsonGet<{ profiles: ValidationProfileSummary[] }>(
      "/api/validation/profiles",
    );
    return r.profiles;
  },

  async updateSuggestionProfile(input: {
    runId: string;
    suggestionId: string;
    validationProfile: string | null;
  }): Promise<ReviewSuggestion> {
    const r = await jsonPatch<{ suggestion: ReviewSuggestion }>(
      `/api/runs/${encodeURIComponent(input.runId)}/suggestions/${encodeURIComponent(input.suggestionId)}/profile`,
      { validationProfile: input.validationProfile },
    );
    return r.suggestion;
  },
  async updateBundleProfile(input: {
    runId: string;
    bundleId: string;
    validationProfile: string | null;
  }): Promise<SuggestionBundle> {
    const r = await jsonPatch<{ bundle: SuggestionBundle }>(
      `/api/runs/${encodeURIComponent(input.runId)}/suggestion-bundles/${encodeURIComponent(input.bundleId)}/profile`,
      { validationProfile: input.validationProfile },
    );
    return r.bundle;
  },

  async previewProfileMigration(input: {
    fromProfile: string;
    toProfile: string | null;
    scope?: { kind: "recent"; limit?: number } | { kind: "all" } | { kind: "run"; runId: string };
  }): Promise<{ preview: ProfileMigrationPreview }> {
    return jsonPost("/api/validation/profile-migrations/preview", input);
  },
  async applyProfileMigration(input: {
    fromProfile: string;
    toProfile: string | null;
    scope?: { kind: "recent"; limit?: number } | { kind: "all" } | { kind: "run"; runId: string };
  }): Promise<{ audit: ProfileMigrationAudit }> {
    return jsonPost("/api/validation/profile-migrations/apply", input);
  },
  async listProfileMigrations(): Promise<ProfileMigrationAudit[]> {
    const r = await jsonGet<{ migrations: ProfileMigrationAudit[] }>(
      "/api/validation/profile-migrations",
    );
    return r.migrations;
  },
  async previewProfileRename(input: {
    fromProfile: string;
    toProfile: string;
    scope?: { kind: "recent"; limit?: number } | { kind: "all" } | { kind: "run"; runId: string };
  }): Promise<{ preview: ProfileRenamePreview }> {
    return jsonPost("/api/validation/profile-renames/preview", input);
  },
  async applyProfileRename(input: {
    fromProfile: string;
    toProfile: string;
    scope?: { kind: "recent"; limit?: number } | { kind: "all" } | { kind: "run"; runId: string };
  }): Promise<{ audit: ProfileMigrationAudit }> {
    return jsonPost("/api/validation/profile-renames/apply", input);
  },
  async getProfileUsage(): Promise<{
    entries: ValidationProfileUsageEntry[];
    filePath: string;
  }> {
    return jsonGet("/api/validation/profile-usage");
  },

  async revertBundle(input: {
    runId: string;
    bundleId: string;
  }): Promise<SuggestionBundle> {
    const r = await jsonPost<{ bundle: SuggestionBundle }>(
      `/api/runs/${encodeURIComponent(input.runId)}/suggestion-bundles/${encodeURIComponent(input.bundleId)}/revert`,
    );
    return r.bundle;
  },
  async preflightBundle(input: {
    runId: string;
    bundleId: string;
  }): Promise<BundlePreflightResult> {
    return jsonGet(
      `/api/runs/${encodeURIComponent(input.runId)}/suggestion-bundles/${encodeURIComponent(input.bundleId)}/preflight`,
    );
  },

  async getTerminalAvailability(): Promise<TerminalAvailability> {
    return jsonGet("/api/terminal/availability");
  },
  async listTerminalSessions(): Promise<TerminalSession[]> {
    const r = await jsonGet<{ sessions: TerminalSession[] }>(
      "/api/terminal/sessions",
    );
    return r.sessions;
  },
  async createTerminalSession(input: {
    runId: string;
    cols: number;
    rows: number;
  }): Promise<TerminalSession> {
    const r = await jsonPost<{ session: TerminalSession }>(
      "/api/terminal/sessions",
      input,
    );
    return r.session;
  },
  async resizeTerminalSession(input: {
    id: string;
    cols: number;
    rows: number;
  }): Promise<void> {
    await jsonPost(
      `/api/terminal/sessions/${encodeURIComponent(input.id)}/resize`,
      { cols: input.cols, rows: input.rows },
    );
  },
  async closeTerminalSession(id: string): Promise<TerminalSession> {
    const r = await jsonPost<{ session: TerminalSession }>(
      `/api/terminal/sessions/${encodeURIComponent(id)}/close`,
    );
    return r.session;
  },

  async getPolicies(): Promise<PolicyStoreSnapshot> {
    return jsonGet("/api/policies");
  },
  async getPolicyDoctor(): Promise<PolicyDoctorResult> {
    return jsonGet("/api/policies/doctor");
  },
  async getSafetyConfig(): Promise<SafetyPoliciesConfig> {
    const r = await jsonGet<{ config: SafetyPoliciesConfig }>(
      "/api/policies/config",
    );
    return r.config;
  },
  async updateSafetyConfig(
    patch: Partial<Omit<SafetyPoliciesConfig, "requireApprovalAtStages">>,
  ): Promise<SafetyPoliciesConfig> {
    const r = await jsonPatch<{ config: SafetyPoliciesConfig }>(
      "/api/policies/config",
      patch,
    );
    return r.config;
  },
  async checkPatchAgainstPolicies(input: {
    patch: string;
    surface: PolicySurface;
  }): Promise<PolicyCheckResult> {
    return jsonPost("/api/policies/check", input);
  },

  async getRunReplay(runId: string): Promise<RunReplay> {
    return jsonGet(`/api/runs/${encodeURIComponent(runId)}/replay`);
  },

  // ── Durable param memory (Project parameters) ─────────────────────────────
  /** The full stored params. Secret entries hold an `env:NAME` ref, never raw. */
  async getParams(): Promise<ProjectParamsView> {
    const r = await jsonGet<{ params: ProjectParamsView }>("/api/params");
    return r.params;
  },
  /** The stored values that apply to one flow, keyed by param name (for the
   *  Composer form prefill). Secret values are blanked - only the flag ships. */
  async getFlowParams(flowId: string): Promise<Record<string, FlowParamValue>> {
    const r = await jsonGet<{ values: Record<string, FlowParamValue> }>(
      `/api/params/flow/${encodeURIComponent(flowId)}`,
    );
    return r.values;
  },
  /** Persist values. With `flowId`, keys are the flow's declared params (typed,
   *  secret-aware, namespaced); without it, keys are raw param keys. */
  async setParams(input: {
    flowId?: string | null;
    values: Record<string, string>;
  }): Promise<{ ok: true; warnings: string[]; params: ProjectParamsView }> {
    return jsonPost("/api/params", input);
  },
  async unsetParamKey(key: string): Promise<{ ok: true; removed: string[] }> {
    return jsonDelete(`/api/params/${encodeURIComponent(key)}`);
  },
  /** Model-independent "generate a default" for a param declaring a `generate`
   *  hint. Strictly user-initiated; returns a suggestion the user reviews. */
  async generateParam(
    flowId: string,
    param: string,
  ): Promise<{ suggestion: string }> {
    return jsonPost(`/api/params/generate`, { flowId, param });
  },
};

export type ParamSetBy = "user" | "generated" | "default";
export type ParamEntryView = {
  value: string;
  setBy: ParamSetBy;
  at: string;
  secret: boolean;
};
export type ProjectParamsView = {
  schemaVersion: number;
  values: Record<string, ParamEntryView>;
};
export type FlowParamValue = {
  value: string;
  setBy: ParamSetBy;
  secret: boolean;
};
