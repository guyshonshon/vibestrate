import {
  applyTransition,
  type RunState,
  type RunStateStore,
} from "../state-machine.js";
import type {
  ResolvedFlowSnapshot,
  ResolvedFlowStep,
} from "../../flows/schemas/flow-schema.js";
import {
  summarizeFlowParticipants,
  type FlowParticipantLedger,
} from "../../flows/runtime/flow-participant-ledger.js";
import type { RunStatus } from "../workflow/workflow-types.js";
import { nowIso } from "../../utils/time.js";

export function createFlowRunState(
  snapshot: ResolvedFlowSnapshot,
  snapshotPath: string,
): NonNullable<RunState["flow"]> {
  return {
    flowId: snapshot.flowId,
    flowVersion: snapshot.flowVersion,
    label: snapshot.label,
    snapshotPath,
    participantLedgerPath: "participants.json",
    participants: [],
    currentStepId: null,
    steps: snapshot.steps.map((step) => ({
      id: step.id,
      label: step.label,
      kind: step.kind,
      status: step.enabled ? "pending" : "skipped",
      optional: step.optional,
      stage: step.stage,
      seat: step.seat,
      needs: step.needs,
      resolvedRoleId: step.resolvedRoleId,
      resolvedRoleLabel: step.resolvedRoleLabel,
      profileId: step.profileId,
      providerId: step.providerId,
      promptArtifactPath: null,
      outputArtifactPath: null,
      contextPacketPath: null,
      validationArtifactPath: null,
      startedAt: null,
      endedAt: null,
      error: null,
    })),
  };
}

export function patchFlowStep(
  state: RunState,
  stepId: string,
  patch: Partial<NonNullable<RunState["flow"]>["steps"][number]>,
  currentStepId = state.flow?.currentStepId ?? null,
): RunState {
  if (!state.flow) {
    throw new Error("Cannot update a flow step before flow state is initialized.");
  }
  return {
    ...state,
    updatedAt: nowIso(),
    flow: {
      ...state.flow,
      currentStepId,
      steps: state.flow.steps.map((step) =>
        step.id === stepId ? { ...step, ...patch } : step,
      ),
    },
  };
}

export function patchFlowParticipants(
  state: RunState,
  ledger: FlowParticipantLedger,
): RunState {
  if (!state.flow) {
    throw new Error("Cannot update flow participants before flow state is initialized.");
  }
  return {
    ...state,
    updatedAt: nowIso(),
    flow: {
      ...state.flow,
      participantLedgerPath: "participants.json",
      participants: summarizeFlowParticipants(ledger),
    },
  };
}

export function flowStatusForStep(step: ResolvedFlowStep): RunStatus {
  switch (step.kind) {
    case "review-turn":
      return "reviewing";
    case "response-turn":
      return "fixing";
    case "validation":
      return "validating";
    case "summary-turn":
      return "verifying";
    case "approval-gate":
      return "waiting_for_approval";
    case "agent-turn":
    default:
      // Prefer the declared stage (planning/architecting/executing) so the
      // run status and policy-approval matching are accurate (e.g. architect
      // → "architecting"). Falls back to the planner/other heuristic.
      if (
        step.stage === "planning" ||
        step.stage === "architecting" ||
        step.stage === "executing"
      ) {
        return step.stage;
      }
      return step.resolvedRoleId === "planner" ? "planning" : "executing";
  }
}

export async function moveToFlowStepStatus(input: {
  state: RunState;
  step: ResolvedFlowStep;
  stateStore: RunStateStore;
}): Promise<RunState> {
  const target = flowStatusForStep(input.step);
  if (target === "waiting_for_approval" || input.state.status === target) {
    return input.state;
  }
  const next = applyTransition(input.state, target);
  await input.stateStore.write(next);
  return next;
}
