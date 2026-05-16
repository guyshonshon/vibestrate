import { randomUUID } from "node:crypto";
import { nowIso } from "../utils/time.js";
import { slugify } from "../utils/slug.js";
import { RoadmapStore } from "./roadmap-store.js";
import {
  type Comment,
  type CommentTarget,
  type MicroStep,
  type Priority,
  type RoadmapItem,
  type RoadmapItemStatus,
  type Task,
  type TaskStatus,
  safeIdSchema,
} from "./roadmap-types.js";

export class RoadmapServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoadmapServiceError";
  }
}

function makeId(seed: string, prefix: string): string {
  const slug = slugify(seed).slice(0, 40);
  // Add 4-char suffix from a UUID for uniqueness without making the id long.
  const suffix = randomUUID().slice(0, 4);
  const id = `${prefix}-${slug}-${suffix}`.replace(/-+/g, "-");
  // Validate before returning.
  safeIdSchema.parse(id);
  return id;
}

export type AddRoadmapInput = {
  title: string;
  description?: string;
  priority?: Priority;
  status?: RoadmapItemStatus;
  notes?: string;
};

export type AddTaskInput = {
  title: string;
  description?: string;
  priority?: Priority;
  roadmapItemId?: string | null;
  dependencies?: string[];
  requiredSkills?: string[];
  touchedFiles?: string[];
  riskLevel?: Priority;
  validationProfile?: string | null;
  effort?: "low" | "medium" | "high" | null;
  providerOverride?: string | null;
  readOnly?: boolean;
};

export type CommentInput = {
  body: string;
  target?: CommentTarget;
  targetRef?: string | null;
};

export class RoadmapService {
  readonly store: RoadmapStore;

  constructor(private readonly projectRoot: string) {
    this.store = new RoadmapStore(projectRoot);
  }

  async init(): Promise<void> {
    await this.store.init();
  }

  // ─── roadmap items ────────────────────────────────────────────────────────

  async addRoadmapItem(input: AddRoadmapInput): Promise<RoadmapItem> {
    if (!input.title.trim()) {
      throw new RoadmapServiceError("Roadmap item title is required.");
    }
    const ts = nowIso();
    const item: RoadmapItem = {
      id: makeId(input.title, "rm"),
      title: input.title.trim(),
      description: input.description?.trim() ?? "",
      status: input.status ?? "idea",
      priority: input.priority ?? "medium",
      createdAt: ts,
      updatedAt: ts,
      linkedTaskIds: [],
      notes: input.notes ?? "",
    };
    await this.store.upsertRoadmapItem(item);
    return item;
  }

  async listRoadmapItems(): Promise<RoadmapItem[]> {
    return this.store.listRoadmapItems();
  }

  async getRoadmapItem(id: string): Promise<RoadmapItem | null> {
    return this.store.getRoadmapItem(id);
  }

  async updateRoadmapItem(
    id: string,
    patch: Partial<
      Pick<RoadmapItem, "title" | "description" | "priority" | "status" | "notes">
    >,
  ): Promise<RoadmapItem> {
    const existing = await this.store.getRoadmapItem(id);
    if (!existing) {
      throw new RoadmapServiceError(`Roadmap item "${id}" not found.`);
    }
    const updated: RoadmapItem = {
      ...existing,
      ...patch,
      updatedAt: nowIso(),
    };
    await this.store.upsertRoadmapItem(updated);
    return updated;
  }

  async archiveRoadmapItem(id: string): Promise<RoadmapItem> {
    return this.updateRoadmapItem(id, { status: "archived" });
  }

  // ─── tasks ────────────────────────────────────────────────────────────────

  async addTask(input: AddTaskInput): Promise<Task> {
    if (!input.title.trim()) {
      throw new RoadmapServiceError("Task title is required.");
    }
    if (input.roadmapItemId) {
      const item = await this.store.getRoadmapItem(input.roadmapItemId);
      if (!item) {
        throw new RoadmapServiceError(
          `Roadmap item "${input.roadmapItemId}" not found.`,
        );
      }
    }
    const ts = nowIso();
    const task: Task = {
      id: makeId(input.title, "task"),
      roadmapItemId: input.roadmapItemId ?? null,
      title: input.title.trim(),
      description: input.description?.trim() ?? "",
      status: "backlog",
      priority: input.priority ?? "medium",
      dependencies: input.dependencies ?? [],
      createdAt: ts,
      updatedAt: ts,
      assignedAgents: [],
      requiredSkills: input.requiredSkills ?? [],
      validationProfile: input.validationProfile ?? null,
      branchName: null,
      worktreePath: null,
      runIds: [],
      currentRunId: null,
      touchedFiles: input.touchedFiles ?? [],
      riskLevel: input.riskLevel ?? "medium",
      commentsCount: 0,
      lastEventAt: ts,
      effort: input.effort ?? null,
      providerOverride: input.providerOverride ?? null,
      readOnly: input.readOnly ?? false,
    };
    await this.store.writeTask(task);
    if (input.roadmapItemId) {
      const parent = await this.store.getRoadmapItem(input.roadmapItemId);
      if (parent) {
        const next: RoadmapItem = {
          ...parent,
          linkedTaskIds: [...new Set([...parent.linkedTaskIds, task.id])],
          updatedAt: nowIso(),
        };
        await this.store.upsertRoadmapItem(next);
      }
    }
    return task;
  }

