import { z } from "zod";
import { contextSourceSchema } from "../core/context-source-schema.js";

// ─── ids ──────────────────────────────────────────────────────────────────────

// Path-safe ids: letters, digits, underscore, dash, dot. No slashes, no '..'.
export const safeIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, "ids must be path-safe (letters/digits/._-)")
  .refine((v) => !v.includes(".."), "ids cannot contain ..");

export type SafeId = z.infer<typeof safeIdSchema>;

// ─── enums ────────────────────────────────────────────────────────────────────

export const roadmapItemStatusSchema = z.enum([
  "idea",
  "planned",
  "active",
  "blocked",
  "done",
  "archived",
]);
export type RoadmapItemStatus = z.infer<typeof roadmapItemStatusSchema>;

export const taskStatusSchema = z.enum([
  "backlog",
  "ready",
  "queued",
  "running",
  "waiting_for_approval",
  "blocked",
  "review",
  "done",
  "failed",
  "cancelled",
]);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

export const prioritySchema = z.enum(["low", "medium", "high"]);
export type Priority = z.infer<typeof prioritySchema>;


export const microStepStageSchema = z.enum([
  "planning",
  "architecting",
  "executing",
  "validating",
  "reviewing",
  "fixing",
  "verifying",
]);
export type MicroStepStage = z.infer<typeof microStepStageSchema>;

export const microStepStatusSchema = z.enum([
  "pending",
  "running",
  "passed",
  "failed",
  "blocked",
  "skipped",
]);
export type MicroStepStatus = z.infer<typeof microStepStatusSchema>;

// Checklist item lifecycle. `pending` → `in_progress` → `done`; `blocked`
// when an item can't proceed. The Phase-3 pick-up loop drives these
// transitions per item; today they're set by hand (or by "enhance").
export const checklistItemStatusSchema = z.enum([
  "pending",
  "in_progress",
  "done",
  "blocked",
]);
export type ChecklistItemStatus = z.infer<typeof checklistItemStatusSchema>;

export const commentTargetSchema = z.enum([
  "task",
  "step",
  "artifact",
  "file",
  "diff",
  "approval",
  "run",
]);
export type CommentTarget = z.infer<typeof commentTargetSchema>;

// ─── records ──────────────────────────────────────────────────────────────────

export const roadmapItemSchema = z.object({
  id: safeIdSchema,
  title: z.string().min(1),
  description: z.string().default(""),
  status: roadmapItemStatusSchema.default("idea"),
  priority: prioritySchema.default("medium"),
  createdAt: z.string(),
  updatedAt: z.string(),
  linkedTaskIds: z.array(safeIdSchema).default([]),
  notes: z.string().default(""),
});
export type RoadmapItem = z.infer<typeof roadmapItemSchema>;

export const roadmapFileSchema = z.object({
  items: z.array(roadmapItemSchema).default([]),
});
export type RoadmapFile = z.infer<typeof roadmapFileSchema>;

export const microStepSchema = z.object({
  id: z.string().min(1),
  taskId: safeIdSchema,
  stage: microStepStageSchema,
  status: microStepStatusSchema,
  roleId: z.string().nullable().default(null),
  startedAt: z.string().nullable().default(null),
  endedAt: z.string().nullable().default(null),
  artifactPaths: z.array(z.string()).default([]),
  diffSnapshotPath: z.string().nullable().default(null),
  validationResultPath: z.string().nullable().default(null),
  approvalIds: z.array(z.string()).default([]),
  notes: z.array(z.string()).default([]),
});
export type MicroStep = z.infer<typeof microStepSchema>;

// A single checklist entry ("item"/todo) that lives *inside* a card. The
// ordered `checklist` array on a Task is the meso-altitude breakdown (see
// docs/design/roadmap-and-sequencing.md §1). Kept on the task on purpose so
// context isn't scattered across many cards. `commitSha`/`promotedTaskId` are
// forward-compat hooks for the pick-up loop (per-item commits) and
// promote-item-to-card; null until those land.
export const checklistItemSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  status: checklistItemStatusSchema.default("pending"),
  createdAt: z.string(),
  updatedAt: z.string(),
  commitSha: z.string().nullable().default(null),
  promotedTaskId: safeIdSchema.nullable().default(null),
  // Saga step fields (Phase 1): a checklist item IS a Saga "step". Defaulted so
  // pre-Saga tasks upgrade losslessly on read (getTask never sees a throw).
  objective: z.string().default(""),
  acceptanceCheck: z.string().default(""),
  fileHints: z.array(z.string()).default([]),
  // Saga step fields (Phase 2): the run that executed this step and a curated
  // one-line outcome recorded after it ran. Defaulted for lossless upgrade.
  runId: z.string().nullable().default(null),
  outcomeSummary: z.string().default(""),
});
export type ChecklistItem = z.infer<typeof checklistItemSchema>;
export type Step = ChecklistItem;

