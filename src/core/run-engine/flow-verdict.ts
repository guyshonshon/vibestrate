// The run's terminal verdict: everything between the last step finishing and
// the run reaching merge_ready or blocked.
//
// Three gates decide it, and they are deliberately independent:
//   - computeMergeReady folds the review / validation / verification lanes.
//   - The checklist item cap (Shape B) blocks on per-item gaps regardless of
//     what the main review lane said.
//   - The project block-policy gate is DETERMINISTIC and never touches
//     reviewDecision, so it can cap merge-readiness without clobbering the
//     reviewer's verdict.
//
// The verdict then crosses the Action Broker as a `run.complete` request, which
// can hold it for human sign-off or deny it outright. A non-allow decision can
// never reach merge_ready - it fails closed to blocked.

import {
  applyTransition,
  type RunState,
  type RunStateStore,
  type ReviewDecision,
  type VerificationDecision,
} from "../state-machine.js";
import { computeMergeReady, type ReviewSkipEvidence } from "../run/merge-readiness.js";
import { deriveTerminalCause, type TerminalCause } from "../run/terminal-cause.js";
import {
  interventionNotification,
  proposeIntervention,
  wantsIntervention,
} from "../../supervisor/blocker-intervention.js";
import { checklistItemGapsCap } from "../../safety/run-assurance.js";
import { evaluateBlockPolicies } from "../../supervisor/policy-block.js";
import { evaluateScope, type DeclaredScope } from "../../supervisor/scope-gate.js";
import { getDiffSnapshot } from "../diff-service.js";
import { awaitApprovalRequest, type ApprovalGateDeps } from "./approval-gate.js";
import { getCurrentBranch } from "../../git/git.js";
import { getWorktreeDiffText } from "../diff-service.js";
import { draftRunCompleted, type NotificationDraft } from "../../notifications/notification-router.js";
import { RoadmapService } from "../../roadmap/roadmap-service.js";
import { ApprovalService } from "../run/approval-service.js";
import type { ActionBroker, ActionRequest } from "../../safety/action-broker.js";
import type { ValidationResults } from "../validation/validation-runner.js";
import type { ChecklistItemOutcome } from "../run/item-summary.js";
import type { ProjectConfig } from "../../project/config-schema.js";
import type { ResolvedFlowSnapshot } from "../../flows/schemas/flow-schema.js";
import type { EventLog } from "../stores/event-log.js";
import type { RoleRunResult } from "./types.js";

/** The orchestrator state the verdict reads. Assembled fresh at the call site
 *  so live fields (the broker, the notifier) are the ones run() wired. */
export type FlowVerdictDeps = {
  projectRoot: string;
  readOnly: boolean;
  projectPolicies: ProjectConfig["projectPolicies"];
  taskId: string | null;
  broker: ActionBroker;
  approvalGateDeps: () => ApprovalGateDeps;
  roadmap: RoadmapService;
  notify: (draft: NotificationDraft) => void;
  /** Resolved Supervisor autonomy. "act" lets it carry out a remedy that is
   *  deterministically safe; anything else means propose and stop. */
  supervisorAutonomy?: "advise" | "act";
};

/**
 * Evaluate whether a run's block policies leave it merge-ready.
 *
 * Project-scoped: the policies belong to the project, so this fires under ANY
 * active supervisor, not only one that "owns" them. Only computed for a write
 * run that actually declares block policies. A gate that cannot read the diff
 * blocks CONSERVATIVELY rather than letting an unchecked change through, and
 * says so in an event so it is diagnosable instead of a silent pass.
 */
