// Task cards, comments, lifecycle, and the per-task checklist.
import { jsonGet, jsonPost, jsonPatch, jsonPut, jsonDelete } from "./http.js";
import type {
  ChecklistItem,
  ChecklistItemStatus,
  MicroStep,
  Task,
  TaskComment,
  TaskRunStatus,
  TaskSuggestion,
} from "../types.js";

export const tasksApi = {
  async listTasks(): Promise<Task[]> {
    const r = await jsonGet<{ tasks: Task[] }>("/api/tasks");
    return r.tasks;
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
    runMode?: "plain" | "supervised";
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
  /** Supervised-run live status (the Conductor): lifecycle, live run, step
   *  progress, halt, invariants. Same source as `vibe tasks status`. */
  async getTaskRunStatus(taskId: string): Promise<{ status: TaskRunStatus }> {
    return jsonGet(`/api/sagas/${encodeURIComponent(taskId)}/status`);
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
    fields?: { objective?: string; acceptanceCheck?: string; fileHints?: string[] },
  ): Promise<{ task: Task; item: ChecklistItem }> {
    return jsonPost(
      `/api/tasks/${encodeURIComponent(taskId)}/checklist`,
      { text, ...fields },
    );
  },
  async updateChecklistItem(
    taskId: string,
    itemId: string,
    patch: { text?: string; status?: ChecklistItemStatus; objective?: string; acceptanceCheck?: string; fileHints?: string[] },
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
    opts: {
      apply?: boolean;
      profileId?: string | null;
      answers?: { question: string; answer: string }[];
      signal?: AbortSignal;
    } = {},
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
    return jsonPost(
      `/api/tasks/${encodeURIComponent(taskId)}/enhance`,
      {
        apply: opts.apply ?? false,
        profileId: opts.profileId ?? null,
        answers: opts.answers,
      },
      opts.signal,
    );
  },
  async planQuestions(
    taskId: string,
    opts: { signal?: AbortSignal } = {},
  ): Promise<{
    proposal: {
      taskId: string;
      questions: {
        id: string;
        question: string;
        why: string;
        kind: "choice" | "text";
        options: string[];
      }[];
      providerId: string;
      profileId: string;
      attempts: number;
    };
  }> {
    return jsonPost(
      `/api/tasks/${encodeURIComponent(taskId)}/plan-questions`,
      {},
      opts.signal,
    );
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
    sources: import("../types.js").ContextSource[],
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
};
