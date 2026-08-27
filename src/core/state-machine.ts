// The run's state VOCABULARY and its on-disk store in one file: the zod schema
// for `.vibestrate/runs/<id>/state.json`, the legal status graph, and the
// RunStateStore that reads and writes that file. It is imported across the
// orchestrator, the CLI, the server routes and the terminal shell, so a change
// to the schema here is felt everywhere.
//
// Source order: the step / flow / run state schemas -> ALLOWED_TRANSITIONS and
// the transition guards -> createInitialState -> RunStateStore ->
// RunNotFoundError -> renameRun.
//
// Two things a reader must not break:
//
//   1. The status graph is an ALLOWLIST, checked at runtime. `canTransition`
//      rejects a self-transition, the four terminal statuses list no successors,
//      and `assertTransition` throws on anything the table does not name. The
//      Record type forces a new status to declare its own row, but nothing
//      forces the rows that should be able to REACH it to list it - that gap
//      only shows up as a thrown StateTransitionError on a live run.
//
//   2. There are two write paths with deliberately opposite failure postures.
//      `write` is the run's own writer putting back state it held in memory
//      across a turn, and it DEGRADES to an unlocked write when the lock cannot
//      be taken, because it is called from a finalizer where a throw leaves the
//      run unfinished. `mutate` is the read-modify-write for every other
//      process and FAILS CLOSED, because a CLI or HTTP caller can retry. Each
//      method carries the longer reasoning at its own definition.
//
// Newer fields carry a default so a state.json written by an older build still
// parses - `.default(...)` normally, `.optional()` where absent is meaningful,
// `.prefault({})` where a nested schema supplies its own field defaults. A run
// directory outlives the schema that made it.

import { z } from "zod";
import { terminalCauseSchema } from "./run/terminal-cause.js";
import { StateTransitionError } from "../utils/errors.js";
import { contextSourceSchema } from "./context/context-source-schema.js";
import { runStatePath } from "../utils/paths.js";
import { readJson } from "../utils/json.js";
import { pathExists, writeTextAtomic } from "../utils/fs.js";
import { withFileMutex } from "../utils/file-mutex.js";
import { nowIso } from "../utils/time.js";
import { EventLog } from "./stores/event-log.js";
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
      // Widened with the step-condition vocabulary: a review may now be
      // skipped because its SUBJECT is absent, not only because the diff is prose.
      reason: z.string().min(1).max(60),
      stepId: z.string().min(1),
      files: z.array(z.string()).max(500),
    })
    .nullable()
    .default(null),
  verification: verificationDecisionSchema.nullable().default(null),
  error: z.string().nullable().default(null),
  /**
   * Why the run ended, as a code rather than prose. `error` stays for humans;
   * this is what callers branch on. Defaults to null so runs already on disk
   * round-trip unchanged, and null reads as "no deterministic signal".
   */
  terminalCause: terminalCauseSchema.nullable().default(null),
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
  // ─── Human guidance ────────────────────────────────────────────────────
  // pendingGuidance is a write-side signal, the same shape and for the same
  // reason as pauseRequested/abortRequested: the orchestrator owns the
  // injection point, so an outside writer queues a note instead of mutating a
  // step. A human (CLI `vibe guide`, or the dashboard) appends here mid-run;
  // the orchestrator drains the queue at the next STEP BOUNDARY into that
  // step's guidance, which reaches the prompt through the same
  // composeGuidedNotes seam an approval's change-request already uses.
  //
  // Draining at a boundary is what makes this safe. A code-writing seat holds
  // an open worktree; interrupting it between two writes would leave half-
  // written files for the re-run to reconcile. Landing the note at a boundary
  // costs at most one step of latency and never corrupts the tree.
  //
  // Read-only advice was never the point: a human who can see the work and
  // cannot redirect it is a spectator. `ownerPid` (below) tells the requester
  // whether a live orchestrator is still there to honour the note.
  pendingGuidance: z
    .array(
      z
        .object({
          note: z.string().min(1).max(4000),
          at: z.string(),
          /** Which step it is aimed at; null = whichever step runs next. */
          stepId: z.string().nullable().default(null),
        })
        .strict(),
    )
    .default([]),
  // ─── Abort ─────────────────────────────────────────────────────────────
  // abortRequested is the same shape as pauseRequested, and for the same
  // reason: the orchestrator owns the terminal transition. Four processes used
  // to write `status: "aborted"` directly, which raced the orchestrator's own
  // whole-object write - an abort landing mid-turn was silently overwritten
  // while the user had already been told the run was aborted. Now they set this
  // flag and the run ends itself through the normal abort path, which also
  // writes the final report, assurance and ledger entry.
  //
  // ownerPid is the process running the run, recorded so a requester can tell a
  // live orchestrator (which will honour the flag) from a crashed one (where
  // nobody is left to, and the requester finalizes the run itself).
  abortRequested: z.boolean().default(false),
  ownerPid: z.number().int().positive().nullable().default(null),
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
    abortRequested: false,
    // Claimed by the orchestrator when it actually starts the run, not here:
    // the process creating this record is often not the one that will execute
    // it. Null means nobody is running it, so an abort closes it out directly.
    ownerPid: null,
    startedAt: ts,
    updatedAt: ts,
    finalDecision: null,
    reviewSkipped: null,
    verification: null,
    error: null,
    terminalCause: null,
    pendingApprovalId: null,
    approvalRequestedFromStatus: null,
    taskId: null,
    pauseRequested: false,
    pendingGuidance: [],
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

