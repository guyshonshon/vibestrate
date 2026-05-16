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
import { buildAgentPrompt, type PriorArtifact } from "./prompt-builder.js";
import { renderFinalReport } from "./final-report.js";
import { runPreflightChecks, type PolicyWarning } from "./policy-engine.js";
import type { ProjectConfig } from "../project/config-schema.js";
import { loadAgentPrompt } from "../project/config-loader.js";
import { getAgentConfig } from "../agents/agent-registry.js";
import { resolveProfile } from "../permissions/permission-profiles.js";
import { assertExecutableContext, resolveCwd } from "../permissions/access-policy.js";
import { loadSkills } from "../skills/skill-loader.js";
import { runProvider, type RichProviderRunResult } from "../providers/provider-runner.js";
import { localWorktreeBackend } from "../execution/local-worktree-backend.js";
import { isGitAvailable } from "../git/git.js";
import { GitError, AmacoError, describeError } from "../utils/errors.js";
import { formatRunIdTimestamp, nowIso, durationMs } from "../utils/time.js";
import { slugify } from "../utils/slug.js";
import type { ProviderRunResult } from "../providers/provider-types.js";
import { MetricsStore } from "./metrics-store.js";
import { makeEmptyMetrics, type AgentMetrics } from "./runtime-metrics.js";
import { getDiffSnapshot } from "./diff-service.js";
import { ApprovalService } from "./approval-service.js";
import { detectApprovalRequest } from "./approval-types.js";
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
};

export type OrchestratorOutput = {
  runId: string;
  state: RunState;
  worktreePath: string | null;
  branchName: string | null;
  finalReportPath: string;
  policyWarnings: PolicyWarning[];
};

