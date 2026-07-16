import path from "node:path";
import type { ArtifactStore } from "../artifact-store.js";
import type { EventLog } from "../event-log.js";
import type { RunState, RunStateStore } from "../state-machine.js";
import {
  runValidationCommands,
  type ValidationResults,
} from "../validation-runner.js";
import { getDiffSnapshot } from "../diff-service.js";
import { classifyChangedFilesForValidation } from "../validation-scope.js";
import {
  evaluateReviewDescent,
  type ReviewDescentDecision,
} from "../review-descent.js";
import { protectedPathMatch } from "../../supervisor/protected-paths.js";
import type { ActionBroker } from "../../safety/action-broker.js";
import type { ProjectConfig } from "../../project/config-schema.js";
import { GitError } from "../../utils/errors.js";
import { nowIso } from "../../utils/time.js";
import type { ResolvedFlowStep } from "../../flows/schemas/flow-schema.js";
import type { FlowContextOutput } from "../../flows/runtime/flow-context-builder.js";
import { registerFlowValidationOutputs } from "./flow-outputs.js";
import { patchFlowStep } from "./flow-run-state.js";

/** Run-level dependencies the validation pass needs from the Orchestrator.
 *  Passed at each call site; ownership of the fields stays on the class. */
export interface ValidationDeps {
  projectRoot: string;
  config: ProjectConfig;
  /** Linked roadmap card id (acceptance commands); null when unbound. */
  taskId: string | null;
  /** The run's Action Broker; null only before run() wires it. */
  broker: ActionBroker | null;
}

