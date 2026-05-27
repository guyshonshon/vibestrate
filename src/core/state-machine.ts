import { z } from "zod";
import { StateTransitionError } from "../utils/errors.js";
import { runStatePath } from "../utils/paths.js";
import { writeJson, readJson } from "../utils/json.js";
import { pathExists } from "../utils/fs.js";
import { nowIso } from "../utils/time.js";
import type { RunStatus } from "../workflow/workflow-types.js";
import { TERMINAL_STATUSES } from "../workflow/workflow-types.js";
import { flowRunParticipantStateSchema } from "../flows/runtime/flow-participant-ledger.js";

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
    slotId: z.string().nullable().default(null),
    roleId: z.string().nullable().default(null),
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
  status: runStatusSchema,
  projectRoot: z.string().min(1),
  worktreePath: z.string().nullable(),
  branchName: z.string().nullable(),
  reviewLoopCount: z.number().int().min(0).default(0),
  maxReviewLoops: z.number().int().min(0).default(2),
  startedAt: z.string(),
  updatedAt: z.string(),
  finalDecision: reviewDecisionSchema.nullable().default(null),
  verification: verificationDecisionSchema.nullable().default(null),
  error: z.string().nullable().default(null),
  pendingApprovalId: z.string().nullable().default(null),
  approvalRequestedFromStatus: runStatusSchema.nullable().default(null),
  // Optional roadmap task this run is associated with. Set by `amaco run --task`
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
  // ─── Per-task effort + override + read-only (Phase A/B) ───────────────
  // Locked into the run at start so the audit trail is faithful even if
  // the originating task is later edited or deleted. resolvedProviderId
  // records the provider that effort/providerOverride actually mapped
  // to (so `agent.provider` in events stays the canonical id used per
  // call, while resolvedProviderId surfaces the run-wide override).
  effort: z.enum(["low", "medium", "high"]).nullable().default(null),
  providerOverride: z.string().nullable().default(null),
  resolvedProviderId: z.string().nullable().default(null),
  readOnly: z.boolean().default(false),
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
  // `.amaco/runs/<id>/flow.json`; this live ledger stays in state.json
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
      fromStage: z.enum(["architecting", "executing"]),
    })
    .nullable()
    .default(null),
});

export type RunState = z.infer<typeof runStateSchema>;

const ALLOWED_TRANSITIONS: Record<RunStatus, RunStatus[]> = {
  created: [
    "planning",
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
  architecting: ["architected", "paused", "failed", "aborted", "blocked"],
  architected: ["executing", "waiting_for_approval", "paused", "failed", "aborted", "blocked"],
  executing: [
    "validating",
    "reviewing",
    "verifying",
    "waiting_for_approval",
    "paused",
    "failed",
    "aborted",
    "blocked",
  ],
  validating: [
    "reviewing",
    "verifying",
    "waiting_for_approval",
    "paused",
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
    "blocked",
    "failed",
    "aborted",
  ],
  verifying: ["merge_ready", "waiting_for_approval", "paused", "blocked", "failed", "aborted"],
  waiting_for_approval: [
    "created",
    "planning",
    "planned",
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
    status: "created",
    projectRoot: input.projectRoot,
    worktreePath: input.worktreePath,
    branchName: input.branchName,
    reviewLoopCount: 0,
    maxReviewLoops: input.maxReviewLoops,
    startedAt: ts,
    updatedAt: ts,
    finalDecision: null,
    verification: null,
    error: null,
    pendingApprovalId: null,
    approvalRequestedFromStatus: null,
    taskId: null,
    pauseRequested: false,
    pausedAtStatus: null,
    effort: null,
    providerOverride: null,
    resolvedProviderId: null,
    readOnly: false,
    runtimeSkills: [],
    concise: false,
    flow: null,
    resumedFrom: null,
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
