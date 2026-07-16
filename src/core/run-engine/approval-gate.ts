import { ApprovalService } from "../approval-service.js";
import {
  applyTransition,
  type RunState,
  type RunStateStore,
} from "../state-machine.js";
import type { EventLog } from "../event-log.js";
import {
  detectApprovalRequest,
  type ApprovalRisk,
  type ApprovalSource,
} from "../approval-types.js";
import {
  draftApprovalRequested,
  type NotificationDraft,
} from "../../notifications/notification-router.js";
import { redactSecretsInText } from "../diff-service.js";
import type { RunStatus } from "../workflow/workflow-types.js";
import type { ProjectConfig } from "../../project/config-schema.js";
import type { RoleRunResult } from "./types.js";

/** The orchestrator state the approval gate reads. Assembled fresh at each
 *  call site (Orchestrator.approvalGateDeps()) so live fields are current;
 *  the gate itself never mutates orchestrator state. */
export type ApprovalGateDeps = {
  projectRoot: string;
  policies: ProjectConfig["policies"];
  /** Unattended runs bound the wait so an unanswered gate expires -> blocked
   *  instead of hanging a scheduler worker forever. */
  unattended: boolean;
  onProgress: (message: string) => void;
  /** Fire-and-forget notification dispatcher; null before run() wires it. */
  notify: ((draft: NotificationDraft) => void) | null;
};

/**
 * Persist a pending approval request, transition the run to
 * `waiting_for_approval`, and poll until it is resolved. Returns the new state
 * plus how it resolved: approved (resume), changes requested (resume forward
 * with guidance), or rejected/expired (run transitioned to `blocked`).
 */
