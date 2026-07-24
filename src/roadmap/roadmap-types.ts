import { z } from "zod";
import { contextSourceSchema } from "../core/context/context-source-schema.js";

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

// Who authored a saga step. Owner = a human; conductor = the autonomous Enhance
// pass.
export const provenanceSchema = z.enum(["owner", "conductor"]);
export type Provenance = z.infer<typeof provenanceSchema>;

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
  // Saga step fields: a checklist item IS a Saga "step". Defaulted so
  // pre-Saga tasks upgrade losslessly on read (getTask never sees a throw).
  objective: z.string().default(""),
  acceptanceCheck: z.string().default(""),
  fileHints: z.array(z.string()).default([]),
  // Saga step run link: the run that executed this step and a curated
  // one-line outcome recorded after it ran. Defaulted for lossless upgrade.
  runId: z.string().nullable().default(null),
  outcomeSummary: z.string().default(""),
  // Saga step provenance: who authored the step. "owner" for
  // anything a human added (the default, so legacy steps upgrade losslessly);
  // "conductor" only for a step the autonomous Enhance pass added. Drives the
  // escalate-on-destructive authority policy deterministically - the conductor
  // may not silently drop an `owner` step. (docs/design/saga-conductor-enhance.md)
  provenance: provenanceSchema.default("owner"),
});
export type ChecklistItem = z.infer<typeof checklistItemSchema>;
export type Step = ChecklistItem;

// How a task runs. "plain" = the default flow, one holistic pass. "supervised" =
// the Conductor bundle (per-step review, fresh context + curated packet, the
// between-steps supervisor + invariants + Enhance, per-task budget + run lock +
// clean-halt). This replaced the old `kind: "single" | "saga"` - a saga is no
// longer a separate KIND of task, just a Task run in "supervised" mode.
export const runModeSchema = z.enum(["plain", "supervised"]);
export type RunMode = z.infer<typeof runModeSchema>;

// ─── Supervised run state (the Conductor) ───────────────────────────────────
// The lifecycle of a task's supervised run. Grouped into task.supervised{}.
export const supervisedStateSchema = z.enum([
  "idle",
  "sequencing",
  "paused",
  "halted",
  "done",
]);
export type SupervisedState = z.infer<typeof supervisedStateSchema>;

// The single home for halt state. A halted step's checklist status stays
// `pending` (NOT `blocked`) so resume re-attempts it from a clean branch tip -
// the failed attempt is reset and leaves no commit.
export const supervisedHaltSchema = z.object({
  reason: z.string(),
  atStepId: z.string().nullable(),
  summary: z.string(),
});
export type SupervisedHalt = z.infer<typeof supervisedHaltSchema>;

// Default step ceiling a freshly created supervised task inherits when no project
// override narrows it (config.supervised.maxSteps). Lives here (the lightweight
// types module) so RoadmapService can seed it without importing the heavy config
// schema; the config schema imports it back so both sides agree on the number.
export const SUPERVISED_DEFAULT_MAX_STEPS = 20;

// Per-task run budget envelope. `maxSpendUsd` is a BETWEEN-STEPS checkpoint, not a
// mid-step wall (a single step is bounded only by the global daily spend cap).
// `maxSteps` caps total steps. Null = no limit on that axis.
export const runBudgetSchema = z.object({
  maxSpendUsd: z.number().nonnegative().nullable().default(null),
  maxSteps: z.number().int().positive().nullable().default(null),
});
export type RunBudget = z.infer<typeof runBudgetSchema>;

// The supervised-scoped pending-plan overlay. When the
// Conductor's Enhance pass refines/reorders/removes the *pending* steps mid-run,
// the revised pending plan is persisted HERE in one atomic write - never into
// `checklist`, so the resume guard (which compares `checklist` ids) is left
// untouched. On resume the overlay is applied by id onto the still-pending slice;
// on clean completion it is reconciled into `checklist` and cleared. `pending`
// carries only EXISTING ids (autonomous add is excluded by design), so the
// merge is a pure by-id reconciliation.
export const supervisedPendingRevisionSchema = z.object({
  // The step index (0-based, into the run's pending iteration) the revision was
  // made after - for display + debugging, not control flow.
  revisedAtStepIndex: z.number().int().min(0),
  // The revised pending steps, in order. Full ChecklistItems (status "pending").
  pending: z.array(checklistItemSchema),
});
export type SupervisedPendingRevision = z.infer<
  typeof supervisedPendingRevisionSchema
