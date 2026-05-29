import path from "node:path";
import { ArtifactStore } from "./artifact-store.js";
import { EventLog } from "./event-log.js";
import {
  RunStateStore,
  applyTransition,
  createInitialState,
  type RunState,
  type ReviewDecision,
  type VerificationDecision,
} from "./state-machine.js";
import {
  effectiveReviewDecision,
  effectiveVerificationDecision,
} from "./review-parser.js";
import { runValidationCommands, type ValidationResults } from "./validation-runner.js";
import { buildRolePrompt, type PriorArtifact } from "./prompt-builder.js";
import {
  listAnnotations,
  renderAnnotationsForPrompt,
} from "./annotations-service.js";
import {
  listControls,
  markPendingConsumed,
  pendingControls,
  renderControlNotes,
} from "./run-control.js";
import { renderFinalReport } from "./final-report.js";
import { runPreflightChecks, type PolicyWarning } from "./policy-engine.js";
import type { ProjectConfig } from "../project/config-schema.js";
import { loadRolePrompt } from "../project/config-loader.js";
import { getCrew, getCrewRole, roleLabel } from "../crews/crew-registry.js";
import { resolveProfile } from "../permissions/permission-profiles.js";
import { assertExecutableContext, resolveCwd } from "../permissions/access-policy.js";
import { loadSkills } from "../skills/skill-loader.js";
import { resolveMcpServers } from "../mcp/mcp-resolve.js";
import { writeMcpConfigFile } from "../mcp/mcp-config-writer.js";
import { runProvider, type RichProviderRunResult } from "../providers/provider-runner.js";
import { selectOutputAdapter } from "../providers/adapters/select.js";
import { estimateTokensFromText, resolveCost } from "./pricing.js";
import {
  computeDailySpendUsd,
  evaluateSpendCap,
} from "./spend-cap-service.js";
import { providerCapabilities } from "../providers/provider-capabilities.js";
import {
  appendStreamLine,
  ensureStreamsDir,
} from "./provider-stream-store.js";
import { localWorktreeBackend } from "../execution/local-worktree-backend.js";
import { isGitAvailable } from "../git/git.js";
import { GitError, VibestrateError, describeError } from "../utils/errors.js";
import { formatRunIdTimestamp, nowIso, durationMs } from "../utils/time.js";
import { slugify } from "../utils/slug.js";
import type {
  ProviderRunResult,
  ProviderSessionRequest,
} from "../providers/provider-types.js";
import { MetricsStore } from "./metrics-store.js";
import { makeEmptyMetrics, type RoleMetrics } from "./runtime-metrics.js";
import { getDiffSnapshot } from "./diff-service.js";
import { ApprovalService } from "./approval-service.js";
import {
  detectApprovalRequest,
  type ApprovalRisk,
  type ApprovalSource,
} from "./approval-types.js";
import { NotificationService } from "../notifications/notification-service.js";
import {
  draftApprovalRequested,
  draftRunCompleted,
  draftValidationFailed,
} from "../notifications/notification-router.js";
import type { NotificationDraft } from "../notifications/notification-router.js";
import type { RunStatus } from "../workflow/workflow-types.js";
import { ReviewSuggestionService } from "../reviews/review-suggestion-service.js";
import type { SuggestionSource } from "../reviews/review-suggestion-types.js";
import { applyPauseIfRequested } from "./pause-service.js";
import { isTerminal } from "./state-machine.js";
import { writeJson } from "../utils/json.js";
import { runFlowSnapshotPath } from "../utils/paths.js";
import type {
  ResolvedFlowSnapshot,
  ResolvedFlowStep,
} from "../flows/schemas/flow-schema.js";
import { defaultFlow } from "../flows/catalog/builtin-flows.js";
import { findFlowById } from "../flows/catalog/flow-discovery.js";
import { resolveFlow } from "../flows/runtime/flow-resolver.js";
import {
  buildFlowContextPacket as buildFlowContextPacketValue,
  type FlowContextOutput,
} from "../flows/runtime/flow-context-builder.js";
import {
  FlowParticipantLedgerStore,
  createFlowParticipantLedger,
  prepareFlowParticipantTurn,
  recordFlowParticipantTurn,
  summarizeFlowParticipants,
  type FlowParticipantLedger,
  type PreparedFlowParticipantTurn,
} from "../flows/runtime/flow-participant-ledger.js";
import {
  FlowArbitrationStore,
  createFlowArbitrationLedger,
  formatFlowFindingSuggestionBody,
  flowAcceptedFindingResponses,
  flowArbitrationCanonicalFindings,
  flowArbitrationCanonicalResolutions,
  flowArbitrationCanonicalResponses,
  parseFlowJsonContract,
  recordFlowArbitrationParseIssue,
  recordFlowDecision,
  recordFlowFindingResolutions,
  recordFlowFindingResponses,
  recordFlowFindings,
  renderFlowDecisionSummaryMarkdown,
  renderFlowOutputContractNotes,
  setFlowAcceptedReviewPassId,
  setFlowDecisionSummaryPath,
  setFlowFindingSuggestionId,
  type FlowArbitrationLedger,
} from "../flows/runtime/flow-arbitration.js";
import {
  flowDecisionSummaryOutputSchema,
  flowFindingResolutionsOutputSchema,
  flowFindingResponsesOutputSchema,
  flowFindingsOutputSchema,
} from "../flows/schemas/flow-output-contracts.js";
import { SuggestionBundleService } from "../reviews/suggestion-bundle-service.js";

/** Stages a run can be rewound to. The flow runner seeds the outputs of every
 *  step before the first step at this stage from the source run, then starts
 *  there. `planning` is the flow's first stage, so resuming there is just a
 *  normal from-scratch run. review/verify aren't resumable: they need the
 *  executor's code present (a per-step worktree snapshot we don't capture yet),
 *  and the executing stages regenerate the downstream code from a fresh
 *  worktree off main. */
export type ResumeStage = "planning" | "architecting" | "executing";

export type ResumeFromInput = {
  /** The run whose upstream step outputs are reused (seeded) by the runner. */
  sourceRunId: string;
  fromStage: ResumeStage;
};

export type OrchestratorInput = {
  projectRoot: string;
  config: ProjectConfig;
  rules: string;
  task: string;
  isGitRepo: boolean;
  onProgress?: (message: string) => void;
  /** Optional roadmap task this run is bound to. Persisted on state.json + events. */
  taskId?: string | null;
  /** Task-difficulty hint carried from the roadmap. Recorded for audit; it no
   * longer maps to a provider (Profiles own runtime now). */
  effort?: "low" | "medium" | "high" | null;
  /** Crew to resolve the flow against. null = project.defaultCrew. Ignored when
   * an already-resolved `flow` snapshot is supplied (it carries its own crew). */
  crewId?: string | null;
  /** Run-wide Profile override applied to every seated step at resolve time. */
  profileOverride?: string | null;
  /** Per-step Profile overrides (step id → profile id) applied at resolve time. */
  stepProfileOverrides?: Record<string, string>;
  /** Pin a Role to a Seat (seat → roleId) — disambiguates a seat filled by
   *  more than one Crew role. Applied at resolve time. */
  seatRoleOverrides?: Record<string, string>;
  /** Investigation-only run: force readOnly permissions on every agent,
   * skip the executor / fix loop entirely, refuse write-side actions. */
  readOnly?: boolean;
  /** Skill ids to attach to every agent for this single run, merged
   * (deduped) with the agent's configured skill list. Empty / omitted
   * means "use the agent's configured skills only". */
  runtimeSkills?: string[];
  /** Brevity directive applied to every agent prompt for this run. */
  concise?: boolean;
  /** Immutable resolved flow recipe to run. When omitted, the orchestrator
   * resolves the built-in `default` flow — every run executes a flow through
   * the one runner. */
  flow?: ResolvedFlowSnapshot | null;
  /** Rewind: fork a fresh run that resumes at a chosen stage, reusing the
   *  upstream artifacts from a prior run instead of regenerating them.
   *  Mutually exclusive with `flow`. */
  resumeFrom?: ResumeFromInput | null;
  /** CLI/process lifecycle signal. Aborting it kills the active provider
   * invocation and records the run as aborted instead of leaving orphan CLIs. */
  abortSignal?: AbortSignal;
};

export type OrchestratorOutput = {
  runId: string;
  state: RunState;
  worktreePath: string | null;
  branchName: string | null;
  finalReportPath: string;
  policyWarnings: PolicyWarning[];
};

type RoleRunResult = {
  roleId: string;
  output: string;
  outputArtifactPath: string;
  promptArtifactPath: string;
  providerResult: ProviderRunResult;
};

type FlowRoleTurn = {
  seat: string;
  contextMode: PreparedFlowParticipantTurn["contextMode"];
  fallbackReason: string | null;
  sessionRequest?: ProviderSessionRequest;
};

export function makeRunId(task: string): string {
  return `${formatRunIdTimestamp()}-${slugify(task)}`;
}

class __ApprovalRejectedSignal extends Error {
  constructor() {
    super("Run blocked after approval rejected");
    this.name = "ApprovalRejectedSignal";
  }
}

class __RunAbortedSignal extends Error {
  constructor() {
    super("Run aborted by user signal");
    this.name = "RunAbortedSignal";
  }
}

/** Thrown when the daily spend cap is hit and the action is (or falls back to)
 *  "stop" — the run() loop catches it and blocks the run with this message. */
class __SpendCapStopSignal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpendCapStopSignal";
  }
}

function summarizeApprovals(
  approvals: import("./approval-types.js").ApprovalRequest[],
): {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  expired: number;
  totalWaitMs: number;
} {
  let pending = 0;
  let approved = 0;
  let rejected = 0;
  let expired = 0;
  let totalWaitMs = 0;
  for (const a of approvals) {
    switch (a.status) {
      case "pending":
        pending += 1;
        break;
      case "approved":
        approved += 1;
        break;
      case "rejected":
        rejected += 1;
        break;
      case "expired":
        expired += 1;
        break;
    }
    if (a.resolvedAt) {
      totalWaitMs +=
        Date.parse(a.resolvedAt) - Date.parse(a.createdAt) || 0;
    }
  }
  return {
    total: approvals.length,
    pending,
    approved,
    rejected,
    expired,
    totalWaitMs,
  };
}

function flowFindingSuggestionTitle(
  finding: import("../flows/schemas/flow-output-contracts.js").FlowFinding,
): string {
  const prefix = `Quality Arbitration ${finding.id}: `;
  const claim = finding.claim.replace(/\s+/g, " ").trim();
  return `${prefix}${claim}`.slice(0, 200);
}

export class Orchestrator {
  private readonly projectRoot: string;
  private readonly config: ProjectConfig;
  private readonly rules: string;
  private readonly task: string;
  private readonly isGitRepo: boolean;
  private readonly onProgress: (message: string) => void;
  private readonly taskId: string | null;
  private readonly effort: "low" | "medium" | "high" | null;
  private readonly crewId: string | null;
  private readonly profileOverride: string | null;
  private readonly stepProfileOverrides: Record<string, string>;
  private readonly seatRoleOverrides: Record<string, string>;
  /** Crew the active flow snapshot was resolved against; set in run(). Used by
   *  runRole to look up the resolved Role's config (prompt/permissions/skills). */
  private activeCrewId: string | null = null;
  /** One-time guard so the spend warning fires once per run, not every turn. */
  private spendWarned = false;
  private readonly readOnly: boolean;
  private readonly runtimeSkills: string[];
  private readonly concise: boolean;
  private readonly flow: ResolvedFlowSnapshot | null;
  private readonly resumeFrom: ResumeFromInput | null;
  private readonly abortSignal: AbortSignal | null;

