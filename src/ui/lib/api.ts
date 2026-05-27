import type {
  AgentWorkReport,
  AmacoEvent,
  ApprovalRequest,
  ArtifactEntry,
  CodeReference,
  ConflictWarning,
  DiffSnapshot,
  DiscoveredSkill,
  DiscoveredGuide,
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
  RunControlDirective,
  RunState,
  RuntimeMetrics,
  SchedulerState,
  SkillAssignmentSummary,
  Task,
  TaskComment,
  TerminalAvailability,
  TerminalSession,
  PolicyStoreSnapshot,
  PolicyDoctorResult,
  PolicyCheckResult,
  PolicySurface,
  RunReplay,
  GuideContextPolicy,
  GuideSuggestion,
  ResolvedGuideSnapshot,
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
  // setErrorHandler in src/server/server.ts). Prefer `title — hint`
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
      return body.hint ? `${body.title} — ${body.hint}` : body.title;
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

async function jsonDelete<T>(path: string): Promise<T> {
  const res = await fetch(path, { method: "DELETE" });
  if (!res.ok) {
    throw new ApiError(res.status, await readErrorMessage(res));
  }
  return (await res.json()) as T;
}

export type OverviewRange = "24h" | "7d" | "30d" | "90d";

export type DailyOutcomeBucket = {
  date: string;
  label: string;
  merged: number;
  changes: number;
  failed: number;
};

export type SpendByAgentEntry = {
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
  fallbackProvider?: string;
};

export type MetricsOverview = {
  range: OverviewRange;
  generatedAt: string;
  daily: DailyOutcomeBucket[];
  spendByAgent: SpendByAgentEntry[];
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

export type AgentProfile = {
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
export type AgentRole = {
  id: string;
  provider: string;
  providerConfigured: boolean;
  permissions: string;
  skills: string[];
};

export type AgentsOverview = {
  generatedAt: string;
  providers: AgentProfile[];
  kpi: {
    onlineCount: number;
    totalCount: number;
    runs24h: number;
    spend24hUsd: number;
    avgP95Seconds: number | null;
  };
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
  shareWithAgents: boolean;
  status: "open" | "resolved";
  createdAt: string;
  updatedAt: string;
};

export type GuideStepKind =
  | "agent-turn"
  | "review-turn"
  | "response-turn"
  | "validation"
  | "approval-gate"
  | "summary-turn";

export type GuideApprovalRiskLevel = "low" | "medium" | "high";

export type GuideApprovalGatePatch = {
  reason: string;
  requestedAction: string;
  userMessage?: string;
  riskLevel: GuideApprovalRiskLevel;
};

/** Per-step patch — `undefined` keeps the current value, `null` clears
 *  the optional field. */
export type GuideStepPatch = {
  id: string;
  label?: string;
  optional?: boolean;
  kind?: GuideStepKind;
  slot?: string | null;
  agentId?: string | null;
  approval?: GuideApprovalGatePatch | null;
};

/** Full step shape — accepted by `replaceSteps`. Mirrors the server's
 *  `guideStepSchema`, but inputs/outputs default to []. */
export type GuideStepFull = {
  id: string;
  label: string;
  kind: GuideStepKind;
  slot?: string;
  agentId?: string;
  inputs?: string[];
  outputs?: string[];
  optional?: boolean;
  approval?: GuideApprovalGatePatch;
  repeat?: { times: number };
};

export type GuideSlotFull = {
  label: string;
  description?: string;
  defaultAgent: string;
};

export type GuidePatch = {
  label?: string;
  description?: string;
  steps?: GuideStepPatch[];
  /** Replace the entire ordered step list (used for add / remove / reorder). */
  replaceSteps?: GuideStepFull[];
  /** Replace the slot map wholesale. */
  replaceSlots?: Record<string, GuideSlotFull>;
};

export type ComposerPreset = {
  name: string;
  kind: "crew" | "template";
  brief: string | null;
  guide: {
    id: string;
    contextPolicy: "balanced" | "compact" | "artifact-heavy";
    slotProviders: Record<string, string>;
    skippedOptionalSteps: string[];
  } | null;
  provider: string | null;
  skills: string[];
  readOnly: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export const api = {
  async listRuns(): Promise<RunState[]> {
    const r = await jsonGet<{ runs: RunState[] }>("/api/runs");
    return r.runs;
  },
  async spawnRun(input: {
    task: string;
    taskId?: string;
    effort?: "low" | "medium" | "high";
    provider?: string;
    readOnly?: boolean;
    skills?: string[];
    concise?: boolean;
    guide?: {
      id: string;
      brief?: string | null;
      contextPolicy?: GuideContextPolicy;
      slotProviders?: Record<string, string>;
      skippedOptionalSteps?: string[];
    };
    resumeFrom?: {
      sourceRunId: string;
      fromStage: "architecting" | "executing";
    };
  }): Promise<{ ok: true; pid: number | null; argv: string[]; message: string }> {
    return jsonPost("/api/runs", input);
  },
  async getProviderConfig(providerId: string): Promise<{
    providerId: string;
    configured: boolean;
    config: {
      type: "cli";
      command: string;
      args: string[];
      input: "stdin" | "arg";
    };
    agentsUsing: string[];
  }> {
    return jsonGet(
      `/api/providers/${encodeURIComponent(providerId)}/config`,
    );
  },
  async setupProvider(
    providerId: string,
    opts: {
      setAsDefault?: boolean;
      config?: { command: string; args?: string[]; input?: "stdin" | "arg" };
    } = {},
  ): Promise<{ ok: true; providerId: string; configured: true }> {
    return jsonPost(
      `/api/providers/${encodeURIComponent(providerId)}/setup`,
      opts,
    );
  },
  async setDefaultProvider(
    providerId: string,
  ): Promise<{ ok: true; providerId: string; agentsUpdated: string[] }> {
    return jsonPost(
      `/api/providers/${encodeURIComponent(providerId)}/default`,
    );
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
  async listEvents(runId: string): Promise<AmacoEvent[]> {
    const r = await jsonGet<{ events: AmacoEvent[] }>(
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
  async listGuides(): Promise<{ guides: DiscoveredGuide[] }> {
    return jsonGet("/api/guides");
  },
  async patchGuide(
    guideId: string,
    patch: GuidePatch,
  ): Promise<{ ok: true; guide: DiscoveredGuide; definitionPath: string }> {
    return jsonPatch(`/api/guides/${encodeURIComponent(guideId)}`, patch);
  },
  async forkGuideToProject(guideId: string): Promise<{
    ok: true;
    guideId: string;
    definitionPath: string;
    alreadyForked: boolean;
    guide: DiscoveredGuide;
  }> {
    return jsonPost(`/api/guides/${encodeURIComponent(guideId)}/fork`);
  },
  async deleteGuide(guideId: string): Promise<{ ok: true; guideId: string }> {
    return jsonDelete(`/api/guides/${encodeURIComponent(guideId)}`);
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
  async updateBudget(
    patch: Partial<BudgetSettings>,
  ): Promise<{ ok: true; budget: BudgetSettings }> {
    return jsonPatch("/api/budget", patch);
  },
  async getAgentsOverview(): Promise<AgentsOverview> {
    return jsonGet("/api/agents/overview");
  },
  async getAgentRoles(): Promise<{ roles: AgentRole[] }> {
    return jsonGet("/api/agents/roles");
  },
  async resolveGuide(
    guideId: string,
    input: {
      task: string;
      brief?: string | null;
      contextPolicy?: GuideContextPolicy;
      slotProviders?: Record<string, string>;
      stepProviders?: Record<string, string>;
      skippedOptionalSteps?: string[];
    },
  ): Promise<ResolvedGuideSnapshot> {
    const r = await jsonPost<{ snapshot: ResolvedGuideSnapshot }>(
      `/api/guides/${encodeURIComponent(guideId)}/resolve`,
      input,
    );
    return r.snapshot;
  },
  async suggestGuides(input: {
    task: string;
    files?: string[];
    riskLevel?: "low" | "medium" | "high" | null;
  }): Promise<GuideSuggestion[]> {
    const r = await jsonPost<{ suggestions: GuideSuggestion[] }>(
      "/api/guides/suggest",
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
    agentId: string;
  }): Promise<{ assignments: SkillAssignmentSummary[] }> {
    const r = await jsonPost<{ assignments: SkillAssignmentSummary[] }>(
      `/api/skills/${encodeURIComponent(input.skillId)}/assign`,
      { agentId: input.agentId },
    );
    return r;
  },
  async unassignSkill(input: {
    skillId: string;
    agentId: string;
  }): Promise<{ assignments: SkillAssignmentSummary[] }> {
    const r = await jsonPost<{ assignments: SkillAssignmentSummary[] }>(
      `/api/skills/${encodeURIComponent(input.skillId)}/unassign`,
      { agentId: input.agentId },
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
  async classifyEffort(input: {
    text: string;
    files?: string[];
  }): Promise<{
    effort: "low" | "medium" | "high";
    confidence: number;
    reasons: string[];
  }> {
    return jsonPost("/api/effort/classify", input);
  },
  async patchTask(
    taskId: string,
    patch: Partial<{
      title: string;
      description: string;
      priority: "low" | "medium" | "high";
      validationProfile: string | null;
      effort: "low" | "medium" | "high" | null;
      providerOverride: string | null;
      readOnly: boolean;
    }>,
  ): Promise<Task> {
    const r = await jsonPatch<{ task: Task }>(
      `/api/tasks/${encodeURIComponent(taskId)}`,
      patch,
    );
    return r.task;
  },
  async queueTask(taskId: string): Promise<Task> {
    const r = await jsonPost<{ task: Task }>(
      `/api/tasks/${encodeURIComponent(taskId)}/queue`,
    );
    return r.task;
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

  // ─── project / codebase / git / agent-work ────────────────────────────────
  async getProjectMetadata(): Promise<ProjectMetadata> {
    const r = await jsonGet<{ metadata: ProjectMetadata }>(
      "/api/project/metadata",
    );
    return r.metadata;
  },
  async getProjectTree(input?: {
    depth?: number;
    maxEntries?: number;
    includeHidden?: boolean;
    includeAmaco?: boolean;
  }): Promise<FileTreeResult> {
    const q = new URLSearchParams();
    if (input?.depth !== undefined) q.set("depth", String(input.depth));
    if (input?.maxEntries !== undefined)
      q.set("maxEntries", String(input.maxEntries));
    if (input?.includeHidden) q.set("includeHidden", "true");
    if (input?.includeAmaco) q.set("includeAmaco", "true");
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
    shareWithAgents?: boolean;
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
      shareWithAgents?: boolean;
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
  async getAgentWork(runId: string): Promise<AgentWorkReport> {
    const r = await jsonGet<{ report: AgentWorkReport }>(
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
  async checkPatchAgainstPolicies(input: {
    patch: string;
    surface: PolicySurface;
  }): Promise<PolicyCheckResult> {
    return jsonPost("/api/policies/check", input);
  },

  async getRunReplay(runId: string): Promise<RunReplay> {
    return jsonGet(`/api/runs/${encodeURIComponent(runId)}/replay`);
  },
};