export const taskKindSchema = z.enum(["single", "saga"]);
export type TaskKind = z.infer<typeof taskKindSchema>;

// ─── Saga execution state (Phase 2 Conductor) ───────────────────────────────
// A saga is one orchestrator run in checklist mode. These track its sequencing
// lifecycle and a clean-halt record.
export const sagaStateSchema = z.enum([
  "idle",
  "sequencing",
  "paused",
  "halted",
  "done",
]);
export type SagaState = z.infer<typeof sagaStateSchema>;

// The single home for halt state. A halted step's checklist status stays
// `pending` (NOT `blocked`) so resume re-attempts it from a clean branch tip -
// the failed attempt is reset and leaves no commit.
export const sagaHaltSchema = z.object({
  reason: z.string(),
  atStepId: z.string().nullable(),
  summary: z.string(),
});
export type SagaHalt = z.infer<typeof sagaHaltSchema>;

// Per-saga budget envelope. `maxSpendUsd` is a BETWEEN-STEPS checkpoint, not a
// mid-step wall (a single step is bounded only by the global daily spend cap).
// `maxSteps` caps total steps. Null = no limit on that axis.
export const sagaBudgetSchema = z.object({
  maxSpendUsd: z.number().nonnegative().nullable().default(null),
  maxSteps: z.number().int().positive().nullable().default(null),
});
export type SagaBudget = z.infer<typeof sagaBudgetSchema>;

