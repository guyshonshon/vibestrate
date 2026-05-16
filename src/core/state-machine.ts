import { z } from "zod";
import { StateTransitionError } from "../utils/errors.js";
import { runStatePath } from "../utils/paths.js";
import { writeJson, readJson } from "../utils/json.js";
import { pathExists } from "../utils/fs.js";
import { nowIso } from "../utils/time.js";
import type { RunStatus } from "../workflow/workflow-types.js";
import { TERMINAL_STATUSES } from "../workflow/workflow-types.js";

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
});

export type RunState = z.infer<typeof runStateSchema>;

const ALLOWED_TRANSITIONS: Record<RunStatus, RunStatus[]> = {
  created: ["planning", "paused", "failed", "aborted", "blocked"],
  planning: ["planned", "paused", "failed", "aborted", "blocked"],
  planned: ["architecting", "waiting_for_approval", "paused", "failed", "aborted", "blocked"],
  architecting: ["architected", "paused", "failed", "aborted", "blocked"],
  architected: ["executing", "waiting_for_approval", "paused", "failed", "aborted", "blocked"],
  executing: ["validating", "waiting_for_approval", "paused", "failed", "aborted", "blocked"],
  validating: ["reviewing", "paused", "failed", "aborted", "blocked"],
  reviewing: [
    "verifying",
    "fixing",
    "waiting_for_approval",
    "paused",
    "blocked",
    "failed",
    "aborted",
  ],
  fixing: ["validating", "waiting_for_approval", "paused", "blocked", "failed", "aborted"],
  verifying: ["merge_ready", "waiting_for_approval", "paused", "blocked", "failed", "aborted"],
  waiting_for_approval: [
    "planned",
    "architected",
    "executing",
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
