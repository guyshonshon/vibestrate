import type {
  AmacoEvent,
  ApprovalRequest,
  ArtifactEntry,
  ConflictWarning,
  DiffSnapshot,
  DiscoveredSkill,
  FileDiff,
  MicroStep,
  Note,
  QueueEntry,
  RoadmapItem,
  RunState,
  RuntimeMetrics,
  SchedulerState,
  SkillAssignmentSummary,
  Task,
  TaskComment,
} from "./types.js";

class ApiError extends Error {
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
};