async function evaluatePolicyBlockGate(input: {
  projectRoot: string;
  worktreePath: string;
  policies: ProjectConfig["projectPolicies"];
  eventLog: EventLog;
}): Promise<boolean> {
  const blockPolicies = (input.policies ?? []).filter(
    (p) => p.tier === "block" && p.confirmedAt != null,
  );
  if (blockPolicies.length === 0) return true;
  try {
    // Scan from the fork point so committed-mid-run changes are caught.
    const baseBranch = await getCurrentBranch(input.projectRoot);
    const diffText = await getWorktreeDiffText({
      worktreePath: input.worktreePath,
      baseBranch,
    });
    const gate = evaluateBlockPolicies(blockPolicies, diffText);
    for (const v of gate.violations) {
      await input.eventLog.append({
        type: "supervisor.policy_block",
        message: `Merge blocked by policy "${v.id}"${v.file ? ` (${v.file})` : ""}: ${v.statement}`,
        data: { policyId: v.id, file: v.file, statement: v.statement },
      });
    }
    for (const inert of gate.inert) {
      await input.eventLog.append({
        type: "supervisor.policy_block",
        message: `Block policy "${inert.id}" is not enforcing: ${inert.reason}`,
        data: { policyId: inert.id, inert: true, reason: inert.reason },
      });
    }
    return gate.clean;
  } catch (err) {
    await input.eventLog.append({
      type: "supervisor.policy_block",
      message: "Block gate could not read the run diff; blocking conservatively.",
      data: {
        policyId: "(diff-read-error)",
        file: null,
        statement: `could not read the diff to check block policies: ${err instanceof Error ? err.message : "unknown error"}`,
      },
    });
    return false;
  }
}

/**
 * Evaluate whether the run stayed inside the path scope its architect declared.
 *
 * Deterministic, like the block-policy gate and for the same reason: a model
 * verdict in the merge path can brick a legitimate merge, a glob caps exactly
 * what it matches. Fail-open on absence - a flow whose architect declared no
 * scope (or that has no architect at all) has nothing to violate, so the gate
 * returns clean and says nothing.
 *
 * A diff it cannot read does NOT block here. The block-policy gate already
 * blocks conservatively on an unreadable diff, so the run is stopped either
 * way; failing this one closed as well would turn a git hiccup into a second,
 * more confusing cap.
 */
async function evaluateScopeGate(input: {
  scope: DeclaredScope | null;
  projectRoot: string;
  worktreePath: string;
  eventLog: EventLog;
}): Promise<boolean> {
  if (!input.scope) return true;
  try {
    // From the fork point, for the reason the block-policy gate above states:
    // a run that commits mid-run is invisible to a HEAD-based diff, and the
    // architect's contract would then report clean over files it forbade.
    const baseBranch = await getCurrentBranch(input.projectRoot);
    const snapshot = await getDiffSnapshot({
      worktreePath: input.worktreePath,
      baseBranch,
    });
    const files = snapshot.files.map((f) => f.path);
    const gate = evaluateScope(input.scope, files);
    if (!gate.declared) return true;
    for (const v of gate.violations) {
      await input.eventLog.append({
        type: "supervisor.scope_block",
        message:
          v.reason === "explicitly-forbidden"
            ? `Merge capped: ${v.file} is outside the architect's scope (matched mayNotEdit ${v.glob}).`
            : `Merge capped: ${v.file} was changed but is not on the architect's may-edit list.`,
        data: { file: v.file, reason: v.reason, glob: v.glob },
      });
    }
    for (const bad of gate.inert) {
      await input.eventLog.append({
        type: "supervisor.scope_block",
        message: `Scope glob "${bad.glob}" is not enforcing: ${bad.reason}`,
        data: { file: null, reason: "inert", glob: bad.glob },
      });
    }
    return gate.clean;
  } catch (err) {
    await input.eventLog.append({
      type: "supervisor.scope_block",
      message: `Scope gate could not read the run diff; not capping on scope: ${err instanceof Error ? err.message : "unknown error"}`,
      data: { file: null, reason: "diff-read-error", glob: null },
    });
    return true;
  }
}