export async function runFlowValidationStep(
  deps: ValidationDeps,
  input: {
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
  },
): Promise<{ state: RunState; validation: ValidationResults }> {
  const artifactsName = path.posix.join(
    "flows",
    input.step.id,
    "validation-results.json",
  );
  const validation = await runValidation(deps, {
    artifactsName,
    prefix: path.posix.join("flows", input.step.id, "validation"),
    ctx: input.ctx,
  });
  const validationArtifactPath = input.artifactStore.relPath(
    input.artifactStore.resolveArtifactPath(artifactsName),
  );
  registerFlowValidationOutputs({
    step: input.step,
    validation,
    validationArtifactPath,
    outputs: input.outputs,
  });
  const state = patchFlowStep(
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

export async function runValidation(
  deps: ValidationDeps,
  input: {
    artifactsName: string;
    prefix?: string;
    ctx: {
      worktreePath: string | null;
      artifactStore: ArtifactStore;
      eventLog: EventLog;
    };
  },
): Promise<ValidationResults> {
  const { ctx } = input;
  if (!ctx.worktreePath) {
    throw new GitError("Cannot run validation: worktree not prepared.");
  }
  await ctx.eventLog.append({
    type: "validation.started",
    message: `Validation starting in ${ctx.worktreePath}.`,
  });

  // Proportional validation scoping (proportional-orchestration.md):
  // when the run's entire diff is provably-inert (docs/text/assets) skip the
  // configured code checks - running `pnpm test` for a `.md` change is pure
  // waste. Keyed on the ACTUAL changed files (same uncommitted-vs-HEAD diff the
  // orchestrator uses elsewhere), never the task text, and fail-safe: any
  // non-inert/unknown file, an empty diff, or a diff error -> validate as
  // configured. Off when `commands.scopeValidationByChange` is false.
  const configured = deps.config.commands.validate;
  if (configured.length > 0 && deps.config.commands.scopeValidationByChange) {
    let decision: ReturnType<typeof classifyChangedFilesForValidation> | null = null;
    try {
      const snap = await getDiffSnapshot({ worktreePath: ctx.worktreePath });
      // Protected-path floor: a protected path (built-in globs + policies.protectedPaths)
      // is never inert - a workflow .yml or a user-protected .md still
      // validates in full. See orchestrator/protected-paths.ts.
      decision = classifyChangedFilesForValidation(
        snap.files.map((f) => f.path),
        {
          isProtected: (p) =>
            protectedPathMatch(p, deps.config.policies) !== null,
        },
      );
    } catch {
      // Diff unavailable -> fail safe: fall through and validate as configured.
      decision = null;
    }
    if (decision?.allInert) {
      await ctx.eventLog.append({
        type: "validation.scoped",
        message: `Validation scoped: ${decision.changedFileCount} inert file(s) changed (docs/text/assets); skipped ${configured.length} configured command(s).`,
        data: {
          reason: "all-changed-files-inert",
          changedFiles: decision.changedFileCount,
          inert: decision.inert,
          skippedCommands: [...configured],
        },
      });
      const scoped: ValidationResults = {
        commands: [],
        summary: { total: 0, passed: 0, failed: 0, environment: 0 },
        note: `Scoped: ${decision.inert.length} inert file(s) changed (docs/text/assets); ${configured.length} configured validation command(s) skipped.`,
      };
      await ctx.artifactStore.writeJson(input.artifactsName, scoped);
      return scoped;
    }
  }

  const results = await runValidationCommands({
    commands: configured,
    cwd: ctx.worktreePath,
    store: ctx.artifactStore,
    prefix: input.prefix,
    broker: deps.broker ?? undefined,
    runId: ctx.artifactStore.runIdValue,
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
  // The linked card's machine-checkable acceptance commands run as an
  // extra validation pass, feeding the SAME gate (a failure caps merge_ready).
  await mergeAcceptanceValidation(deps, results, ctx, input.prefix);
  await ctx.artifactStore.writeJson(input.artifactsName, results);
  return results;
}

/**
 * Acceptance gate (machine half): run the linked roadmap card's
 * `acceptanceCommands` (USER-authored - same trust as `commands.validate`) and
 * merge them into `results`, so an unmet machine criterion fails validation and
 * caps the verdict. No-op when there's no linked card / no commands. The prose
 * `acceptanceCriteria` are the LLM-judge half (verifier confirms each).
 */
export async function mergeAcceptanceValidation(
  deps: ValidationDeps,
  results: ValidationResults,
  ctx: { worktreePath: string | null; artifactStore: ArtifactStore; eventLog: EventLog },
  prefix: string | undefined,
): Promise<void> {
  if (!deps.taskId || !ctx.worktreePath) return;
  let commands: string[] = [];
  try {
    const { RoadmapService } = await import("../../roadmap/roadmap-service.js");
    const card = await new RoadmapService(deps.projectRoot).getTask(deps.taskId);
    commands = card?.acceptanceCommands ?? [];
  } catch {
    return;
  }
  if (commands.length === 0) return;
  const acc = await runValidationCommands({
    commands,
    cwd: ctx.worktreePath,
    store: ctx.artifactStore,
    prefix: prefix ? `${prefix}-acceptance` : "acceptance",
    broker: deps.broker ?? undefined,
    runId: ctx.artifactStore.runIdValue,
  });
  for (const c of acc.commands) {
    await ctx.eventLog.append({
      type: "validation.command.completed",
      message: `[acceptance] ${c.command} → exit ${c.exitCode}`,
      data: {
        command: c.command,
        exitCode: c.exitCode,
        status: c.status,
        durationMs: c.durationMs,
        acceptance: true,
      },
    });
  }
  results.commands.push(...acc.commands);
  results.summary.total += acc.summary.total;
  results.summary.passed += acc.summary.passed;
  results.summary.failed += acc.summary.failed;
  results.summary.environment += acc.summary.environment;
}

/** Express: evaluate the deterministic review descent against the run's
 *  actual diff. Null on any uncertainty (no worktree, diff error) - the
 *  caller then runs the review (fail toward more checking). */
export async function evaluateReviewDescentForWorktree(
  worktreePath: string | null | undefined,
  policies: ProjectConfig["policies"],
): Promise<ReviewDescentDecision | null> {
  if (!worktreePath) return null;
  try {
    const snap = await getDiffSnapshot({ worktreePath });
    return evaluateReviewDescent(
      snap.files.map((f) => f.path),
      policies,
    );
  } catch {
    return null;
  }
}