  constructor(input: OrchestratorInput) {
    this.projectRoot = input.projectRoot;
    this.config = input.config;
    this.rules = input.rules;
    this.task = input.task;
    this.isGitRepo = input.isGitRepo;
    this.onProgress = input.onProgress ?? (() => {});
    this.taskId = input.taskId ?? null;
    this.effort = input.effort ?? null;
    this.crewId = input.crewId ?? null;
    this.profileOverride = input.profileOverride ?? null;
    this.stepProfileOverrides = input.stepProfileOverrides ?? {};
    this.seatRoleOverrides = input.seatRoleOverrides ?? {};
    this.readOnly = input.readOnly ?? false;
    this.runtimeSkills = Array.from(new Set(input.runtimeSkills ?? []));
    this.concise = input.concise ?? false;
    this.flow = input.flow ?? null;
    this.resumeFrom = input.resumeFrom ?? null;
    this.abortSignal = input.abortSignal ?? null;
  }

  /** Resolve the `default` flow against this run's config. Used when a run
   *  doesn't pick an explicit flow — a plain `vibe run` executes the default
   *  flow through the same runner as every other flow. A project may fork + edit
   *  the default (`.vibestrate/flows/default`); that shadows the builtin here too, so
   *  editing the default actually takes effect for plain runs. Falls back to the
   *  builtin. Throws if the configured roles/providers can't satisfy it. */
  private async resolveDefaultFlow(): Promise<ResolvedFlowSnapshot> {
    const discovered = await findFlowById(this.projectRoot, defaultFlow.id);
    return resolveFlow({
      flow: discovered?.definition ?? defaultFlow,
      source: discovered?.source ?? { kind: "builtin", ref: defaultFlow.id },
      config: this.config,
      task: this.task,
      crewId: this.crewId,
      profileOverride: this.profileOverride,
      stepProfileOverrides: this.stepProfileOverrides,
      seatRoleOverrides: this.seatRoleOverrides,
    });
  }

  async run(): Promise<OrchestratorOutput> {
    if (!(await isGitAvailable())) {
      throw new GitError("git is not available on PATH.");
    }

    const policy = await runPreflightChecks({
      projectRoot: this.projectRoot,
      config: this.config,
      isGitRepo: this.isGitRepo,
    });

    // Every run executes a flow. An explicit `--flow` snapshot wins; otherwise
    // the `default` flow is resolved here. There is one runner.
    const flow = this.flow ?? (await this.resolveDefaultFlow());
    // runRole resolves the Role's config from the Crew the snapshot was built
    // against — not necessarily this.crewId (a pre-resolved snapshot carries its
    // own crew).
    this.activeCrewId = flow.crewId;

    const runId = makeRunId(this.task);

    const artifactStore = new ArtifactStore(this.projectRoot, runId);
    const stateStore = new RunStateStore(this.projectRoot, runId);
    const eventLog = new EventLog(this.projectRoot, runId);
    const metricsStore = new MetricsStore(this.projectRoot, runId);
    const approvalService = new ApprovalService(this.projectRoot, runId);
    const notifications = new NotificationService(this.projectRoot);
    const notify = (draft: NotificationDraft): void => {
      // Fire-and-forget: gateway delivery never blocks the orchestrator and
      // never bubbles errors. Failed delivery is recorded as a receipt.
      void notifications.notify(draft).catch(() => {});
    };
    // Stash for private methods (maybeAwaitApproval, etc.) so they can fire
    // notifications without the call sites threading the closure through.
    (this as unknown as { _notify?: typeof notify })._notify = notify;
    await artifactStore.init();
    await metricsStore.write(
      makeEmptyMetrics({
        runId,
        task: this.task,
        startedAt: nowIso(),
      }),
    );

    let state = createInitialState({
      runId,
      task: this.task,
      projectRoot: this.projectRoot,
      worktreePath: null,
      branchName: null,
      maxReviewLoops: this.config.workflow.maxReviewLoops,
    });
    // Persist the run-level Crew/Profile choices. The exact per-step
    // profile/provider resolution lives in flow.json (the immutable snapshot).
    // Read-only runs are stamped too — every subsequent enforcement (route
    // guards, executor short-circuit) reads from state.readOnly.
    state = {
      ...state,
      taskId: this.taskId,
      effort: this.effort,
      crewId: flow.crewId,
      profileOverride: this.profileOverride,
      stepProfileOverrides: this.stepProfileOverrides,
      seatRoleOverrides: this.seatRoleOverrides,
      runtimeSkills: this.runtimeSkills,
      concise: this.concise,
      readOnly: this.readOnly,
      flow: this.createFlowRunState(flow, "flow.json"),
      resumedFrom: this.resumeFrom
        ? {
            sourceRunId: this.resumeFrom.sourceRunId,
            fromStage: this.resumeFrom.fromStage,
          }
        : null,
    };
    await writeJson(runFlowSnapshotPath(this.projectRoot, runId), flow);
    await stateStore.write(state);
    await eventLog.append({
      type: "run.created",
      message: `Run ${runId} created.`,
      data: {
        task: this.task,
        taskId: this.taskId,
        effort: this.effort,
        crewId: flow.crewId,
        profileOverride: this.profileOverride,
        stepProfileOverrides: this.stepProfileOverrides,
        readOnly: this.readOnly,
      },
    });
    await eventLog.append({
      type: "flow.snapshot.written",
      message: `Resolved flow ${flow.flowId} snapshot persisted.`,
      data: {
        flowId: flow.flowId,
        flowVersion: flow.flowVersion,
        snapshotPath: "flow.json",
      },
    });
    if (this.readOnly) {
      await eventLog.append({
        type: "policy.warning",
        message:
          "Read-only run: write, validation, and verify steps are skipped. Every role is forced to the read-only permission profile. Apply/validate/revert routes are refused.",
        data: { kind: "read-only-run" },
      });
    }

    for (const w of policy.warnings) {
      await eventLog.append({
        type: "policy.warning",
        message: w.message,
        data: { code: w.code },
      });
    }

    await artifactStore.write("00-idea.md", `# Task\n\n${this.task}\n`);

    let worktreePath: string | null = null;
    let branchName: string | null = null;

    try {
      const prep = await localWorktreeBackend.prepareRun({
        projectRoot: this.projectRoot,
        runId,
        branchPrefix: this.config.git.branchPrefix,
        worktreeDir: this.config.git.worktreeDir,
        mainBranch: this.config.git.mainBranch,
      });
      worktreePath = prep.worktreePath;
      branchName = prep.branchName;
      state = { ...state, worktreePath, branchName, updatedAt: nowIso() };
      await stateStore.write(state);
      await eventLog.append({
        type: "git.worktree.created",
        message: `Worktree ${prep.worktreePath} on branch ${prep.branchName}.`,
        data: { worktreePath: prep.worktreePath, branchName: prep.branchName },
      });
    } catch (err) {
      state = applyTransition(state, "failed");
      state = { ...state, error: describeError(err) };
      await stateStore.write(state);
      await eventLog.append({
        type: "run.failed",
        message: `Failed to prepare worktree: ${describeError(err)}`,
      });
      throw err;
    }

    const ctx = {
      runId,
      worktreePath,
      branchName,
      artifactStore,
      eventLog,
      stateStore,
      onProgress: this.onProgress,
    };

    // One runner for every run. Stages that already triggered a policy approval
    // this run are tracked so the same stage re-running (e.g. review inside the
    // fix loop) doesn't re-prompt.
    const policyStagesAlreadyForced = new Set<string>();

    return this.runFlowSequence({
      snapshot: flow,
      runId,
      state,
      worktreePath,
      branchName,
      artifactStore,
      stateStore,
      eventLog,
      metricsStore,
      approvalService,
      notify,
      policyWarnings: policy.warnings,
      policyStagesAlreadyForced,
      ctx,
    });
  }