/** What a pre-write read of state.json found. "absent" and "unreadable" are held
 *  apart on purpose: the first means this write creates the run, the second means
 *  we cannot know what it replaced. See `readOnDisk`. */
type OnDiskState =
  | { kind: "absent" }
  | { kind: "unreadable"; error: unknown }
  | { kind: "read"; state: RunState };

export class RunStateStore {
  constructor(private readonly projectRoot: string, private readonly runId: string) {}

  get filePath(): string {
    return runStatePath(this.projectRoot, this.runId);
  }

  async exists(): Promise<boolean> {
    return pathExists(this.filePath);
  }

  /** Readers never take the lock. `persist` ends in a rename, so a reader sees
   *  the whole old state or the whole new one, never a torn file. */
  async read(): Promise<RunState> {
    const raw = await readJson<unknown>(this.filePath);
    return runStateSchema.parse(raw);
  }

  /** Serializes writers to this one run. Per-run, so runs never contend. */
  get lockPath(): string {
    return `${this.filePath}.lock`;
  }

  /**
   * Atomic replace, not a truncating rewrite. state.json carries the whole flow
   * ledger, so it is far past a single page, and several processes read it while
   * the orchestrator writes it - the abort poller every 500ms, the pause poller,
   * run-lock's staleness check, and the run listing. A plain writeFile leaves a
   * window where every one of them parses a half-written file; they all swallow
   * that error, so the run silently disappears from the dashboard instead.
   */
  private async persist(state: RunState): Promise<void> {
    await writeTextAtomic(this.filePath, `${JSON.stringify(state, null, 2)}\n`);
  }

  /**
   * The run's own writer - the orchestrator, persisting the state it has held
   * in memory across a turn.
   *
   * Takes the lock so an external `mutate` cannot read, be overtaken by this
   * write, and then put its stale copy back, discarding the flow ledger.
   *
   * DEGRADES rather than throws when the lock cannot be acquired. The
   * orchestrator finalizes a run by writing from inside its catch block, with
   * no `finally` behind it: a throw there skips the run.failed event, the
   * metrics finalize and the final report, and leaves state.json reading
   * "executing" with a dead ownerPid that nothing in the codebase reclaims. An
   * unlocked write is exactly what this method did before, so degrading is
   * never worse than the old behaviour - where refusing to write would be.
   */
  async write(state: RunState): Promise<void> {
    const validated = runStateSchema.parse(state);
    let acquired = false;
    // Set by persistFresh, read after the mutex releases. The pre-read it comes
    // from MUST stay inside the critical section - see keepAbortRequested.
    let onDisk: OnDiskState = { kind: "absent" };
    const persistFresh = async (): Promise<void> => {
      onDisk = await this.readOnDisk();
      await this.persist(this.keepExternalSignals(validated, onDisk));
    };
    try {
      await withFileMutex(this.lockPath, async () => {
        acquired = true;
        await persistFresh();
      });
    } catch (err) {
      // Acquired means the failure is the write itself - a real I/O error the
      // caller has always been able to see. Only a failure to acquire degrades.
      if (acquired) throw err;
      process.emitWarning(
        `Could not lock ${this.filePath} (${err instanceof Error ? err.message : String(err)}); writing unlocked so the run is not left unfinalized.`,
        "VibestrateStateLockDegraded",
      );
      await persistFresh();
    }
    // Strictly after the mutex releases - never inside. See recordStatusChange.
    await this.recordStatusChange(onDisk, validated.status);
  }

