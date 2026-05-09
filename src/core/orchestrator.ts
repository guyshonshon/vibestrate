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

export type OrchestratorInput = {
  projectRoot: string;
  config: ProjectConfig;
  rules: string;
  task: string;
  isGitRepo: boolean;
  onProgress?: (message: string) => void;
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

export class Orchestrator {
  private readonly projectRoot: string;
  private readonly config: ProjectConfig;
  private readonly rules: string;
  private readonly task: string;
  private readonly isGitRepo: boolean;
  private readonly onProgress: (message: string) => void;

  constructor(input: OrchestratorInput) {
    this.projectRoot = input.projectRoot;
    this.config = input.config;
    this.rules = input.rules;
    this.task = input.task;
    this.isGitRepo = input.isGitRepo;
    this.onProgress = input.onProgress ?? (() => {});
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
    await stateStore.write(state);
    await eventLog.append({
      type: "run.created",
      message: `Run ${runId} created.`,
      data: { task: this.task },
    });

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

    try {
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

      // Stage: executing
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

      // Stage: validate -> review (loop)
      let approved = false;
      let blocked = false;

      // First validation
      state = applyTransition(state, "validating");
      await stateStore.write(state);
      this.onProgress("Validating...");
      lastValidation = await this.runValidation({
        artifactsName: "07-validation-results.json",
        ctx,
      });

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
      await eventLog.append({
        type: "review.decision",
        message: `Reviewer decision: ${reviewDecision}`,
        data: { decision: reviewDecision, loop: 0 },
      });

      while (
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
      } else if (approved) {
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
      }
    } catch (err) {
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
      try {
        await metricsStore.update((m) => ({ ...m, finalStatus: state.status }));
      } catch {
        // metrics finalize best-effort
      }
      const failureMetrics = (await metricsStore.read()) ?? null;
      await this.writeFinalReport({
        artifactStore,
        state,
        validation: lastValidation,
        policyWarnings: policy.warnings,
        reviewLoops: reviewLoopsCompleted,
        metrics: failureMetrics,
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

    // Finalize metrics (record final status + review loops).
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
    }));

    const finalMetrics = (await metricsStore.read()) ?? null;

    const finalReportPath = await this.writeFinalReport({
      artifactStore,
      state,
      validation: lastValidation,
      policyWarnings: policy.warnings,
      reviewLoops: reviewLoopsCompleted,
      metrics: finalMetrics,
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
    const profile = resolveProfile(this.config.permissions.profiles, agent.permissions);

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
      data: { agentId, provider: agent.provider, permissions: agent.permissions },
    });
    await ctx.eventLog.append({
      type: "provider.started",
      message: `Provider ${agent.provider} invoked for ${agentId}.`,
      data: { agentId, provider: agent.provider, cwd },
    });

    let providerResult: RichProviderRunResult;
    const stageStart = new Date();
    try {
      providerResult = await runProvider(this.config.providers, {
        providerId: agent.provider,
        prompt,
        cwd,
      });
    } catch (err) {
      const stageEnd = new Date();
      await ctx.eventLog.append({
        type: "provider.failed",
        message: `Provider ${agent.provider} failed for ${agentId}: ${describeError(err)}`,
        data: { agentId, provider: agent.provider },
      });
      await ctx.eventLog.append({
        type: "agent.failed",
        message: `Agent ${agentId} failed.`,
        data: { agentId },
      });
      // Record a partial metric so the dashboard reflects the failure.
      const providerCfg = this.config.providers[agent.provider];
      const failedMetric: AgentMetrics = {
        agentId,
        stageId: input.stageId,
        providerId: agent.provider,
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
      message: `Provider ${agent.provider} completed for ${agentId}.`,
      data: {
        agentId,
        provider: agent.provider,
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
    const providerCfg = this.config.providers[agent.provider];
    const metric: AgentMetrics = {
      agentId,
      stageId: input.stageId,
      providerId: agent.provider,
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

  private async writeFinalReport(input: {
    artifactStore: ArtifactStore;
    state: RunState;
    validation: ValidationResults | null;
    policyWarnings: PolicyWarning[];
    reviewLoops: number;
    metrics: import("./runtime-metrics.js").RuntimeMetrics | null;
    artifacts: {
      plan?: string;
      architecture?: string;
      execution?: string;
      review?: string;
      verification?: string;
    };
  }): Promise<string> {
    const report = renderFinalReport({
      state: input.state,
      artifactPaths: input.artifacts,
      validation: input.validation,
      policyWarnings: input.policyWarnings,
      reviewLoops: input.reviewLoops,
      metrics: input.metrics,
    });
    return input.artifactStore.write("12-final-report.md", report);
  }
}