export async function awaitApprovalRequest(
  deps: ApprovalGateDeps,
  input: {
    state: RunState;
    fromStatus: RunStatus;
    stageId: string;
    stepId?: string | null;
    roleId: string;
    reason: string | null;
    prompt: string | null;
    sourceArtifactPath: string | null;
    requestedAction: string | null;
    riskLevel: ApprovalRisk;
    source: ApprovalSource;
    alsoRequiredByPolicy?: boolean;
    userMessage?: string | null;
    progressMessage: string;
    requestedMessage: string;
    resumedMessage: string;
    approvalService: ApprovalService;
    stateStore: RunStateStore;
    eventLog: EventLog;
  },
): Promise<{ state: RunState; rejected: boolean; changesGuidance: string | null }> {
  deps.onProgress(input.progressMessage);

  const req = await input.approvalService.create({
    stageId: input.stageId,
    stepId: input.stepId ?? null,
    roleId: input.roleId,
    reason: input.reason,
    prompt: input.prompt,
    sourceArtifactPath: input.sourceArtifactPath,
    requestedAction: input.requestedAction,
    riskLevel: input.riskLevel,
    source: input.source,
    alsoRequiredByPolicy: input.alsoRequiredByPolicy,
    userMessage: input.userMessage,
  });

  let pendingState: RunState = applyTransition(
    input.state,
    "waiting_for_approval",
  );
  pendingState = {
    ...pendingState,
    pendingApprovalId: req.id,
    approvalRequestedFromStatus: input.fromStatus,
  };
  await input.stateStore.write(pendingState);
  if (deps.notify) {
    deps.notify(
      draftApprovalRequested({
        runId: input.state.runId,
        approvalId: req.id,
        roleId: input.roleId,
        stageId: input.stageId,
        reason: input.reason,
      }),
    );
  }
  await input.eventLog.append({
    type: "approval.requested",
    message: input.requestedMessage,
    data: {
      approvalId: req.id,
      roleId: input.roleId,
      stageId: input.stageId,
      reason: input.reason,
      requestedAction: input.requestedAction,
      riskLevel: input.riskLevel,
      source: input.source,
      alsoRequiredByPolicy: input.alsoRequiredByPolicy ?? false,
    },
  });

  // Unattended runs must not hang at a gate: no human is watching, so an
  // unanswered approval would wedge a scheduler worker forever. Bound the wait
  // so it `expires` -> the run goes `blocked` honestly. Attended runs keep the
  // indefinite wait (a human is there). This NEVER approves; it only stops the
  // hang. `forbidAutoMerge`/`forbidAutoPush` and every gate are untouched.
  const resolved = await input.approvalService.waitForResolution(req.id, {
    pollMs: 1500,
    ...(deps.unattended
      ? {
          timeoutMs: Math.max(
            1,
            deps.policies.unattendedApprovalTimeoutMs,
          ),
        }
      : {}),
  });

  if (resolved.status === "approved") {
    let next: RunState = applyTransition(pendingState, input.fromStatus);
    next = {
      ...next,
      pendingApprovalId: null,
      approvalRequestedFromStatus: null,
    };
    await input.stateStore.write(next);
    await input.eventLog.append({
      type: "approval.approved",
      message: `Approval ${req.id} approved by ${resolved.resolvedBy ?? "local-user"}.`,
      data: {
        approvalId: req.id,
        decisionNote: resolved.decisionNote ?? null,
      },
    });
    await input.eventLog.append({
      type: "run.resumed",
      message: input.resumedMessage,
      data: { stageId: input.stageId },
    });
    return { state: next, rejected: false, changesGuidance: null };
  }

  if (resolved.status === "changes_requested") {
    // Resume FORWARD (like approved): the caller re-runs this stage's next
    // turn with the guidance injected. It never re-runs the already-committed
    // turn, so no worktree double-apply. Guidance is redacted before it enters
    // the event log or any prompt.
    let next: RunState = applyTransition(pendingState, input.fromStatus);
    next = {
      ...next,
      pendingApprovalId: null,
      approvalRequestedFromStatus: null,
    };
    await input.stateStore.write(next);
    const safeGuidance = resolved.guidance
      ? redactSecretsInText(resolved.guidance).redacted
      : null;
    await input.eventLog.append({
      type: "approval.changes_requested",
      message: `Approval ${req.id} returned to ${input.roleId} with change guidance.`,
      data: { approvalId: req.id, guidance: safeGuidance },
    });
    return { state: next, rejected: false, changesGuidance: safeGuidance };
  }

  let blockedState: RunState = applyTransition(pendingState, "blocked");
  blockedState = {
    ...blockedState,
    pendingApprovalId: null,
    approvalRequestedFromStatus: null,
  };
  await input.stateStore.write(blockedState);
  await input.eventLog.append({
    type:
      resolved.status === "rejected"
        ? "approval.rejected"
        : "approval.expired",
    message:
      resolved.status === "rejected"
        ? `Approval ${req.id} rejected by ${resolved.resolvedBy ?? "local-user"}.`
        : `Approval ${req.id} expired without a decision.`,
    data: {
      approvalId: req.id,
      decisionNote: resolved.decisionNote ?? null,
    },
  });
  return { state: blockedState, rejected: true, changesGuidance: null };
}

/**
 * If `roleArtifact.output` contains `HUMAN_APPROVAL: REQUIRED`, transition
 * the run to `waiting_for_approval`, persist a pending approval request, and
 * poll until the user resolves it via CLI/API. Returns the new state and
 * whether the run was rejected (caller must transition to `blocked`).
 *
 * If no approval signal is present, returns the input state unchanged.
 */
