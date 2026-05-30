import { z } from "zod";

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

/**
 * "Effort" is a coarse task-difficulty hint (low/medium/high) used for
 * planning and heuristics. It no longer maps to a provider — runtime strength
 * is chosen by a Profile now (see `profiles/profile-schema.ts`).
 */
export const effortSchema = z.enum(["low", "medium", "high"]);
export type Effort = z.infer<typeof effortSchema>;

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
});
export type ChecklistItem = z.infer<typeof checklistItemSchema>;

export const taskSchema = z.object({
  id: safeIdSchema,
  roadmapItemId: safeIdSchema.nullable().default(null),
  title: z.string().min(1),
  description: z.string().default(""),
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
  // ─── Per-task effort / profile override / read-only ──────────────────
  // effort is a difficulty hint (it no longer maps to a provider — Profiles
  // own runtime now). profileOverride pins a run-wide Profile for every seated
  // step. readOnly forces every role to the readOnly permission profile and
  // short-circuits the executor / fix loop — investigation only.
  effort: effortSchema.nullable().default(null),
  profileOverride: z.string().nullable().default(null),
  readOnly: z.boolean().default(false),
  // Ordered breakdown that lives inside the card (Phase 3 "Checklist"). The
  // pick-up loop iterates this in order; an instant task is the degenerate
  // synthetic-1-item case. Defaults to empty for backward-compat with tasks
  // written before this field existed.
  checklist: z.array(checklistItemSchema).default([]),
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