export const taskSchema = z.object({
  id: safeIdSchema,
  kind: taskKindSchema.default("single"),
  roadmapItemId: safeIdSchema.nullable().default(null),
  title: z.string().min(1),
  description: z.string().default(""),
  // Spec-up phase (M4): prose acceptance criteria ("done when…") and a rough size
  // estimate (free label, e.g. "S" / "M" / "L" / "2d"). Authored by the roadmap
  // synthesis and editable on the card. The authoring contract is "may be
  // omitted"; "" is the empty state (a card without criteria yet), not a
  // back-compat backfill.
  acceptanceCriteria: z.string().default(""),
  // Machine-checkable acceptance (P5): shell commands that must PASS for the card
  // to be "done" - run as an extra validation pass on the card's run, feeding the
  // same gate as `commands.validate`. USER-AUTHORED (not LLM-generated), so it
  // carries the same trust as the project's validate commands. Empty = LLM-judged
  // acceptanceCriteria only.
  acceptanceCommands: z.array(z.string().min(1).max(2000)).max(20).default([]),
  est: z.string().default(""),
  status: taskStatusSchema.default("backlog"),
  priority: prioritySchema.default("medium"),
  dependencies: z.array(safeIdSchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
  assignedRoles: z.array(z.string()).default([]),
  requiredSkills: z.array(z.string()).default([]),
  validationProfile: z.string().nullable().default(null),
  branchName: z.string().nullable().default(null),
  worktreePath: z.string().nullable().default(null),
  runIds: z.array(z.string()).default([]),
  currentRunId: z.string().nullable().default(null),
  // Best-effort hints used by the conflict detector before any run has produced
  // a real diff. Plain glob/path strings; no semantics enforced.
  touchedFiles: z.array(z.string()).default([]),
  riskLevel: prioritySchema.default("medium"),
  commentsCount: z.number().int().min(0).default(0),
  lastEventAt: z.string().nullable().default(null),
  // ─── Per-task profile override / read-only ──────────────────
  // profileOverride pins a run-wide Profile for every seated step. readOnly
  // forces every role to the readOnly permission profile and short-circuits
  // the executor / fix loop - investigation only.
  profileOverride: z.string().nullable().default(null),
  readOnly: z.boolean().default(false),
  // Ordered breakdown that lives inside the card (Phase 3 "Checklist"). The
  // pick-up loop iterates this in order; an instant task is the degenerate
  // synthetic-1-item case. Defaults to empty for backward-compat with tasks
  // written before this field existed.
  checklist: z.array(checklistItemSchema).default([]),
  // ─── Saga execution (Phase 2 Conductor) ─────────────────────────────
  // Lifecycle of a kind:"saga" task's sequenced run. `sagaHalt` is the only
  // home for halt state; a halted step's checklist status stays `pending` so
  // resume re-attempts from a clean branch tip. `sagaBudget` is a per-task
  // override of the config.saga defaults.
  sagaState: sagaStateSchema.default("idle"),
  sagaHalt: sagaHaltSchema.nullable().default(null),
  sagaBudget: sagaBudgetSchema.default({}),
  // Non-blocking advisory: a run finished but a human should eyeball something
  // the model can't perceive (visual/UX/3D). Set from a HUMAN_REVIEW: ADVISORY
  // marker; cleared by a human verdict (pass → done, fail → reopen). (Phase 3)
  needsTesting: z.boolean().default(false),
  needsTestingReason: z.string().nullable().default(null),
  // "Derived from" back-pointer (Phase 3 promote-item-to-card): set when this
  // card was promoted out of another card's checklist item. A *relation*, not a
  // reparent - the origin item keeps its own status and points here via
  // `promotedTaskId`. null for normal cards.
  derivedFrom: z
    .object({ taskId: safeIdSchema, itemId: z.string().min(1) })
    .nullable()
    .default(null),
  // Filed-away flag (Phase 3 board): an archived card sits in the board's
  // Archived column regardless of its run status. Orthogonal to status so a
  // done OR abandoned card can be archived without losing its real state.
  archived: z.boolean().default(false),
  // Context sources (Phase 4): files/URLs injected into every agent's prompt
  // for runs launched from this card (inherited when the run doesn't override).
  contextSources: z.array(contextSourceSchema).default([]),
});
export type Task = z.infer<typeof taskSchema>;

export const commentSchema = z.object({
  id: z.string().min(1),
  taskId: safeIdSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  author: z.string().default("local-user"),
  body: z.string().min(1),
  resolved: z.boolean().default(false),
  resolvedAt: z.string().nullable().default(null),
  target: commentTargetSchema.default("task"),
  targetRef: z.string().nullable().default(null),
});
export type Comment = z.infer<typeof commentSchema>;

export const commentsFileSchema = z.array(commentSchema);

export const TASK_STATUSES_BOARD: readonly TaskStatus[] = [
  "backlog",
  "ready",
  "queued",
  "running",
  "waiting_for_approval",
  "review",
  "blocked",
  "done",
  "failed",
  "cancelled",
] as const;

// ── Coarse board columns (Phase 3) ──────────────────────────────────────────
// The planning board shows a *coarse* human kanban - not the orchestrator's
// fine run stages (those live in Mission Control). A card's column is derived
// from its status plus the archived / needs-testing overlays. Auto-nudged: as
// the run status changes (→ running, → done) and the advisory flag flips, the
// card moves columns on its own.

export type CoarseColumnId =
  | "planned"
  | "in_progress"
  | "needs_testing"
  | "completed"
  | "archived";

export const COARSE_COLUMNS: { id: CoarseColumnId; label: string }[] = [
  { id: "planned", label: "Planned" },
  { id: "in_progress", label: "In-progress" },
  { id: "needs_testing", label: "Needs testing" },
  { id: "completed", label: "Completed" },
  { id: "archived", label: "Archived" },
];

/**
 * Map a task to its coarse board column. Overlays win over status: an archived
 * card is always Archived; a needs-testing card is Needs testing (even when its
 * run reached done/merge_ready). Otherwise it's derived from the run status.
 */
export function coarseColumn(task: {
  status: TaskStatus;
  needsTesting?: boolean;
  archived?: boolean;
}): CoarseColumnId {
  if (task.archived) return "archived";
  if (task.needsTesting) return "needs_testing";
  switch (task.status) {
    case "backlog":
    case "ready":
      return "planned";
    case "done":
      return "completed";
    case "cancelled":
      return "archived";
    default:
      // queued / running / waiting_for_approval / review / blocked / failed
      return "in_progress";
  }
}

export const ROADMAP_COLUMNS: { id: string; label: string; statuses: TaskStatus[] }[] = [
  { id: "ideas", label: "Ideas", statuses: ["backlog"] },
  { id: "ready", label: "Ready", statuses: ["ready"] },
  { id: "queued", label: "Queued", statuses: ["queued"] },
  { id: "running", label: "Running", statuses: ["running"] },
  { id: "waiting", label: "Waiting Approval", statuses: ["waiting_for_approval"] },
  { id: "review", label: "Review", statuses: ["review"] },
  { id: "blocked", label: "Blocked", statuses: ["blocked", "failed"] },
  { id: "done", label: "Done", statuses: ["done"] },
];