export async function maybeAwaitApproval(
  deps: ApprovalGateDeps,
  input: {
    state: RunState;
    fromStatus: RunStatus;
    stageId: string;
    stepId?: string | null;
    roleId: string;
    roleArtifact: RoleRunResult | null;
    approvalService: ApprovalService;
    stateStore: RunStateStore;
    eventLog: EventLog;
    /** Tracks which policy stages have already triggered approval this run (mutated). */
    policyStagesAlreadyForced: Set<string>;
  },
): Promise<{ state: RunState; rejected: boolean; changesGuidance: string | null }> {
  const detection = input.roleArtifact
    ? detectApprovalRequest(input.roleArtifact.output)
    : null;
  const policyStages = deps.policies.requireApprovalAtStages;
  const policyForcedThisStage =
    policyStages.includes(input.stageId as (typeof policyStages)[number]) &&
    !input.policyStagesAlreadyForced.has(input.stageId);

  const roleRequested = !!detection?.required;
  if (!roleRequested && !policyForcedThisStage) {
    return { state: input.state, rejected: false, changesGuidance: null };
  }

  // Build approval payload. Prefer agent-provided metadata when present,
  // fall back to policy defaults otherwise. If both apply, we record one
  // approval with source="agent" and alsoRequiredByPolicy=true.
  const fallbackReason = `Project policy requires approval before continuing past the ${input.stageId} stage.`;
  const fallbackRequestedAction = `Approve continuing after ${input.stageId}.`;
  const reason = detection?.reason ?? (policyForcedThisStage ? fallbackReason : null);
  const requestedAction =
    detection?.requestedAction ??
    (policyForcedThisStage
      ? fallbackRequestedAction
      : `Continue past the ${input.stageId} stage.`);
  const riskLevel = detection?.riskLevel ?? "medium";
  const source: "agent" | "policy" = roleRequested ? "agent" : "policy";
  const alsoRequiredByPolicy = roleRequested && policyForcedThisStage;

  if (policyForcedThisStage) {
    input.policyStagesAlreadyForced.add(input.stageId);
  }

  return awaitApprovalRequest(deps, {
    state: input.state,
    fromStatus: input.fromStatus,
    stageId: input.stageId,
    stepId: input.stepId ?? null,
    roleId: input.roleId,
    reason,
    prompt: input.roleArtifact?.promptArtifactPath ?? null,
    sourceArtifactPath: input.roleArtifact?.outputArtifactPath ?? null,
    requestedAction,
    riskLevel,
    source,
    alsoRequiredByPolicy,
    progressMessage: roleRequested
      ? `Pausing for human approval (${input.roleId} requested it)...`
      : `Pausing for human approval (project policy requires approval at ${input.stageId})...`,
    requestedMessage: roleRequested
      ? `Approval requested by ${input.roleId} at stage ${input.stageId}.`
      : `Approval required by project policy at stage ${input.stageId}.`,
    resumedMessage: `Run resumed at stage ${input.stageId}.`,
    approvalService: input.approvalService,
    stateStore: input.stateStore,
    eventLog: input.eventLog,
  });
}

/**
 * Pause the run for a human at a limit (budget ceiling, provider retry
 * exhaustion), reusing the standard approval flow. Returns true if approved
 * (continue), false if rejected (stop/give up). For ATTENDED runs only - the
 * caller must already have checked `!unattended`.
 */
export async function pauseForApproval(
  deps: ApprovalGateDeps,
  input: {
    ctx: { eventLog: EventLog; runId: string; stateStore: RunStateStore };
    stageId: string;
    reason: string;
    requestedAction: string;
    requestedMessage: string;
    resumedMessage: string;
  },
): Promise<boolean> {
  const cur = await input.ctx.stateStore.read();
  if (!cur) return false; // no state to pause on -> treat as reject (stop).
  const res = await awaitApprovalRequest(deps, {
    state: cur,
    fromStatus: cur.status,
    stageId: input.stageId,
    roleId: "budget",
    reason: input.reason,
    prompt: null,
    sourceArtifactPath: null,
    requestedAction: input.requestedAction,
    riskLevel: "medium",
    source: "policy",
    progressMessage: `Pausing: ${input.reason}`,
    requestedMessage: input.requestedMessage,
    resumedMessage: input.resumedMessage,
    approvalService: new ApprovalService(deps.projectRoot, input.ctx.runId),
    stateStore: input.ctx.stateStore,
    eventLog: input.ctx.eventLog,
  });
  // Budget pause is a policy gate with no turn to re-run: "request changes"
  // fails CLOSED (does not resume), same as a reject.
  return !res.rejected && res.changesGuidance == null;
}
