import { z } from "zod";
import { detectProject } from "../project/project-detector.js";
import { configExists, loadConfig } from "../project/config-loader.js";
import {
  Orchestrator,
  type OrchestratorOutput,
  type ResumeFromInput,
} from "./orchestrator.js";
import { ArtifactStore } from "./artifact-store.js";
import {
  discoverFlows,
  findFlowById,
} from "../flows/catalog/flow-discovery.js";
import { resolveFlow } from "../flows/runtime/flow-resolver.js";
import type { ResolvedFlowSnapshot } from "../flows/schemas/flow-schema.js";

/**
 * The shared, non-interactive run pipeline. Both the CLI (`amaco run`) and the
 * dashboard reach a run through the core `Orchestrator`; this launcher is the
 * piece the **dashboard** uses so the server never has to shell out to the CLI
 * binary. It takes a fully-structured spec, loads config, resolves the Flow,
 * and drives the orchestrator — no terminal output, no prompts.
 *
 * The CLI command keeps its own presentation layer (effort heuristic, wizard,
 * friendly errors) and constructs the orchestrator directly; the orchestrator
 * itself is the single shared core. UI ⇄ CLI stay independent.
 */
export const runSpecSchema = z.object({
  /** Absolute project root the run executes in. */
  projectRoot: z.string().min(1),
  task: z.string().min(1).max(2000),
  taskId: z.string().min(1).max(128).nullable().optional(),
  effort: z.enum(["low", "medium", "high"]).nullable().optional(),
  /** Provider override (wins over effort). */
  provider: z.string().min(1).max(128).nullable().optional(),
  readOnly: z.boolean().optional(),
  runtimeSkills: z.array(z.string().min(1).max(128)).max(64).optional(),
  concise: z.boolean().optional(),
  flow: z
    .object({
      id: z.string().min(1).max(80),
      brief: z.string().max(4000).nullable().optional(),
      contextPolicy: z
        .enum(["balanced", "compact", "artifact-heavy"])
        .optional(),
      slotProviders: z.record(z.string(), z.string()).optional(),
      skippedOptionalSteps: z.array(z.string()).max(64).optional(),
    })
    .nullable()
    .optional(),
  /** Rewind: fork a fresh run from a prior run, resuming at a chosen stage
   *  and reusing that run's upstream artifacts. Mutually exclusive with
   *  `flow`. The launcher loads the seeded artifacts from the source run. */
  resumeFrom: z
    .object({
      sourceRunId: z.string().min(1).max(200),
      fromStage: z.enum(["architecting", "executing"]),
    })
    .nullable()
    .optional(),
});

export type RunSpec = z.infer<typeof runSpecSchema>;

export class RunLaunchError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RunLaunchError";
  }
}

export type RunLaunchOptions = {
  abortSignal?: AbortSignal;
  onProgress?: (message: string) => void;
};

/** Load the upstream artifacts a rewind reuses from the source run, validating
 *  they exist (plan for both stages; architecture for executing). Shared by the
 *  dashboard launcher and the `amaco run --resume-from` CLI path so both reach
 *  the same behavior. Throws RunLaunchError with an actionable message. */
export async function resolveResumeFrom(
  projectRoot: string,
  input: { sourceRunId: string; fromStage: "architecting" | "executing" },
): Promise<ResumeFromInput> {
  const src = new ArtifactStore(projectRoot, input.sourceRunId);
  if (!(await src.exists("02-plan.md"))) {
    throw new RunLaunchError(
      "resume_missing_plan",
      `Source run "${input.sourceRunId}" has no plan artifact to reuse.`,
    );
  }
  const seededPlan = await src.read("02-plan.md");
  let seededArchitecture: string | null = null;
  if (input.fromStage === "executing") {
    if (!(await src.exists("04-architecture.md"))) {
      throw new RunLaunchError(
        "resume_missing_architecture",
        `Source run "${input.sourceRunId}" has no architecture artifact; rewind to architecting instead.`,
      );
    }
    seededArchitecture = await src.read("04-architecture.md");
  }
  return {
    sourceRunId: input.sourceRunId,
    fromStage: input.fromStage,
    seededPlan,
    seededArchitecture,
  };
}

