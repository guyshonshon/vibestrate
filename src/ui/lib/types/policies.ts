import type { FlowRunStepStatus } from "./runs.js";
import type { PolicySurface } from "./suggestions.js";

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
