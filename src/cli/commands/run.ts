import path from "node:path";
import { detectProject } from "../../project/project-detector.js";
import { configExists, loadConfig } from "../../project/config-loader.js";
import {
  Orchestrator,
  type ResumeFromInput,
} from "../../core/orchestrator.js";
import { resolveResumeFrom, RunLaunchError } from "../../core/run-launcher.js";
import { chooseRunFlow, type WorkflowSelection } from "../../orchestrator/select-workflow.js";
import {
  color,
  header,
  indent,
  isInteractiveTTY,
  symbol,
} from "../ui/format.js";
import { isVibestrateError } from "../../utils/errors.js";
import { startServer, DEFAULT_VIBESTRATE_PORT } from "../../server/server.js";
import { setCliWriter } from "../../notifications/gateways/cli-gateway.js";
import {
  discoverFlows,
  findFlowById,
} from "../../flows/catalog/flow-discovery.js";
import {
  FlowResolutionError,
  resolveFlow,
} from "../../flows/runtime/flow-resolver.js";
import type {
  FlowContextPolicy,
  ResolvedFlowSnapshot,
} from "../../flows/schemas/flow-schema.js";
import {
  formatFlowRunCommand,
  runFlowRunWizard,
} from "../wizards/flow-run-wizard.js";
import { pickFlow, pickCrew } from "../wizards/flow-crew-picker.js";

function rewriteFriendly(message: string): string {
  // Worktree already exists.
  if (message.includes("Worktree path already exists")) {
    return [
      "Vibestrate could not create the isolated worktree for this run.",
      "The branch or folder may already exist from a previous run.",
      `${symbol.arrow()} Inspect: ${color.bold("vibe status")}`,
      `${symbol.arrow()} Remove an old worktree manually: ${color.bold("git worktree remove <path>")}`,
    ].join("\n");
  }
  if (message.includes("Branch already exists")) {
    return [
      "Vibestrate wanted to create a new branch but one with that name already exists.",
      `${symbol.arrow()} Delete the old branch with: ${color.bold("git branch -D <branch>")}`,
      `${symbol.arrow()} Or run again - Vibestrate generates a fresh run-id each time.`,
    ].join("\n");
  }
  if (message.includes("not configured")) {
    return [
      message,
      `${symbol.arrow()} Run ${color.bold("vibe provider setup")} to add a provider.`,
    ].join("\n");
  }
  if (message.includes("Failed to invoke provider command")) {
    return [
      message,
      `${symbol.arrow()} Verify the CLI is installed and on PATH: ${color.bold("vibe provider detect")}`,
      `${symbol.arrow()} Confirm prompt-flag setup: ${color.bold("vibe provider setup")}`,
    ].join("\n");
  }
  return message;
}

export type RunCommandOptions = {
  ui?: boolean;
  uiPort?: number;
  taskId?: string | null;
  effort?: "low" | "medium" | "high" | null;
  /** Crew to resolve against. null = project.defaultCrew. */
  crewId?: string | null;
  /** Run-wide Profile override applied to every seated step. */
  profileOverride?: string | null;
  /** Seat → Role overrides (disambiguate seats filled by >1 crew role). */
  seatRoleOverrides?: Record<string, string>;
  readOnly?: boolean;
  autoEffort?: boolean;
  /** Skill ids attached only for this run, merged into role skills. */
  runtimeSkills?: string[];
  /** Brevity directive applied to every agent prompt for this run. */
  concise?: boolean;
  /** Flow id to resolve before start. */
  flowId?: string | null;
  /** --select: force orchestrator flow selection even when a default flow is set. */
  select?: boolean;
  /** Per-step Profile overrides (step id → profile id). */
  flowStepProfiles?: Record<string, string>;
  /** Extra run brief included in the Flow task packet. */
  flowBrief?: string | null;
  /** Flow context packing policy. */
  flowContextPolicy?: FlowContextPolicy;
  /** Optional Flow steps explicitly disabled for this run. */
  flowSkippedOptionalSteps?: string[];
  /** Open the terminal Flow setup flow before resolving the run. */
  flowInteractive?: boolean;
  /** Rewind: fork from a prior run, reusing its upstream artifacts and
   *  resuming at `resumeStage`. Resume skips flow selection and reuses the
   *  flow you name (default or --flow) - it works for graph (DAG) flows too:
   *  the frontier scheduler treats the seeded upstream steps as done. */
  resumeFromRunId?: string | null;
  resumeStage?:
    | "planning"
    | "architecting"
    | "executing"
    | "reviewing"
    | "fixing"
    | "verifying";
  /** Pick-up execution: iterate the linked task's checklist through the flow's
   *  checklistSegment. "continuous" runs items back-to-back; "step" pauses
   *  between items. Requires --task and a checklist-aware flow (e.g. pickup). */
  checklistMode?: "continuous" | "step" | null;
  /** Context sources injected into every agent prompt (Phase 4). */
  contextSources?: import("../../core/context-source-schema.js").ContextSource[];
};

