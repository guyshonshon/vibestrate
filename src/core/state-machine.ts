import { z } from "zod";
import { StateTransitionError } from "../utils/errors.js";
import { contextSourceSchema } from "./context/context-source-schema.js";
import { runStatePath } from "../utils/paths.js";
import { writeJson, readJson } from "../utils/json.js";
import { pathExists } from "../utils/fs.js";
import { nowIso } from "../utils/time.js";
import { defaultDisplayName } from "../utils/slug.js";
import type { RunStatus } from "./workflow/workflow-types.js";
import { TERMINAL_STATUSES } from "./workflow/workflow-types.js";
import { flowRunParticipantStateSchema } from "../flows/runtime/flow-participant-ledger.js";
import { runBudgetSchema } from "../roadmap/roadmap-types.js";

export const runStatusSchema = z.enum([
  "created",
  "planning",
  "planned",
  "architecting",
  "architected",
  "executing",
  "validating",
  "reviewing",
  "fixing",
  "verifying",
  "waiting_for_approval",
  "paused",
  "merge_ready",
  "blocked",
  "failed",
  "aborted",
]);

export const reviewDecisionSchema = z.enum([
  "APPROVED",
  "CHANGES_REQUESTED",
  "BLOCKED",
]);
export type ReviewDecision = z.infer<typeof reviewDecisionSchema>;

export const verificationDecisionSchema = z.enum([
  "PASSED",
  "FAILED",
  "NEEDS_HUMAN",
]);
export type VerificationDecision = z.infer<typeof verificationDecisionSchema>;

export const flowRunStepStatusSchema = z.enum([
  "pending",
  "running",
  "passed",
  "blocked",
  "failed",
  "skipped",
]);
export type FlowRunStepStatus = z.infer<typeof flowRunStepStatusSchema>;

export const flowRunStepStateSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    kind: z.string().min(1),
    status: flowRunStepStatusSchema,
    optional: z.boolean().default(false),
    // Coarse phase (mirrors the flow step's `stage`); used to tell which stages
    // a run can be resumed at. null when the step declares no stage.
    stage: z
      .enum(["planning", "architecting", "executing", "reviewing", "verifying"])
      .nullable()
      .default(null),
    seat: z.string().nullable().default(null),
    // DAG dependencies: the step ids this step waits on. Empty for
    // linear flows. Carried on the run state so the dashboard can draw the graph
    // (concurrent review-panel branches + their join) with live per-step status.
    needs: z.array(z.string()).default([]),
    resolvedRoleId: z.string().nullable().default(null),
    resolvedRoleLabel: z.string().nullable().default(null),
    profileId: z.string().nullable().default(null),
    providerId: z.string().nullable().default(null),
    promptArtifactPath: z.string().nullable().default(null),
    outputArtifactPath: z.string().nullable().default(null),
    contextPacketPath: z.string().nullable().default(null),
    validationArtifactPath: z.string().nullable().default(null),
    startedAt: z.string().nullable().default(null),
    endedAt: z.string().nullable().default(null),
    error: z.string().nullable().default(null),
  })
  .strict();
export type FlowRunStepState = z.infer<typeof flowRunStepStateSchema>;

export const flowRunStateSchema = z
  .object({
    flowId: z.string().min(1),
    flowVersion: z.number().int().positive(),
    label: z.string().min(1),
    snapshotPath: z.string().min(1),
    participantLedgerPath: z.string().nullable().default(null),
    participants: z.array(flowRunParticipantStateSchema).default([]),
    currentStepId: z.string().nullable().default(null),
    steps: z.array(flowRunStepStateSchema),
  })
  .strict();
export type FlowRunState = z.infer<typeof flowRunStateSchema>;

