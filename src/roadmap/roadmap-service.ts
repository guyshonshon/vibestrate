import { randomUUID } from "node:crypto";
import { nowIso } from "../utils/time.js";
import { slugify } from "../utils/slug.js";
import { pathExists } from "../utils/fs.js";
import { runStatePath } from "../utils/paths.js";
import { RunStateStore, isTerminal } from "../core/state-machine.js";
import { RunQueue } from "../scheduler/run-queue.js";
import { RoadmapStore } from "./roadmap-store.js";
import { buildDependencyGraph, findFirstCycle } from "./dependency-graph.js";
import {
  type ChecklistItem,
  type ChecklistItemStatus,
  type Comment,
  type CommentTarget,
  type MicroStep,
  type Priority,
  type RoadmapItem,
  type RoadmapItemStatus,
  type Task,
  type TaskKind,
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
  acceptanceCriteria?: string;
  acceptanceCommands?: string[];
  est?: string;
  priority?: Priority;
  roadmapItemId?: string | null;
  dependencies?: string[];
  requiredSkills?: string[];
  touchedFiles?: string[];
  riskLevel?: Priority;
  validationProfile?: string | null;
  profileOverride?: string | null;
  readOnly?: boolean;
  derivedFrom?: { taskId: string; itemId: string } | null;
  kind?: TaskKind;
};

export type CommentInput = {
  body: string;
  target?: CommentTarget;
  targetRef?: string | null;
};

export type ChecklistItemPatch = Partial<
  Pick<
    ChecklistItem,
    "text" | "status" | "commitSha" | "promotedTaskId" | "objective" | "acceptanceCheck" | "fileHints"
  >
>;

