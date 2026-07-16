// Run lifecycle, inspection, notes, approvals, control, snapshots, replay.
import { ApiError, jsonGet, jsonPost } from "./http.js";
import type {
  VibestrateEvent,
  ApprovalRequest,
  ArtifactEntry,
  WorkflowSelectionView,
  DiffSnapshot,
  FileDiff,
  Note,
  EngagementEntry,
  RunAssurance,
  RunAudit,
  RunControlDirective,
  RunState,
  RuntimeMetrics,
  RunReplay,
  FlowContextPolicy,
  PerItemVerdict,
} from "../types.js";
import type {
  RestorePreview,
  SnapshotPrunePlan,
} from "./types.js";

export const runsApi = {
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
    /** Flow parameter values, name -> raw string. */
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
  async getRun(runId: string): Promise<RunState> {
    const r = await jsonGet<{ run: RunState }>(`/api/runs/${runId}`);
    return r.run;
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
  async getChecklistVerdicts(runId: string): Promise<PerItemVerdict[]> {
    const r = await jsonGet<{ verdicts: PerItemVerdict[] }>(
      `/api/runs/${runId}/checklist-verdicts`,
    );
    return r.verdicts;
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
  async requestChangesApproval(input: {
    runId: string;
    approvalId: string;
    guidance: string;
  }): Promise<ApprovalRequest> {
    const r = await jsonPost<{ approval: ApprovalRequest }>(
      `/api/runs/${input.runId}/approvals/${input.approvalId}/request-changes`,
      { guidance: input.guidance },
    );
    return r.approval;
  },
  async getRunReplay(runId: string): Promise<RunReplay> {
    return jsonGet(`/api/runs/${encodeURIComponent(runId)}/replay`);
  },
};
