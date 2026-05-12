import type {
  AgentWorkReport,
  AmacoEvent,
  ApprovalRequest,
  ArtifactEntry,
  CodeReference,
  ConflictWarning,
  DiffSnapshot,
  DiscoveredSkill,
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
  RunState,
  RuntimeMetrics,
  SchedulerState,
  SkillAssignmentSummary,
  Task,
  TaskComment,
} from "./types.js";

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

async function jsonGet<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) msg = body.error;
    } catch {
      // ignore
    }
    throw new ApiError(res.status, msg);
  }
  return (await res.json()) as T;
}

async function jsonPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      // ignore
    }
    throw new ApiError(res.status, msg);
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
    let msg = `${res.status} ${res.statusText}`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      // ignore
    }
    throw new ApiError(res.status, msg);
  }
  return (await res.json()) as T;
}

export const api = {
  async listRuns(): Promise<RunState[]> {
    const r = await jsonGet<{ runs: RunState[] }>("/api/runs");
    return r.runs;
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
  async listSkills(): Promise<{
    skills: DiscoveredSkill[];
    assignments: SkillAssignmentSummary[];
  }> {
    return jsonGet("/api/skills");
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

  // ─── queue ────────────────────────────────────────────────────────────────
  async getQueue(): Promise<{
    queue: QueueEntry[];
    state: SchedulerState;
  }> {
    return jsonGet("/api/queue");
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
};