type AgentRunResult = {
  agentId: string;
  output: string;
  outputArtifactPath: string;
  promptArtifactPath: string;
  providerResult: ProviderRunResult;
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

export class Orchestrator {
  private readonly projectRoot: string;
  private readonly config: ProjectConfig;
  private readonly rules: string;
  private readonly task: string;
  private readonly isGitRepo: boolean;
  private readonly onProgress: (message: string) => void;
  private readonly taskId: string | null;
  private readonly effort: "low" | "medium" | "high" | null;
  private readonly providerOverride: string | null;
  private readonly readOnly: boolean;

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
      readOnly: this.readOnly,
    };
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

    let planArtifact: AgentRunResult | null = null;
    let architectureArtifact: AgentRunResult | null = null;
    let executionArtifact: AgentRunResult | null = null;
    let reviewArtifact: AgentRunResult | null = null;
    let verificationArtifact: AgentRunResult | null = null;
    let lastValidation: ValidationResults | null = null;
    let reviewDecision: ReviewDecision = "BLOCKED";
    let verificationDecision: VerificationDecision = "NEEDS_HUMAN";
    let reviewLoopsCompleted = 0;

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

    try {
      // Earliest pause gate: a user who queued `amaco pause <runId>`
      // before the run started gets paused before any agent runs.
      state = await applyPauseIfRequested({
        state,
        store: stateStore,
        events: eventLog,
      });
      if (isTerminal(state.status)) throw new __ApprovalRejectedSignal();
      // Stage: planning
      this.onProgress("Planning...");
      state = applyTransition(state, "planning");
      await stateStore.write(state);
      planArtifact = await this.runAgent({
        agentId: "planner",
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
      {
        const gate = await this.maybeAwaitApproval({
          state,
          fromStatus: "planned",
          stageId: "planning",
          agentId: "planner",
          agentArtifact: planArtifact,
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

      // Pause gate: between planning and architecting.
      state = await applyPauseIfRequested({
        state,
        store: stateStore,
        events: eventLog,
      });
      if (isTerminal(state.status)) throw new __ApprovalRejectedSignal();
      // Stage: architecting
      this.onProgress("Architecting...");
      state = applyTransition(state, "architecting");
      await stateStore.write(state);
      architectureArtifact = await this.runAgent({
        agentId: "architect",
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
      {
        const gate = await this.maybeAwaitApproval({
          state,
          fromStatus: "architected",
          stageId: "architecting",
          agentId: "architect",
          agentArtifact: architectureArtifact,
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
        executionArtifact = await this.runAgent({
          agentId: "executor",
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
            agentId: "executor",
            agentArtifact: executionArtifact,
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
      reviewArtifact = await this.runAgent({
        agentId: "reviewer",
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
          agentId: "reviewer",
          agentArtifact: reviewArtifact,
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

        const fixArtifact = await this.runAgent({
          agentId: "fixer",
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
            agentId: "fixer",
            agentArtifact: fixArtifact,
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
        reviewArtifact = await this.runAgent({
          agentId: "reviewer",
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
            agentId: "reviewer",
            agentArtifact: reviewArtifact,
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
        verificationArtifact = await this.runAgent({
          agentId: "verifier",
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
            agentId: "verifier",
            agentArtifact: verificationArtifact,
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

  private collectPriors(input: {
    plan: AgentRunResult | null;
    architecture: AgentRunResult | null;
    execution: AgentRunResult | null;
  }): PriorArtifact[] {
    const out: PriorArtifact[] = [];
    if (input.plan) out.push({ label: "Plan", content: input.plan.output });
    if (input.architecture)
      out.push({ label: "Architecture", content: input.architecture.output });
    if (input.execution)
      out.push({ label: "Implementation Summary", content: input.execution.output });
    return out;
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

  /**
   * If `agentArtifact.output` contains `HUMAN_APPROVAL: REQUIRED`, transition
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
    agentId: string;
    agentArtifact: AgentRunResult | null;
    approvalService: ApprovalService;
    stateStore: RunStateStore;
    eventLog: EventLog;
    /** Tracks which policy stages have already triggered approval this run (mutated). */
    policyStagesAlreadyForced: Set<string>;
  }): Promise<{ state: RunState; rejected: boolean }> {
    const detection = input.agentArtifact
      ? detectApprovalRequest(input.agentArtifact.output)
      : null;
    const policyStages = this.config.policies.requireApprovalAtStages;
    const policyForcedThisStage =
      policyStages.includes(input.stageId as (typeof policyStages)[number]) &&
      !input.policyStagesAlreadyForced.has(input.stageId);

    const agentRequested = !!detection?.required;
    if (!agentRequested && !policyForcedThisStage) {
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
    const source: "agent" | "policy" = agentRequested ? "agent" : "policy";
    const alsoRequiredByPolicy = agentRequested && policyForcedThisStage;

    if (policyForcedThisStage) {
      input.policyStagesAlreadyForced.add(input.stageId);
    }

    this.onProgress(
      agentRequested
        ? `Pausing for human approval (${input.agentId} requested it)...`
        : `Pausing for human approval (project policy requires approval at ${input.stageId})...`,
    );

    // Create the (single) approval request and pause.
    const req = await input.approvalService.create({
      stageId: input.stageId,
      agentId: input.agentId,
      reason,
      prompt: input.agentArtifact?.promptArtifactPath ?? null,
      sourceArtifactPath: input.agentArtifact?.outputArtifactPath ?? null,
      requestedAction,
      riskLevel,
      source,
      alsoRequiredByPolicy,
    });

    let pendingState: RunState = applyTransition(input.state, "waiting_for_approval");
    pendingState = {
      ...pendingState,
      pendingApprovalId: req.id,
      approvalRequestedFromStatus: input.fromStatus,
    };
    await input.stateStore.write(pendingState);
    // Fire a notification so the dashboard / CLI / external gateways can
    // alert the user; never blocks the gate loop.
    const _notify = (this as unknown as { _notify?: (d: NotificationDraft) => void })._notify;
    if (_notify) {
      _notify(
        draftApprovalRequested({
          runId: input.state.runId,
          approvalId: req.id,
          agentId: input.agentId,
          stageId: input.stageId,
          reason: reason ?? null,
        }),
      );
    }
    await input.eventLog.append({
      type: "approval.requested",
      message: agentRequested
        ? `Approval requested by ${input.agentId} at stage ${input.stageId}.`
        : `Approval required by project policy at stage ${input.stageId}.`,
      data: {
        approvalId: req.id,
        agentId: input.agentId,
        stageId: input.stageId,
        reason: reason ?? null,
        requestedAction,
        riskLevel,
        source,
        alsoRequiredByPolicy,
      },
    });

    const resolved = await input.approvalService.waitForResolution(req.id, {
      pollMs: 1500,
    });

    if (resolved.status === "approved") {
      // Round-trip back to the prior status so the caller's next transition works.
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
        message: `Run resumed at stage ${input.stageId}.`,
        data: { stageId: input.stageId },
      });
      return { state: next, rejected: false };
    }

    // rejected (or expired — treat as rejected for safety)
    let blockedState: RunState = applyTransition(pendingState, "blocked");
    blockedState = {
      ...blockedState,
      pendingApprovalId: null,
      approvalRequestedFromStatus: null,
    };
    await input.stateStore.write(blockedState);
    await input.eventLog.append({
      type: resolved.status === "rejected" ? "approval.rejected" : "approval.expired",
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

  private async runAgent(input: {
    agentId: string;
    stageId: string;
    promptIndex: number;
    outputName: string;
    promptName?: string;
    priorArtifacts: PriorArtifact[];
    validationResults: ValidationResults | null;
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
  }): Promise<AgentRunResult> {
    const { agentId, ctx } = input;
    const agent = getAgentConfig(this.config.agents, agentId);
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
      this.runtimeProviderId() ?? agent.provider;

    assertExecutableContext({
      agentId,
      profile,
      projectRoot: this.projectRoot,
      worktreePath: ctx.worktreePath,
    });

    const cwd = resolveCwd({
      agentId,
      profile,
      projectRoot: this.projectRoot,
      worktreePath: ctx.worktreePath,
    });

    const promptTemplate = await loadAgentPrompt(this.projectRoot, agent.prompt);
    const skills = await loadSkills(this.projectRoot, agent.skills);

    const prompt = buildAgentPrompt({
      agentId,
      task: this.task,
      rules: this.rules,
      agentPromptTemplate: promptTemplate,
      skills,
      priorArtifacts: input.priorArtifacts,
      permission: profile,
      permissionName: agent.permissions,
      worktreePath: ctx.worktreePath,
      branchName: ctx.branchName,
      projectName: this.config.project.name,
      validationResults: input.validationResults,
    });

    const promptName = input.promptName ?? this.defaultPromptName(input.promptIndex, agentId);
    const promptArtifactPathAbs = await ctx.artifactStore.write(promptName, prompt);

    await ctx.eventLog.append({
      type: "agent.started",
      message: `Agent ${agentId} starting.`,
      data: { agentId, provider: effectiveProviderId, permissions: effectivePermissions },
    });
    await ctx.eventLog.append({
      type: "provider.started",
      message: `Provider ${effectiveProviderId} invoked for ${agentId}.`,
      data: { agentId, provider: effectiveProviderId, cwd },
    });

    let providerResult: RichProviderRunResult;
    const stageStart = new Date();
    try {
      providerResult = await runProvider(this.config.providers, {
        providerId: effectiveProviderId,
        prompt,
        cwd,
      });
    } catch (err) {
      const stageEnd = new Date();
      await ctx.eventLog.append({
        type: "provider.failed",
        message: `Provider ${effectiveProviderId} failed for ${agentId}: ${describeError(err)}`,
        data: { agentId, provider: effectiveProviderId },
      });
      await ctx.eventLog.append({
        type: "agent.failed",
        message: `Agent ${agentId} failed.`,
        data: { agentId },
      });
      // Record a partial metric so the dashboard reflects the failure.
      const providerCfg = this.config.providers[effectiveProviderId];
      const failedMetric: AgentMetrics = {
        agentId,
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
        model: null,
        totalCostUsd: null,
        perModelCost: [],
        tokenUsage: null,
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
      await input.metricsStore.appendAgentMetrics(failedMetric);
      throw err;
    }

    const stdout = providerResult.stdout || "";
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
      message: `Provider ${effectiveProviderId} completed for ${agentId}.`,
      data: {
        agentId,
        provider: effectiveProviderId,
        exitCode: providerResult.exitCode,
        durationMs: providerResult.durationMs,
      },
    });
    await ctx.eventLog.append({
      type: "agent.completed",
      message: `Agent ${agentId} completed.`,
      data: { agentId, exitCode: providerResult.exitCode },
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

    const claudeMetrics = providerResult.claudeMetrics;
    const providerCfg = this.config.providers[effectiveProviderId];
    const metric: AgentMetrics = {
      agentId,
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
      sessionId: claudeMetrics?.sessionId ?? null,
      model: claudeMetrics?.model ?? null,
      totalCostUsd: claudeMetrics?.totalCostUsd ?? null,
      perModelCost: claudeMetrics?.perModelCost ?? [],
      tokenUsage: claudeMetrics?.tokenUsage ?? null,
      toolCallCount: claudeMetrics?.toolCallCount ?? null,
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
      notes: claudeMetrics && !claudeMetrics.parseAvailable
        ? ["claude-code metrics not reported by provider"]
        : [],
    };
    await input.metricsStore.appendAgentMetrics(metric);

    return {
      agentId,
      output: stdout,
      outputArtifactPath: ctx.artifactStore.relPath(outputArtifactPathAbs),
      promptArtifactPath: ctx.artifactStore.relPath(promptArtifactPathAbs),
      providerResult,
    };
  }

  private async runValidation(input: {
    artifactsName: string;
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

  private defaultPromptName(index: number, agentId: string): string {
    const padded = index.toString().padStart(2, "0");
    return `${padded}-${agentId}-prompt.md`;
  }

  /**
   * The provider id that should override agent.provider for this run, OR
   * null when no override is in effect. Cached at run start
   * (state.resolvedProviderId) but re-derived here so the orchestrator
   * never has to thread state through to every runAgent call.
   */
  private runtimeProviderId(): string | null {
    const resolution = resolveEffort({
      effort: this.effort,
      providerOverride: this.providerOverride,
      config: this.config,
    });
    return resolution.providerId;
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
    });
    return input.artifactStore.write("12-final-report.md", report);
  }
}