export async function runFromSpec(
  spec: RunSpec,
  opts: RunLaunchOptions = {},
): Promise<OrchestratorOutput> {
  const detected = await detectProject(spec.projectRoot);
  if (!detected.isGitRepo) {
    throw new RunLaunchError(
      "not_git_repo",
      `${spec.projectRoot} is not inside a git repository.`,
    );
  }
  if (!(await configExists(detected.projectRoot))) {
    throw new RunLaunchError(
      "not_initialized",
      "Amaco is not initialized here (.amaco/project.yml is missing). Run `amaco init`.",
    );
  }

  const loaded = await loadConfig(detected.projectRoot);

  const missing: string[] = [];
  for (const [roleId, agent] of Object.entries(loaded.config.roles)) {
    if (!loaded.config.providers[agent.provider]) {
      missing.push(`${roleId} → ${agent.provider}`);
    }
  }
  if (missing.length > 0) {
    throw new RunLaunchError(
      "missing_provider",
      `Some agents reference an unconfigured provider: ${missing.join(", ")}.`,
    );
  }

  // Inherit effort / provider / read-only from a linked roadmap task when the
  // spec didn't set them explicitly — same precedence as `amaco run --task`.
  let effort = spec.effort ?? null;
  let providerOverride = spec.provider ?? null;
  let readOnly = spec.readOnly ?? false;
  if (spec.taskId) {
    const { RoadmapService } = await import("../roadmap/roadmap-service.js");
    const svc = new RoadmapService(detected.projectRoot);
    const task = await svc.getTask(spec.taskId);
    if (!task) {
      throw new RunLaunchError(
        "task_not_found",
        `Roadmap task "${spec.taskId}" not found.`,
      );
    }
    if (effort === null) effort = task.effort;
    if (providerOverride === null) providerOverride = task.providerOverride;
    if (!spec.readOnly) readOnly = task.readOnly;
  }

  // Rewind: load the upstream artifacts from the source run so the new run
  // resumes at the chosen stage instead of regenerating them.
  let resumeFrom: ResumeFromInput | null = null;
  if (spec.resumeFrom) {
    if (spec.flow) {
      throw new RunLaunchError(
        "resume_with_flow",
        "A run cannot both rewind from a prior run and run a Flow.",
      );
    }
    resumeFrom = await resolveResumeFrom(detected.projectRoot, spec.resumeFrom);
  }

  let resolvedFlow: ResolvedFlowSnapshot | null = null;
  if (spec.flow) {
    const flow = await findFlowById(detected.projectRoot, spec.flow.id);
    if (!flow) {
      const ids = (await discoverFlows(detected.projectRoot)).map((g) => g.id);
      throw new RunLaunchError(
        "flow_not_found",
        `No Flow named "${spec.flow.id}". Found: ${ids.join(", ") || "(none)"}.`,
      );
    }
    resolvedFlow = resolveFlow({
      flow: flow.definition,
      source: flow.source,
      config: loaded.config,
      task: spec.task,
      brief: spec.flow.brief ?? null,
      contextPolicy: spec.flow.contextPolicy,
      slotProviders: spec.flow.slotProviders ?? {},
      skippedOptionalSteps: spec.flow.skippedOptionalSteps ?? [],
    });
  }

  const orchestrator = new Orchestrator({
    projectRoot: detected.projectRoot,
    config: loaded.config,
    rules: loaded.rules,
    task: spec.task,
    isGitRepo: detected.isGitRepo,
    taskId: spec.taskId ?? null,
    effort,
    providerOverride,
    readOnly,
    runtimeSkills: spec.runtimeSkills ?? [],
    concise: spec.concise ?? false,
    flow: resolvedFlow,
    resumeFrom,
    abortSignal: opts.abortSignal,
    onProgress: opts.onProgress,
  });
  return orchestrator.run();
}
