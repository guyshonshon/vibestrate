// The rules layer over RoadmapStore for the board: epics (roadmap items), task
// cards, their comments, and the ordered checklist inside a card. The store owns
// the files and the schemas; this owns the guards, so callers inherit them
// instead of each re-implementing them.
//
// Shape of a mutator here: read the record through the store, patch it, write
// the WHOLE record back. Nothing in this file holds a lock across that
// read-modify-write, so concurrent mutations of one card are not safe.
//
// `patchTask` validates a dependency edit before persisting - it rejects
// self-edges, unknown ids, and cycles, because a cycle corrupts the
// ready/blocked logic and lets a card block itself. `addTask` stores its
// `dependencies` input as given.

import { randomUUID } from "node:crypto";
import { nowIso } from "../utils/time.js";
import { slugify } from "../utils/slug.js";
import { pathExists } from "../utils/fs.js";
import { runStatePath } from "../utils/paths.js";
import { RunStateStore, isTerminal } from "../core/state-machine.js";
import { RunQueue } from "../scheduler/run-queue.js";
import { RoadmapStore } from "./roadmap-store.js";
import { appendInvariants } from "../core/saga/saga-supervisor.js";
import { buildDependencyGraph, findFirstCycle } from "./dependency-graph.js";
import {
  type ChecklistItem,
  type ChecklistItemStatus,
  type Comment,
  type CommentTarget,
  type MicroStep,
  type Priority,
  type Provenance,
  type RoadmapItem,
  type RoadmapItemStatus,
  type SupervisedHalt,
  type SupervisedPendingRevision,
  type Task,
  type RunMode,
  type TaskStatus,
  SUPERVISED_DEFAULT_MAX_STEPS,
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
  /** Project-relative path to the approved spec this card came from. */
  specRef?: string | null;
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
  runMode?: RunMode;
};

export type CommentInput = {
  body: string;
  target?: CommentTarget;
  targetRef?: string | null;
};

export type ChecklistItemPatch = Partial<
  Pick<
    ChecklistItem,
    | "text"
    | "status"
    | "commitSha"
    | "promotedTaskId"
    | "objective"
    | "acceptanceCheck"
    | "fileHints"
    | "runId"
    | "outcomeSummary"
  >
>;