export const runStateSchema = z.object({
  runId: z.string().min(1),
  task: z.string().min(1),
  /** A friendly, editable run label. The runId stays the stable
   *  identifier; this is just nicer to read in lists/headers. Defaults to the
   *  first words of the task; `vibe rename` / the UI overrides it. Nullable +
   *  defaulted so older run state files (which predate it) still parse. */
  displayName: z.string().min(1).max(120).nullable().default(null),
  status: runStatusSchema,
  projectRoot: z.string().min(1),
  worktreePath: z.string().nullable(),
  branchName: z.string().nullable(),
  reviewLoopCount: z.number().int().min(0).default(0),
  maxReviewLoops: z.number().int().min(0).default(2),
  startedAt: z.string(),
  updatedAt: z.string(),
  finalDecision: reviewDecisionSchema.nullable().default(null),
  // Express: set ONLY by the deterministic inert-diff evaluator when a
  // `skipWhen: "inert_diff"` review-turn was skipped on recorded diff evidence
  // (strict-prose, unprotected files). Feeds assurance `review:
  // skipped_inert_diff` + the merge-readiness predicate. Null everywhere else.
  reviewSkipped: z
    .object({
      reason: z.literal("inert_diff"),
      stepId: z.string().min(1),
      files: z.array(z.string()).max(500),
    })
    .nullable()
    .default(null),
  verification: verificationDecisionSchema.nullable().default(null),
  error: z.string().nullable().default(null),
  pendingApprovalId: z.string().nullable().default(null),
  approvalRequestedFromStatus: runStatusSchema.nullable().default(null),
  // Optional roadmap task this run is associated with. Set by `vibe run --task`
  // or by the scheduler. Existing runs round-trip safely (defaults to null).
  taskId: z.string().nullable().default(null),
  // ─── Pause / resume ────────────────────────────────────────────────────
  // pauseRequested is a write-side signal from CLI / dashboard. The
  // orchestrator polls between stages and, when it observes the flag, it
  // transitions to "paused" and waits for the flag to clear before
  // resuming. pausedAtStatus remembers the stage we were entering so
  // resume can transition back into it. Both default to safe values for
  // existing runs that predate pause/resume.
  pauseRequested: z.boolean().default(false),
  pausedAtStatus: runStatusSchema.nullable().default(null),
  // ─── Per-run Crew + Profile selection + read-only ─────────────────────
  // Locked into the run at start so the audit trail is faithful even if
  // the originating task/config is later edited. The resolved per-step
  // profile/provider lives in flow.json (the immutable snapshot); these
  // record the run-level choices that fed resolution.
  /** Crew the run resolved against (null = project.defaultCrew). */
  crewId: z.string().nullable().default(null),
  /** Run-wide Profile override applied to every seated step (null = none). */
  profileOverride: z.string().nullable().default(null),
  /** Per-step Profile overrides (step id → profile id). */
  stepProfileOverrides: z.record(z.string(), z.string()).default({}),
  /** Seat → Role overrides used to disambiguate seats filled by >1 role. */
  seatRoleOverrides: z.record(z.string(), z.string()).default({}),
  readOnly: z.boolean().default(false),
  /** The RESOLVED permission mode that governed this run - recorded so
   *  reports reflect the policy actually enforced, not the request. */
  permissionMode: z
    .enum(["read-only", "ask", "accept-edits", "auto"])
    .optional(),
  /** Resolved flow parameter values, name -> value. Secret params are
   *  recorded as "[secret]" - the real value never lands on disk. */
  params: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .default({}),
  // Per-run skill ids. Merged into every agent's configured skill list
  // before invocation, so the user can attach context to a single run
  // without editing project-level agent config. Empty / missing means
  // "use only the agent's configured skills". Survives round-trip on
  // older records that predate this field.
  runtimeSkills: z.array(z.string()).default([]),
  // Per-run concise-mode flag. When true, every agent's prompt
  // includes a brevity directive: prefer diffs over re-stating
  // surrounding code, bullets over paragraphs, no preamble.
  concise: z.boolean().default(false),
  // Flows persist their immutable resolved snapshot separately at
  // `.vibestrate/runs/<id>/flow.json`; this live ledger stays in state.json
  // so run lists, shell snapshots, and replay can expose progress without
  // reading artifacts or provider output.
  flow: flowRunStateSchema.nullable().default(null),
  // Set when this run was forked from a prior run via "rewind to a stage":
  // the upstream artifacts (plan, and architecture when resuming at
  // executing) were copied from `sourceRunId` instead of regenerated, and
  // the run started at `fromStage`. null for normal from-scratch runs.
  resumedFrom: z
    .object({
      sourceRunId: z.string(),
      fromStage: z.enum([
        "planning",
        "architecting",
        "executing",
        "reviewing",
        "fixing",
        "verifying",
      ]),
    })
    .nullable()
    .default(null),
  // Non-blocking "a human should look at this" advisory. Set when a
  // reviewer/verifier emits HUMAN_REVIEW: ADVISORY. Does NOT change the run's
  // terminal verdict; it flags the linked card for human testing.
  needsTesting: z
    .object({ reason: z.string().nullable() })
    .nullable()
    .default(null),
  // Context sources: the files/URLs attached to this run's prompts.
  // Recorded for display; the materialized content lives under
  // runs/<id>/artifacts/context/.
  contextSources: z.array(contextSourceSchema).default([]),
  // Pick-up execution: how the per-item checklist band advances.
  // "continuous" runs items back-to-back; "step" pauses between items for a
  // human. null when the run isn't iterating a checklist.
  checklistMode: z.enum(["continuous", "step"]).nullable().default(null),
  // Saga mode (the Conductor): this run is a supervised saga - a step that
  // exhausts self-heal halts the run cleanly (no green-but-broken commit) and
  // each step starts a fresh model context. Defaulted for older runs.
  sagaMode: z.boolean().default(false),
  // Per-saga budget envelope (the Conductor): bounds the saga's TOTAL
  // cost/length, enforced BETWEEN steps. Null fields mean no limit on that axis.
  // Defaulted (no limits) for non-saga and older runs.
  // .prefault(): {} needs runBudgetSchema's own field defaults to fill in.
  sagaBudget: runBudgetSchema.prefault({}),
  // Live per-item progress for the dashboard/report. null unless the run is
  // iterating a checklist segment. The authoritative per-item status + commit
  // sha live on the task's own checklist (written back as each item finishes).
  checklistProgress: z
    .object({
      total: z.number().int().min(0),
      completed: z.number().int().min(0),
      currentItemId: z.string().nullable(),
      currentIndex: z.number().int().min(0),
    })
    .nullable()
    .default(null),
  /**
   * The ordered checklist item ids this run ran against, recorded at checklist
   * setup. A resume reads its source run's value and refuses if the task's
   * checklist changed since (ids added/removed/reordered) - resume skips items
   * by their per-item done status, so a mutated list could skip/re-run the wrong
   * one. null on non-checklist runs and on runs from before this field existed
   * (the guard fails open when it can't verify).
   */
  checklistItemIds: z.array(z.string()).nullable().default(null),
});