/**
 * Fold the run's decision lanes into a terminal state, take it through the
 * Action Broker, and persist the transition, the completion event and the
 * notification.
 *
 * Returns the advanced state. The caller must adopt it - the finalize block
 * that follows reports on `state.status`.
 */

/**
 * The run's own evidence, read back from the event log, folded into a typed
 * cause. Reading the log rather than threading a dozen flags keeps this honest:
 * the classification is derived from what was actually recorded, so it cannot
 * drift from the audit trail a human would read.
 *
 * Best-effort by design: an unreadable log yields `unknown`, and `unknown` is
 * never auto-remediable. Failing to classify must never fail the run.
 */
async function resolveTerminalCause(
  input: { eventLog: EventLog; lastValidation: ValidationResults | null },
  status: string,
  reviewDecision: string | null,
): Promise<TerminalCause> {
  try {
    const events = await input.eventLog.read();
    return deriveTerminalCause({
      status,
      events,
      validation: input.lastValidation,
      reviewDecision,
    });
  } catch {
    return status === "merge_ready" ? "completed" : "unknown";
  }
}

export async function finalizeFlowVerdict(
  deps: FlowVerdictDeps,
  input: {
    runId: string;
    snapshot: ResolvedFlowSnapshot;
    state: RunState;
    worktreePath: string | null;
    /** Path scope the architecture step declared, if any. Null = nothing
     *  declared, so the scope gate stays silent. */
    declaredScope?: DeclaredScope | null;
    stateStore: RunStateStore;
    eventLog: EventLog;
    approvalService: ApprovalService;
    reviewDecision: ReviewDecision;
    lastValidation: ValidationResults | null;
    verificationArtifact: RoleRunResult | null;
    verificationDecision: VerificationDecision;
    reviewTurnRan: boolean;
    reviewSkipEvidence: ReviewSkipEvidence | null;
    itemOutcomes: ChecklistItemOutcome[];
    needsTestingAdvisory: { reason: string | null } | null;
  },
): Promise<{ state: RunState }> {
  let state = input.state;
  // Read-only runs skip the executor, validation, and verify steps, so no
  // verification decision is produced - an APPROVED review is the bar for
  // merge_ready. A read-only CHANGES_REQUESTED can't be fixed, so record it as
  // BLOCKED for an honest verdict.
  const reviewDecision: ReviewDecision =
    deps.readOnly && input.reviewDecision === "CHANGES_REQUESTED"
      ? "BLOCKED"
      : input.reviewDecision;
  const validationPassed =
    input.lastValidation === null || input.lastValidation.summary.failed === 0;
  // A flow only requires a passing verification if it actually has a verify
  // (summary-turn) step that ran. Minimal flows (e.g. coder + reviewer with no
  // verify) reach merge_ready on an APPROVED review + passing validation.
  const verified = input.verificationArtifact !== null;
  // Read-only runs skip verification entirely, so there's no decision to report
  // - null keeps the report/events honest ("skipped") rather than leaking the
  // NEEDS_HUMAN default as if a verifier had run.
  const finalVerification =
    deps.readOnly || !verified ? null : input.verificationDecision;
  // Per-item checklist items with open findings or changes_requested cap the run
  // from merge_ready regardless of the main review lane. For a non-checklist
  // run, itemOutcomes is empty so caps:false -> no behavior change.
  const itemGaps = checklistItemGapsCap(
    input.itemOutcomes.map((o) => ({
      itemIndex: o.index,
      verdict: (o.reviewVerdict ?? "none") as
        | "approved"
        | "changes_requested"
        | "none",
      openFindingCount: o.openFindingCount ?? 0,
      fixIterations: o.fixIterations ?? 0,
    })),
  );
  const policiesClean =
    !deps.readOnly && input.worktreePath
      ? await evaluatePolicyBlockGate({
          projectRoot: deps.projectRoot,
          worktreePath: input.worktreePath,
          policies: deps.projectPolicies,
          eventLog: input.eventLog,
        })
      : true;
  const scopeClean =
    !deps.readOnly && input.worktreePath
      ? await evaluateScopeGate({
          projectRoot: deps.projectRoot,
          scope: input.declaredScope ?? null,
          worktreePath: input.worktreePath,
          eventLog: input.eventLog,
        })
      : true;

  // Skip evidence satisfies review ONLY when no review turn ran; it never
  // substitutes for validation or verification (merge-readiness.ts).
  const mergeReady = computeMergeReady({
    readOnly: deps.readOnly,
    reviewDecision,
    // A read-only flow with no review step (the spec-up-intake enrichment phase)
    // has nothing to approve - it lands merge_ready on completion, not blocked.
    hasReviewStep: input.snapshot.steps.some((s) => s.kind === "review-turn"),
    reviewTurnRan: input.reviewTurnRan,
    reviewSkipEvidence: input.reviewSkipEvidence,
    validationPassed,
    verified,
    verificationDecision: input.verificationDecision,
    checklistItemsClean: !itemGaps.caps,
    policiesClean,
    scopeClean,
  });
  const reviewSatisfiedByEvidence =
    !input.reviewTurnRan &&
    input.reviewSkipEvidence !== null &&
    !deps.readOnly;

  // ── Action Broker boundary: run.complete ─────────────────────
  // The run's terminal verdict crosses the broker. A non-allow decision cannot
  // reach merge_ready - it downgrades to blocked (fail-closed). The verdict +
  // evidence anchor the Run Assurance artifact.
  const completeReq: ActionRequest = {
    runId: input.runId,
    kind: "run.complete",
    subject: {
      status: mergeReady ? "merge_ready" : "blocked",
      // A skip-evidence run reports its decision honestly as null (no reviewer
      // spoke) - the skip evidence rides alongside, never as a fake APPROVED.
      decision: reviewSatisfiedByEvidence ? null : reviewDecision,
      reviewSkipped: reviewSatisfiedByEvidence,
      verification: finalVerification,
      validationPassed,
    },
    proposedBy: "system",
  };
  const completeDecision = await deps.broker.decide(completeReq);
  let effectiveMergeReady = mergeReady;
  // `accept-edits` (and any require_approval run.complete policy) HOLDS a run
  // that earned merge_ready for human sign-off, then RESUMES to merge_ready on
  // approval (reject / unattended-expire -> blocked). awaitApprovalRequest
  // already transitions to blocked on reject, so the terminal transition below
  // is guarded to avoid a blocked->blocked double-transition.
  let completionApprovalRejected = false;
  if (completeDecision.effect === "require_approval" && mergeReady) {
    const reason =
      "reason" in completeDecision ? completeDecision.reason : "policy";
    const held = await awaitApprovalRequest(deps.approvalGateDeps(), {
      state,
      fromStatus: state.status,
      stageId: "run.complete",
      roleId: "supervisor",
      reason,
      prompt: null,
      sourceArtifactPath: null,
      requestedAction: "run.complete",
      riskLevel: "medium",
      source: "policy",
      alsoRequiredByPolicy: true,
      progressMessage: "Pausing for human sign-off before completing the run...",
      requestedMessage: "Run completion is held for your review (permission mode).",
      resumedMessage: "Approved - completing the run.",
      approvalService: input.approvalService,
      stateStore: input.stateStore,
      eventLog: input.eventLog,
    });
    state = held.state;
    // The final sign-off has no turn to re-run: a human "request changes" here
    // fails CLOSED (does not complete merge_ready), same as a reject.
    const heldBlocked = held.rejected || held.changesGuidance != null;
    completionApprovalRejected = heldBlocked;
    effectiveMergeReady = !heldBlocked;
  } else if (completeDecision.effect !== "allow") {
    // deny, or require_approval on a run that DIDN'T earn merge_ready anyway.
    effectiveMergeReady = false;
    const reason =
      "reason" in completeDecision ? completeDecision.reason : "policy";
    await input.eventLog.append({
      type:
        completeDecision.effect === "deny"
          ? "action.denied"
          : "action.approval_required",
      message: `Action broker ${completeDecision.effect} run.complete for ${input.runId}: ${reason}`,
      data: {
        kind: "run.complete",
        effect: completeDecision.effect,
        ruleIds: completeDecision.ruleIds,
        reason,
      },
    });
  }

  state = {
    ...state,
    // No reviewer spoke on a skip-evidence run - finalDecision stays null
    // (assurance reports `skipped_inert_diff` from state.reviewSkipped).
    finalDecision: reviewSatisfiedByEvidence ? null : reviewDecision,
    verification: finalVerification,
    needsTesting: input.needsTestingAdvisory,
  };
  await input.stateStore.write(state);
  // Skip the terminal transition when the completion-approval already moved the
  // run to a terminal `blocked` (else blocked->blocked is illegal).
  if (!completionApprovalRejected) {
    state = applyTransition(state, effectiveMergeReady ? "merge_ready" : "blocked");
    state = { ...state, terminalCause: await resolveTerminalCause(input, state.status, reviewDecision) };
    await input.stateStore.write(state);
  } else {
    // The completion approval already moved this to a terminal blocked, so the
    // transition above is skipped - but the cause still has to be recorded, or
    // exactly the runs a supervisor most needs to reason about arrive with none.
    state = { ...state, terminalCause: await resolveTerminalCause(input, state.status, reviewDecision) };
    await input.stateStore.write(state);
  }
  // Propagate a needs-testing advisory to the linked card (best-effort,
  // non-blocking). The run keeps its real verdict; the card is flagged so a
  // human can pass it or send it back.
  if (input.needsTestingAdvisory && deps.taskId) {
    await deps.roadmap
      .flagNeedsTesting(deps.taskId, input.needsTestingAdvisory.reason)
      .catch(() => {});
  }
  await deps.broker.record(completeReq, completeDecision, {
    ok: effectiveMergeReady,
    summary: `run ${input.runId} ${state.status}`,
    data: { decision: reviewDecision, validationPassed },
  });
  await input.eventLog.append({
    type: "run.completed",
    message: `Flow run ${input.runId} ${state.status}.`,
    data: {
      flowId: input.snapshot.flowId,
      decision: reviewSatisfiedByEvidence ? null : reviewDecision,
      reviewSkipped: reviewSatisfiedByEvidence,
      verification: finalVerification,
      validationPassed,
    },
  });
  deps.notify(
    draftRunCompleted({
      runId: input.runId,
      taskId: deps.taskId,
      status: state.status as "merge_ready" | "blocked",
      decision: reviewDecision,
      verification: finalVerification,
    }),
  );

  // ── Supervisor: a run that did not complete gets an intervention ──────────
  // Raised for EVERY non-completed cause, including the ones the Supervisor
  // refuses to act on - a silent refusal is how a stuck delivery ends up
  // looking like a finished one. The proposal is a lookup over the typed
  // cause; nothing here asks a model what it thinks went wrong.
  if (wantsIntervention(state.terminalCause)) {
    const intervention = proposeIntervention(state.terminalCause!);
    const autonomy = deps.supervisorAutonomy ?? "advise";
    await input.eventLog.append({
      type: "supervisor.intervention",
      message: `Supervisor intervention (${intervention.cause}): ${intervention.summary}`,
      data: {
        cause: intervention.cause,
        kind: intervention.kind,
        autoExecutable: intervention.autoExecutable,
        autonomy,
        willAct: autonomy === "act" && intervention.autoExecutable,
      },
    });
    deps.notify(
      interventionNotification({
        intervention,
        runId: input.runId,
        taskId: deps.taskId,
        autonomy,
      }),
    );
  }

  return { state };
}