  private createFlowRunState(
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

  private patchFlowStep(
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

  private patchFlowParticipants(
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

  private flowStatusForStep(step: ResolvedFlowStep): RunStatus {
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

  private async moveToFlowStepStatus(input: {
    state: RunState;
    step: ResolvedFlowStep;
    stateStore: RunStateStore;
  }): Promise<RunState> {
    const target = this.flowStatusForStep(input.step);
    if (target === "waiting_for_approval" || input.state.status === target) {
      return input.state;
    }
    const next = applyTransition(input.state, target);
    await input.stateStore.write(next);
    return next;
  }

  private renderFlowStepNotes(input: {
    snapshot: ResolvedFlowSnapshot;
    step: ResolvedFlowStep;
  }): string {
    const brief = input.snapshot.brief
      ? `Run brief:\n${input.snapshot.brief.trim()}\n\n`
      : "";
    const outputs =
      input.step.outputs.length > 0
        ? input.step.outputs.map((token) => `- ${token}`).join("\n")
        : "- No named outputs declared.";
    const contractNotes = renderFlowOutputContractNotes(input.step);
    return [
      `Flow: ${input.snapshot.label} (${input.snapshot.flowId} v${input.snapshot.flowVersion})`,
      `Flow step: ${input.step.label} (${input.step.id})`,
      `Flow step kind: ${input.step.kind}`,
      `Context policy: ${input.snapshot.contextPolicy}`,
      "",
      brief.trimEnd(),
      "",
      "Only this step should be completed now. Use the named prior artifacts as the handoff packet.",
      "Expected named outputs:",
      outputs,
      "",
      contractNotes,
    ]
      .filter((line, index, all) => line !== "" || all[index - 1] !== "")
      .join("\n");
  }

  private async buildFlowContextPacket(input: {
    snapshot: ResolvedFlowSnapshot;
    step: ResolvedFlowStep;
    outputs: Map<string, FlowContextOutput>;
    artifactStore: ArtifactStore;
    contextMode: PreparedFlowParticipantTurn["contextMode"];
  }): Promise<{
    priorArtifacts: PriorArtifact[];
    contextPacketPath: string;
    budget: ReturnType<typeof buildFlowContextPacketValue>["packet"]["budget"];
  }> {
    const built = buildFlowContextPacketValue({
      snapshot: input.snapshot,
      step: input.step,
      outputs: input.outputs,
      contextMode: input.contextMode,
      generatedAt: nowIso(),
    });
    const absPath = await input.artifactStore.writeJson(
      path.posix.join("flows", input.step.id, "context-packet.json"),
      built.packet,
    );
    return {
      priorArtifacts: built.priorArtifacts,
      contextPacketPath: input.artifactStore.relPath(absPath),
      budget: built.packet.budget,
    };
  }

  private async registerFlowRoleOutputs(input: {
    step: ResolvedFlowStep;
    result: RoleRunResult;
    outputs: Map<string, FlowContextOutput>;
    artifactStore: ArtifactStore;
    worktreePath: string | null;
  }): Promise<void> {
    for (const token of input.step.outputs) {
      if (token === "diff") {
        if (!input.worktreePath) continue;
        const snapshot = await getDiffSnapshot({
          worktreePath: input.worktreePath,
        });
        const absPath = await input.artifactStore.writeJson(
          path.posix.join("flows", input.step.id, "diff-snapshot.json"),
          snapshot,
        );
        input.outputs.set(token, {
          token,
          label: `${input.step.label}: ${token}`,
          content: `${JSON.stringify(snapshot, null, 2)}\n`,
          artifactPath: input.artifactStore.relPath(absPath),
        });
        continue;
      }
      input.outputs.set(token, {
        token,
        label: `${input.step.label}: ${token}`,
        content: input.result.output,
        artifactPath: input.result.outputArtifactPath,
      });
    }
  }

  private registerFlowValidationOutputs(input: {
    step: ResolvedFlowStep;
    validation: ValidationResults;
    validationArtifactPath: string;
    outputs: Map<string, FlowContextOutput>;
  }): void {
    for (const token of input.step.outputs) {
      input.outputs.set(token, {
        token,
        label: `${input.step.label}: ${token}`,
        content: `${JSON.stringify(input.validation, null, 2)}\n`,
        artifactPath: input.validationArtifactPath,
      });
    }
  }

  private async recordFlowArbitrationOutputs(input: {
    step: ResolvedFlowStep;
    result: RoleRunResult;
    outputs: Map<string, FlowContextOutput>;
    validation: ValidationResults | null;
    artifactStore: ArtifactStore;
    eventLog: EventLog;
    ledger: FlowArbitrationLedger;
    store: FlowArbitrationStore;
  }): Promise<FlowArbitrationLedger> {
    let ledger = input.ledger;
    let findingsChanged = false;

    if (input.step.outputs.includes("findings")) {
      const parsed = parseFlowJsonContract({
        text: input.result.output,
        schema: flowFindingsOutputSchema,
        expectedStepId: input.step.id,
      });
      if (parsed.ok) {
        ledger = recordFlowFindings({
          ledger,
          output: parsed.output,
          sourceArtifactPath: input.result.outputArtifactPath,
        });
        const absPath = await input.artifactStore.writeJson(
          path.posix.join("flows", "findings.json"),
          flowArbitrationCanonicalFindings(ledger, input.step.id),
        );
        input.outputs.set("findings", {
          token: "findings",
          label: "Flow Findings",
          content: `${JSON.stringify(
            flowArbitrationCanonicalFindings(ledger, input.step.id),
            null,
            2,
          )}\n`,
          artifactPath: input.artifactStore.relPath(absPath),
        });
        findingsChanged = true;
      } else {
        ledger = recordFlowArbitrationParseIssue({
          ledger,
          stepId: input.step.id,
          outputToken: "findings",
          sourceArtifactPath: input.result.outputArtifactPath,
          message: parsed.message,
        });
      }
    }

    if (input.step.outputs.includes("finding-responses")) {
      const parsed = parseFlowJsonContract({
        text: input.result.output,
        schema: flowFindingResponsesOutputSchema,
        expectedStepId: input.step.id,
      });
      if (parsed.ok) {
        ledger = recordFlowFindingResponses({
          ledger,
          output: parsed.output,
          sourceArtifactPath: input.result.outputArtifactPath,
        });
        ledger = await this.feedFlowAcceptedFindings(ledger);
        const canonical = flowArbitrationCanonicalResponses(
          ledger,
          input.step.id,
        );
        const absPath = await input.artifactStore.writeJson(
          path.posix.join("flows", "finding-responses.json"),
          canonical,
        );
        input.outputs.set("finding-responses", {
          token: "finding-responses",
          label: "Flow Finding Responses",
          content: `${JSON.stringify(canonical, null, 2)}\n`,
          artifactPath: input.artifactStore.relPath(absPath),
        });
        findingsChanged = true;
      } else {
        ledger = recordFlowArbitrationParseIssue({
          ledger,
          stepId: input.step.id,
          outputToken: "finding-responses",
          sourceArtifactPath: input.result.outputArtifactPath,
          message: parsed.message,
        });
      }
    }

    if (input.step.outputs.includes("finding-resolutions")) {
      const parsed = parseFlowJsonContract({
        text: input.result.output,
        schema: flowFindingResolutionsOutputSchema,
        expectedStepId: input.step.id,
      });
      if (parsed.ok) {
        ledger = recordFlowFindingResolutions({
          ledger,
          output: parsed.output,
          sourceArtifactPath: input.result.outputArtifactPath,
        });
        const canonical = flowArbitrationCanonicalResolutions(
          ledger,
          input.step.id,
        );
        const absPath = await input.artifactStore.writeJson(
          path.posix.join("flows", "finding-resolutions.json"),
          canonical,
        );
        input.outputs.set("finding-resolutions", {
          token: "finding-resolutions",
          label: "Flow Finding Resolutions",
          content: `${JSON.stringify(canonical, null, 2)}\n`,
          artifactPath: input.artifactStore.relPath(absPath),
        });
        findingsChanged = true;
      } else {
        ledger = recordFlowArbitrationParseIssue({
          ledger,
          stepId: input.step.id,
          outputToken: "finding-resolutions",
          sourceArtifactPath: input.result.outputArtifactPath,
          message: parsed.message,
        });
      }
    }

    if (input.step.outputs.includes("decision-summary")) {
      const parsed = parseFlowJsonContract({
        text: input.result.output,
        schema: flowDecisionSummaryOutputSchema,
        expectedStepId: input.step.id,
      });
      if (parsed.ok) {
        ledger = recordFlowDecision({
          ledger,
          output: parsed.output,
          sourceArtifactPath: input.result.outputArtifactPath,
        });
        const absPath = await input.artifactStore.writeJson(
          path.posix.join("flows", "decision-summary.json"),
          parsed.output,
        );
        input.outputs.set("decision-summary", {
          token: "decision-summary",
          label: "Flow Decision Summary",
          content: `${JSON.stringify(parsed.output, null, 2)}\n`,
          artifactPath: input.artifactStore.relPath(absPath),
        });
      } else {
        ledger = recordFlowArbitrationParseIssue({
          ledger,
          stepId: input.step.id,
          outputToken: "decision-summary",
          sourceArtifactPath: input.result.outputArtifactPath,
          message: parsed.message,
        });
      }
      ledger = await this.writeFlowDecisionSummaryArtifact({
        ledger,
        stepId: input.step.id,
        outputs: input.outputs,
        validation: input.validation,
        artifactStore: input.artifactStore,
      });
      await input.eventLog.append({
        type: "flow.decision.completed",
        message: `Flow decision summary persisted for ${input.step.id}.`,
        data: {
          stepId: input.step.id,
          decisionSummaryPath: ledger.decisionSummaryPath,
          structuredDecisionParsed: ledger.decision !== null,
        },
      });
    }

    if (findingsChanged) {
      await input.eventLog.append({
        type: "flow.findings.updated",
        message: `Flow arbitration records updated at ${input.step.id}.`,
        data: {
          stepId: input.step.id,
          findings: ledger.findings.length,
          responses: ledger.responses.length,
          resolutions: ledger.resolutions.length,
        },
      });
    }

    await input.store.write(ledger);
    return ledger;
  }

  private async feedFlowAcceptedFindings(
    ledger: FlowArbitrationLedger,
  ): Promise<FlowArbitrationLedger> {
    const svc = new ReviewSuggestionService(this.projectRoot, ledger.runId);
    for (const accepted of flowAcceptedFindingResponses(ledger)) {
      if (accepted.finding.suggestionId) continue;
      const fileRef = accepted.finding.finding.evidence.find(
        (evidence) => evidence.kind === "file",
      );
      const suggestion = await svc.addArtifactSuggestion({
        title: flowFindingSuggestionTitle(accepted.finding.finding),
        body: formatFlowFindingSuggestionBody({
          finding: accepted.finding.finding,
          response: accepted.response.response,
        }),
        file: fileRef?.ref ?? null,
        sourceArtifactPath: accepted.finding.sourceArtifactPath,
      });
      ledger = setFlowFindingSuggestionId({
        ledger,
        findingId: accepted.finding.finding.id,
        suggestionId: suggestion.id,
      });
    }

    if (ledger.acceptedReviewPassId) return ledger;
    const suggestionIds = flowAcceptedFindingResponses(ledger)
      .map((accepted) => accepted.finding.suggestionId)
      .filter((id): id is string => id !== null);
    if (suggestionIds.length === 0) return ledger;
    const bundle = await new SuggestionBundleService(
      this.projectRoot,
      ledger.runId,
    ).create({
      title: "Quality Arbitration accepted findings",
      description:
        "Findings the builder accepted or fixed during the Flow challenge response.",
      suggestionIds,
    });
    return setFlowAcceptedReviewPassId(ledger, bundle.id);
  }

  private async writeFlowDecisionSummaryArtifact(input: {
    ledger: FlowArbitrationLedger;
    stepId: string;
    outputs: Map<string, FlowContextOutput>;
    validation: ValidationResults | null;
    artifactStore: ArtifactStore;
  }): Promise<FlowArbitrationLedger> {
    await input.artifactStore.writeJson(
      path.posix.join("flows", "findings.json"),
      flowArbitrationCanonicalFindings(input.ledger, input.stepId),
    );
    await input.artifactStore.writeJson(
      path.posix.join("flows", "finding-responses.json"),
      flowArbitrationCanonicalResponses(input.ledger, input.stepId),
    );
    await input.artifactStore.writeJson(
      path.posix.join("flows", "finding-resolutions.json"),
      flowArbitrationCanonicalResolutions(input.ledger, input.stepId),
    );
    const absPath = await input.artifactStore.write(
      path.posix.join("flows", "decision-summary.md"),
      `${renderFlowDecisionSummaryMarkdown({
        ledger: input.ledger,
        validation: input.validation,
        validationArtifactPath:
          input.outputs.get("validation")?.artifactPath ?? null,
      })}\n`,
    );
    return setFlowDecisionSummaryPath(
      input.ledger,
      input.artifactStore.relPath(absPath),
    );
  }

  /** Seed the outputs of every step before the resume stage from the source
   *  run and mark them skipped. Returns the index to start the walk at, the
   *  updated state, and seeded plan/execution artifacts (for the report). */
  private async seedResumedSteps(input: {
    snapshot: ResolvedFlowSnapshot;
    resumeFrom: ResumeFromInput;
    state: RunState;
    outputs: Map<string, FlowContextOutput>;
    targetStore: ArtifactStore;
    stateStore: RunStateStore;
    eventLog: EventLog;
  }): Promise<{
    state: RunState;
    resumeStartIndex: number;
    planArtifact: RoleRunResult | null;
    executionArtifact: RoleRunResult | null;
  }> {
    const { snapshot, resumeFrom } = input;
    const resumeStartIndex = snapshot.steps.findIndex(
      (s) => s.stage === resumeFrom.fromStage,
    );
    if (resumeStartIndex < 0) {
      throw new Error(
        `Cannot resume from stage "${resumeFrom.fromStage}": flow "${snapshot.flowId}" has no step at that stage.`,
      );
    }
    let state = input.state;
    let planArtifact: RoleRunResult | null = null;
    let executionArtifact: RoleRunResult | null = null;
    const sourceStore = new ArtifactStore(
      this.projectRoot,
      resumeFrom.sourceRunId,
    );

    for (let i = 0; i < resumeStartIndex; i += 1) {
      const upstream = snapshot.steps[i]!;
      for (const token of upstream.outputs) {
        const seeded = await this.seedResumedOutput({
          token,
          step: upstream,
          sourceStore,
          targetStore: input.targetStore,
        });
        input.outputs.set(token, seeded);
        if (token === "plan") planArtifact = this.seededFlowResult(upstream, seeded);
        if (token === "execution")
          executionArtifact = this.seededFlowResult(upstream, seeded);
      }
      state = this.patchFlowStep(
        state,
        upstream.id,
        { status: "skipped", endedAt: nowIso() },
        upstream.id,
      );
      await input.stateStore.write(state);
      await input.eventLog.append({
        type: "flow.step.skipped",
        message: `Flow step ${upstream.id} skipped (resumed from ${resumeFrom.fromStage}).`,
        data: {
          flowId: snapshot.flowId,
          stepId: upstream.id,
          resumedFrom: resumeFrom.fromStage,
        },
      });
    }

    await input.eventLog.append({
      type: "run.rewound",
      message: `Resumed from run ${resumeFrom.sourceRunId} at stage ${resumeFrom.fromStage}; seeded ${resumeStartIndex} upstream step(s).`,
      data: {
        sourceRunId: resumeFrom.sourceRunId,
        fromStage: resumeFrom.fromStage,
        seededSteps: resumeStartIndex,
      },
    });

    return { state, resumeStartIndex, planArtifact, executionArtifact };
  }

  /** Read a single upstream output from the source run and copy it into this
   *  run's artifacts. `diff` outputs come from the step's diff snapshot; every
   *  other token comes from the step's role output. Throws clearly if missing. */
  private async seedResumedOutput(input: {
    token: string;
    step: ResolvedFlowStep;
    sourceStore: ArtifactStore;
    targetStore: ArtifactStore;
  }): Promise<FlowContextOutput> {
    const isDiff = input.token === "diff";
    const rel = path.posix.join(
      "flows",
      input.step.id,
      isDiff ? "diff-snapshot.json" : "output.md",
    );
    if (!(await input.sourceStore.exists(rel))) {
      throw new Error(
        `Cannot resume: source run is missing "${rel}" (output "${input.token}" of step "${input.step.id}").`,
      );
    }
    const content = await input.sourceStore.read(rel);
    const abs = await input.targetStore.write(rel, content);
    return {
      token: input.token,
      label: `${input.step.label}: ${input.token} (seeded)`,
      content,
      artifactPath: input.targetStore.relPath(abs),
    };
  }

  /** Synthetic RoleRunResult for an output seeded from a prior run during a
   *  resume. Only `.output`/`.outputArtifactPath` are read downstream; the
   *  provider stub records that no agent turn was spent regenerating it. */
  private seededFlowResult(
    step: ResolvedFlowStep,
    output: FlowContextOutput,
  ): RoleRunResult {
    const ts = nowIso();
    return {
      roleId: step.resolvedRoleId ?? "(seeded)",
      output: output.content,
      outputArtifactPath: output.artifactPath,
      promptArtifactPath: "",
      providerResult: {
        providerId: "(seeded)",
        command: "(seeded)",
        args: [],
        cwd: this.projectRoot,
        exitCode: 0,
        stdout: output.content,
        stderr: "",
        durationMs: 0,
        startedAt: ts,
        endedAt: ts,
        session: null,
      },
    };
  }

  private async runFlowSequence(input: {
    snapshot: ResolvedFlowSnapshot;
    runId: string;
    state: RunState;
    worktreePath: string | null;
    branchName: string | null;
    artifactStore: ArtifactStore;
    stateStore: RunStateStore;
    eventLog: EventLog;
    metricsStore: MetricsStore;
    approvalService: ApprovalService;
    notify: (draft: NotificationDraft) => void;
    policyWarnings: PolicyWarning[];
    policyStagesAlreadyForced: Set<string>;
    ctx: {
      runId: string;
      worktreePath: string | null;
      branchName: string | null;
      artifactStore: ArtifactStore;
      eventLog: EventLog;
      stateStore: RunStateStore;
      onProgress: (message: string) => void;
    };
  }): Promise<OrchestratorOutput> {
    let state = input.state;
    // Widened initializers (`as`): these are reassigned inside the per-step
    // `runStep` closure below, which TS control-flow analysis can't see — a
    // plain literal initializer would pin them to the initial value and break
    // the post-loop comparisons. The `as` keeps the full union type.
    let lastValidation = null as ValidationResults | null;
    let reviewDecision = "BLOCKED" as ReviewDecision;
    let verificationDecision = "NEEDS_HUMAN" as VerificationDecision;
    let planArtifact: RoleRunResult | null = null;
    let executionArtifact: RoleRunResult | null = null;
    let reviewArtifact: RoleRunResult | null = null;
    let verificationArtifact: RoleRunResult | null = null;
    // Number of times the adaptive loop body ran (review passes). Hoisted so the
    // final report can derive the fix-cycle count even on the error path.
    let loopIteration = 0;
    const outputs = new Map<string, FlowContextOutput>();
    const participantStore = new FlowParticipantLedgerStore(
      this.projectRoot,
      input.runId,
    );
    let participantLedger =
      (await participantStore.read()) ??
      createFlowParticipantLedger({
        snapshot: input.snapshot,
        capabilities: (providerId) =>
          providerCapabilities(this.config.providers, providerId),
      });
    await participantStore.write(participantLedger);
    state = this.patchFlowParticipants(state, participantLedger);
    await input.stateStore.write(state);
    for (const participant of participantLedger.participants) {
      await input.eventLog.append({
        type: "flow.participant.capabilities",
        message: `Flow participant ${participant.seat} uses ${participant.providerId} with ${participant.capabilities.sessionReuse} session reuse.`,
        data: {
          flowId: input.snapshot.flowId,
          seat: participant.seat,
          providerId: participant.providerId,
          capabilities: participant.capabilities,
        },
      });
    }
    const arbitrationStore = new FlowArbitrationStore(
      this.projectRoot,
      input.runId,
    );
    let arbitrationLedger =
      (await arbitrationStore.read()) ??
      createFlowArbitrationLedger({
        runId: input.runId,
        snapshot: input.snapshot,
      });
    await arbitrationStore.write(arbitrationLedger);
    const taskBriefBody = [
      "# Flow Task Brief",
      "",
      `Task: ${this.task}`,
      "",
      input.snapshot.brief ? input.snapshot.brief : "_No extra Flow brief._",
    ].join("\n");
    const taskBriefAbs = await input.artifactStore.write(
      path.posix.join("flows", "task-brief.md"),
      `${taskBriefBody}\n`,
    );
    outputs.set("task-brief", {
      token: "task-brief",
      label: "Task Brief",
      content: `${taskBriefBody}\n`,
      artifactPath: input.artifactStore.relPath(taskBriefAbs),
    });

    try {
      const steps = input.snapshot.steps;
      const loop = input.snapshot.loop;
      const loopFrom = loop
        ? steps.findIndex((s) => s.sourceStepId === loop.from)
        : -1;
      const loopTo = loop
        ? steps.findIndex((s) => s.sourceStepId === loop.to)
        : -1;
      if (loop && (loopFrom < 0 || loopTo < 0)) {
        throw new Error(
          `Flow loop references unknown step(s) (from=${loop.from}, to=${loop.to}).`,
        );
      }

      // Resume: rewind to a stage by seeding the outputs of every step before
      // the first step at that stage from the source run, marking them skipped,
      // and starting the walk there. Native to the flow runner — driven by the
      // step `stage` metadata, no run() delegation.
      let stepIndex = 0;
      if (this.resumeFrom) {
        const seeded = await this.seedResumedSteps({
          snapshot: input.snapshot,
          resumeFrom: this.resumeFrom,
          state,
          outputs,
          targetStore: input.artifactStore,
          stateStore: input.stateStore,
          eventLog: input.eventLog,
        });
        state = seeded.state;
        stepIndex = seeded.resumeStartIndex;
        if (seeded.planArtifact) planArtifact = seeded.planArtifact;
        if (seeded.executionArtifact) executionArtifact = seeded.executionArtifact;
      }

      // Adaptive-loop-aware traversal. Linear flows (loop === null) advance one
      // step at a time, exactly as before. When a flow declares a loop, the
      // decisionStep (a review-turn at/inside from..to) gates re-entry: after it
      // runs we exit past `to` when the review isn't CHANGES_REQUESTED or the
      // iteration budget is spent; otherwise we finish the body and jump back to
      // `from`. The gate can sit at the body head so an early APPROVED skips the
      // remaining body (e.g. the default flow's fix) — mirroring run()'s loop.
      while (stepIndex < steps.length) {
        const step = steps[stepIndex]!;
        if (loop && stepIndex === loopFrom) {
          loopIteration += 1;
          await input.eventLog.append({
            type: "flow.loop.iteration",
            message: `Flow loop pass ${loopIteration}/${loop.maxIterations} (body ${loop.from}..${loop.to}).`,
            data: {
              flowId: input.snapshot.flowId,
              iteration: loopIteration,
              maxIterations: loop.maxIterations,
              from: loop.from,
              to: loop.to,
            },
          });
        }
        const runStep = async (): Promise<void> => {
          // Read-only runs skip write/validation/verify steps the same way
          // run() does — investigation only. Disabled (skipped-optional) steps
          // skip too.
          const readOnlySkip = this.readOnly && step.skipWhenReadOnly;
          if (!step.enabled || readOnlySkip) {
            state = this.patchFlowStep(
              state,
              step.id,
              { status: "skipped", endedAt: nowIso() },
              step.id,
            );
            await input.stateStore.write(state);
            await input.eventLog.append({
              type: "flow.step.skipped",
              message: readOnlySkip
                ? `Flow step ${step.id} skipped (read-only run).`
                : `Flow step ${step.id} skipped.`,
              data: {
                flowId: input.snapshot.flowId,
                stepId: step.id,
                readOnly: readOnlySkip,
              },
            });
            return;
          }

          state = await applyPauseIfRequested({
            state,
            store: input.stateStore,
            events: input.eventLog,
          });
          if (isTerminal(state.status)) throw new __ApprovalRejectedSignal();
          state = await this.moveToFlowStepStatus({
            state,
            step,
            stateStore: input.stateStore,
          });

          const preparedTurn = step.seat && step.resolvedRoleId
            ? prepareFlowParticipantTurn(participantLedger, step.seat)
            : null;
          const context = await this.buildFlowContextPacket({
            snapshot: input.snapshot,
            step,
            outputs,
            artifactStore: input.artifactStore,
            contextMode: preparedTurn?.contextMode ?? "stateless",
          });
          state = this.patchFlowStep(
            state,
            step.id,
            {
              status: "running",
              startedAt: nowIso(),
              contextPacketPath: context.contextPacketPath,
              error: null,
            },
            step.id,
          );
          await input.stateStore.write(state);
          await input.eventLog.append({
            type: "flow.context.built",
            message: `Flow context packet built for ${step.id}.`,
            data: {
              flowId: input.snapshot.flowId,
              stepId: step.id,
              contextPolicy: input.snapshot.contextPolicy,
              contextMode: preparedTurn?.contextMode ?? "stateless",
              contextPacketPath: context.contextPacketPath,
              budget: context.budget,
            },
          });
          await input.eventLog.append({
            type: "flow.step.started",
            message: `Flow step ${step.id} starting.`,
            data: {
              flowId: input.snapshot.flowId,
              stepId: step.id,
              kind: step.kind,
              seat: step.seat,
              resolvedRoleId: step.resolvedRoleId,
              profileId: step.profileId,
              providerId: step.providerId,
              contextPacketPath: context.contextPacketPath,
            },
          });
          this.onProgress(`Flow ${step.id}...`);

          if (step.kind === "validation") {
            const validationOutput = await this.runFlowValidationStep({
              step,
              state,
              outputs,
              artifactStore: input.artifactStore,
              stateStore: input.stateStore,
              ctx: input.ctx,
            });
            state = validationOutput.state;
            lastValidation = validationOutput.validation;
            if (validationOutput.validation.summary.failed > 0) {
              input.notify(
                draftValidationFailed({
                  runId: input.runId,
                  taskId: this.taskId,
                  failedCount: validationOutput.validation.summary.failed,
                }),
              );
            }
            await input.eventLog.append({
              type: "flow.step.completed",
              message: `Flow step ${step.id} completed.`,
              data: { flowId: input.snapshot.flowId, stepId: step.id },
            });
            return;
          }

          if (step.kind === "approval-gate") {
            if (!step.approval) {
              throw new Error(`Flow approval gate "${step.id}" has no metadata.`);
            }
            const gate = await this.awaitApprovalRequest({
              state,
              fromStatus: state.status,
              stageId: step.id,
              roleId: "flow",
              reason: step.approval.reason,
              prompt: null,
              sourceArtifactPath: context.contextPacketPath,
              requestedAction: step.approval.requestedAction,
              riskLevel: step.approval.riskLevel,
              source: "policy",
              userMessage: step.approval.userMessage ?? null,
              progressMessage: `Pausing for Flow approval at ${step.id}...`,
              requestedMessage: `Flow approval gate ${step.id} is waiting for a decision.`,
              resumedMessage: `Run resumed after Flow approval gate ${step.id}.`,
              approvalService: input.approvalService,
              stateStore: input.stateStore,
              eventLog: input.eventLog,
            });
            state = gate.state;
            if (gate.rejected) {
              state = this.patchFlowStep(
                state,
                step.id,
                { status: "blocked", endedAt: nowIso() },
                step.id,
              );
              await input.stateStore.write(state);
              await input.eventLog.append({
                type: "flow.step.failed",
                message: `Flow approval gate ${step.id} blocked the run.`,
                data: { flowId: input.snapshot.flowId, stepId: step.id },
              });
              throw new __ApprovalRejectedSignal();
            }

            state = this.patchFlowStep(
              state,
              step.id,
              { status: "passed", endedAt: nowIso() },
              step.id,
            );
            await input.stateStore.write(state);
            await input.eventLog.append({
              type: "flow.step.completed",
              message: `Flow approval gate ${step.id} completed.`,
              data: { flowId: input.snapshot.flowId, stepId: step.id },
            });
            return;
          }

          if (!step.resolvedRoleId) {
            throw new Error(`Flow step "${step.id}" needs a seated role.`);
          }

          const result = await this.runRole({
            roleId: step.resolvedRoleId,
            providerId: step.providerId,
            stageId: step.id,
            promptIndex: 0,
            promptName: path.posix.join("flows", step.id, "prompt.md"),
            outputName: path.posix.join("flows", step.id, "output.md"),
            priorArtifacts: context.priorArtifacts,
            validationResults: lastValidation,
            additionalNotes: this.renderFlowStepNotes({
              snapshot: input.snapshot,
              step,
            }),
            ...(preparedTurn
              ? {
                  flowTurn: {
                    seat: preparedTurn.seat,
                    contextMode: preparedTurn.contextMode,
                    fallbackReason: preparedTurn.fallbackReason,
                    ...(preparedTurn.sessionRequest
                      ? { sessionRequest: preparedTurn.sessionRequest }
                      : {}),
                  },
                }
              : {}),
            metricsStore: input.metricsStore,
            ctx: input.ctx,
          });
          if (preparedTurn) {
            participantLedger = recordFlowParticipantTurn({
              ledger: participantLedger,
              prepared: preparedTurn,
              stepId: step.id,
              roleId: step.resolvedRoleId,
              providerId: step.providerId ?? result.providerResult.providerId,
              contextPacketPath: context.contextPacketPath,
              promptArtifactPath: result.promptArtifactPath,
              outputArtifactPath: result.outputArtifactPath,
              providerSessionId: result.providerResult.session?.sessionId ?? null,
            });
            await participantStore.write(participantLedger);
            state = this.patchFlowParticipants(state, participantLedger);
            await input.stateStore.write(state);
            await input.eventLog.append({
              type:
                preparedTurn.contextMode === "opened"
                  ? "flow.session.opened"
                  : preparedTurn.contextMode === "reused"
                    ? "flow.session.reused"
                    : preparedTurn.contextMode === "rehydrated"
                      ? "flow.session.rehydrated"
                      : "flow.session.stateless",
              message: `Flow participant ${preparedTurn.seat} completed ${step.id} with ${preparedTurn.contextMode} context.`,
              data: {
                flowId: input.snapshot.flowId,
                stepId: step.id,
                seat: preparedTurn.seat,
                providerId: step.providerId,
                contextMode: preparedTurn.contextMode,
                fallbackReason: preparedTurn.fallbackReason,
                sessionId: result.providerResult.session?.sessionId ?? null,
              },
            });
          }
          await this.registerFlowRoleOutputs({
            step,
            result,
            outputs,
            artifactStore: input.artifactStore,
            worktreePath: input.worktreePath,
          });
          arbitrationLedger = await this.recordFlowArbitrationOutputs({
            step,
            result,
            outputs,
            validation: lastValidation,
            artifactStore: input.artifactStore,
            eventLog: input.eventLog,
            ledger: arbitrationLedger,
            store: arbitrationStore,
          });

          if (step.outputs.includes("plan")) planArtifact = result;
          if (step.outputs.includes("execution")) executionArtifact = result;
          if (
            step.kind === "review-turn" &&
            (step.outputs.includes("review-decision") ||
              step.outputs.includes("finding-resolutions"))
          ) {
            reviewArtifact = result;
            reviewDecision = effectiveReviewDecision(result.output);
            await input.eventLog.append({
              type: "review.decision",
              message: `Flow review decision at ${step.id}: ${reviewDecision}`,
              data: { decision: reviewDecision, stepId: step.id },
            });
          }
          if (step.kind === "summary-turn") {
            verificationArtifact = result;
            verificationDecision = effectiveVerificationDecision(result.output);
            await input.eventLog.append({
              type: "verification.decision",
              message: `Flow summary decision at ${step.id}: ${verificationDecision}`,
              data: { decision: verificationDecision, stepId: step.id },
            });
          }
          if (step.kind === "review-turn" || step.kind === "summary-turn") {
            await this.ingestSuggestionsFromArtifact({
              runId: input.runId,
              artifactRelPath: result.outputArtifactPath,
              artifactBody: result.output,
              source: step.kind === "summary-turn" ? "verifier" : "reviewer",
              notify: input.notify,
            });
          }

          const gate = await this.maybeAwaitApproval({
            state,
            fromStatus: state.status,
            // Policy approvals are configured per run phase
            // (planning/architecting/executing/validating/reviewing/fixing/
            // verifying); match on the step's phase, not its id.
            stageId: this.flowStatusForStep(step),
            roleId: step.resolvedRoleId,
            roleArtifact: result,
            approvalService: input.approvalService,
            stateStore: input.stateStore,
            eventLog: input.eventLog,
            policyStagesAlreadyForced: input.policyStagesAlreadyForced,
          });
          state = gate.state;
          if (gate.rejected) {
            state = this.patchFlowStep(
              state,
              step.id,
              {
                status: "blocked",
                promptArtifactPath: result.promptArtifactPath,
                outputArtifactPath: result.outputArtifactPath,
                endedAt: nowIso(),
              },
              step.id,
            );
            await input.stateStore.write(state);
            await input.eventLog.append({
              type: "flow.step.failed",
              message: `Flow step ${step.id} blocked by approval decision.`,
              data: { flowId: input.snapshot.flowId, stepId: step.id },
            });
            throw new __ApprovalRejectedSignal();
          }

          state = this.patchFlowStep(
            state,
            step.id,
            {
              status: "passed",
              promptArtifactPath: result.promptArtifactPath,
              outputArtifactPath: result.outputArtifactPath,
              endedAt: nowIso(),
            },
            step.id,
          );
          await input.stateStore.write(state);
          await input.eventLog.append({
            type: "flow.step.completed",
            message: `Flow step ${step.id} completed.`,
            data: {
              flowId: input.snapshot.flowId,
              stepId: step.id,
              promptArtifactPath: result.promptArtifactPath,
              outputArtifactPath: result.outputArtifactPath,
            },
          });
        };
        await runStep();
        // Adaptive loop control (no-op for linear flows). The decisionStep
        // gates the loop; an early non-CHANGES_REQUESTED exit skips the rest of
        // the body, and exhausting the budget exits with the last decision
        // (left CHANGES_REQUESTED → the run blocks below).
        if (loop && step.sourceStepId === loop.decisionStep) {
          const wantsChanges = reviewDecision === "CHANGES_REQUESTED";
          const budgetLeft = loopIteration < loop.maxIterations;
          // Read-only runs never loop — the fix body is skipped, so re-running
          // would just repeat the same review. They traverse the body once
          // (the write steps mark themselves skipped) and don't jump back.
          const continuing = !this.readOnly && wantsChanges && budgetLeft;
          await input.eventLog.append({
            type: "flow.loop.decision",
            message: `Flow loop decision at ${step.id}: ${reviewDecision} on pass ${loopIteration}/${loop.maxIterations}.`,
            data: {
              flowId: input.snapshot.flowId,
              stepId: step.id,
              decision: reviewDecision,
              iteration: loopIteration,
              maxIterations: loop.maxIterations,
              continuing,
            },
          });
          // Non-read-only early exit: an APPROVED/BLOCKED review or a spent
          // budget skips the rest of the body and continues past `to`.
          if (!this.readOnly && !continuing) {
            stepIndex = loopTo + 1;
            continue;
          }
        }
        if (loop && stepIndex === loopTo && !this.readOnly) {
          stepIndex = loopFrom;
          continue;
        }
        stepIndex += 1;
      }

      // Read-only runs skip the executor, validation, and verify steps, so no
      // verification decision is produced — an APPROVED review is the bar for
      // merge_ready, mirroring run(). A read-only CHANGES_REQUESTED can't be
      // fixed, so record it as BLOCKED for an honest verdict.
      if (this.readOnly && reviewDecision === "CHANGES_REQUESTED") {
        reviewDecision = "BLOCKED";
      }
      const validationPassed =
        lastValidation === null || lastValidation.summary.failed === 0;
      // A flow only requires a passing verification if it actually has a verify
      // (summary-turn) step that ran. Minimal flows (e.g. coder + reviewer with
      // no verify) reach merge_ready on an APPROVED review + passing validation.
      const verified = verificationArtifact !== null;
      // Read-only runs skip verification entirely, so there's no decision to
      // report — null keeps the report/events honest ("skipped") rather than
      // leaking the NEEDS_HUMAN default as if a verifier had run.
      const finalVerification = this.readOnly || !verified ? null : verificationDecision;
      const mergeReady = this.readOnly
        ? reviewDecision === "APPROVED"
        : reviewDecision === "APPROVED" &&
          validationPassed &&
          (!verified || verificationDecision === "PASSED");
      state = {
        ...state,
        finalDecision: reviewDecision,
        verification: finalVerification,
      };
      await input.stateStore.write(state);
      state = applyTransition(state, mergeReady ? "merge_ready" : "blocked");
      await input.stateStore.write(state);
      await input.eventLog.append({
        type: "run.completed",
        message: `Flow run ${input.runId} ${state.status}.`,
        data: {
          flowId: input.snapshot.flowId,
          decision: reviewDecision,
          verification: finalVerification,
          validationPassed,
        },
      });
      input.notify(
        draftRunCompleted({
          runId: input.runId,
          taskId: this.taskId,
          status: state.status as "merge_ready" | "blocked",
          decision: reviewDecision,
          verification: finalVerification,
        }),
      );
    } catch (err) {
      // Aborted by user signal → terminal "aborted", not "failed". Falls through
      // to the finalize block below (metrics + report).
      if (err instanceof __RunAbortedSignal || this.abortSignal?.aborted) {
        try {
          state = applyTransition(state, "aborted");
        } catch {
          // already terminal
        }
        state = { ...state, error: "Run aborted by user signal." };
        await input.stateStore.write(state);
        await input.eventLog.append({
          type: "run.aborted",
          message: "Run aborted by user signal.",
        });
      } else if (err instanceof __SpendCapStopSignal) {
        // Daily spend cap with capAction=stop → "blocked" (not "failed"); the
        // spend.capped event was already logged. Falls through to finalize.
        try {
          state = applyTransition(state, "blocked");
        } catch {
          // already terminal
        }
        state = { ...state, error: err.message };
        await input.stateStore.write(state);
      } else if (!(err instanceof __ApprovalRejectedSignal)) {
        const stepId = state.flow?.currentStepId;
        if (stepId) {
          state = this.patchFlowStep(
            state,
            stepId,
            {
              status: "failed",
              endedAt: nowIso(),
              error: describeError(err),
            },
            stepId,
          );
          await input.stateStore.write(state);
          await input.eventLog.append({
            type: "flow.step.failed",
            message: `Flow step ${stepId} failed: ${describeError(err)}`,
            data: { flowId: input.snapshot.flowId, stepId },
          });
        }
        const message = describeError(err);
        try {
          state = applyTransition(state, "failed");
        } catch {
          // already terminal
        }
        state = { ...state, error: message };
        await input.stateStore.write(state);
        await input.eventLog.append({
          type: "run.failed",
          message: `Flow run failed: ${message}`,
        });
        input.notify(
          draftRunCompleted({
            runId: input.runId,
            taskId: this.taskId,
            status: "failed",
          }),
        );
        try {
          await input.metricsStore.update((metrics) => ({
            ...metrics,
            finalStatus: state.status,
          }));
        } catch {
          // metrics finalize best-effort
        }
        await this.writeFlowFinalReport({
          ...input,
          state,
          lastValidation,
          reviewLoops: Math.max(0, loopIteration - 1),
          planArtifact,
          executionArtifact,
          reviewArtifact,
          verificationArtifact,
        });
        if (err instanceof VibestrateError) throw err;
        throw err instanceof Error ? err : new Error(message);
      }
    }

    const approvals = await input.approvalService.readAll();
    await input.metricsStore.update((metrics) => ({
      ...metrics,
      finalStatus: state.status,
      reviewLoopCount: Math.max(0, loopIteration - 1),
      validationSummary: lastValidation
        ? {
            total: lastValidation.summary.total,
            passed: lastValidation.summary.passed,
            failed: lastValidation.summary.failed,
          }
        : null,
      approvalsSummary: summarizeApprovals(approvals),
    }));
    const finalReportPath = await this.writeFlowFinalReport({
      ...input,
      state,
      lastValidation,
      reviewLoops: Math.max(0, loopIteration - 1),
      planArtifact,
      executionArtifact,
      reviewArtifact,
      verificationArtifact,
    });
    return {
      runId: input.runId,
      state,
      worktreePath: input.worktreePath,
      branchName: input.branchName,
      finalReportPath,
      policyWarnings: input.policyWarnings,
    };
  }

  private async runFlowValidationStep(input: {
    step: ResolvedFlowStep;
    state: RunState;
    outputs: Map<string, FlowContextOutput>;
    artifactStore: ArtifactStore;
    stateStore: RunStateStore;
    ctx: {
      worktreePath: string | null;
      artifactStore: ArtifactStore;
      eventLog: EventLog;
    };
  }): Promise<{ state: RunState; validation: ValidationResults }> {
    const artifactsName = path.posix.join(
      "flows",
      input.step.id,
      "validation-results.json",
    );
    const validation = await this.runValidation({
      artifactsName,
      prefix: path.posix.join("flows", input.step.id, "validation"),
      ctx: input.ctx,
    });
    const validationArtifactPath = input.artifactStore.relPath(
      input.artifactStore.resolveArtifactPath(artifactsName),
    );
    this.registerFlowValidationOutputs({
      step: input.step,
      validation,
      validationArtifactPath,
      outputs: input.outputs,
    });
    const state = this.patchFlowStep(
      input.state,
      input.step.id,
      {
        status: "passed",
        validationArtifactPath,
        endedAt: nowIso(),
      },
      input.step.id,
    );
    await input.stateStore.write(state);
    return { state, validation };
  }

  private async writeFlowFinalReport(input: {
    artifactStore: ArtifactStore;
    state: RunState;
    lastValidation: ValidationResults | null;
    policyWarnings: PolicyWarning[];
    reviewLoops: number;
    metricsStore: MetricsStore;
    approvalService: ApprovalService;
    planArtifact: RoleRunResult | null;
    executionArtifact: RoleRunResult | null;
    reviewArtifact: RoleRunResult | null;
    verificationArtifact: RoleRunResult | null;
  }): Promise<string> {
    const metrics = (await input.metricsStore.read()) ?? null;
    const approvals = await input.approvalService.readAll().catch(() => []);
    return this.writeFinalReport({
      artifactStore: input.artifactStore,
      state: input.state,
      validation: input.lastValidation,
      policyWarnings: input.policyWarnings,
      reviewLoops: input.reviewLoops,
      metrics,
      approvals,
      artifacts: {
        plan: input.planArtifact?.outputArtifactPath,
        execution: input.executionArtifact?.outputArtifactPath,
        review: input.reviewArtifact?.outputArtifactPath,
        verification: input.verificationArtifact?.outputArtifactPath,
      },
    });
  }

  /**
   * Capture VIBESTRATE_SUGGESTION marker blocks from a stage artifact. Best-effort:
   * never throws into the orchestrator's hot path. Notifies the dashboard via
   * the notification service when a suggestion was extracted (one summary
   * notification per stage, not one per suggestion).
   */
  private async ingestSuggestionsFromArtifact(input: {
    runId: string;
    artifactRelPath: string;
    artifactBody: string;
    source: SuggestionSource;
    notify?: (draft: NotificationDraft) => void;
  }): Promise<void> {
    try {
      const svc = new ReviewSuggestionService(this.projectRoot, input.runId);
      const created = await svc.ingestArtifact({
        artifactRelPath: input.artifactRelPath,
        artifactBody: input.artifactBody,
        source: input.source,
      });
      if (created.length === 0) return;
      input.notify?.({
        severity: "attention",
        category: "review",
        title: `${created.length} suggestion${created.length > 1 ? "s" : ""} ready for review`,
        message: `Captured from ${input.source} artifact ${input.artifactRelPath}.`,
        runId: input.runId,
        sourceEventType: "suggestion.created",
        actionRequired: true,
        actionLabel: "Open run",
        actionUrl: `#/runs/${input.runId}`,
      });
    } catch {
      // Suggestion ingestion is best-effort — never fail a run because the
      // marker parser hiccupped.
    }
  }

  private async awaitApprovalRequest(input: {
    state: RunState;
    fromStatus: RunStatus;
    stageId: string;
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
  }): Promise<{ state: RunState; rejected: boolean }> {
    this.onProgress(input.progressMessage);

    const req = await input.approvalService.create({
      stageId: input.stageId,
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
    const _notify = (
      this as unknown as { _notify?: (d: NotificationDraft) => void }
    )._notify;
    if (_notify) {
      _notify(
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

    const resolved = await input.approvalService.waitForResolution(req.id, {
      pollMs: 1500,
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
      return { state: next, rejected: false };
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
    return { state: blockedState, rejected: true };
  }

  /**
   * If `roleArtifact.output` contains `HUMAN_APPROVAL: REQUIRED`, transition
   * the run to `waiting_for_approval`, persist a pending approval request, and
   * poll until the user resolves it via CLI/API. Returns the new state and
   * whether the run was rejected (caller must transition to `blocked`).
   *
   * If no approval signal is present, returns the input state unchanged.
   */
  private async maybeAwaitApproval(input: {
    state: RunState;
    fromStatus: RunStatus;
    stageId: string;
    roleId: string;
    roleArtifact: RoleRunResult | null;
    approvalService: ApprovalService;
    stateStore: RunStateStore;
    eventLog: EventLog;
    /** Tracks which policy stages have already triggered approval this run (mutated). */
    policyStagesAlreadyForced: Set<string>;
  }): Promise<{ state: RunState; rejected: boolean }> {
    const detection = input.roleArtifact
      ? detectApprovalRequest(input.roleArtifact.output)
      : null;
    const policyStages = this.config.policies.requireApprovalAtStages;
    const policyForcedThisStage =
      policyStages.includes(input.stageId as (typeof policyStages)[number]) &&
      !input.policyStagesAlreadyForced.has(input.stageId);

    const roleRequested = !!detection?.required;
    if (!roleRequested && !policyForcedThisStage) {
      return { state: input.state, rejected: false };
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

    return this.awaitApprovalRequest({
      state: input.state,
      fromStatus: input.fromStatus,
      stageId: input.stageId,
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

  private async runRole(input: {
    roleId: string;
    providerId?: string | null;
    stageId: string;
    promptIndex: number;
    outputName: string;
    promptName?: string;
    priorArtifacts: PriorArtifact[];
    validationResults: ValidationResults | null;
    additionalNotes?: string;
    flowTurn?: FlowRoleTurn;
    metricsStore: MetricsStore;
    reviewDecisionForStage?: string | null;
    verificationDecisionForStage?: string | null;
    ctx: {
      runId: string;
      worktreePath: string | null;
      branchName: string | null;
      artifactStore: ArtifactStore;
      eventLog: EventLog;
      stateStore: RunStateStore;
      onProgress: (message: string) => void;
    };
  }): Promise<RoleRunResult> {
    const { roleId, ctx } = input;
    // Budget gate: before spending on this turn, check today's spend against
    // the daily cap and apply the configured action (warn / stop). Runs before
    // provider resolution.
    await this.enforceSpendCap(ctx);
    // Resolve the Role from the Crew the run's flow snapshot was built against.
    const { crew } = getCrew(this.config, this.activeCrewId);
    const agent = getCrewRole(crew, roleId);
    // Read-only runs override every role's permission profile to the built-in
    // `read_only` (allowWrite/allowShell false), regardless of how the role is
    // configured. Using the builtin name guarantees resolution via
    // resolveProfile's builtin fallback even on a project that hasn't defined a
    // read-only profile of its own.
    const effectivePermissions = this.readOnly ? "read_only" : agent.permissions;
    const profile = resolveProfile(
      this.config.permissions.profiles,
      effectivePermissions,
    );
    // Effective provider id: the resolved snapshot already mapped this step's
    // Seat → Role → Profile → Provider, so input.providerId is authoritative.
    // Fall back to the role's Profile's provider if (defensively) absent.
    const effectiveProviderId =
      input.providerId ?? this.config.profiles[agent.profile]?.provider;
    if (!effectiveProviderId) {
      throw new VibestrateError(
        "provider-unresolved",
        `Role "${roleId}" has no resolvable provider (profile "${agent.profile}").`,
      );
    }

    assertExecutableContext({
      roleId,
      profile,
      projectRoot: this.projectRoot,
      worktreePath: ctx.worktreePath,
    });

    const cwd = resolveCwd({
      roleId,
      profile,
      projectRoot: this.projectRoot,
      worktreePath: ctx.worktreePath,
    });

    const promptTemplate = await loadRolePrompt(this.projectRoot, agent.prompt);
    // Merge per-run runtimeSkills into the agent's configured skill ids
    // (deduped, order-preserving). Empty runtimeSkills is a no-op so
    // existing runs keep their exact behavior.
    const effectiveSkillIds =
      this.runtimeSkills.length === 0
        ? agent.skills
        : Array.from(new Set([...agent.skills, ...this.runtimeSkills]));
    const skills = await loadSkills(this.projectRoot, effectiveSkillIds);

    // MCP: gather servers from the agent + each skill, materialize them
    // into a per-invocation `mcp/<stage>-mcp.json` under the run's
    // artifacts directory, and surface the attachment as an event so
    // the run replay / dashboard can show what was wired in.
    const mcpResolved = resolveMcpServers({
      roleServers: agent.mcpServers,
      skills: skills.map((s) => ({ name: s.name, servers: s.mcpServers })),
    });
    const mcpConfigRelDir = path.join("mcp");
    const mcpConfigRelPath = path.join(
      mcpConfigRelDir,
      `${input.stageId}-${roleId}.json`,
    );
    let mcpConfigAbsPath: string | null = null;
    if (mcpResolved.servers.length > 0) {
      mcpConfigAbsPath = await writeMcpConfigFile({
        dir: path.dirname(ctx.artifactStore.resolveArtifactPath(mcpConfigRelPath)),
        servers: mcpResolved.servers,
      });
      await ctx.eventLog.append({
        type: "mcp.attached",
        message: `Attached ${mcpResolved.servers.length} MCP server(s) for ${roleId}.`,
        data: {
          roleId,
          stageId: input.stageId,
          configPath: ctx.artifactStore.relPath(mcpConfigAbsPath ?? ""),
          servers: mcpResolved.servers.map((s) => ({
            name: s.name,
            source: s.source,
            command: s.config.command,
          })),
          collisions: mcpResolved.collisions,
        },
      });
    }

    // Pull any user-queued control directives (notes, compaction
    // requests) that have arrived since the previous stage. They are
    // rendered into the `additionalNotes` slot of the prompt and then
    // marked consumed so the next agent doesn't see them again.
    const allControls = await listControls(this.projectRoot, ctx.runId);
    const pending = pendingControls(allControls);
    const controlNotes = renderControlNotes(pending);
    const additionalNotes = [input.additionalNotes, controlNotes]
      .filter((note): note is string => !!note && note.trim().length > 0)
      .join("\n\n");
    // Pull the user's shared, open codebase annotations and inject them so
    // every agent acknowledges them. Read per turn so notes added mid-run are
    // picked up by the next stage; a corrupt/missing file yields "".
    const humanAnnotations = renderAnnotationsForPrompt(
      await listAnnotations(this.projectRoot, { status: "open" }),
    );
    const prompt = buildRolePrompt({
      roleId,
      task: this.task,
      rules: this.rules,
      rolePromptTemplate: promptTemplate,
      skills,
      priorArtifacts: input.priorArtifacts,
      permission: profile,
      permissionName: agent.permissions,
      worktreePath: ctx.worktreePath,
      branchName: ctx.branchName,
      projectName: this.config.project.name,
      validationResults: input.validationResults,
      concise: this.concise,
      ...(additionalNotes ? { additionalNotes } : {}),
      ...(humanAnnotations ? { humanAnnotations } : {}),
    });
    if (pending.length > 0) {
      const consumed = await markPendingConsumed(
        this.projectRoot,
        ctx.runId,
        roleId,
      );
      await ctx.eventLog.append({
        type: "control.applied",
        message: `Applied ${consumed.length} user-queued directive(s) to ${roleId}.`,
        data: {
          roleId,
          kinds: consumed.map((d) => d.kind),
          ids: consumed.map((d) => d.id),
        },
      });
    }

    const promptName = input.promptName ?? this.defaultPromptName(input.promptIndex, roleId);
    const promptArtifactPathAbs = await ctx.artifactStore.write(promptName, prompt);

    await ctx.eventLog.append({
      type: "role.started",
      message: `Agent ${roleId} starting.`,
      data: {
        roleId,
        provider: effectiveProviderId,
        permissions: effectivePermissions,
        // Skills attached to this agent's prompt. The provider's
        // underlying model decides whether to use them — we can only
        // honestly report what we made available, not what it picked.
        skillsAttached: skills.map((s) => s.name),
        skillsConfigured: agent.skills.slice(),
        skillsFromRuntime: this.runtimeSkills.slice(),
        flowSeat: input.flowTurn?.seat ?? null,
        flowContextMode: input.flowTurn?.contextMode ?? null,
      },
    });
    await ctx.eventLog.append({
      type: "provider.started",
      message: `Provider ${effectiveProviderId} invoked for ${roleId}.`,
      data: { roleId, provider: effectiveProviderId, cwd },
    });

    let providerResult: RichProviderRunResult;
    const stageStart = new Date();
    // Materialize a live stream file for this agent invocation so the
    // dashboard can tail what the provider's CLI is saying in real
    // time — bridges the gap between "spawned" and "artifact written".
    await ensureStreamsDir(this.projectRoot, ctx.runId).catch(() => undefined);
    const streamName = promptName;

    // Structured providers (e.g. claude stream-json) emit JSON events, not
    // readable text. The adapter's live filter turns those into the assistant's
    // text for the live panel (display only). Plain providers have no filter →
    // chunks stream verbatim. `liveEmitted` lets us skip the end-of-turn flush
    // when the stream already showed the text incrementally.
    const outputAdapter = selectOutputAdapter(
      this.config.providers[effectiveProviderId]!,
    );
    const liveFilter = outputAdapter.createLiveFilter?.();
    let liveEmitted = false;

    // Honor `vibe abort` mid-stage: poll state.json every 500ms; when
    // we see `aborted`, abort the controller to SIGTERM the provider
    // child. Without this the run waited for the current CLI call to
    // finish on its own, which could mean minutes per stage. Cleared
    // in the finally block so we don't leak intervals.
    const providerAbort = new AbortController();
    if (this.abortSignal?.aborted) {
      providerAbort.abort();
    }
    const abortFromSignal = (): void => {
      if (!providerAbort.signal.aborted) providerAbort.abort();
    };
    this.abortSignal?.addEventListener("abort", abortFromSignal, {
      once: true,
    });
    const observer = setInterval(() => {
      void (async () => {
        try {
          const cur = await ctx.stateStore.read();
          if (cur && cur.status === "aborted" && !providerAbort.signal.aborted) {
            providerAbort.abort();
          }
        } catch {
          /* ignore — state file may be mid-write */
        }
      })();
    }, 500);
    try {
      providerResult = await runProvider(this.config.providers, {
        providerId: effectiveProviderId,
        prompt,
        cwd,
        mcpConfigPath: mcpConfigAbsPath ?? undefined,
        onChunk: (c) => {
          if (liveFilter && c.stream === "stdout") {
            const text = liveFilter(c.chunk);
            if (text) {
              liveEmitted = true;
              void appendStreamLine(this.projectRoot, ctx.runId, streamName, {
                ...c,
                chunk: text,
              });
            }
            return;
          }
          void appendStreamLine(this.projectRoot, ctx.runId, streamName, c);
        },
        signal: providerAbort.signal,
        ...(input.flowTurn?.sessionRequest
          ? { session: input.flowTurn.sessionRequest }
          : {}),
      });
      if (providerAbort.signal.aborted) {
        throw new __RunAbortedSignal();
      }
      // Fallback flush — most providers buffer all output until exit, so the
      // live panel would be empty mid-flight. Persist the *normalized* response
      // text (the clean answer, not raw JSON for structured providers) as one
      // chunk. Skip it when a structured stream already showed text live, so we
      // don't duplicate.
      if (
        !liveEmitted &&
        providerResult.normalized.responseText &&
        providerResult.normalized.responseText.length > 0
      ) {
        await appendStreamLine(this.projectRoot, ctx.runId, streamName, {
          stream: "stdout",
          chunk: providerResult.normalized.responseText,
          at: new Date().toISOString(),
        }).catch(() => undefined);
      }
      if (
        providerResult.stderr &&
        providerResult.stderr.length > 0
      ) {
        await appendStreamLine(this.projectRoot, ctx.runId, streamName, {
          stream: "stderr",
          chunk: providerResult.stderr,
          at: new Date().toISOString(),
        }).catch(() => undefined);
      }
    } catch (err) {
      const stageEnd = new Date();
      await ctx.eventLog.append({
        type: "provider.failed",
        message: `Provider ${effectiveProviderId} failed for ${roleId}: ${describeError(err)}`,
        data: { roleId, provider: effectiveProviderId },
      });
      await ctx.eventLog.append({
        type: "role.failed",
        message: `Agent ${roleId} failed.`,
        data: { roleId },
      });
      // Record a partial metric so the dashboard reflects the failure.
      const providerCfg = this.config.providers[effectiveProviderId];
      const failedMetric: RoleMetrics = {
        roleId,
        stageId: input.stageId,
        providerId: effectiveProviderId,
        providerType: providerCfg?.type ?? "cli",
        command: providerCfg?.command ?? "",
        args: [...(providerCfg?.args ?? [])],
        cwd,
        startedAt: stageStart.toISOString(),
        endedAt: stageEnd.toISOString(),
        durationMs: durationMs(stageStart, stageEnd),
        exitCode: -1,
        sessionId: null,
        flowSeat: input.flowTurn?.seat ?? null,
        flowContextMode: input.flowTurn?.contextMode ?? null,
        flowContextFallbackReason: input.flowTurn?.fallbackReason ?? null,
        model: null,
        totalCostUsd: null,
        costEstimated: false,
        perModelCost: [],
        tokenUsage: null,
        tokensEstimated: false,
        toolCallCount: null,
        filesChangedBefore: null,
        filesChangedAfter: null,
        diffInsertionsAfter: null,
        diffDeletionsAfter: null,
        validationSummary: null,
        reviewDecision: null,
        verificationDecision: null,
        skillsAttached: skills.map((s) => s.name),
        skillsRequested: agent.skills.slice(),
        notes: ["agent invocation failed before completion"],
      };
      await input.metricsStore.appendRoleMetrics(failedMetric);
      if (providerAbort.signal.aborted) {
        throw new __RunAbortedSignal();
      }
      throw err;
    } finally {
      clearInterval(observer);
      this.abortSignal?.removeEventListener("abort", abortFromSignal);
    }

    // Control + artifact read the adapter-normalized response text, not raw
    // stdout. For the text adapter these are identical; for a structured
    // adapter this is the losslessly-extracted assistant text (the markers the
    // approval/review parsers depend on live here).
    const stdout = providerResult.normalized.responseText || "";
    const stderr = providerResult.stderr || "";

    const outputBody = stderr
      ? `${stdout}\n\n---\n## stderr\n\n${stderr}`
      : stdout;

    const outputArtifactPathAbs = await ctx.artifactStore.write(
      input.outputName,
      outputBody,
    );

    await ctx.eventLog.append({
      type: "provider.completed",
      message: `Provider ${effectiveProviderId} completed for ${roleId}.`,
      data: {
        roleId,
        provider: effectiveProviderId,
        exitCode: providerResult.exitCode,
        durationMs: providerResult.durationMs,
      },
    });
    await ctx.eventLog.append({
      type: "role.completed",
      message: `Agent ${roleId} completed.`,
      data: { roleId, exitCode: providerResult.exitCode },
    });

    // Compute diff snapshot after this stage when worktree exists.
    let filesChangedAfter: number | null = null;
    let diffInsertionsAfter: number | null = null;
    let diffDeletionsAfter: number | null = null;
    if (ctx.worktreePath) {
      try {
        const snap = await getDiffSnapshot({ worktreePath: ctx.worktreePath });
        filesChangedAfter = snap.totals.files;
        diffInsertionsAfter = snap.totals.insertions;
        diffDeletionsAfter = snap.totals.deletions;
      } catch {
        // Diff unavailable; leave nulls.
      }
    }

    const metrics = providerResult.normalized.metrics;
    const providerCfg = this.config.providers[effectiveProviderId];

    // Token + cost ledger: prefer the provider's real numbers; otherwise
    // estimate tokens from the prompt/response text and price them from the
    // local list-price table. Estimates are flagged so the UI labels them.
    let tokenUsage = metrics?.tokenUsage ?? null;
    let tokensEstimated = false;
    const hasRealTokens =
      !!tokenUsage && ((tokenUsage.input ?? 0) + (tokenUsage.output ?? 0)) > 0;
    if (!hasRealTokens) {
      tokenUsage = {
        input: estimateTokensFromText(prompt),
        output: estimateTokensFromText(stdout),
      };
      tokensEstimated = true;
    }
    const { costUsd, estimated: costEstimated } = resolveCost({
      reportedCostUsd: metrics?.totalCostUsd ?? null,
      model: metrics?.model ?? null,
      tokenUsage,
    });
    const metric: RoleMetrics = {
      roleId,
      stageId: input.stageId,
      providerId: effectiveProviderId,
      providerType: providerCfg?.type ?? "cli",
      command: providerResult.command,
      args: providerResult.args,
      cwd: providerResult.cwd,
      startedAt: providerResult.startedAt,
      endedAt: providerResult.endedAt,
      durationMs: providerResult.durationMs,
      exitCode: providerResult.exitCode,
      promptArtifactPath: ctx.artifactStore.relPath(promptArtifactPathAbs),
      outputArtifactPath: ctx.artifactStore.relPath(outputArtifactPathAbs),
      sessionId:
        metrics?.sessionId ?? providerResult.session?.sessionId ?? null,
      flowSeat: input.flowTurn?.seat ?? null,
      flowContextMode: input.flowTurn?.contextMode ?? null,
      flowContextFallbackReason: input.flowTurn?.fallbackReason ?? null,
      model: metrics?.model ?? null,
      totalCostUsd: costUsd,
      costEstimated,
      perModelCost: metrics?.perModelCost ?? [],
      tokenUsage,
      tokensEstimated,
      toolCallCount: metrics?.toolCallCount ?? null,
      filesChangedBefore: null,
      filesChangedAfter,
      diffInsertionsAfter,
      diffDeletionsAfter,
      validationSummary: input.validationResults
        ? {
            total: input.validationResults.summary.total,
            passed: input.validationResults.summary.passed,
            failed: input.validationResults.summary.failed,
          }
        : null,
      reviewDecision: input.reviewDecisionForStage ?? null,
      verificationDecision: input.verificationDecisionForStage ?? null,
      skillsAttached: skills.map((s) => s.name),
      skillsRequested: agent.skills.slice(),
      notes:
        providerResult.claudeMetrics &&
        !providerResult.claudeMetrics.parseAvailable
          ? ["claude-code metrics not reported by provider"]
          : [],
    };
    await input.metricsStore.appendRoleMetrics(metric);

    return {
      roleId,
      output: stdout,
      outputArtifactPath: ctx.artifactStore.relPath(outputArtifactPathAbs),
      promptArtifactPath: ctx.artifactStore.relPath(promptArtifactPathAbs),
      providerResult,
    };
  }

  private async runValidation(input: {
    artifactsName: string;
    prefix?: string;
    ctx: {
      worktreePath: string | null;
      artifactStore: ArtifactStore;
      eventLog: EventLog;
    };
  }): Promise<ValidationResults> {
    const { ctx } = input;
    if (!ctx.worktreePath) {
      throw new GitError("Cannot run validation: worktree not prepared.");
    }
    await ctx.eventLog.append({
      type: "validation.started",
      message: `Validation starting in ${ctx.worktreePath}.`,
    });
    const results = await runValidationCommands({
      commands: this.config.commands.validate,
      cwd: ctx.worktreePath,
      store: ctx.artifactStore,
      prefix: input.prefix,
    });
    for (const c of results.commands) {
      await ctx.eventLog.append({
        type: "validation.command.completed",
        message: `${c.command} → exit ${c.exitCode}`,
        data: {
          command: c.command,
          exitCode: c.exitCode,
          status: c.status,
          durationMs: c.durationMs,
        },
      });
    }
    await ctx.artifactStore.writeJson(input.artifactsName, results);
    return results;
  }

  private defaultPromptName(index: number, roleId: string): string {
    const padded = index.toString().padStart(2, "0");
    return `${padded}-${roleId}-prompt.md`;
  }

  /**
   * Enforce the daily spend cap before an agent turn. Warns once at the
   * threshold; at the cap, stops the run. NOTE: in the new Profile model the
   * `reduce-effort` / `downgrade-model` cap actions are not yet implemented —
   * mid-run Profile downgrade (switching every seated step to
   * `budget.fallbackProfile`) is a TODO. Until then every cap action stops the
   * run honestly rather than silently continuing at full cost. No cap
   * configured ⇒ no-op.
   */
  private async enforceSpendCap(ctx: { eventLog: EventLog }): Promise<void> {
    const budget = this.config.budget;
    const cap = budget?.spendCapDailyUsd;
    if (!budget || cap === null || cap === undefined || cap <= 0) return;

    const dailySpendUsd = await computeDailySpendUsd(this.projectRoot).catch(
      () => 0,
    );
    const evaluation = evaluateSpendCap(budget, dailySpendUsd);

    if (evaluation.state === "warn" && !this.spendWarned) {
      this.spendWarned = true;
      await ctx.eventLog.append({
        type: "spend.warning",
        message: `Daily spend ~$${dailySpendUsd.toFixed(2)} crossed ${Math.round(
          (budget.warnThresholdPct ?? 0.8) * 100,
        )}% of the $${cap}/day cap.`,
        data: { dailySpendUsd, cap },
      });
    }
    if (evaluation.state !== "exceeded") return;

    const at = `Daily spend ~$${dailySpendUsd.toFixed(2)} reached the $${cap}/day cap`;
    if (budget.capAction !== "stop") {
      // Honest TODO: Profile-based downgrade isn't wired up yet.
      await ctx.eventLog.append({
        type: "policy.warning",
        message: `${at}; capAction="${budget.capAction}" is not yet supported in the Profile model — stopping instead.`,
        data: { kind: "spend-cap-downgrade-unsupported", capAction: budget.capAction },
      });
    }
    await ctx.eventLog.append({
      type: "spend.capped",
      message: `${at}. Stopping per budget policy (capAction=${budget.capAction}).`,
      data: { action: "stop", dailySpendUsd, cap },
    });
    throw new __SpendCapStopSignal(
      `${at}. Run stopped by the daily spend cap (capAction=${budget.capAction}).`,
    );
  }

  private async writeFinalReport(input: {
    artifactStore: ArtifactStore;
    state: RunState;
    validation: ValidationResults | null;
    policyWarnings: PolicyWarning[];
    reviewLoops: number;
    metrics: import("./runtime-metrics.js").RuntimeMetrics | null;
    approvals: import("./approval-types.js").ApprovalRequest[];
    artifacts: {
      plan?: string;
      architecture?: string;
      execution?: string;
      review?: string;
      verification?: string;
    };
  }): Promise<string> {
    let suggestions: import("../reviews/review-suggestion-types.js").ReviewSuggestion[] = [];
    try {
      suggestions = await new ReviewSuggestionService(
        this.projectRoot,
        input.state.runId,
      ).list();
    } catch {
      suggestions = [];
    }
    let bundles: import("../reviews/suggestion-bundle-types.js").SuggestionBundle[] = [];
    try {
      const { SuggestionBundleService } = await import(
        "../reviews/suggestion-bundle-service.js"
      );
      bundles = await new SuggestionBundleService(
        this.projectRoot,
        input.state.runId,
      ).list();
    } catch {
      bundles = [];
    }
    let arbitration: FlowArbitrationLedger | null = null;
    try {
      arbitration = await new FlowArbitrationStore(
        this.projectRoot,
        input.state.runId,
      ).read();
    } catch {
      arbitration = null;
    }
    const report = renderFinalReport({
      state: input.state,
      artifactPaths: input.artifacts,
      validation: input.validation,
      policyWarnings: input.policyWarnings,
      reviewLoops: input.reviewLoops,
      metrics: input.metrics,
      approvals: input.approvals,
      suggestions,
      bundles,
      arbitration,
    });
    return input.artifactStore.write("12-final-report.md", report);
  }
}
