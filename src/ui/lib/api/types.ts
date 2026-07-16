// DTO types for the dashboard API client - the response/request shapes
// the UI consumes. Server-mirror types stay in lib/types.ts; these are
// the dashboard-side views that used to live inline in lib/api.ts.
// Importers keep using lib/api.js - the barrel re-exports everything here.
import type { FlowLoop, RunState } from "../types.js";

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

export type HeatmapProviderUsage = {
  label: string;
  runs: number;
  costUsd: number;
  tokens: number;
};
export type HeatmapCell = {
  count: number;
  providers: HeatmapProviderUsage[];
};
export type HeatmapRow = { day: string; cells: HeatmapCell[] };

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

/** Project continuity ledger - the folded state surfaced read-only. */
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
  /** Suspected duplicate/conflict flags - never auto-resolved. */
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
  /** Per-step skills. */
  skills?: string[];
  /** Free-form per-step prompt instructions (null clears). */
  instructions?: string | null;
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
  /** Per-step skills. */
  skills?: string[];
  /** Free-form per-step prompt instructions. */
  instructions?: string;
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

/** Merge advice (design/merge-advisor.md). Structural mirror of the
 *  server's MergeAdvice - deterministic advisory data, no model output. */
/** Hub-list row: facts only (no preview, no recommendation - those come
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

/** The analyze-deeper result. Advisory prose + the deterministic
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