  async listTasks(): Promise<Task[]> {
    return this.store.listTasks();
  }

  async getTask(id: string): Promise<Task | null> {
    return this.store.getTask(id);
  }

  async updateTaskStatus(id: string, status: TaskStatus): Promise<Task> {
    const t = await this.store.getTask(id);
    if (!t) throw new RoadmapServiceError(`Task "${id}" not found.`);
    const next: Task = { ...t, status, updatedAt: nowIso(), lastEventAt: nowIso() };
    await this.store.writeTask(next);
    return next;
  }

  async patchTask(
    id: string,
    patch: Partial<
      Pick<
        Task,
        | "title"
        | "description"
        | "priority"
        | "dependencies"
        | "requiredSkills"
        | "validationProfile"
        | "touchedFiles"
        | "riskLevel"
        | "effort"
        | "providerOverride"
        | "readOnly"
      >
    >,
  ): Promise<Task> {
    const t = await this.store.getTask(id);
    if (!t) throw new RoadmapServiceError(`Task "${id}" not found.`);
    const next: Task = {
      ...t,
      ...patch,
      updatedAt: nowIso(),
      lastEventAt: nowIso(),
    };
    await this.store.writeTask(next);
    return next;
  }

  async setTaskRun(input: {
    taskId: string;
    runId: string;
    branchName?: string | null;
    worktreePath?: string | null;
    status?: TaskStatus;
  }): Promise<Task> {
    const t = await this.store.getTask(input.taskId);
    if (!t) throw new RoadmapServiceError(`Task "${input.taskId}" not found.`);
    const next: Task = {
      ...t,
      currentRunId: input.runId,
      runIds: [...new Set([...t.runIds, input.runId])],
      branchName: input.branchName ?? t.branchName,
      worktreePath: input.worktreePath ?? t.worktreePath,
      status: input.status ?? t.status,
      updatedAt: nowIso(),
      lastEventAt: nowIso(),
    };
    await this.store.writeTask(next);
    return next;
  }

  async clearTaskCurrentRun(taskId: string, finalStatus: TaskStatus): Promise<Task> {
    const t = await this.store.getTask(taskId);
    if (!t) throw new RoadmapServiceError(`Task "${taskId}" not found.`);
    const next: Task = {
      ...t,
      currentRunId: null,
      status: finalStatus,
      updatedAt: nowIso(),
      lastEventAt: nowIso(),
    };
    await this.store.writeTask(next);
    return next;
  }

  // ─── comments ─────────────────────────────────────────────────────────────

  async listComments(taskId: string): Promise<Comment[]> {
    return this.store.listComments(taskId);
  }

  async addComment(taskId: string, input: CommentInput): Promise<Comment> {
    const t = await this.store.getTask(taskId);
    if (!t) throw new RoadmapServiceError(`Task "${taskId}" not found.`);
    if (!input.body.trim()) {
      throw new RoadmapServiceError("Comment body is required.");
    }
    const ts = nowIso();
    const comment: Comment = {
      id: randomUUID(),
      taskId,
      createdAt: ts,
      updatedAt: ts,
      author: "local-user",
      body: input.body.trim(),
      resolved: false,
      resolvedAt: null,
      target: input.target ?? "task",
      targetRef: input.targetRef ?? null,
    };
    const all = await this.store.listComments(taskId);
    all.push(comment);
    await this.store.writeComments(taskId, all);
    await this.patchTaskCounters(taskId, all);
    return comment;
  }

  async resolveComment(taskId: string, commentId: string): Promise<Comment | null> {
    const all = await this.store.listComments(taskId);
    const idx = all.findIndex((c) => c.id === commentId);
    if (idx < 0) return null;
    const ts = nowIso();
    const updated: Comment = {
      ...all[idx]!,
      resolved: true,
      resolvedAt: ts,
      updatedAt: ts,
    };
    all[idx] = updated;
    await this.store.writeComments(taskId, all);
    await this.patchTaskCounters(taskId, all);
    return updated;
  }

  private async patchTaskCounters(
    taskId: string,
    comments: Comment[],
  ): Promise<void> {
    const t = await this.store.getTask(taskId);
    if (!t) return;
    const open = comments.filter((c) => !c.resolved).length;
    const next: Task = {
      ...t,
      commentsCount: open,
      updatedAt: nowIso(),
      lastEventAt: nowIso(),
    };
    await this.store.writeTask(next);
  }
}

// ─── derived micro-step helpers (separate import path) ───────────────────────

export type { MicroStep };
