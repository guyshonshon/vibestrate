import { z } from "zod";
import { detectProject } from "../project/project-detector.js";
import { configExists, loadConfig } from "../project/config-loader.js";
import { Orchestrator, type OrchestratorOutput } from "./orchestrator.js";
import {
  discoverGuides,
  findGuideById,
} from "../guides/catalog/guide-discovery.js";
import { resolveGuide } from "../guides/runtime/guide-resolver.js";
import type { ResolvedGuideSnapshot } from "../guides/schemas/guide-schema.js";

/**
 * The shared, non-interactive run pipeline. Both the CLI (`amaco run`) and the
 * dashboard reach a run through the core `Orchestrator`; this launcher is the
 * piece the **dashboard** uses so the server never has to shell out to the CLI
 * binary. It takes a fully-structured spec, loads config, resolves the Guide,
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
  guide: z
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
  for (const [agentId, agent] of Object.entries(loaded.config.agents)) {
    if (!loaded.config.providers[agent.provider]) {
      missing.push(`${agentId} → ${agent.provider}`);
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

  let resolvedGuide: ResolvedGuideSnapshot | null = null;
  if (spec.guide) {
    const guide = await findGuideById(detected.projectRoot, spec.guide.id);
    if (!guide) {
      const ids = (await discoverGuides(detected.projectRoot)).map((g) => g.id);
      throw new RunLaunchError(
        "guide_not_found",
        `No Guide named "${spec.guide.id}". Found: ${ids.join(", ") || "(none)"}.`,
      );
    }
    resolvedGuide = resolveGuide({
      guide: guide.definition,
      source: guide.source,
      config: loaded.config,
      task: spec.task,
      brief: spec.guide.brief ?? null,
      contextPolicy: spec.guide.contextPolicy,
      slotProviders: spec.guide.slotProviders ?? {},
      skippedOptionalSteps: spec.guide.skippedOptionalSteps ?? [],
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
    guide: resolvedGuide,
    abortSignal: opts.abortSignal,
    onProgress: opts.onProgress,
  });
  return orchestrator.run();
}
