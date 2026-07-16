// Barrel for the dashboard HTTP client. The implementation lives in the
// ./api/<domain>.ts slices; this module re-composes them into the single
// `api` object and re-exports the DTO types + ApiError, so every importer
// keeps the historical `lib/api.js` specifier. Method names are unique
// across slices (tests/api-barrel-composition.test.ts guards the spread
// composition against silent key collisions).
import { runsApi } from "./api/runs.js";
import { specUpApi } from "./api/spec-up.js";
import { providersApi } from "./api/providers.js";
import { supervisorsApi } from "./api/supervisors.js";
import { policiesApi } from "./api/policies.js";
import { flowsApi } from "./api/flows.js";
import { metricsApi } from "./api/metrics.js";
import { crewsApi } from "./api/crews.js";
import { roadmapApi } from "./api/roadmap.js";
import { tasksApi } from "./api/tasks.js";
import { integrationApi } from "./api/integration.js";
import { workspaceApi } from "./api/workspace.js";
import { queueApi } from "./api/queue.js";
import { notificationsApi } from "./api/notifications.js";
import { configApi } from "./api/config.js";
import { projectApi } from "./api/project.js";
import { codebaseApi } from "./api/codebase.js";
import { gitApi } from "./api/git.js";
import { agentWorkApi } from "./api/agent-work.js";
import { suggestionsApi } from "./api/suggestions.js";
import { bundlesApi } from "./api/bundles.js";
import { terminalApi } from "./api/terminal.js";
import { paramsApi } from "./api/params.js";

export { ApiError } from "./api/http.js";
export type {
  OverviewRange,
  CrewPresetView,
  DailyOutcomeBucket,
  SpendByRoleEntry,
  PhaseLatencyEntry,
  HeatmapProviderUsage,
  HeatmapCell,
  HeatmapRow,
  LeaderboardEntry,
  KpiSparks,
  BudgetSettings,
  MetricsOverview,
  ProviderProfile,
  Role,
  ProvidersOverview,
  WorkspaceRecentRun,
  WorkspaceProjectSummary,
  WorkspaceOverview,
  EnsureServerResult,
  WorkspaceBusyStatus,
  WorkspaceCloseResult,
  ProviderRow,
  LedgerEntryDto,
  LedgerStateDto,
  CodebaseAnnotation,
  FlowStepKind,
  FlowApprovalRiskLevel,
  FlowApprovalGatePatch,
  FlowStepPatch,
  FlowStepFull,
  FlowSeatFull,
  FlowPatch,
  ComposerPreset,
  MergeOverviewRowDto,
  MergeAnalysisDto,
  MergeAdviceDto,
  RestorePreviewFile,
  RestorePreview,
  SnapshotPrunePlan,
  ParamSetBy,
  ParamEntryView,
  ProjectParamsView,
  FlowParamValue,
} from "./api/types.js";

export const api = {
  ...runsApi,
  ...specUpApi,
  ...providersApi,
  ...supervisorsApi,
  ...policiesApi,
  ...flowsApi,
  ...metricsApi,
  ...crewsApi,
  ...roadmapApi,
  ...tasksApi,
  ...integrationApi,
  ...workspaceApi,
  ...queueApi,
  ...notificationsApi,
  ...configApi,
  ...projectApi,
  ...codebaseApi,
  ...gitApi,
  ...agentWorkApi,
  ...suggestionsApi,
  ...bundlesApi,
  ...terminalApi,
  ...paramsApi,
};