export async function runRunCommand(
  task: string,
  options: RunCommandOptions = {},
): Promise<number> {
  let resolvedTask = task.trim();
  if (options.flowInteractive && !isInteractiveTTY()) {
    console.error(
      `${symbol.fail()} ${color.bold("vibe run -i")} needs an interactive terminal.`,
    );
    return 1;
  }
  if (!resolvedTask && !options.flowInteractive) {
    console.error(
      `${symbol.fail()} A task description is required.`,
    );
    console.error(
      `  ${symbol.arrow()} Try: ${color.bold('vibe run "Add dark mode to settings"')}`,
    );
    return 1;
  }

  // Attach a CLI writer for the notifications gateway so attention-needed
  // events (approvals, validation failures, run final status) print inline.
  setCliWriter((line) => console.log(color.dim(line)));
  const cwd = process.cwd();
  const detected = await detectProject(cwd);

  if (!detected.isGitRepo) {
    console.error(
      `${symbol.fail()} ${cwd} is not inside a git repository.`,
    );
    console.error(
      `  ${symbol.arrow()} Run ${color.bold("git init")} first, then ${color.bold("vibe init")}.`,
    );
    return 1;
  }

  if (!(await configExists(detected.projectRoot))) {
    console.error(
      `${symbol.fail()} Vibestrate is not initialized in this project.`,
    );
    console.error(
      `  ${symbol.arrow()} Run ${color.bold("vibe init")} to create ${color.bold(".vibestrate/project.yml")}.`,
    );
    return 1;
  }

  let loaded;
  try {
    loaded = await loadConfig(detected.projectRoot);
  } catch (err) {
    console.error(
      `${symbol.fail()} ${isVibestrateError(err) ? err.message : String(err)}`,
    );
    console.error(
      `  ${symbol.arrow()} Run ${color.bold("vibe config validate")} to see the exact issues.`,
    );
    return 1;
  }

  // Profile → provider and crew role → profile integrity is enforced by the
  // config schema at load time, so a successful loadConfig already guarantees
  // every Profile resolves to a configured Provider.

  // `-i` fills in whatever the user didn't pass: a horizontal Flow picker when
  // no --flow, then a Crew picker when no --crew and the project has more than
  // one crew. Anything passed on the CLI is respected and skips its prompt.
  let activeFlowId = options.flowId ?? null;
  let activeCrewId = options.crewId ?? null;
  if (options.flowInteractive) {
    // Fail fast before any prompts so we never discard the user's picks.
    if (!resolvedTask) {
      console.error(`${symbol.fail()} A task description is required.`);
      console.error(
        `  ${symbol.arrow()} Try: ${color.bold('vibe run -i "Add dark mode to settings"')}`,
      );
      return 1;
    }
    if (!activeFlowId) {
      const flows = await discoverFlows(detected.projectRoot);
      if (flows.length === 0) {
        console.error(`${symbol.fail()} No Flows available to pick from.`);
        return 1;
      }
      activeFlowId = await pickFlow(flows, "default");
    }
    if (!activeCrewId) {
      const crewIds = Object.keys(loaded.config.crews);
      if (crewIds.length > 1) {
        const crews = crewIds.map((id) => ({
          id,
          label: loaded.config.crews[id]?.label ?? id,
        }));
        activeCrewId = await pickCrew(crews, loaded.config.defaultCrew);
      }
    }
  }

  // Choose the Flow transparently (forced > default > orchestrator selection),
  // unless resuming or running a checklist (the flow is implied). Always shown.
  let selection: WorkflowSelection | null = null;
  if (!options.resumeFromRunId && !options.checklistMode) {
    try {
      selection = await chooseRunFlow({
        projectRoot: detected.projectRoot,
        task: resolvedTask,
        config: loaded.config,
        forcedFlowId: activeFlowId,
        forceSelect: options.select === true,
        loaded,
      });
      activeFlowId = selection.flowId;
      // Apply a recommended crew only when the user didn't pick one.
      if (selection.crewId && !activeCrewId) activeCrewId = selection.crewId;
    } catch (err) {
      console.error(
        `${symbol.warn()} Flow selection failed; falling back to the default flow. ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  let resolvedFlow: ResolvedFlowSnapshot | null = null;
  if (activeFlowId) {
    const flow = await findFlowById(detected.projectRoot, activeFlowId);
    if (!flow) {
      const ids = (await discoverFlows(detected.projectRoot)).map((item) => item.id);
      console.error(
        `${symbol.fail()} No Flow named "${activeFlowId}". Found: ${ids.join(", ") || "(none)"}.`,
      );
      return 1;
    }
    let flowBrief = options.flowBrief ?? null;
    let flowContextPolicy = options.flowContextPolicy;
    let flowStepProfiles = options.flowStepProfiles ?? {};
    let flowSkippedOptionalSteps = options.flowSkippedOptionalSteps ?? [];
    // When the flow was named explicitly with --flow, -i still opens the
    // detailed per-flow setup (brief / context / per-step profiles / optional
    // steps). When the flow was chosen via the picker, we run immediately.
    if (options.flowInteractive && options.flowId) {
      const setup = await runFlowRunWizard({
        task: resolvedTask,
        flow,
        config: loaded.config,
        crewId: activeCrewId,
        brief: flowBrief,
        contextPolicy: flowContextPolicy,
        stepProfiles: flowStepProfiles,
        skippedOptionalSteps: flowSkippedOptionalSteps,
      });
      resolvedTask = setup.task;
      flowBrief = setup.brief;
      flowContextPolicy = setup.contextPolicy;
      flowStepProfiles = setup.stepProfiles;
      flowSkippedOptionalSteps = setup.skippedOptionalSteps;
      console.log("");
      console.log(header("Equivalent command"));
      console.log(
        indent(
          formatFlowRunCommand({
            flowId: flow.id,
            task: resolvedTask,
            brief: flowBrief,
            contextPolicy: flowContextPolicy,
            stepProfiles: flowStepProfiles,
            skippedOptionalSteps: flowSkippedOptionalSteps,
          }),
        ),
      );
      console.log("");
    }
    try {
      resolvedFlow = resolveFlow({
        flow: flow.definition,
        source: flow.source,
        config: loaded.config,
        task: resolvedTask,
        crewId: activeCrewId,
        profileOverride: options.profileOverride ?? null,
        seatRoleOverrides: options.seatRoleOverrides ?? {},
        brief: flowBrief,
        contextPolicy: flowContextPolicy,
        stepProfileOverrides: flowStepProfiles,
        skippedOptionalSteps: flowSkippedOptionalSteps,
      });
      printResolvedFlow(resolvedFlow);
      if (selection) printFlowChoice(resolvedFlow.label, selection);
    } catch (err) {
      const message =
        err instanceof FlowResolutionError || isVibestrateError(err)
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err);
      console.error(`${symbol.fail()} Flow resolution failed.`);
      console.error(indent(message));
      return 1;
    }
    console.log("");
  }

  // Optionally bring up the supervisor server alongside the run.
  let server: Awaited<ReturnType<typeof startServer>> | null = null;
  if (options.ui) {
    try {
      server = await startServer({
        projectRoot: detected.projectRoot,
        port: options.uiPort ?? DEFAULT_VIBESTRATE_PORT,
        host: "127.0.0.1",
      });
      console.log(
        `${symbol.ok()} Supervisor: ${color.bold(server.url)}${
          server.uiAvailable ? "" : color.dim(" (API only - UI bundle missing)")
        }`,
      );
    } catch (err) {
      console.error(
        `${symbol.warn()} Could not start supervisor: ${
          isVibestrateError(err) ? err.message : String(err)
        }`,
      );
      console.error(
        `  ${symbol.arrow()} Continuing without UI. The run will still execute normally.`,
      );
      server = null;
    }
  }

  // Resolve roadmap task linkage if --task was provided.
  let roadmapTaskId: string | null = options.taskId ?? null;
  if (roadmapTaskId) {
    try {
      const { RoadmapService } = await import(
        "../../roadmap/roadmap-service.js"
      );
      const svc = new RoadmapService(detected.projectRoot);
      const t = await svc.getTask(roadmapTaskId);
      if (!t) {
        console.error(
          `${symbol.fail()} Roadmap task "${roadmapTaskId}" not found.`,
        );
        return 1;
      }
    } catch (err) {
      console.error(
        `${symbol.fail()} ${isVibestrateError(err) ? err.message : String(err)}`,
      );
      return 1;
    }
  }

  // If --task <id> was passed and the user did NOT override effort /
  // provider / read-only on the CLI, inherit those from the roadmap task.
  let effort: "low" | "medium" | "high" | null = options.effort ?? null;
  let profileOverride: string | null = options.profileOverride ?? null;
  let readOnly: boolean = options.readOnly ?? false;
  if (roadmapTaskId) {
    try {
      const { RoadmapService } = await import("../../roadmap/roadmap-service.js");
      const svc = new RoadmapService(detected.projectRoot);
      const t = await svc.getTask(roadmapTaskId);
      if (t) {
        if (effort === null) effort = t.effort;
        if (profileOverride === null) profileOverride = t.profileOverride;
        if (!options.readOnly) readOnly = t.readOnly;
      }
    } catch {
      // Best-effort. The orchestrator will still honor the explicit CLI
      // flags; missing roadmap inheritance is non-fatal.
    }
  }

  // Always classify, even when the user passed --effort, so we can print
  // an honest "(suggested: …)" line. --auto-effort applies the suggestion
  // when --effort wasn't passed.
  const { classifyEffort } = await import("../../core/effort-heuristic.js");
  const heuristic = classifyEffort({ text: resolvedTask });
  if (effort === null && options.autoEffort) {
    effort = heuristic.effort;
  }
  const verdictLine =
    effort === heuristic.effort && effort !== null
      ? `${symbol.bullet()} effort ${color.bold(effort)} (matches suggestion @ ${heuristic.confidence})`
      : effort
        ? `${symbol.bullet()} effort ${color.bold(effort)} ${color.dim(`(suggested ${heuristic.effort} @ ${heuristic.confidence})`)}`
        : `${symbol.bullet()} effort ${color.dim("(none)")} ${color.dim(`- suggested ${heuristic.effort} @ ${heuristic.confidence}; pass --auto-effort or --effort ${heuristic.effort} to apply`)}`;
  console.log(verdictLine);
  for (const r of heuristic.reasons.slice(0, 3)) {
    console.log(indent(color.dim(`· ${r}`)));
  }

  const cliAbort = new AbortController();
  let signalRequested = false;
  const requestAbort = (signalName: "SIGINT" | "SIGTERM"): void => {
    if (signalRequested) {
      console.log("");
      console.log(color.dim("Force-exiting (second interrupt)."));
      process.exit(signalName === "SIGINT" ? 130 : 143);
    }
    signalRequested = true;
    console.log("");
    console.log(
      color.dim(
        `Received ${signalName}; aborting active provider CLI. Press Ctrl+C again to force.`,
      ),
    );
    cliAbort.abort();
  };
  const onSigint = (): void => requestAbort("SIGINT");
  const onSigterm = (): void => requestAbort("SIGTERM");
  process.on("SIGINT", onSigint);
  process.on("SIGTERM", onSigterm);

  // Rewind: fork from a prior run, reusing its upstream step outputs. The flow
  // runner seeds them - works with the default flow and an explicit --flow.
  let resumeFrom: ResumeFromInput | null = null;
  if (options.resumeFromRunId) {
    try {
      resumeFrom = await resolveResumeFrom(detected.projectRoot, {
        sourceRunId: options.resumeFromRunId,
        fromStage: options.resumeStage ?? "executing",
      });
    } catch (err) {
      const message =
        err instanceof RunLaunchError ? err.message : String(err);
      console.error(`${symbol.fail()} ${message}`);
      return 1;
    }
    console.log(
      `${symbol.bullet()} Rewinding from ${color.bold(resumeFrom.sourceRunId)} at stage ${color.bold(resumeFrom.fromStage)} - seeding the upstream steps from that run.`,
    );
  }

  // C1: warn (non-blocking) when the chosen flow looks heavier than the task.
  if (resolvedFlow) {
    const { inferFlowComplexity, flowComplexityAdvice, flowFanoutAdvice } =
      await import("../../flows/runtime/flow-complexity.js");
    const { classifyEffort } = await import("../../core/effort-heuristic.js");
    const taskEffort =
      effort ?? classifyEffort({ text: resolvedTask, files: [] }).effort;
    const advice = flowComplexityAdvice({
      flowComplexity: inferFlowComplexity(resolvedFlow),
      taskEffort,
      flowLabel: resolvedFlow.label,
    });
    if (advice.message) {
      console.log(
        `${advice.level === "overkill" ? symbol.warn() : symbol.bullet()} ${advice.message}`,
      );
    }
    // Slice 4: graph flows that fan out N parallel agents multiply spend loudly.
    const fanout = flowFanoutAdvice(resolvedFlow);
    if (fanout.message) {
      console.log(`${symbol.warn()} ${fanout.message}`);
    }
  }

  const orchestrator = new Orchestrator({
    projectRoot: detected.projectRoot,
    config: loaded.config,
    rules: loaded.rules,
    task: resolvedTask,
    isGitRepo: detected.isGitRepo,
    taskId: roadmapTaskId,
    effort,
    crewId: activeCrewId,
    profileOverride,
    stepProfileOverrides: options.flowStepProfiles ?? {},
    seatRoleOverrides: options.seatRoleOverrides ?? {},
    readOnly,
    runtimeSkills: options.runtimeSkills ?? [],
    concise: options.concise ?? false,
    flow: resolvedFlow,
    selection,
    resumeFrom,
    checklistMode: options.checklistMode ?? null,
    contextSources: options.contextSources ?? [],
    abortSignal: cliAbort.signal,
    onProgress: (msg) => {
      console.log(`${symbol.bullet()} ${msg}`);
      if (msg.startsWith("Pausing for human approval")) {
        const url = server?.url;
        if (url) {
          console.log(
            indent(
              `${symbol.arrow()} Open ${color.bold(url)} to approve or reject.`,
            ),
          );
        } else {
          console.log(
            indent(
              `${symbol.arrow()} Run ${color.bold("vibe approvals list <runId>")} (or ${color.bold("vibe ui")}) to decide.`,
            ),
          );
        }
      }
    },
  });

  // Snapshot of the linked roadmap service so we can reuse it for both happy
  // and failure paths (cannot move into the orchestrator: it shouldn't depend
  // on the roadmap module).
  const roadmapModule = roadmapTaskId
    ? await import("../../roadmap/roadmap-service.js")
    : null;
  const roadmapSvc =
    roadmapModule && roadmapTaskId
      ? new roadmapModule.RoadmapService(detected.projectRoot)
      : null;

  let result;
  try {
    result = await orchestrator.run();
  } catch (err) {
    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigterm);
    const raw = isVibestrateError(err) ? err.message : err instanceof Error ? err.message : String(err);
    const friendly = rewriteFriendly(raw);
    console.error("");
    console.error(`${symbol.fail()} Run failed.`);
    console.error(indent(friendly));
    if (server) {
      console.error("");
      console.error(
        `${symbol.arrow()} Supervisor still running at ${color.bold(server.url)}.`,
      );
    }
    if (roadmapSvc && roadmapTaskId) {
      try {
        await roadmapSvc.clearTaskCurrentRun(roadmapTaskId, "failed");
      } catch {
        // best-effort
      }
    }
    return 2;
  }
  process.off("SIGINT", onSigint);
  process.off("SIGTERM", onSigterm);

  // Update the linked roadmap task with the run id, branch, worktree, and
  // final status so the board reflects the outcome immediately.
  if (roadmapSvc && roadmapTaskId) {
    try {
      const taskStatus = (() => {
        switch (result.state.status) {
          case "merge_ready":
            return "done" as const;
          case "blocked":
            return "blocked" as const;
          case "failed":
            return "failed" as const;
          case "aborted":
            return "cancelled" as const;
          case "waiting_for_approval":
            return "waiting_for_approval" as const;
          default:
            return "running" as const;
        }
      })();
      await roadmapSvc.setTaskRun({
        taskId: roadmapTaskId,
        runId: result.runId,
        branchName: result.branchName,
        worktreePath: result.worktreePath,
        status: taskStatus,
      });
      await roadmapSvc.clearTaskCurrentRun(roadmapTaskId, taskStatus);
    } catch (err) {
      console.error(
        `${symbol.warn()} Run finished but linked task update failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  console.log("");
  const statusLabel = (() => {
    switch (result.state.status) {
      case "merge_ready":
        return color.green(color.bold("merge_ready"));
      case "blocked":
        return color.yellow(color.bold("blocked"));
      case "failed":
        return color.red(color.bold("failed"));
      default:
        return color.bold(result.state.status);
    }
  })();
  console.log(`${header("Final status:")} ${statusLabel}`);
  if (result.state.finalDecision) {
    console.log(indent(`Review decision: ${result.state.finalDecision}`));
  }
  if (result.state.verification) {
    console.log(indent(`Verification: ${result.state.verification}`));
  }
  console.log(
    indent(
      `Artifacts: ${color.dim(
        path.relative(process.cwd(), path.dirname(result.finalReportPath)),
      )}`,
    ),
  );
  if (result.worktreePath) {
    console.log(indent(`Worktree: ${color.dim(result.worktreePath)}`));
  }
  if (result.branchName) {
    console.log(indent(`Branch: ${color.dim(result.branchName)}`));
  }
  if (result.policyWarnings.length > 0) {
    console.log("");
    console.log(`${symbol.warn()} ${color.bold("Policy warnings:")}`);
    for (const w of result.policyWarnings) {
      console.log(indent(`- ${w.code}: ${w.message}`));
    }
  }

  if (server) {
    console.log("");
    console.log(
      `${symbol.arrow()} Supervisor: ${color.bold(server.url)} (Ctrl+C to stop)`,
    );
    // Keep server alive so the user can inspect the run.
    let resolveExit: ((code: number) => void) | null = null;
    const exitPromise = new Promise<number>((resolve) => {
      resolveExit = resolve;
    });
    const shutdown = async (code: number) => {
      try {
        await server!.close();
      } catch {
        // ignore
      }
      if (resolveExit) resolveExit(code);
    };
    process.on("SIGINT", () => void shutdown(0));
    process.on("SIGTERM", () => void shutdown(0));
    return exitPromise;
  }

  switch (result.state.status) {
    case "merge_ready":
      return 0;
    case "blocked":
    case "failed":
    case "aborted":
      return 3;
    default:
      return 0;
  }
}

function printResolvedFlow(snapshot: ReturnType<typeof resolveFlow>): void {
  console.log(header(`${snapshot.label} preview`));
  console.log(
    `${symbol.bullet()} Flow ${color.bold(snapshot.flowId)} v${snapshot.flowVersion} ${color.dim(`(${snapshot.source.kind})`)}`,
  );
  console.log(`${symbol.bullet()} Context ${color.bold(snapshot.contextPolicy)}`);
  console.log(`${symbol.bullet()} Crew ${color.bold(snapshot.crewId)}`);
  console.log(`${symbol.bullet()} Steps`);
  for (const [index, step] of snapshot.steps.entries()) {
    const seat = step.seat ? `${step.seat}` : color.dim("-");
    const role = step.resolvedRoleLabel ?? step.resolvedRoleId ?? color.dim("-");
    const profile = step.profileId
      ? `${step.profileId}${step.providerId ? color.dim(` (${step.providerId})`) : ""}`
      : color.dim("-");
    const state = step.enabled ? "" : color.dim(" skipped");
    console.log(
      indent(
        `${index + 1}. ${color.bold(step.label)} ${color.dim(`[${step.kind}]`)}  seat=${seat}  role=${role}  profile=${profile}${state}`,
      ),
    );
  }
}

// Always show the active Flow and where the choice came from (Slice 2).
function printFlowChoice(label: string, selection: WorkflowSelection): void {
  const sourceLabel: Record<WorkflowSelection["source"], string> = {
    forced: "forced",
    default: "default",
    selected: `selected · ${selection.confidence} confidence`,
    "only-flow": "only flow",
  };
  console.log("");
  console.log(
    `${header("Flow:")} ${color.bold(label)} ${color.dim(`(${selection.flowId})`)}  ${color.dim("·")}  ${color.cyan(sourceLabel[selection.source])}`,
  );
  if (selection.source === "selected" && selection.reasons.length) {
    console.log(indent(color.dim(selection.reasons[0]!)));
  }
  if (selection.crewId) {
    console.log(indent(color.dim(`crew: ${selection.crewId}`)));
  }
  for (const risk of selection.risks) {
    console.log(indent(`${symbol.warn()} ${color.dim(risk)}`));
  }
  if (selection.advisory) {
    console.log(indent(`${symbol.arrow()} ${color.yellow(selection.advisory)}`));
  }
}