export type RunState = z.infer<typeof runStateSchema>;

const ALLOWED_TRANSITIONS: Record<RunStatus, RunStatus[]> = {
  created: [
    "planning",
    "architecting",
    "executing",
    "validating",
    "reviewing",
    "fixing",
    "verifying",
    "waiting_for_approval",
    "paused",
    "failed",
    "aborted",
    "blocked",
  ],
  planning: [
    "planned",
    "architecting",
    "executing",
    "validating",
    "reviewing",
    "verifying",
    "waiting_for_approval",
    "paused",
    // A read-only no-review enrichment flow (e.g. spec-up-intake) has its only
    // step at the planning stage and nothing to approve - it goes terminal from
    // here. Gated by computeMergeReady, so a WRITE flow stuck at planning (no
    // review satisfied) still cannot reach merge_ready - it blocks.
    "merge_ready",
    "failed",
    "aborted",
    "blocked",
  ],
  planned: [
    "architecting",
    "executing",
    "validating",
    "reviewing",
    "verifying",
    "waiting_for_approval",
    "paused",
    "failed",
    "aborted",
    "blocked",
  ],
  architecting: [
    "architected",
    "executing",
    "validating",
    "reviewing",
    "verifying",
    "waiting_for_approval",
    "paused",
    // Read-only no-review flow terminating at architecting (see `planning`).
    "merge_ready",
    "failed",
    "aborted",
    "blocked",
  ],
  architected: ["executing", "waiting_for_approval", "paused", "failed", "aborted", "blocked"],
  executing: [
    "validating",
    "reviewing",
    "verifying",
    "waiting_for_approval",
    "paused",
    // Read-only no-review flow terminating at executing (see `planning`).
    "merge_ready",
    "failed",
    "aborted",
    "blocked",
  ],
  validating: [
    "reviewing",
    "verifying",
    "waiting_for_approval",
    "paused",
    // Express skips review on recorded inert-diff evidence, so a run
    // whose last executed step is validation goes terminal from here - the
    // skip is evidence, not absence (assurance still caps the verdict).
    "merge_ready",
    "failed",
    "aborted",
    "blocked",
  ],
  reviewing: [
    "executing",
    "validating",
    "verifying",
    "fixing",
    "waiting_for_approval",
    "paused",
    // Read-only runs skip verification, so an APPROVED review goes straight to
    // merge_ready (both run() and the flow runner).
    "merge_ready",
    "blocked",
    "failed",
    "aborted",
  ],
  fixing: [
    "validating",
    "reviewing",
    "verifying",
    "waiting_for_approval",
    "paused",
    // Belt-and-suspenders: a flow that ends merge-ready at the fixing stage
    // (e.g. a response-turn terminal) - including via the accept-edits approval
    // hold's resume - can reach merge_ready. Gated by computeMergeReady like every
    // other stage, so a write flow stuck at fixing without review still blocks.
    "merge_ready",
    "blocked",
    "failed",
    "aborted",
  ],
  verifying: ["merge_ready", "waiting_for_approval", "paused", "blocked", "failed", "aborted"],
  waiting_for_approval: [
    "created",
    "planning",
    "planned",
    "architecting",
    "architected",
    "executing",
    "validating",
    "reviewing",
    "fixing",
    "verifying",
    "blocked",
    "failed",
    "aborted",
  ],
  // From paused we can return to any non-terminal pre-pause status, or be
  // aborted outright. The actual round-trip status is tracked separately
  // in state.pausedAtStatus.
  paused: [
    "created",
    "planning",
    "planned",
    "architecting",
    "architected",
    "executing",
    "validating",
    "reviewing",
    "fixing",
    "verifying",
    "aborted",
    "failed",
  ],
  merge_ready: [],
  blocked: [],
  failed: [],
  aborted: [],
};