function normalizeStepFields(f: {
  objective?: string;
  acceptanceCheck?: string;
  fileHints?: string[];
}) {
  const out: {
    objective?: string;
    acceptanceCheck?: string;
    fileHints?: string[];
  } = {};
  if (f.objective !== undefined) out.objective = f.objective.trim();
  if (f.acceptanceCheck !== undefined)
    out.acceptanceCheck = f.acceptanceCheck.trim();
  if (f.fileHints !== undefined)
    out.fileHints = f.fileHints
      .map((x) => x.trim())
      .filter((x) => x.length > 0);
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
      Pick<
        RoadmapItem,
        "title" | "description" | "priority" | "status" | "notes"
      >
    >,
  ): Promise<RoadmapItem> {
    // Write path, so it must use the quarantining read: a corrupt file has to
    // leave `vibe roadmap update` and `archive` able to make progress, not dead
    // until the owner hand-repairs the JSON.
    const existing = await this.store.getRoadmapItemForWrite(id);
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
    const runMode: RunMode = input.runMode ?? "plain";
    const task: Task = {
      id: makeId(input.title, "task"),
      runMode,
      supervised: {
        state: "idle",
        halt: null,
        invariants: [],
        pendingRevision: null,
      },
      // A supervised task is bounded out of the box: seed the default step ceiling
      // so a runaway actually halts (checkSupervisedStopConditions never trips
      // when every axis is null). config.supervised is the project-level override
      // layer the launch path merges in wherever this value is still null. A plain
      // task carries no envelope.
      runOptions: {
        budget:
          runMode === "supervised"
            ? { maxSpendUsd: null, maxSteps: SUPERVISED_DEFAULT_MAX_STEPS }
            : { maxSpendUsd: null, maxSteps: null },
      },
      roadmapItemId: input.roadmapItemId ?? null,
      title: input.title.trim(),
      description: input.description?.trim() ?? "",
      acceptanceCriteria: input.acceptanceCriteria?.trim() ?? "",
      specRef: input.specRef ?? null,
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
      // Unstaged: a new card has not been filed anywhere yet.
      stage: null,
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
    return this.mutate(id, (t) => ({
      ...t,
      status,
      updatedAt: nowIso(),
      lastEventAt: nowIso(),
    }));
  }

  /** Saga conductor: record a clean halt - set sagaState to "halted"
   *  and stamp the halt record. The halted step's checklist status is left for
   *  the conductor to manage (it resets it to "pending" so a resume re-attempts
   *  the step from the clean branch tip). */
  async recordSagaHalt(id: string, halt: SupervisedHalt): Promise<Task> {
    return this.mutate(id, (t) => ({
      ...t,
      supervised: { ...t.supervised, state: "halted", halt },
      updatedAt: nowIso(),
      lastEventAt: nowIso(),
    }));
  }

  /** Saga conductor: set the saga lifecycle state (sequencing on
   *  launch, done on clean completion). Moving to "sequencing" (a resume) or
   *  "done" (clean completion) also clears any prior `sagaHalt` - otherwise a
   *  recovered saga would end with a stale halt record contradicting its state.
   *  ("halted" is set via recordSagaHalt, which owns writing the halt.) */
  async setSagaState(
    id: string,
    state: Task["supervised"]["state"],
  ): Promise<Task> {
    const clearsHalt = state === "sequencing" || state === "done";
    return this.mutate(id, (t) => ({
      ...t,
      supervised: {
        ...t.supervised,
        state,
        ...(clearsHalt ? { halt: null } : {}),
      },
      updatedAt: nowIso(),
      lastEventAt: nowIso(),
    }));
  }

  /** Saga conductor: append new cross-cutting invariants the
   *  supervisor recorded to the durable, non-folding ledger. Append-only +
   *  redacted + deduped + bounded via `appendInvariants` (the secret-shaped text
   *  is scrubbed before it lands on disk). A no-op write when nothing new
   *  survives dedup, so a chatty supervisor doesn't churn the task file. */
  async appendSagaInvariants(id: string, incoming: string[]): Promise<Task> {
    return this.mutate(id, (t) => {
      const merged = appendInvariants(t.supervised.invariants, incoming);
      if (merged.length === t.supervised.invariants.length) return t; // nothing new
      return {
        ...t,
        supervised: { ...t.supervised, invariants: merged },
        updatedAt: nowIso(),
        lastEventAt: nowIso(),
      };
    });
  }

  /** Saga conductor (Enhance): persist the revised pending-plan overlay
   *  in ONE atomic write. The conductor's Enhance pass mutates only the
   *  in-memory pending steps and records the result HERE - never into
   *  `checklist` - so the resume guard (which compares `checklist` ids) is left
   *  untouched. Pass `null` to clear it. */
  async setSagaPendingRevision(
    id: string,
    revision: SupervisedPendingRevision | null,
  ): Promise<Task> {
    return this.mutate(id, (t) => ({
      ...t,
      supervised: { ...t.supervised, pendingRevision: revision },
      updatedAt: nowIso(),
      lastEventAt: nowIso(),
    }));
  }

  /** Saga conductor (Enhance): on clean saga completion, fold the
   *  pending overlay back into `checklist` and clear it, in ONE write. Refined
   *  fields are patched onto the matching items by id; a still-pending item the
   *  overlay dropped (a conductor `remove`, never executed) is removed from the
   *  checklist. Done items and ids are otherwise preserved. A no-op when no
   *  overlay is set. */
  async reconcileSagaPendingRevision(id: string): Promise<Task> {
    return this.mutate(id, (t) => {
      const overlay = t.supervised.pendingRevision;
      if (!overlay) return t;
      const byId = new Map(overlay.pending.map((p) => [p.id, p]));
      const overlayIds = new Set(overlay.pending.map((p) => p.id));
      const checklist = t.checklist
        // Drop pending items the overlay removed (not done, not in the overlay).
        .filter((c) => c.status === "done" || overlayIds.has(c.id))
        // Patch refined fields from the overlay onto the matching items.
        .map((c) => {
          const p = byId.get(c.id);
          return p
            ? {
                ...c,
                text: p.text,
                objective: p.objective,
                acceptanceCheck: p.acceptanceCheck,
                fileHints: p.fileHints,
                updatedAt: nowIso(),
              }
            : c;
        });
      return {
        ...t,
        checklist,
        supervised: { ...t.supervised, pendingRevision: null },
        updatedAt: nowIso(),
        lastEventAt: nowIso(),
      };
    });
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
    return this.mutate(id, async (t) => {
      // Dependency edits must keep the roadmap a DAG: a cycle corrupts the
      // ready/blocked logic (a card could block itself). Validate against the
      // full task set BEFORE persisting - the route + accept both reach here, so
      // this is the single guard. (Edges toward an acyclic target are always a
      // subgraph of it, so accept's incremental second pass never trips this.)
      if (patch.dependencies !== undefined) {
        const deps = [...new Set(patch.dependencies)];
        if (deps.includes(id)) {
          throw new RoadmapServiceError(
            `A task cannot depend on itself ("${id}").`,
          );
        }
        const all = await this.store.listTasks();
        const known = new Set(all.map((x) => x.id));
        const missing = deps.find((d) => !known.has(d));
        if (missing) {
          throw new RoadmapServiceError(`Unknown dependency "${missing}".`);
        }
        const proposed = all.map((x) =>
          x.id === id ? { ...x, dependencies: deps } : x,
        );
        const cycle = findFirstCycle(buildDependencyGraph(proposed));
        if (cycle.cyclic) {
          throw new RoadmapServiceError(
            `That dependency would create a cycle: ${cycle.cycle.join(" -> ")}.`,
          );
        }
      }
      return {
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
    });
  }

  async setTaskRun(input: {
    taskId: string;
    runId: string;
    branchName?: string | null;
    worktreePath?: string | null;
    status?: TaskStatus;
  }): Promise<Task> {
    return this.mutate(input.taskId, (t) => ({
      ...t,
      currentRunId: input.runId,
      runIds: [...new Set([...t.runIds, input.runId])],
      branchName: input.branchName ?? t.branchName,
      worktreePath: input.worktreePath ?? t.worktreePath,
      status: input.status ?? t.status,
      updatedAt: nowIso(),
      lastEventAt: nowIso(),
    }));
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
    const inFlight: TaskStatus[] = [
      "queued",
      "running",
      "waiting_for_approval",
    ];
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
          await this.mutateChecklist(origin.id, (items) => {
            const at = items.findIndex((c) => c.id === t.derivedFrom!.itemId);
            if (at < 0) return items;
            const checklist = [...items];
            checklist[at] = {
              ...checklist[at]!,
              promotedTaskId: null,
              updatedAt: nowIso(),
            };
            return checklist;
          });
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

  async clearTaskCurrentRun(
    taskId: string,
    finalStatus: TaskStatus,
  ): Promise<Task> {
    return this.mutate(taskId, (t) => ({
      ...t,
      currentRunId: null,
      status: finalStatus,
      updatedAt: nowIso(),
      lastEventAt: nowIso(),
    }));
  }

  /** Replace a task's context sources. */
  async setContextSources(
    taskId: string,
    sources: import("../core/context/context-source-schema.js").ContextSource[],
  ): Promise<Task> {
    return this.mutate(taskId, (t) => ({
      ...t,
      contextSources: sources,
      updatedAt: nowIso(),
      lastEventAt: nowIso(),
    }));
  }

  /** Archive or un-archive a task (board overlay; orthogonal to run status). */
  async setArchived(taskId: string, archived: boolean): Promise<Task> {
    return this.mutate(taskId, (t) => {
      // Checked inside the lock: a run linking itself between an unlocked read
      // and the write is exactly the race this guard exists to lose.
      if (archived && t.currentRunId) {
        throw new RoadmapServiceError(
          `Task "${taskId}" is linked to active run ${t.currentRunId}; abort the run before archiving.`,
        );
      }
      return { ...t, archived, updatedAt: nowIso(), lastEventAt: nowIso() };
    });
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

  async resolveComment(
    taskId: string,
    commentId: string,
  ): Promise<Comment | null> {
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

  /**
   * Read-modify-write a task under its own file lock.
   *
   * EVERY method that reads a task, derives a new one, and writes it back MUST
   * go through here. Two concurrent runs touching the same task - a status
   * flip while a checklist item completes, a counter patch while a run links -
   * otherwise both read the same base and the second write silently discards
   * the first. The lock is per-task-file, so unrelated tasks never contend.
   *
   * Return the task you were handed to signal "no change" and skip the write.
   */
  private async mutate(
    taskId: string,
    transform: (current: Task) => Task | Promise<Task>,
  ): Promise<Task> {
    const next = await this.store.mutateTask(taskId, transform);
    if (!next) throw new RoadmapServiceError(`Task "${taskId}" not found.`);
    return next;
  }

  private async requireTask(taskId: string): Promise<Task> {
    const t = await this.store.getTask(taskId);
    if (!t) throw new RoadmapServiceError(`Task "${taskId}" not found.`);
    return t;
  }

  /**
   * Apply a checklist transform under the task's lock.
   *
   * The checklist is the one part of a task written by two parties at once: a
   * live run's band marks items done with their commit sha, while the board,
   * the CLI and (now) the supervisor add and edit items. Read-modify-write
   * without a lock loses one of them, and the band's write is wrapped in a catch
   * so the loss is silent - an item goes from done-with-a-sha back to pending
   * and nothing says so.
   *
   * The transform receives the CURRENT checklist read inside the lock, not the
   * caller's copy, which is the whole point: a caller that read the task a
   * moment ago no longer has authority over what it contains.
   */
  private async mutateChecklist(
    taskId: string,
    transform: (current: ChecklistItem[]) => ChecklistItem[],
    opts: { clearSagaPendingRevision?: boolean } = {},
  ): Promise<Task> {
    const next = await this.store.mutateTask(taskId, (current) =>
      this.nextChecklistTask(current, transform(current.checklist), opts),
    );
    if (!next) throw new RoadmapServiceError(`Task "${taskId}" not found.`);
    return next;
  }

  private nextChecklistTask(
    task: Task,
    checklist: ChecklistItem[],
    opts: { clearSagaPendingRevision?: boolean } = {},
  ): Task {
    return {
      ...task,
      checklist,
      // A STRUCTURAL checklist edit (add / remove / reorder /
      // a step's text or fields) invalidates any conductor pending overlay - it
      // was computed against the pre-edit plan. Clearing it here is the root-
      // cause guard against a stale overlay silently dropping an owner-added
      // step on the next sequence. Status-only updates (the run's per-step
      // commit) DON'T pass this flag, so the overlay survives a live run.
      ...(opts.clearSagaPendingRevision
        ? { supervised: { ...task.supervised, pendingRevision: null } }
        : {}),
      updatedAt: nowIso(),
      lastEventAt: nowIso(),
    };
  }

  async addChecklistItem(
    taskId: string,
    text: string,
    fields: {
      objective?: string;
      acceptanceCheck?: string;
      fileHints?: string[];
      // Who authored this step. Defaults to "owner" (a human
      // add via the board/CLI); the manual `vibe saga enhance --apply` ADD path
      // passes "conductor" to mark an AI-proposed (owner-approved-once) step.
      provenance?: Provenance;
    } = {},
  ): Promise<{ task: Task; item: ChecklistItem }> {
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
      runId: null,
      outcomeSummary: "",
      objective: normalized.objective ?? "",
      acceptanceCheck: normalized.acceptanceCheck ?? "",
      fileHints: normalized.fileHints ?? [],
      provenance: fields.provenance ?? "owner",
    };
    // Appends to whatever the checklist is INSIDE the lock, not to a copy read
    // before it: a run committing an item concurrently must not be undone.
    const task = await this.mutateChecklist(
      taskId,
      (current) => [...current, item],
      {
        clearSagaPendingRevision: true,
      },
    );
    return { task, item };
  }

  async updateChecklistItem(
    taskId: string,
    itemId: string,
    patch: ChecklistItemPatch,
  ): Promise<{ task: Task; item: ChecklistItem }> {
    if (patch.text !== undefined && !patch.text.trim()) {
      throw new RoadmapServiceError("Checklist item text cannot be empty.");
    }
    // Only a STRUCTURAL edit (text/objective/acceptanceCheck/fileHints)
    // invalidates a conductor pending overlay. A status-only update - the run's
    // own per-step commit - must NOT clear it, or the overlay would be wiped mid
    // run on the very next step.
    const structural =
      patch.text !== undefined ||
      patch.objective !== undefined ||
      patch.acceptanceCheck !== undefined ||
      patch.fileHints !== undefined;
    let item: ChecklistItem | null = null;
    // Both the existence check and the merge run against the checklist read
    // inside the lock, so this cannot resurrect an item another writer just
    // removed or clobber a status another writer just set.
    const task = await this.mutateChecklist(
      taskId,
      (current) => {
        const idx = current.findIndex((c) => c.id === itemId);
        if (idx < 0) {
          throw new RoadmapServiceError(
            `Checklist item "${itemId}" not found on task "${taskId}".`,
          );
        }
        const prev = current[idx]!;
        item = {
          ...prev,
          ...patch,
          ...normalizeStepFields(patch),
          text: patch.text !== undefined ? patch.text.trim() : prev.text,
          updatedAt: nowIso(),
        };
        const checklist = [...current];
        checklist[idx] = item;
        return checklist;
      },
      { clearSagaPendingRevision: structural },
    );
    return { task, item: item! };
  }

  async setChecklistItemStatus(
    taskId: string,
    itemId: string,
    status: ChecklistItemStatus,
  ): Promise<{ task: Task; item: ChecklistItem }> {
    return this.updateChecklistItem(taskId, itemId, { status });
  }

  async removeChecklistItem(taskId: string, itemId: string): Promise<Task> {
    return this.mutateChecklist(
      taskId,
      (current) => {
        const checklist = current.filter((c) => c.id !== itemId);
        if (checklist.length === current.length) {
          throw new RoadmapServiceError(
            `Checklist item "${itemId}" not found on task "${taskId}".`,
          );
        }
        return checklist;
      },
      { clearSagaPendingRevision: true },
    );
  }

  /** Reorder the checklist to `orderedIds`, which must be a permutation of the
   *  existing item ids (same set, no additions/removals). */
  async reorderChecklist(taskId: string, orderedIds: string[]): Promise<Task> {
    return this.mutateChecklist(
      taskId,
      (items) => {
        // The permutation check runs against the checklist as it is inside the
        // lock. Validated against a stale copy, a reorder racing an add would
        // drop the new item on the floor while reporting success.
        const existing = new Set(items.map((c) => c.id));
        const wanted = new Set(orderedIds);
        if (
          orderedIds.length !== items.length ||
          wanted.size !== orderedIds.length ||
          [...existing].some((id) => !wanted.has(id))
        ) {
          throw new RoadmapServiceError(
            "Reorder must be a permutation of the existing checklist item ids.",
          );
        }
        const byId = new Map(items.map((c) => [c.id, c]));
        return orderedIds.map((id) => byId.get(id)!);
      },
      { clearSagaPendingRevision: true },
    );
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
    // Stamp the forward-pointer on the item. The re-read happens inside the
    // lock, which also covers addTask above having touched the task.
    const task = await this.mutateChecklist(taskId, (items) => {
      const at = items.findIndex((c) => c.id === itemId);
      if (at < 0) return items;
      const checklist = [...items];
      checklist[at] = {
        ...checklist[at]!,
        promotedTaskId: card.id,
        updatedAt: nowIso(),
      };
      return checklist;
    });
    return { task, card };
  }

  // ─── needs-testing advisory ───────────────────────────────────────────────

  /** Flag a task for human testing (non-blocking advisory from a run). */
  async flagNeedsTesting(taskId: string, reason: string | null): Promise<Task> {
    return this.mutate(taskId, (t) => ({
      ...t,
      needsTesting: true,
      needsTestingReason: reason,
      updatedAt: nowIso(),
      lastEventAt: nowIso(),
    }));
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
    return this.mutate(taskId, (t) => ({
      ...t,
      needsTesting: false,
      needsTestingReason: null,
      status: verdict === "pass" ? "done" : "ready",
      updatedAt: nowIso(),
      lastEventAt: nowIso(),
    }));
  }

  private async patchTaskCounters(
    taskId: string,
    comments: Comment[],
  ): Promise<void> {
    const open = comments.filter((c) => !c.resolved).length;
    await this.store.mutateTask(taskId, (t) => ({
      ...t,
      commentsCount: open,
      updatedAt: nowIso(),
      lastEventAt: nowIso(),
    }));
  }

  /**
   * File a card under a workflow stage, or clear it with null.
   *
   * Re-filing is deliberately INERT: it moves a label and nothing else. No run
   * starts, no status changes, nothing is queued. That is the whole reason the
   * stage axis exists - a board whose columns were derived from run status
   * could not offer a safe drag, because every honest move was either a lie or
   * an execution.
   *
   * The stage is not validated against `board.stages`. A renamed or removed
   * stage would otherwise orphan every card filed under it, and a card holding
   * a label its board no longer lists is recoverable - one that was refused or
   * silently cleared is not.
   */
  async setTaskStage(taskId: string, stage: string | null): Promise<Task | null> {
    const next = stage?.trim() ? stage.trim() : null;
    return await this.store.mutateTask(taskId, (t) =>
      t.stage === next
        ? t // unchanged - mutateTask skips the write, so no mtime churn
        : { ...t, stage: next, updatedAt: nowIso(), lastEventAt: nowIso() },
    );
  }
}

// ─── derived micro-step helpers (separate import path) ───────────────────────

export type { MicroStep };

/** Whether a triage-authored roadmap may seed a card.
 *
 *  Only an empty checklist qualifies. A card the owner has already broken down
 *  is never touched: a model's reading of a one-line brief does not get to
 *  rewrite a plan a human wrote, and "the card looked stale" is not a judgment
 *  it is in a position to make. Extracted so the rule is testable on its own -
 *  it guards a write to the user's own planning data. */
export function maySeedChecklist(
  card: { checklist: unknown[] } | null,
  steps: unknown[] | undefined,
): boolean {
  if (!card || !steps || steps.length === 0) return false;
  return card.checklist.length === 0;
}
