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
import { getRoleConfig } from "../roles/role-registry.js";
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
import { GitError, AmacoError, describeError } from "../utils/errors.js";
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
import { resolveEffort } from "./effort-resolver.js";
import { writeJson } from "../utils/json.js";
import { runFlowSnapshotPath } from "../utils/paths.js";
import type {
  ResolvedFlowSnapshot,
  ResolvedFlowStep,
} from "../flows/schemas/flow-schema.js";
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

/** Stages a run can be rewound to. Earlier stages (planning) just mean a
 *  normal from-scratch run; review/verify aren't resumable here because they
 *  need the executor's code present (a per-phase worktree snapshot we don't
 *  capture yet). Both supported stages regenerate the downstream code, so a
 *  fresh worktree off main is correct. */
export type ResumeStage = "architecting" | "executing";

export type ResumeFromInput = {
  /** The run whose upstream artifacts are reused. */
  sourceRunId: string;
  fromStage: ResumeStage;
  /** Plan text copied from the source run — reused for both stages. */
  seededPlan: string;
  /** Architecture text — required when fromStage === "executing". */
  seededArchitecture?: string | null;
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
  /** Effort hint (low|medium|high) that maps to a provider via
   * project.yml#effortMap. Optional; defaults to no override. */
  effort?: "low" | "medium" | "high" | null;
  /** Explicit provider override. Wins over effort when both are set. */
  providerOverride?: string | null;
  /** Investigation-only run: force readOnly permissions on every agent,
   * skip the executor / fix loop entirely, refuse write-side actions. */
  readOnly?: boolean;
  /** Skill ids to attach to every agent for this single run, merged
   * (deduped) with the agent's configured skill list. Empty / omitted
   * means "use the agent's configured skills only". */
  runtimeSkills?: string[];
  /** Brevity directive applied to every agent prompt for this run. */
  concise?: boolean;
  /** Immutable resolved Flow recipe. When set, the sequential Flow
   * runner replaces the legacy fixed workflow for this run. */
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
  slotId: string;
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
  // Mutable: the spend-cap "reduce-effort" / "downgrade-model" actions adjust
  // these mid-run so subsequent turns resolve a cheaper provider.
  private effort: "low" | "medium" | "high" | null;
  private providerOverride: string | null;
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
    this.providerOverride = input.providerOverride ?? null;
    this.readOnly = input.readOnly ?? false;
    this.runtimeSkills = Array.from(new Set(input.runtimeSkills ?? []));
    this.concise = input.concise ?? false;
    this.flow = input.flow ?? null;
    this.resumeFrom = input.resumeFrom ?? null;
    if (this.flow && this.resumeFrom) {
      throw new Error(
        "A run cannot both run a Flow and rewind from a prior run.",
      );
    }
    this.abortSignal = input.abortSignal ?? null;
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
    // Resolve effort/provider override before persisting initial state so
    // events.ndjson + state.json carry the exact provider that will be
    // used. Read-only runs are stamped too — every subsequent enforcement
    // (route guards, executor short-circuit) reads from state.readOnly.
    const resolution = resolveEffort({
      effort: this.effort,
      providerOverride: this.providerOverride,
      config: this.config,
    });
    state = {
      ...state,
      taskId: this.taskId,
      effort: this.effort,
      providerOverride: this.providerOverride,
      resolvedProviderId: resolution.providerId,
      runtimeSkills: this.runtimeSkills,
      concise: this.concise,
      readOnly: this.readOnly,
      flow: this.flow
        ? this.createFlowRunState(this.flow, "flow.json")
        : null,
      resumedFrom: this.resumeFrom
        ? {
            sourceRunId: this.resumeFrom.sourceRunId,
            fromStage: this.resumeFrom.fromStage,
          }
        : null,
    };
    if (this.flow) {
      await writeJson(runFlowSnapshotPath(this.projectRoot, runId), this.flow);
    }
    await stateStore.write(state);
    await eventLog.append({
      type: "run.created",
      message: `Run ${runId} created.`,
      data: {
        task: this.task,
        taskId: this.taskId,
        effort: this.effort,
        providerOverride: this.providerOverride,
        resolvedProviderId: resolution.providerId,
        resolutionSource: resolution.source,
        readOnly: this.readOnly,
      },
    });
    // Honest log line so users can see *why* a given provider was
    // picked (or *why* the override was ignored).
    await eventLog.append({
      type: "policy.warning",
      message: resolution.note,
      data: { kind: "effort-resolution", source: resolution.source },
    });
    if (this.flow) {
      await eventLog.append({
        type: "flow.snapshot.written",
        message: `Resolved Flow ${this.flow.flowId} snapshot persisted.`,
        data: {
          flowId: this.flow.flowId,
          flowVersion: this.flow.flowVersion,
          snapshotPath: "flow.json",
        },
      });
    }
    if (this.readOnly) {
      await eventLog.append({
        type: "policy.warning",
        message:
          "Read-only run: executor and fix loop will be skipped. Every agent is forced to the readOnly permission profile. Apply/validate/revert routes are refused.",
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

    let planArtifact: RoleRunResult | null = null;
    let architectureArtifact: RoleRunResult | null = null;
    let executionArtifact: RoleRunResult | null = null;
    let reviewArtifact: RoleRunResult | null = null;
    let verificationArtifact: RoleRunResult | null = null;
    let lastValidation: ValidationResults | null = null;
    let reviewDecision: ReviewDecision = "BLOCKED";
    let verificationDecision: VerificationDecision = "NEEDS_HUMAN";
    let reviewLoopsCompleted = 0;

    // Rewind: when resuming, the stages before `fromStage` are skipped and
    // their artifacts are seeded from the source run. STAGE_ORD lets each
    // stage block guard itself; a fresh worktree off main is correct because
    // architecting/executing regenerate the downstream code.
    const STAGE_ORD = { planning: 0, architecting: 1, executing: 2 } as const;
    const startOrd = this.resumeFrom
      ? STAGE_ORD[this.resumeFrom.fromStage]
      : 0;
    if (this.resumeFrom) {
      await artifactStore.write("02-plan.md", this.resumeFrom.seededPlan);
      planArtifact = this.seededRoleResult("planner", this.resumeFrom.seededPlan);
      if (this.resumeFrom.fromStage === "executing") {
        const arch = this.resumeFrom.seededArchitecture ?? "";
        await artifactStore.write("04-architecture.md", arch);
        architectureArtifact = this.seededRoleResult("architect", arch);
      }
      await eventLog.append({
        type: "run.rewound",
        message: `Rewound from run ${this.resumeFrom.sourceRunId} to ${this.resumeFrom.fromStage}; reused plan${
          this.resumeFrom.fromStage === "executing" ? " + architecture" : ""
        } instead of regenerating it.`,
        data: {
          sourceRunId: this.resumeFrom.sourceRunId,
          fromStage: this.resumeFrom.fromStage,
        },
      });
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

    // Tracks which policy-required stages have already paused this run.
    // The same stage running again (e.g. reviewing inside a fixer loop) does
    // not re-trigger policy approval — V0 keeps it once-per-stage-per-run.
    const policyStagesAlreadyForced = new Set<string>();

    if (this.flow) {
      return this.runFlowSequence({
        snapshot: this.flow,
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

    try {
      // Earliest pause gate: a user who queued `amaco pause <runId>`
      // before the run started gets paused before any agent runs.
      state = await applyPauseIfRequested({
        state,
        store: stateStore,
        events: eventLog,
      });
      if (isTerminal(state.status)) throw new __ApprovalRejectedSignal();
      // Stage: planning — skipped when rewinding (plan seeded from source).
      if (startOrd === STAGE_ORD.planning) {
        this.onProgress("Planning...");
        state = applyTransition(state, "planning");
        await stateStore.write(state);
        planArtifact = await this.runRole({
          roleId: "planner",
          stageId: "planning",
          promptIndex: 1,
          outputName: "02-plan.md",
          priorArtifacts: [],
          validationResults: null,
          metricsStore,
          ctx,
        });
        state = applyTransition(state, "planned");
        await stateStore.write(state);
        const gate = await this.maybeAwaitApproval({
          state,
          fromStatus: "planned",
          stageId: "planning",
          roleId: "planner",
          roleArtifact: planArtifact,
          approvalService,
          stateStore,
          eventLog,
          policyStagesAlreadyForced,
        });
        state = gate.state;
        if (gate.rejected) {
          await eventLog.append({
            type: "run.completed",
            message: `Run ${runId} blocked after rejected approval.`,
          });
          throw new __ApprovalRejectedSignal();
        }
      }
      if (!planArtifact) {
        throw new Error(
          "Internal: plan artifact is required before architecting.",
        );
      }

      // Pause gate: between planning and architecting.
      state = await applyPauseIfRequested({
        state,
        store: stateStore,
        events: eventLog,
      });
      if (isTerminal(state.status)) throw new __ApprovalRejectedSignal();
      // Stage: architecting — skipped when rewinding to executing (architecture
      // seeded from source); runs normally otherwise (incl. rewind-to-architecting).
      if (startOrd <= STAGE_ORD.architecting) {
        this.onProgress("Architecting...");
        state = applyTransition(state, "architecting");
        await stateStore.write(state);
        architectureArtifact = await this.runRole({
          roleId: "architect",
          stageId: "architecting",
          promptIndex: 3,
          outputName: "04-architecture.md",
          priorArtifacts: [{ label: "Plan", content: planArtifact.output }],
          validationResults: null,
          metricsStore,
          ctx,
        });
        state = applyTransition(state, "architected");
        await stateStore.write(state);
        const gate = await this.maybeAwaitApproval({
          state,
          fromStatus: "architected",
          stageId: "architecting",
          roleId: "architect",
          roleArtifact: architectureArtifact,
          approvalService,
          stateStore,
          eventLog,
          policyStagesAlreadyForced,
        });
        state = gate.state;
        if (gate.rejected) {
          await eventLog.append({
            type: "run.completed",
            message: `Run ${runId} blocked after rejected approval.`,
          });
          throw new __ApprovalRejectedSignal();
        }
      }
      if (!architectureArtifact) {
        throw new Error(
          "Internal: architecture artifact is required before executing.",
        );
      }

      // Pause gate: between architecting and executing.
      state = await applyPauseIfRequested({
        state,
        store: stateStore,
        events: eventLog,
      });
      if (isTerminal(state.status)) throw new __ApprovalRejectedSignal();
      // Stage: executing — SKIPPED for read-only runs. Read-only runs
      // are investigation-only; the reviewer reviews plan + architecture
      // and we transition straight to merge_ready (or blocked). The
      // validation runner is also skipped (nothing to validate). The fix
      // loop is gated below (line further down) so it can't fire.
      let approved = false;
      let blocked = false;
      if (!this.readOnly) {
        this.onProgress("Executing...");
        state = applyTransition(state, "executing");
        await stateStore.write(state);
        executionArtifact = await this.runRole({
          roleId: "executor",
          stageId: "executing",
          promptIndex: 5,
          outputName: "06-execution-output.md",
          priorArtifacts: [
            { label: "Plan", content: planArtifact.output },
            { label: "Architecture", content: architectureArtifact.output },
          ],
          validationResults: null,
          metricsStore,
          ctx,
        });
        {
          const gate = await this.maybeAwaitApproval({
            state,
            fromStatus: "executing",
            stageId: "executing",
            roleId: "executor",
            roleArtifact: executionArtifact,
            approvalService,
            stateStore,
            eventLog,
            policyStagesAlreadyForced,
          });
          state = gate.state;
          if (gate.rejected) {
            await eventLog.append({
              type: "run.completed",
              message: `Run ${runId} blocked after rejected approval.`,
            });
            throw new __ApprovalRejectedSignal();
          }
        }

        // Pause gate: between executing and the validate→review loop.
        state = await applyPauseIfRequested({
          state,
          store: stateStore,
          events: eventLog,
        });
        if (isTerminal(state.status)) throw new __ApprovalRejectedSignal();
        // First validation
        state = applyTransition(state, "validating");
        await stateStore.write(state);
        this.onProgress("Validating...");
        lastValidation = await this.runValidation({
          artifactsName: "07-validation-results.json",
          ctx,
        });
        if (lastValidation.summary.failed > 0) {
          notify(
            draftValidationFailed({
              runId,
              taskId: this.taskId,
              failedCount: lastValidation.summary.failed,
            }),
          );
        }
      }

      // Reviewing loop
      state = applyTransition(state, "reviewing");
      await stateStore.write(state);
      this.onProgress("Reviewing...");
      reviewArtifact = await this.runRole({
        roleId: "reviewer",
        stageId: "reviewing",
        promptIndex: 8,
        outputName: "09-review.md",
        priorArtifacts: this.collectPriors({
          plan: planArtifact,
          architecture: architectureArtifact,
          execution: executionArtifact,
        }),
        validationResults: lastValidation,
        metricsStore,
        ctx,
      });
      reviewDecision = effectiveReviewDecision(reviewArtifact.output);
      await this.ingestSuggestionsFromArtifact({
        runId,
        artifactRelPath: reviewArtifact.outputArtifactPath,
        artifactBody: reviewArtifact.output,
        source: "reviewer",
        notify,
      });
      {
        const gate = await this.maybeAwaitApproval({
          state,
          fromStatus: "reviewing",
          stageId: "reviewing",
          roleId: "reviewer",
          roleArtifact: reviewArtifact,
          approvalService,
          stateStore,
          eventLog,
          policyStagesAlreadyForced,
        });
        state = gate.state;
        if (gate.rejected) {
          await eventLog.append({
            type: "run.completed",
            message: `Run ${runId} blocked after rejected approval.`,
          });
          throw new __ApprovalRejectedSignal();
        }
      }
      await eventLog.append({
        type: "review.decision",
        message: `Reviewer decision: ${reviewDecision}`,
        data: { decision: reviewDecision, loop: 0 },
      });

      // Fix loop is unreachable for read-only runs: there's nothing to
      // fix (no executor output). On a read-only CHANGES_REQUESTED, treat
      // it as BLOCKED so the run ends with an honest verdict rather than
      // sitting in a half-completed state.
      if (this.readOnly && reviewDecision === "CHANGES_REQUESTED") {
        reviewDecision = "BLOCKED";
      }

      while (
        !this.readOnly &&
        reviewDecision === "CHANGES_REQUESTED" &&
        reviewLoopsCompleted < state.maxReviewLoops
      ) {
        reviewLoopsCompleted += 1;
        state = applyTransition(state, "fixing");
        state = { ...state, reviewLoopCount: reviewLoopsCompleted };
        await stateStore.write(state);
        this.onProgress(
          `Fixing (loop ${reviewLoopsCompleted}/${state.maxReviewLoops})...`,
        );

        const loopRel = path.posix.join("loops", `loop-${reviewLoopsCompleted}`);
        const fixerOutputName = path.posix.join(loopRel, "fix-output.md");

        const fixArtifact = await this.runRole({
          roleId: "fixer",
          stageId: "fixing",
          promptIndex: 0,
          outputName: fixerOutputName,
          promptName: path.posix.join(loopRel, "fixer-prompt.md"),
          priorArtifacts: [
            ...this.collectPriors({
              plan: planArtifact,
              architecture: architectureArtifact,
              execution: executionArtifact,
            }),
            { label: "Latest Review", content: reviewArtifact.output },
          ],
          validationResults: lastValidation,
          metricsStore,
          ctx,
        });
        {
          const gate = await this.maybeAwaitApproval({
            state,
            fromStatus: "fixing",
            stageId: "fixing",
            roleId: "fixer",
            roleArtifact: fixArtifact,
            approvalService,
            stateStore,
            eventLog,
            policyStagesAlreadyForced,
          });
          state = gate.state;
          if (gate.rejected) {
            await eventLog.append({
              type: "run.completed",
              message: `Run ${runId} blocked after rejected approval.`,
            });
            throw new __ApprovalRejectedSignal();
          }
        }

        // Re-validate
        state = applyTransition(state, "validating");
        await stateStore.write(state);
        this.onProgress(`Validating (loop ${reviewLoopsCompleted})...`);
        lastValidation = await this.runValidation({
          artifactsName: path.posix.join(loopRel, "validation-results.json"),
          ctx,
        });

        // Re-review
        state = applyTransition(state, "reviewing");
        await stateStore.write(state);
        this.onProgress(`Reviewing (loop ${reviewLoopsCompleted})...`);
        reviewArtifact = await this.runRole({
          roleId: "reviewer",
          stageId: "reviewing",
          promptIndex: 0,
          outputName: path.posix.join(loopRel, "review.md"),
          promptName: path.posix.join(loopRel, "reviewer-prompt.md"),
          priorArtifacts: [
            ...this.collectPriors({
              plan: planArtifact,
              architecture: architectureArtifact,
              execution: executionArtifact,
            }),
            { label: "Latest Fix", content: fixArtifact.output },
          ],
          validationResults: lastValidation,
          metricsStore,
          ctx,
        });
        reviewDecision = effectiveReviewDecision(reviewArtifact.output);
        await this.ingestSuggestionsFromArtifact({
          runId,
          artifactRelPath: reviewArtifact.outputArtifactPath,
          artifactBody: reviewArtifact.output,
          source: "reviewer",
          notify,
        });
        {
          const gate = await this.maybeAwaitApproval({
            state,
            fromStatus: "reviewing",
            stageId: "reviewing",
            roleId: "reviewer",
            roleArtifact: reviewArtifact,
            approvalService,
            stateStore,
            eventLog,
            policyStagesAlreadyForced,
          });
          state = gate.state;
          if (gate.rejected) {
            await eventLog.append({
              type: "run.completed",
              message: `Run ${runId} blocked after rejected approval.`,
            });
            throw new __ApprovalRejectedSignal();
          }
        }
        await eventLog.append({
          type: "review.decision",
          message: `Reviewer decision: ${reviewDecision}`,
          data: { decision: reviewDecision, loop: reviewLoopsCompleted },
        });
      }

      if (reviewDecision === "APPROVED") {
        approved = true;
      } else if (reviewDecision === "BLOCKED") {
        blocked = true;
      } else {
        // CHANGES_REQUESTED but max loops reached
        blocked = true;
      }

      state = { ...state, finalDecision: reviewDecision };
      await stateStore.write(state);

      if (blocked) {
        state = applyTransition(state, "blocked");
        await stateStore.write(state);
        await eventLog.append({
          type: "run.completed",
          message: `Run ${runId} blocked.`,
          data: { decision: reviewDecision },
        });
      } else if (approved && this.readOnly) {
        // Read-only approved: skip verifying (nothing was changed, nothing
        // to verify), transition straight to merge_ready. The final
        // report's "Verification" section honestly shows "skipped — read-only run".
        state = applyTransition(state, "merge_ready");
        await stateStore.write(state);
        await eventLog.append({
          type: "run.completed",
          message: `Run ${runId} completed (read-only — investigation approved).`,
          data: { decision: reviewDecision, readOnly: true },
        });
      } else if (approved) {
        // Pause gate: between approved-review and verifying.
        state = await applyPauseIfRequested({
          state,
          store: stateStore,
          events: eventLog,
        });
        if (isTerminal(state.status)) throw new __ApprovalRejectedSignal();
        // Stage: verifying
        state = applyTransition(state, "verifying");
        await stateStore.write(state);
        this.onProgress("Verifying...");
        verificationArtifact = await this.runRole({
          roleId: "verifier",
          stageId: "verifying",
          promptIndex: 10,
          outputName: "11-verification.md",
          priorArtifacts: [
            ...this.collectPriors({
              plan: planArtifact,
              architecture: architectureArtifact,
              execution: executionArtifact,
            }),
            { label: "Latest Review", content: reviewArtifact.output },
          ],
          validationResults: lastValidation,
          metricsStore,
          ctx,
        });
        verificationDecision = effectiveVerificationDecision(
          verificationArtifact.output,
        );
        await this.ingestSuggestionsFromArtifact({
          runId,
          artifactRelPath: verificationArtifact.outputArtifactPath,
          artifactBody: verificationArtifact.output,
          source: "verifier",
          notify,
        });
        {
          const gate = await this.maybeAwaitApproval({
            state,
            fromStatus: "verifying",
            stageId: "verifying",
            roleId: "verifier",
            roleArtifact: verificationArtifact,
            approvalService,
            stateStore,
            eventLog,
            policyStagesAlreadyForced,
          });
          state = gate.state;
          if (gate.rejected) {
            await eventLog.append({
              type: "run.completed",
              message: `Run ${runId} blocked after rejected approval.`,
            });
            throw new __ApprovalRejectedSignal();
          }
        }
        await eventLog.append({
          type: "verification.decision",
          message: `Verifier decision: ${verificationDecision}`,
          data: { decision: verificationDecision },
        });
        state = { ...state, verification: verificationDecision };
        await stateStore.write(state);

        if (verificationDecision === "PASSED") {
          state = applyTransition(state, "merge_ready");
        } else {
          state = applyTransition(state, "blocked");
        }
        await stateStore.write(state);
        await eventLog.append({
          type: "run.completed",
          message: `Run ${runId} ${state.status}.`,
          data: { decision: reviewDecision, verification: verificationDecision },
        });
        notify(
          draftRunCompleted({
            runId,
            taskId: this.taskId,
            status: state.status as "merge_ready" | "blocked" | "failed",
            decision: reviewDecision,
            verification: verificationDecision,
          }),
        );
      }
    } catch (err) {
      if (err instanceof __RunAbortedSignal || this.abortSignal?.aborted) {
        const message = "Run aborted by user signal.";
        try {
          state = applyTransition(state, "aborted");
        } catch {
          // already terminal
        }
        state = { ...state, error: message };
        await stateStore.write(state);
        await eventLog.append({
          type: "run.aborted",
          message,
        });
        try {
          await metricsStore.update((m) => ({ ...m, finalStatus: state.status }));
        } catch {
          // metrics finalize best-effort
        }
        const abortedMetrics = (await metricsStore.read()) ?? null;
        const abortedApprovals = await approvalService.readAll().catch(() => []);
        const finalReportPath = await this.writeFinalReport({
          artifactStore,
          state,
          validation: lastValidation,
          policyWarnings: policy.warnings,
          reviewLoops: reviewLoopsCompleted,
          metrics: abortedMetrics,
          approvals: abortedApprovals,
          artifacts: {
            plan: planArtifact?.outputArtifactPath,
            architecture: architectureArtifact?.outputArtifactPath,
            execution: executionArtifact?.outputArtifactPath,
            review: reviewArtifact?.outputArtifactPath,
            verification: verificationArtifact?.outputArtifactPath,
          },
        });
        return {
          runId,
          state,
          worktreePath,
          branchName,
          finalReportPath,
          policyWarnings: policy.warnings,
        };
      }

      // Daily spend cap hit with capAction=stop: block the run (not "failed")
      // with the cap message. The spend.capped event was already logged.
      if (err instanceof __SpendCapStopSignal) {
        try {
          state = applyTransition(state, "blocked");
        } catch {
          // already terminal
        }
        state = { ...state, error: err.message };
        await stateStore.write(state);
        try {
          await metricsStore.update((m) => ({ ...m, finalStatus: state.status }));
        } catch {
          // best-effort
        }
        const cappedMetrics = (await metricsStore.read()) ?? null;
        const cappedApprovals = await approvalService.readAll().catch(() => []);
        const finalReportPath = await this.writeFinalReport({
          artifactStore,
          state,
          validation: lastValidation,
          policyWarnings: policy.warnings,
          reviewLoops: reviewLoopsCompleted,
          metrics: cappedMetrics,
          approvals: cappedApprovals,
          artifacts: {
            plan: planArtifact?.outputArtifactPath,
            architecture: architectureArtifact?.outputArtifactPath,
            execution: executionArtifact?.outputArtifactPath,
            review: reviewArtifact?.outputArtifactPath,
            verification: verificationArtifact?.outputArtifactPath,
          },
        });
        return {
          runId,
          state,
          worktreePath,
          branchName,
          finalReportPath,
          policyWarnings: policy.warnings,
        };
      }

      // Approval-rejection short-circuit: state is already 'blocked' and the
      // approval.rejected event is already written. Do not mark the run as failed.
      if (err instanceof __ApprovalRejectedSignal) {
        try {
          const allApprovals = await approvalService.readAll();
          const summary = summarizeApprovals(allApprovals);
          await metricsStore.update((m) => ({
            ...m,
            finalStatus: state.status,
            approvalsSummary: summary,
          }));
        } catch {
          // best-effort
        }
        const blockedMetrics = (await metricsStore.read()) ?? null;
        const blockedApprovals = await approvalService.readAll().catch(() => []);
        const finalReportPath = await this.writeFinalReport({
          artifactStore,
          state,
          validation: lastValidation,
          policyWarnings: policy.warnings,
          reviewLoops: reviewLoopsCompleted,
          metrics: blockedMetrics,
          approvals: blockedApprovals,
          artifacts: {
            plan: planArtifact?.outputArtifactPath,
            architecture: architectureArtifact?.outputArtifactPath,
            execution: executionArtifact?.outputArtifactPath,
            review: reviewArtifact?.outputArtifactPath,
            verification: verificationArtifact?.outputArtifactPath,
          },
        });
        notify(
          draftRunCompleted({
            runId,
            taskId: this.taskId,
            status: "blocked",
            decision: state.finalDecision,
          }),
        );
        return {
          runId,
          state,
          worktreePath,
          branchName,
          finalReportPath,
          policyWarnings: policy.warnings,
        };
      }

      const message = describeError(err);
      try {
        state = applyTransition(state, "failed");
      } catch {
        // already terminal
      }
      state = { ...state, error: message };
      await stateStore.write(state);
      await eventLog.append({
        type: "run.failed",
        message: `Run failed: ${message}`,
      });
      notify(
        draftRunCompleted({
          runId,
          taskId: this.taskId,
          status: "failed",
        }),
      );
      try {
        await metricsStore.update((m) => ({ ...m, finalStatus: state.status }));
      } catch {
        // metrics finalize best-effort
      }
      const failureMetrics = (await metricsStore.read()) ?? null;
      const failureApprovals = await approvalService.readAll().catch(() => []);
      await this.writeFinalReport({
        artifactStore,
        state,
        validation: lastValidation,
        policyWarnings: policy.warnings,
        reviewLoops: reviewLoopsCompleted,
        metrics: failureMetrics,
        approvals: failureApprovals,
        artifacts: {
          plan: planArtifact?.outputArtifactPath,
          architecture: architectureArtifact?.outputArtifactPath,
          execution: executionArtifact?.outputArtifactPath,
          review: reviewArtifact?.outputArtifactPath,
          verification: verificationArtifact?.outputArtifactPath,
        },
      });
      if (err instanceof AmacoError) throw err;
      throw err instanceof Error ? err : new Error(message);
    }

    // Finalize metrics (record final status + review loops + approvals summary).
    const allApprovals = await approvalService.readAll();
    const approvalsSummary = summarizeApprovals(allApprovals);
    await metricsStore.update((m) => ({
      ...m,
      finalStatus: state.status,
      reviewLoopCount: reviewLoopsCompleted,
      validationSummary: lastValidation
        ? {
            total: lastValidation.summary.total,
            passed: lastValidation.summary.passed,
            failed: lastValidation.summary.failed,
          }
        : null,
      approvalsSummary,
    }));

    const finalMetrics = (await metricsStore.read()) ?? null;
    const finalApprovals = allApprovals;

    const finalReportPath = await this.writeFinalReport({
      artifactStore,
      state,
      validation: lastValidation,
      policyWarnings: policy.warnings,
      reviewLoops: reviewLoopsCompleted,
      metrics: finalMetrics,
      approvals: finalApprovals,
      artifacts: {
        plan: planArtifact?.outputArtifactPath,
        architecture: architectureArtifact?.outputArtifactPath,
        execution: executionArtifact?.outputArtifactPath,
        review: reviewArtifact?.outputArtifactPath,
        verification: verificationArtifact?.outputArtifactPath,
      },
    });

    return {
      runId,
      state,
      worktreePath,
      branchName,
      finalReportPath,
      policyWarnings: policy.warnings,
    };
  }

  /** Synthetic RoleRunResult for an artifact seeded from a prior run during a
   *  rewind. Only `.output` is read downstream (collectPriors + inline
   *  priorArtifacts); the provider stub records that no agent turn was spent
   *  regenerating it — no metrics entry, no cost. */
  private seededRoleResult(roleId: string, output: string): RoleRunResult {
    const ts = nowIso();
    return {
      roleId,
      output,
      outputArtifactPath:
        roleId === "planner" ? "02-plan.md" : "04-architecture.md",
      promptArtifactPath: "",
      providerResult: {
        providerId: "(seeded)",
        command: "(seeded)",
        args: [],
        cwd: this.projectRoot,
        exitCode: 0,
        stdout: output,
        stderr: "",
        durationMs: 0,
        startedAt: ts,
        endedAt: ts,
        session: null,
      },
    };
  }

  private collectPriors(input: {
    plan: RoleRunResult | null;
    architecture: RoleRunResult | null;
    execution: RoleRunResult | null;
  }): PriorArtifact[] {
    const out: PriorArtifact[] = [];
    if (input.plan) out.push({ label: "Plan", content: input.plan.output });
    if (input.architecture)
      out.push({ label: "Architecture", content: input.architecture.output });
    if (input.execution)
      out.push({ label: "Implementation Summary", content: input.execution.output });
    return out;
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
        slotId: step.slotId,
        roleId: step.roleId,
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
      throw new Error("Cannot update a Flow step on a legacy run.");
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
      throw new Error("Cannot update Flow participants on a legacy run.");
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
        return step.roleId === "planner" ? "planning" : "executing";
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
    let lastValidation: ValidationResults | null = null;
    let reviewDecision: ReviewDecision = "BLOCKED";
    let verificationDecision: VerificationDecision = "NEEDS_HUMAN";
    let planArtifact: RoleRunResult | null = null;
    let executionArtifact: RoleRunResult | null = null;
    let reviewArtifact: RoleRunResult | null = null;
    let verificationArtifact: RoleRunResult | null = null;
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
        message: `Flow participant ${participant.slotId} uses ${participant.providerId} with ${participant.capabilities.sessionReuse} session reuse.`,
        data: {
          flowId: input.snapshot.flowId,
          slotId: participant.slotId,
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
      for (const step of input.snapshot.steps) {
        if (!step.enabled) {
          state = this.patchFlowStep(
            state,
            step.id,
            { status: "skipped", endedAt: nowIso() },
            step.id,
          );
          await input.stateStore.write(state);
          await input.eventLog.append({
            type: "flow.step.skipped",
            message: `Flow step ${step.id} skipped.`,
            data: { flowId: input.snapshot.flowId, stepId: step.id },
          });
          continue;
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

        const preparedTurn = step.slotId && step.roleId
          ? prepareFlowParticipantTurn(participantLedger, step.slotId)
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
            roleId: step.roleId,
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
          continue;
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
          continue;
        }

        if (!step.roleId) {
          throw new Error(`Flow step "${step.id}" needs an agent.`);
        }

        const result = await this.runRole({
          roleId: step.roleId,
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
                  slotId: preparedTurn.slotId,
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
            roleId: step.roleId,
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
            message: `Flow participant ${preparedTurn.slotId} completed ${step.id} with ${preparedTurn.contextMode} context.`,
            data: {
              flowId: input.snapshot.flowId,
              stepId: step.id,
              slotId: preparedTurn.slotId,
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
          stageId: step.id,
          roleId: step.roleId,
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
      }

      const validationPassed =
        lastValidation === null || lastValidation.summary.failed === 0;
      state = {
        ...state,
        finalDecision: reviewDecision,
        verification: verificationDecision,
      };
      await input.stateStore.write(state);
      state = applyTransition(
        state,
        reviewDecision === "APPROVED" &&
          verificationDecision === "PASSED" &&
          validationPassed
          ? "merge_ready"
          : "blocked",
      );
      await input.stateStore.write(state);
      await input.eventLog.append({
        type: "run.completed",
        message: `Flow run ${input.runId} ${state.status}.`,
        data: {
          flowId: input.snapshot.flowId,
          decision: reviewDecision,
          verification: verificationDecision,
          validationPassed,
        },
      });
      input.notify(
        draftRunCompleted({
          runId: input.runId,
          taskId: this.taskId,
          status: state.status as "merge_ready" | "blocked",
          decision: reviewDecision,
          verification: verificationDecision,
        }),
      );
    } catch (err) {
      if (!(err instanceof __ApprovalRejectedSignal)) {
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
          planArtifact,
          executionArtifact,
          reviewArtifact,
          verificationArtifact,
        });
        if (err instanceof AmacoError) throw err;
        throw err instanceof Error ? err : new Error(message);
      }
    }

    const approvals = await input.approvalService.readAll();
    await input.metricsStore.update((metrics) => ({
      ...metrics,
      finalStatus: state.status,
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
      reviewLoops: 0,
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
   * Capture AMACO_SUGGESTION marker blocks from a stage artifact. Best-effort:
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
    // the daily cap and apply the configured action (warn / reduce-effort /
    // downgrade-model / stop). Runs before provider resolution so a downgrade
    // applies to this turn too.
    await this.enforceSpendCap(ctx);
    const agent = getRoleConfig(this.config.roles, roleId);
    // Read-only runs override every agent's permission profile to
    // "readOnly", regardless of how the agent is configured. resolveProfile
    // will throw if the project doesn't define `readOnly`; we surface that
    // as a config error rather than silently letting writes through.
    const effectivePermissions = this.readOnly ? "readOnly" : agent.permissions;
    const profile = resolveProfile(
      this.config.permissions.profiles,
      effectivePermissions,
    );
    // Effective provider id: run-wide resolved override (effort or
    // explicit) beats the agent's default. Falls back to the agent's
    // configured provider when no override applies or the override
    // couldn't be resolved.
    const effectiveProviderId =
      input.providerId ?? this.runtimeProviderId() ?? agent.provider;

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
        flowSlotId: input.flowTurn?.slotId ?? null,
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

    // Honor `amaco abort` mid-stage: poll state.json every 500ms; when
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
        flowSlotId: input.flowTurn?.slotId ?? null,
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
      flowSlotId: input.flowTurn?.slotId ?? null,
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
   * The provider id that should override agent.provider for this run, OR
   * null when no override is in effect. Cached at run start
   * (state.resolvedProviderId) but re-derived here so the orchestrator
   * never has to thread state through to every runRole call.
   */
  private runtimeProviderId(): string | null {
    const resolution = resolveEffort({
      effort: this.effort,
      providerOverride: this.providerOverride,
      config: this.config,
    });
    return resolution.providerId;
  }

  /** Drop effort one notch (high→medium→low; none→low). False if already lowest. */
  private lowerEffort(): boolean {
    if (this.effort === "high") {
      this.effort = "medium";
      return true;
    }
    if (this.effort === "medium" || this.effort === null) {
      this.effort = "low";
      return true;
    }
    return false;
  }

  /** Switch to the configured cheaper provider (budget.fallbackProvider, else
   *  effortMap.low). False if none, already on it, or not configured. */
  private downgradeProvider(): boolean {
    const target =
      this.config.budget?.fallbackProvider ?? this.config.effortMap?.low ?? null;
    if (!target || target === this.providerOverride) return false;
    if (!this.config.providers[target]) return false;
    this.providerOverride = target;
    return true;
  }

  /**
   * Enforce the daily spend cap before an agent turn. Warns once at the
   * threshold; at the cap applies `capAction` (reduce-effort / downgrade-model
   * fall back to stop when no cheaper option remains). "stop" throws a signal
   * the run loop turns into a blocked run. No cap configured ⇒ no-op.
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
    if (budget.capAction === "reduce-effort" && this.lowerEffort()) {
      await ctx.eventLog.append({
        type: "spend.action",
        message: `${at}; reduced effort to "${this.effort}" and continued.`,
        data: { action: "reduce-effort", effort: this.effort, dailySpendUsd },
      });
      return;
    }
    if (budget.capAction === "downgrade-model" && this.downgradeProvider()) {
      await ctx.eventLog.append({
        type: "spend.action",
        message: `${at}; downgraded provider to "${this.providerOverride}" and continued.`,
        data: {
          action: "downgrade-model",
          provider: this.providerOverride,
          dailySpendUsd,
        },
      });
      return;
    }
    // "stop", or reduce/downgrade with no cheaper option left.
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
