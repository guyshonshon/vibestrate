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
import { runProvider } from "../providers/provider-runner.js";
import { localWorktreeBackend } from "../execution/local-worktree-backend.js";
import { isGitAvailable } from "../git/git.js";
import { GitError, AmacoError, describeError } from "../utils/errors.js";
import { formatRunIdTimestamp, nowIso } from "../utils/time.js";
import { slugify } from "../utils/slug.js";
import type { ProviderRunResult } from "../providers/provider-types.js";

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
    await artifactStore.init();

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
        promptIndex: 1,
        outputName: "02-plan.md",
        priorArtifacts: [],
        validationResults: null,
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
        promptIndex: 3,
        outputName: "04-architecture.md",
        priorArtifacts: [{ label: "Plan", content: planArtifact.output }],
        validationResults: null,
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
        promptIndex: 5,
        outputName: "06-execution-output.md",
        priorArtifacts: [
          { label: "Plan", content: planArtifact.output },
          { label: "Architecture", content: architectureArtifact.output },
        ],
        validationResults: null,
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
        promptIndex: 8,
        outputName: "09-review.md",
        priorArtifacts: this.collectPriors({
          plan: planArtifact,
          architecture: architectureArtifact,
          execution: executionArtifact,
        }),
        validationResults: lastValidation,
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
      await this.writeFinalReport({
        artifactStore,
        state,
        validation: lastValidation,
        policyWarnings: policy.warnings,
        reviewLoops: reviewLoopsCompleted,
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

    const finalReportPath = await this.writeFinalReport({
      artifactStore,
      state,
      validation: lastValidation,
      policyWarnings: policy.warnings,
      reviewLoops: reviewLoopsCompleted,
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
    promptIndex: number;
    outputName: string;
    promptName?: string;
    priorArtifacts: PriorArtifact[];
    validationResults: ValidationResults | null;
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

    let providerResult: ProviderRunResult;
    try {
      providerResult = await runProvider(this.config.providers, {
        providerId: agent.provider,
        prompt,
        cwd,
      });
    } catch (err) {
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
    });
    return input.artifactStore.write("12-final-report.md", report);
  }
}