function normalizeStepFields(f: { objective?: string; acceptanceCheck?: string; fileHints?: string[] }) {
  const out: { objective?: string; acceptanceCheck?: string; fileHints?: string[] } = {};
  if (f.objective !== undefined) out.objective = f.objective.trim();
  if (f.acceptanceCheck !== undefined) out.acceptanceCheck = f.acceptanceCheck.trim();
  if (f.fileHints !== undefined) out.fileHints = f.fileHints.map((x) => x.trim()).filter((x) => x.length > 0);
  return out;
}

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
      kind: input.kind ?? "single",
      roadmapItemId: input.roadmapItemId ?? null,
      title: input.title.trim(),
      description: input.description?.trim() ?? "",
      acceptanceCriteria: input.acceptanceCriteria?.trim() ?? "",
      acceptanceCommands: (input.acceptanceCommands ?? [])
        .map((c) => c.trim())
        .filter((c) => c.length > 0),
      est: input.est?.trim() ?? "",
      status: "backlog",
      priority: input.priority ?? "medium",
      dependencies: input.dependencies ?? [],
      createdAt: ts,
      updatedAt: ts,
      assignedRoles: [],
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
      profileOverride: input.profileOverride ?? null,
      readOnly: input.readOnly ?? false,
      checklist: [],
      needsTesting: false,
      needsTestingReason: null,
      derivedFrom: input.derivedFrom ?? null,
      archived: false,
      contextSources: [],
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

  /** Rank backlog cards by dependency-readiness + priority (suggest-next). */
  async suggestNext(): Promise<import("./suggest-next.js").Suggestion[]> {
    const { suggestNext } = await import("./suggest-next.js");
    return suggestNext(await this.store.listTasks());
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
        | "acceptanceCriteria"
        | "acceptanceCommands"
        | "est"
        | "priority"
        | "dependencies"
        | "requiredSkills"
        | "validationProfile"
        | "touchedFiles"
        | "riskLevel"
        | "profileOverride"
        | "readOnly"
      >
    >,
  ): Promise<Task> {
    const t = await this.store.getTask(id);
    if (!t) throw new RoadmapServiceError(`Task "${id}" not found.`);
    // Dependency edits must keep the roadmap a DAG: a cycle corrupts the
    // ready/blocked logic (a card could block itself). Validate against the
    // full task set BEFORE persisting - the route + accept both reach here, so
    // this is the single guard. (Edges toward an acyclic target are always a
    // subgraph of it, so accept's incremental second pass never trips this.)
    if (patch.dependencies !== undefined) {
      const deps = [...new Set(patch.dependencies)];
      if (deps.includes(id)) {
        throw new RoadmapServiceError(`A task cannot depend on itself ("${id}").`);
      }
      const all = await this.store.listTasks();
      const known = new Set(all.map((x) => x.id));
      const missing = deps.find((d) => !known.has(d));
      if (missing) {
        throw new RoadmapServiceError(`Unknown dependency "${missing}".`);
      }
      const proposed = all.map((x) => (x.id === id ? { ...x, dependencies: deps } : x));
      const cycle = findFirstCycle(buildDependencyGraph(proposed));
      if (cycle.cyclic) {
        throw new RoadmapServiceError(
          `That dependency would create a cycle: ${cycle.cycle.join(" -> ")}.`,
        );
      }
    }
    const next: Task = {
      ...t,
      ...patch,
      // Normalize acceptanceCommands like addTask does (trim + drop blanks) so an
      // edit can't persist a whitespace-only command.
      ...(patch.acceptanceCommands !== undefined
        ? {
            acceptanceCommands: patch.acceptanceCommands
              .map((c) => c.trim())
              .filter((c) => c.length > 0),
          }
        : {}),
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

  /**
   * Refuse to remove a task that is live anywhere. The card's `currentRunId`
   * is NOT a reliable liveness signal - it's only set for the two lines around
   * run completion, so a genuinely-executing task usually has it null. We check
   * the real signals: the card's own in-flight status, any associated run whose
   * state file is non-terminal (a leaked/parallel run), and the scheduler's
   * queue / running set. Lives in the service so the TUI, web, and CLI all
   * inherit the same guard.
   */
  private async assertTaskRemovable(t: Task): Promise<void> {
    const inFlight: TaskStatus[] = ["queued", "running", "waiting_for_approval"];
    if (inFlight.includes(t.status)) {
      throw new RoadmapServiceError(
        `Task "${t.id}" is ${t.status}; terminate or cancel its run before removing it.`,
      );
    }
    if (t.currentRunId) {
      throw new RoadmapServiceError(
        `Task "${t.id}" is linked to active run ${t.currentRunId}; terminate it before removing.`,
      );
    }
    const runIds = [
      ...new Set(
        [t.currentRunId, ...t.runIds].filter((x): x is string => Boolean(x)),
      ),
    ];
    for (const runId of runIds) {
      const stateFile = runStatePath(this.projectRoot, runId);
      if (!(await pathExists(stateFile))) continue;
      try {
        const state = await new RunStateStore(this.projectRoot, runId).read();
        if (!isTerminal(state.status)) {
          throw new RoadmapServiceError(
            `Task "${t.id}" has a live run ${runId} (status: ${state.status}); terminate it before removing.`,
          );
        }
      } catch (err) {
        if (err instanceof RoadmapServiceError) throw err;
        // Unreadable/partial state file - treat as not-live (best-effort).
      }
    }
    const queue = new RunQueue(this.projectRoot);
    const [qf, st] = await Promise.all([queue.readQueue(), queue.readState()]);
    if (
      qf.entries.some((e) => e.taskId === t.id) ||
      st.runningTaskIds.includes(t.id)
    ) {
      throw new RoadmapServiceError(
        `Task "${t.id}" is in the run queue; cancel it before removing.`,
      );
    }
  }

  /**
   * Permanently remove a task card. Refuses while the task is live (see
   * `assertTaskRemovable`). Cleans up everything the card owns as metadata:
   * the promoted-from checklist back-pointer, the parent roadmap item's
   * `linkedTaskIds`, the comments file, and the task file. Does NOT touch the
   * git worktree, run state, transcripts, or artifacts - that's the user's
   * work/history (no auto-purge); callers surface the leftover worktree path.
   * Returns the deleted task so callers can report what was removed.
   */
  async deleteTask(id: string): Promise<Task> {
    const t = await this.store.getTask(id);
    if (!t) throw new RoadmapServiceError(`Task "${id}" not found.`);
    await this.assertTaskRemovable(t);
    // If this card was promoted from a checklist item, clear the origin item's
    // forward-pointer so it no longer shows "→ card X" pointing at nothing.
    if (t.derivedFrom) {
      const origin = await this.store.getTask(t.derivedFrom.taskId);
      if (origin) {
        const idx = origin.checklist.findIndex(
          (c) => c.id === t.derivedFrom!.itemId,
        );
        if (idx >= 0 && origin.checklist[idx]!.promotedTaskId === id) {
          const checklist = [...origin.checklist];
          checklist[idx] = {
            ...checklist[idx]!,
            promotedTaskId: null,
            updatedAt: nowIso(),
          };
          await this.writeChecklist(origin, checklist);
        }
      }
    }
    // Detach from the parent roadmap item so it doesn't keep claiming this id.
    if (t.roadmapItemId) {
      const item = await this.store.getRoadmapItem(t.roadmapItemId);
      if (item && item.linkedTaskIds.includes(id)) {
        await this.store.upsertRoadmapItem({
          ...item,
          linkedTaskIds: item.linkedTaskIds.filter((x) => x !== id),
          updatedAt: nowIso(),
        });
      }
    }
    await this.store.deleteComments(id);
    await this.store.deleteTask(id);
    return t;
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

  /** Replace a task's context sources (Phase 4). */
  async setContextSources(
    taskId: string,
    sources: import("../core/context-source-schema.js").ContextSource[],
  ): Promise<Task> {
    const t = await this.store.getTask(taskId);
    if (!t) throw new RoadmapServiceError(`Task "${taskId}" not found.`);
    const next: Task = {
      ...t,
      contextSources: sources,
      updatedAt: nowIso(),
      lastEventAt: nowIso(),
    };
    await this.store.writeTask(next);
    return next;
  }

  /** Archive or un-archive a task (board overlay; orthogonal to run status). */
  async setArchived(taskId: string, archived: boolean): Promise<Task> {
    const t = await this.store.getTask(taskId);
    if (!t) throw new RoadmapServiceError(`Task "${taskId}" not found.`);
    if (archived && t.currentRunId) {
      throw new RoadmapServiceError(
        `Task "${taskId}" is linked to active run ${t.currentRunId}; abort the run before archiving.`,
      );
    }
    const next: Task = {
      ...t,
      archived,
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

  // ─── checklist ────────────────────────────────────────────────────────────
  // The ordered breakdown that lives *inside* a card. Every mutation is a
  // read-modify-write of the whole task (consistent with patchTask), so the
  // checklist always round-trips through taskSchema validation.

  private async requireTask(taskId: string): Promise<Task> {
    const t = await this.store.getTask(taskId);
    if (!t) throw new RoadmapServiceError(`Task "${taskId}" not found.`);
    return t;
  }

  private async writeChecklist(
    task: Task,
    checklist: ChecklistItem[],
  ): Promise<Task> {
    const next: Task = {
      ...task,
      checklist,
      updatedAt: nowIso(),
      lastEventAt: nowIso(),
    };
    await this.store.writeTask(next);
    return next;
  }

  async addChecklistItem(
    taskId: string,
    text: string,
    fields: { objective?: string; acceptanceCheck?: string; fileHints?: string[] } = {},
  ): Promise<{ task: Task; item: ChecklistItem }> {
    const t = await this.requireTask(taskId);
    const trimmed = text.trim();
    if (!trimmed) {
      throw new RoadmapServiceError("Checklist item text is required.");
    }
    const ts = nowIso();
    const normalized = normalizeStepFields(fields);
    const item: ChecklistItem = {
      id: makeId(trimmed, "ci"),
      text: trimmed,
      status: "pending",
      createdAt: ts,
      updatedAt: ts,
      commitSha: null,
      promotedTaskId: null,
      objective: normalized.objective ?? "",
      acceptanceCheck: normalized.acceptanceCheck ?? "",
      fileHints: normalized.fileHints ?? [],
    };
    const task = await this.writeChecklist(t, [...t.checklist, item]);
    return { task, item };
  }

  async updateChecklistItem(
    taskId: string,
    itemId: string,
    patch: ChecklistItemPatch,
  ): Promise<{ task: Task; item: ChecklistItem }> {
    const t = await this.requireTask(taskId);
    const idx = t.checklist.findIndex((c) => c.id === itemId);
    if (idx < 0) {
      throw new RoadmapServiceError(
        `Checklist item "${itemId}" not found on task "${taskId}".`,
      );
    }
    if (patch.text !== undefined && !patch.text.trim()) {
      throw new RoadmapServiceError("Checklist item text cannot be empty.");
    }
    const prev = t.checklist[idx]!;
    const item: ChecklistItem = {
      ...prev,
      ...patch,
      ...normalizeStepFields(patch),
      text: patch.text !== undefined ? patch.text.trim() : prev.text,
      updatedAt: nowIso(),
    };
    const checklist = [...t.checklist];
    checklist[idx] = item;
    const task = await this.writeChecklist(t, checklist);
    return { task, item };
  }

  async setChecklistItemStatus(
    taskId: string,
    itemId: string,
    status: ChecklistItemStatus,
  ): Promise<{ task: Task; item: ChecklistItem }> {
    return this.updateChecklistItem(taskId, itemId, { status });
  }

  async removeChecklistItem(taskId: string, itemId: string): Promise<Task> {
    const t = await this.requireTask(taskId);
    const checklist = t.checklist.filter((c) => c.id !== itemId);
    if (checklist.length === t.checklist.length) {
      throw new RoadmapServiceError(
        `Checklist item "${itemId}" not found on task "${taskId}".`,
      );
    }
    return this.writeChecklist(t, checklist);
  }

  /** Reorder the checklist to `orderedIds`, which must be a permutation of the
   *  existing item ids (same set, no additions/removals). */
  async reorderChecklist(taskId: string, orderedIds: string[]): Promise<Task> {
    const t = await this.requireTask(taskId);
    const current = new Set(t.checklist.map((c) => c.id));
    const wanted = new Set(orderedIds);
    if (
      orderedIds.length !== t.checklist.length ||
      wanted.size !== orderedIds.length ||
      [...current].some((id) => !wanted.has(id))
    ) {
      throw new RoadmapServiceError(
        "Reorder must be a permutation of the existing checklist item ids.",
      );
    }
    const byId = new Map(t.checklist.map((c) => [c.id, c]));
    const checklist = orderedIds.map((id) => byId.get(id)!);
    return this.writeChecklist(t, checklist);
  }

  /**
   * Promote a checklist item to its own card. Creates a new Task whose
   * `derivedFrom` points back at the origin item, and stamps the item's
   * `promotedTaskId` with the new card id (a relation - the item is NOT removed,
   * and the new card is independent). Idempotent-guarded: refuses to promote an
   * item that already points at a still-existing card.
   */
  async promoteChecklistItem(
    taskId: string,
    itemId: string,
  ): Promise<{ task: Task; card: Task }> {
    const t = await this.requireTask(taskId);
    const idx = t.checklist.findIndex((c) => c.id === itemId);
    if (idx < 0) {
      throw new RoadmapServiceError(
        `Checklist item "${itemId}" not found on task "${taskId}".`,
      );
    }
    const item = t.checklist[idx]!;
    if (item.promotedTaskId) {
      const existing = await this.store.getTask(item.promotedTaskId);
      if (existing) {
        throw new RoadmapServiceError(
          `Checklist item "${itemId}" was already promoted to card "${item.promotedTaskId}".`,
        );
      }
      // The previously-promoted card was deleted - allow re-promotion.
    }
    // Create the new card, carrying the origin task's roadmap link so it stays
    // grouped under the same epic.
    const card = await this.addTask({
      title: item.text,
      roadmapItemId: t.roadmapItemId,
      derivedFrom: { taskId, itemId },
    });
    // Stamp the forward-pointer on the item (re-read in case addTask touched it).
    const fresh = await this.requireTask(taskId);
    const freshIdx = fresh.checklist.findIndex((c) => c.id === itemId);
    const checklist = [...fresh.checklist];
    checklist[freshIdx] = {
      ...checklist[freshIdx]!,
      promotedTaskId: card.id,
      updatedAt: nowIso(),
    };
    const task = await this.writeChecklist(fresh, checklist);
    return { task, card };
  }

  // ─── needs-testing advisory ───────────────────────────────────────────────

  /** Flag a task for human testing (non-blocking advisory from a run). */
  async flagNeedsTesting(taskId: string, reason: string | null): Promise<Task> {
    const t = await this.requireTask(taskId);
    const next: Task = {
      ...t,
      needsTesting: true,
      needsTestingReason: reason,
      updatedAt: nowIso(),
      lastEventAt: nowIso(),
    };
    await this.store.writeTask(next);
    return next;
  }

  /**
   * Resolve a needs-testing advisory with a human verdict. "pass" clears the
   * flag and marks the task done; "fail" clears it and reopens the task to
   * `ready` so it can be picked up again.
   */
  async resolveNeedsTesting(
    taskId: string,
    verdict: "pass" | "fail",
  ): Promise<Task> {
    const t = await this.requireTask(taskId);
    const next: Task = {
      ...t,
      needsTesting: false,
      needsTestingReason: null,
      status: verdict === "pass" ? "done" : "ready",
      updatedAt: nowIso(),
      lastEventAt: nowIso(),
    };
    await this.store.writeTask(next);
    return next;
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