>;

// The supervised-run lifecycle, grouped into one object on the task (was four
// flat `saga*` fields). Always present + defaulted, so a plain task simply has
// `state: "idle"` forever - no null-guards at the read sites.
export const supervisedRunSchema = z.object({
  state: supervisedStateSchema.default("idle"),
  halt: supervisedHaltSchema.nullable().default(null),
  invariants: z.array(z.string()).default([]),
  pendingRevision: supervisedPendingRevisionSchema.nullable().default(null),
});
export type SupervisedRun = z.infer<typeof supervisedRunSchema>;

// Per-task run options (the "advanced knobs" that override project defaults).
// Today: the run budget (was `task.sagaBudget`). Future: per-task supervisor /
// enhance on-off toggles.
export const runOptionsSchema = z.object({
  // .prefault(): {} needs runBudgetSchema's own field defaults to fill in.
  budget: runBudgetSchema.prefault({}),
});
export type RunOptions = z.infer<typeof runOptionsSchema>;

export const taskSchema = z.object({
  id: safeIdSchema,
  // How the task runs (was `kind: "single" | "saga"`). "supervised" flips the
  // Conductor bundle; "plain" runs the default flow. See runModeSchema.
  runMode: runModeSchema.default("plain"),
  roadmapItemId: safeIdSchema.nullable().default(null),
  title: z.string().min(1),
  description: z.string().default(""),
  // Spec-up phase: prose acceptance criteria ("done when…") and a rough size
  // estimate (free label, e.g. "S" / "M" / "L" / "2d"). Authored by the roadmap
  // synthesis and editable on the card. The authoring contract is "may be
  // omitted"; "" is the empty state (a card without criteria yet), not a
  // back-compat backfill.
  acceptanceCriteria: z.string().default(""),
  // Machine-checkable acceptance: shell commands that must PASS for the card
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
  // Ordered breakdown that lives inside the card (the "Checklist"). The
  // pick-up loop iterates this in order; an instant task is the degenerate
  // synthetic-1-item case. Defaults to empty for backward-compat with tasks
  // written before this field existed.
  checklist: z.array(checklistItemSchema).default([]),
  // ─── Supervised execution (the Conductor) ───────────────────────────
  // The supervised-run lifecycle, grouped: `state` + clean-halt record + the
  // non-folding INVARIANTS ledger (re-injected into every step's packet so
  // conventions don't fold away) + the Enhance pending-plan overlay.
  // Always present + defaulted (a plain task stays `state:"idle"`). Durable
  // across resume; redacted + bounded on write.
  // .prefault(): both rely on their own field defaults to fill in from {}.
  supervised: supervisedRunSchema.prefault({}),
  // Per-task run options / advanced knobs (was `sagaBudget`): the run budget
  // override of the config.supervised defaults.
  runOptions: runOptionsSchema.prefault({}),
  // Non-blocking advisory: a run finished but a human should eyeball something
  // the model can't perceive (visual/UX/3D). Set from a HUMAN_REVIEW: ADVISORY
  // marker; cleared by a human verdict (pass → done, fail → reopen).
  needsTesting: z.boolean().default(false),
  needsTestingReason: z.string().nullable().default(null),
  // "Derived from" back-pointer (promote-item-to-card): set when this
  // card was promoted out of another card's checklist item. A *relation*, not a
  // reparent - the origin item keeps its own status and points here via
  // `promotedTaskId`. null for normal cards.
  derivedFrom: z
    .object({ taskId: safeIdSchema, itemId: z.string().min(1) })
    .nullable()
    .default(null),
  // Filed-away flag (board): an archived card sits in the board's
  // Archived column regardless of its run status. Orthogonal to status so a
  // done OR abandoned card can be archived without losing its real state.
  archived: z.boolean().default(false),
  // Context sources: files/URLs injected into every agent's prompt
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

// ── Coarse board columns ─────────────────────────────────────────────────────
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