  /**
   * `abortRequested` is raised by whoever asks a run to stop and is never
   * lowered anywhere in this codebase - `createInitialState` is the only place
   * that writes false, at birth. So a whole-object write built from memory that
   * predates the request must not carry the stale false back to disk.
   *
   * Without this an abort is dropped outright: the per-turn observer is cleared
   * before the post-turn diff gate and the approval gate, and the approval gate
   * can wait on a human indefinitely, so an abort arriving in that window is
   * seen by nobody and then overwritten by the commit's own state write - after
   * the user was told the run would stop.
   *
   * `pendingGuidance` is the same class of signal, and is preserved for the
   * same reason - see the note on the field below.
   *
   * Takes the on-disk copy rather than reading it, so `write` can spend ONE read
   * on both this and the status diff. That read must happen inside the lock: a
   * copy taken before acquiring can be overtaken by a concurrent `requestAbort`
   * raising the flag, and this would then put the stale false back - the exact
   * dropped abort described above.
   */
  private keepExternalSignals(next: RunState, onDisk: OnDiskState): RunState {
    if (onDisk.kind !== "read") return next;
    let out = next;
    if (!out.abortRequested && onDisk.state.abortRequested === true) {
      out = { ...out, abortRequested: true };
    }
    // `pendingGuidance` belongs to whoever queued it, not to the caller's
    // in-memory snapshot. A whole-object write built before a note arrived
    // would drop it; one built before a DRAIN would resurrect it. Deferring to
    // disk in both directions makes `write` unable to do either, which leaves
    // `mutate` - the append in queueGuidance and the removal in drainGuidance -
    // as the only thing that ever changes this field.
    out = { ...out, pendingGuidance: onDisk.state.pendingGuidance ?? [] };
    return out;
  }

  /**
   * One read, three outcomes kept apart. A missing file means this write CREATES
   * the run; an unreadable one means we cannot know what it held. Folding both
   * into "no previous state" silently coerces a torn read into a fresh run,
   * which would drop a real transition from the audit log with no signal.
   */
  private async readOnDisk(): Promise<OnDiskState> {
    try {
      return { kind: "read", state: await this.read() };
    } catch (err) {
      if (!(await pathExists(this.filePath))) return { kind: "absent" };
      return { kind: "unreadable", error: err };
    }
  }

  /**
   * THE funnel for `state.changed`. Every status a run ever reaches passes
   * through `persist`, so emitting here - rather than beside the ~40 callers of
   * `write`/`mutate` scattered across the orchestrator, the approval gate, the
   * pause and abort services and the flow runner - makes the invariant
   * structural: state.json's status changed on disk => the event exists.
   * The event type had two consumers and no emitter for exactly as long as it
   * was the callers' job to remember.
   *
   * Called only AFTER the mutex releases. `withFileMutex` is a link()-based
   * cross-process lock and is NOT reentrant, so anything under this that took
   * `lockPath` again would spin the full timeout and then either throw or
   * degrade to an unlocked write. It is safe today only because `EventLog.append`
   * is a bare `fs.appendFile` that takes no lock at all - keep it that way, or
   * keep this call outside.
   *
   * BEST-EFFORT, never throws. `write` is called from the orchestrator's
   * finalizer inside a catch block with nothing behind it; a throw here would
   * skip the run.failed event, the metrics finalize and the final report - the
   * same failure the unlocked-write degrade exists to prevent. An audit line is
   * not worth a run left unfinalized.
   */
  private async recordStatusChange(
    onDisk: OnDiskState,
    to: RunStatus,
  ): Promise<void> {
    // The run was born by this write. `run.created` marks that; a transition
    // from nothing is not a state CHANGE, and emitting one here would displace
    // run.created as the first line of every run's events.ndjson.
    if (onDisk.kind === "absent") return;
    const from = onDisk.kind === "read" ? onDisk.state.status : null;
    if (from === to) return;
    if (from === null) {
      process.emitWarning(
        `Could not read ${this.filePath} before writing status "${to}" (${onDisk.kind === "unreadable" && onDisk.error instanceof Error ? onDisk.error.message : "unreadable"}); recording the transition without its origin.`,
        "VibestrateStateOriginUnknown",
      );
    }
    await this.appendStateChanged(from, to);
  }