export function isTerminal(status: RunStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function canTransition(from: RunStatus, to: RunStatus): boolean {
  if (from === to) return false;
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: RunStatus, to: RunStatus): void {
  if (isTerminal(from)) {
    throw new StateTransitionError(
      `Cannot transition from terminal status "${from}" to "${to}".`,
    );
  }
  if (!canTransition(from, to)) {
    throw new StateTransitionError(
      `Invalid state transition: "${from}" → "${to}".`,
    );
  }
}

export function applyTransition(state: RunState, next: RunStatus): RunState {
  assertTransition(state.status, next);
  return { ...state, status: next, updatedAt: nowIso() };
}

export function createInitialState(input: {
  runId: string;
  task: string;
  projectRoot: string;
  worktreePath: string | null;
  branchName: string | null;
  maxReviewLoops: number;
}): RunState {
  const ts = nowIso();
  return {
    runId: input.runId,
    task: input.task,
    displayName: defaultDisplayName(input.task),
    status: "created",
    projectRoot: input.projectRoot,
    worktreePath: input.worktreePath,
    branchName: input.branchName,
    reviewLoopCount: 0,
    maxReviewLoops: input.maxReviewLoops,
    startedAt: ts,
    updatedAt: ts,
    finalDecision: null,
    reviewSkipped: null,
    verification: null,
    error: null,
    pendingApprovalId: null,
    approvalRequestedFromStatus: null,
    taskId: null,
    pauseRequested: false,
    pausedAtStatus: null,
    crewId: null,
    profileOverride: null,
    stepProfileOverrides: {},
    seatRoleOverrides: {},
    readOnly: false,
    params: {},
    runtimeSkills: [],
    concise: false,
    flow: null,
    resumedFrom: null,
    needsTesting: null,
    contextSources: [],
    checklistMode: null,
    sagaMode: false,
    sagaBudget: { maxSpendUsd: null, maxSteps: null },
    checklistProgress: null,
    checklistItemIds: null,
  };
}

export class RunStateStore {
  constructor(private readonly projectRoot: string, private readonly runId: string) {}

  get filePath(): string {
    return runStatePath(this.projectRoot, this.runId);
  }

  async exists(): Promise<boolean> {
    return pathExists(this.filePath);
  }

  async read(): Promise<RunState> {
    const raw = await readJson<unknown>(this.filePath);
    return runStateSchema.parse(raw);
  }

  async write(state: RunState): Promise<void> {
    const validated = runStateSchema.parse(state);
    await writeJson(this.filePath, validated);
  }
}

/** Set a run's friendly display name. Reads the freshest state immediately
 *  before writing so a concurrent orchestrator write isn't reverted - the
 *  display name is cosmetic, and terminal runs (the common rename target) have
 *  no concurrent writer. Throws if the run doesn't exist or the name is empty. */
export async function renameRun(
  projectRoot: string,
  runId: string,
  displayName: string,
): Promise<RunState> {
  const trimmed = displayName.replace(/\s+/g, " ").trim();
  if (!trimmed) throw new Error("A run display name cannot be empty.");
  if (trimmed.length > 120) {
    throw new Error("A run display name must be 120 characters or fewer.");
  }
  const store = new RunStateStore(projectRoot, runId);
  if (!(await store.exists())) throw new Error(`Run ${runId} not found.`);
  const state = await store.read();
  const next: RunState = { ...state, displayName: trimmed, updatedAt: nowIso() };
  await store.write(next);
  return next;
}