  /** Shared by both write paths. Swallows and warns - see recordStatusChange. */
  private async appendStateChanged(
    from: RunStatus | null,
    to: RunStatus,
  ): Promise<void> {
    try {
      await new EventLog(this.projectRoot, this.runId).append({
        type: "state.changed",
        message: from ? `${from} → ${to}` : `→ ${to}`,
        data: { from, to },
      });
    } catch (err) {
      process.emitWarning(
        `Could not record the ${from ?? "?"} → ${to} transition for run ${this.runId} (${err instanceof Error ? err.message : String(err)}); state.json is written, only the audit line is missing.`,
        "VibestrateStateEventDegraded",
      );
    }
  }

  /**
   * The read-modify-write every OTHER process must use: `vibe pause`, the
   * dashboard's rename, `vibe abort`. Reads the freshest state inside the lock
   * and hands it to `fn`, so a decision can never be taken on a copy the
   * orchestrator has already superseded. Return `next: null` to decide against
   * writing at all; `result` is what the caller gets back.
   *
   * Unlike `write`, this FAILS CLOSED on a lock timeout. The caller is a CLI or
   * HTTP request that can be retried, and a refusal it can see beats a silent
   * lost update.
   *
   * `fn` must be pure: no I/O, and above all no other lock. Taking a second
   * lock here (an event append, a roadmap or approval write) creates an AB-BA
   * deadlock with routes that already hold that lock and then abort a run.
   * Append events AFTER this returns.
   *
   * This makes each mutation atomic, not every sequence of them: a caller that
   * writes twice can still be interleaved between the two.
   */
  async mutate<T>(
    fn: (fresh: RunState) => { next: RunState | null; result: T },
  ): Promise<T> {
    // Before the lock, because acquiring it creates the run directory: a
    // mutation aimed at a pruned run would otherwise resurrect an empty dir,
    // and the orphan sweep reads those directories to decide what is still live.
    if (!(await this.exists())) {
      throw new RunNotFoundError(`Run ${this.runId} not found.`);
    }
    // The transition is carried OUT of the critical section rather than emitted
    // inside it, for the same reason `fn` may not do I/O - see the note above
    // and recordStatusChange. `fresh` is a real read, so a status change seen
    // here is never a phantom.
    const { result, from, to } = await withFileMutex(this.lockPath, async () => {
      const fresh = await this.read();
      const { next, result } = fn(fresh);
      if (!next) return { result, from: null, to: null };
      const parsed = runStateSchema.parse(next);
      await this.persist(parsed);
      return { result, from: fresh.status, to: parsed.status };
    });
    if (to !== null && from !== to) await this.appendStateChanged(from, to);
    return result;
  }
}

/** A mutation was aimed at a run that no longer exists on disk. */
export class RunNotFoundError extends Error {
  readonly code = "RUN_NOT_FOUND";
  constructor(message: string) {
    super(message);
    this.name = "RunNotFoundError";
  }
}

/** Set a run's friendly display name. Goes through `mutate` so renaming a live
 *  run cannot put a minutes-old copy of the flow ledger back on disk. Throws if
 *  the run doesn't exist or the name is empty. */
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
  return store.mutate((fresh) => {
    const next: RunState = {
      ...fresh,
      displayName: trimmed,
      updatedAt: nowIso(),
    };
    return { next, result: next };
  });
}
