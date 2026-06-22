import { z } from "zod";
import { detectProject } from "../project/project-detector.js";
import { configExists, loadConfig } from "../project/config-loader.js";
import {
  Orchestrator,
  type OrchestratorOutput,
  type ResumeFromInput,
  type ResumeStage,
} from "./orchestrator.js";
import { ArtifactStore } from "./artifact-store.js";
import {
  discoverFlows,
  findFlowById,
} from "../flows/catalog/flow-discovery.js";
import { resolveFlow } from "../flows/runtime/flow-resolver.js";
import { chooseRunFlow, type WorkflowSelection } from "../orchestrator/select-workflow.js";
import { resolveRunPosture } from "../orchestrator/posture-apply.js";
import { SPEC_UP_TARGET_FLOW } from "../orchestrator/flow-sizing.js";
import { resolvePersona } from "../orchestrator/personas.js";
import { permissionModeSchema } from "../project/config-schema.js";
import type { ResolvedFlowSnapshot } from "../flows/schemas/flow-schema.js";
import { contextSourceSchema } from "./context-source-schema.js";

/**
 * The shared, non-interactive run pipeline. Both the CLI (`vibe run`) and the
 * dashboard reach a run through the core `Orchestrator`; this launcher is the
 * piece the **dashboard** uses so the server never has to shell out to the CLI
 * binary. It takes a fully-structured spec, loads config, resolves the Flow,
 * and drives the orchestrator - no terminal output, no prompts.
 *
 * The CLI command keeps its own presentation layer (wizard, friendly errors)
 * and constructs the orchestrator directly; the orchestrator
 * itself is the single shared core. UI ⇄ CLI stay independent.
 */
export const runSpecSchema = z.object({
  /** Absolute project root the run executes in. */
  projectRoot: z.string().min(1),
  task: z.string().min(1).max(2000),
  /** Pre-assigned run id (the dashboard computes it before spawning so the UI
   *  can navigate immediately). Short docker-style `adjective-noun` ids now;
   *  the pattern also still accepts the legacy `YYYYMMDD-HHMMSS-slug` form so
   *  old run dirs/refs keep validating. Filesystem- and git-ref-safe. */
  runId: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{0,120}$/)
    .nullable()
    .optional(),
  taskId: z.string().min(1).max(128).nullable().optional(),
  /** Crew to resolve the flow against (default: project.defaultCrew). */
  crewId: z.string().min(1).max(128).nullable().optional(),
  /** Run-wide Profile override applied to every seated step. */
  profileOverride: z.string().min(1).max(128).nullable().optional(),
  /** Seat → Role overrides (disambiguate seats filled by >1 crew role). */
  seatRoleOverrides: z.record(z.string(), z.string()).optional(),
  readOnly: z.boolean().optional(),
  /** Permission mode (T14 P4): read-only / ask / accept-edits / auto. Omitted ⇒
   *  config.policies.defaultPermissionMode. `readOnly: true` is the legacy alias
   *  for read-only. */
  permissionMode: permissionModeSchema.optional(),
  /** Unattended run: never pause for a human (forces budget onLimit->stop and
   *  resilience onExhausted->fail), so the run always terminates on its own. */
  unattended: z.boolean().optional(),
  runtimeSkills: z.array(z.string().min(1).max(128)).max(64).optional(),
  concise: z.boolean().optional(),
  /** Orchestrator flow selection: true = force a selection even if a default is
   *  set (--select); false = skip selection, use the default flow (--no-select);
   *  omitted = the normal precedence (forced > default > select). */
  select: z.boolean().nullable().optional(),
  /** Supervisor persona (judgment posture) for this run; default = defaultPersona. */
  persona: z.string().min(1).max(40).nullable().optional(),
  /** Pick-up execution (Phase 3): iterate the linked task's checklist through
   *  the flow's checklistSegment. "continuous" runs items back-to-back; "step"
   *  pauses between items. Omitted = no checklist iteration. */
  checklistMode: z.enum(["continuous", "step"]).nullable().optional(),
  /** Context sources (Phase 4): files/URLs injected into every agent prompt.
   *  Omitted ⇒ inherit the linked task's sources (if any). */
  contextSources: z.array(contextSourceSchema).max(32).optional(),
  /** Adaptive spec-up (P1): true marks this run as a spec-up-phase run (intake/spec-up/
   *  roadmap) or the post-spec-up executor, so it is NOT itself re-shaped (loop
   *  guard). Omitted = a normal user run, eligible for adaptive spec-up. */
  specUpPhase: z.boolean().optional(),
  /** Adaptive spec-up (P1): the flow to BUILD once spec-up is approved. Carried
   *  across the detached chain via the `spec-up-target-flow.json` sidecar. */
  specUpTargetFlowId: z.string().min(1).max(80).nullable().optional(),
  /** Deep-questioning loop: the round this intake run represents (server-owned,
   *  never model-emitted). Persisted as the `spec-up-round.json` sidecar. */
  specUpRound: z.number().int().min(1).max(20).nullable().optional(),
  /** Deep-questioning loop: the chain-root run id where accumulated cross-round
   *  answers live. Persisted as the `spec-up-root-run.json` sidecar. */
  specUpRootRunId: z.string().min(1).max(200).nullable().optional(),
  flow: z
    .object({
      id: z.string().min(1).max(80),
      brief: z.string().max(4000).nullable().optional(),
      contextPolicy: z
        .enum(["balanced", "compact", "artifact-heavy"])
        .optional(),
      /** Per-step Profile overrides (step id → profile id). */
      stepProfileOverrides: z.record(z.string(), z.string()).optional(),
      skippedOptionalSteps: z.array(z.string()).max(64).optional(),
    })
    .nullable()
    .optional(),
  /** Rewind: fork a fresh run from a prior run, resuming at a chosen stage and
   *  reusing that run's upstream step outputs. May be combined with `flow` -
   *  the flow runner seeds the upstream steps from the source run. */
  resumeFrom: z
    .object({
      sourceRunId: z.string().min(1).max(200),
      fromStage: z.enum([
        "planning",
        "architecting",
        "executing",
        "reviewing",
        "fixing",
        "verifying",
      ]),
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
 *  dashboard launcher and the `vibe run --resume-from` CLI path so both reach
 *  the same behavior. Throws RunLaunchError with an actionable message. */
export async function resolveResumeFrom(
  projectRoot: string,
  input: { sourceRunId: string; fromStage: ResumeStage },
): Promise<ResumeFromInput> {
  // Validate the source run exists; the flow runner seeds the upstream step
  // outputs itself (and fails clearly if a needed step output is missing).
  // Every run writes `00-idea.md` at start, so it's a stable existence probe.
  const src = new ArtifactStore(projectRoot, input.sourceRunId);
  if (!(await src.exists("00-idea.md"))) {
    throw new RunLaunchError(
      "resume_source_missing",
      `Source run "${input.sourceRunId}" not found (no artifacts to reuse).`,
    );
  }
  // Downstream stages (review/fix/verify) need the source run's code, restored
  // from a per-phase worktree snapshot. Fail fast with a clear message when the
  // source run captured none (e.g. an older run, or a read-only run with no
  // code), rather than resuming into an empty worktree.
  const downstream = new Set<ResumeStage>(["reviewing", "fixing", "verifying"]);
  if (downstream.has(input.fromStage)) {
    const { readPhaseSnapshots, pickSnapshotForResume } = await import(
      "./phase-snapshots.js"
    );
    const snaps = await readPhaseSnapshots(projectRoot, input.sourceRunId);
    const pick = pickSnapshotForResume(
      snaps,
      input.fromStage as "reviewing" | "fixing" | "verifying",
    );
    if (!pick) {
      throw new RunLaunchError(
        "resume_no_snapshot",
        `Cannot rewind run "${input.sourceRunId}" to "${input.fromStage}": it has no worktree snapshot ` +
          `for that stage (only runs that produced code after Rewind phase 2 can be resumed downstream).`,
      );
    }
  }
  return { sourceRunId: input.sourceRunId, fromStage: input.fromStage };
}

/**
 * Non-destructive preview of a downstream rewind: the file overwrite/remove set
 * the restore WOULD apply (ISSUE-001 P2). Validates the source run exists, then
 * returns the diff of the snapshot vs the worktree base. Returns null for an
 * upstream stage (planning/architecting/executing restore no code) or when the
 * source has no snapshot for that stage. Throws RunLaunchError if the source run
 * is missing. Read-only - never starts a run.
 */
export async function resolveRestorePreview(
  projectRoot: string,
  input: { sourceRunId: string; fromStage: ResumeStage },
): Promise<import("./phase-snapshots.js").RestorePreview | null> {
  const src = new ArtifactStore(projectRoot, input.sourceRunId);
  if (!(await src.exists("00-idea.md"))) {
    throw new RunLaunchError(
      "resume_source_missing",
      `Source run "${input.sourceRunId}" not found (no artifacts to reuse).`,
    );
  }
  const downstream = new Set<ResumeStage>(["reviewing", "fixing", "verifying"]);
  if (!downstream.has(input.fromStage)) return null;
  const { previewPhaseRestore } = await import("./phase-snapshots.js");
  return previewPhaseRestore({
    projectRoot,
    sourceRunId: input.sourceRunId,
    fromStage: input.fromStage as "reviewing" | "fixing" | "verifying",
  });
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
      "Vibestrate is not initialized here (.vibestrate/project.yml is missing). Run `vibe init`.",
    );
  }

  const loaded = await loadConfig(detected.projectRoot);
  // Profile → provider integrity is enforced by the config schema at load time.

  // Inherit profile override / read-only from a linked roadmap task
  // when the spec didn't set them - same precedence as `vibe run --task`.
  let profileOverride = spec.profileOverride ?? null;
  let readOnly = spec.readOnly ?? false;
  let contextSources = spec.contextSources ?? null;
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
    if (profileOverride === null) profileOverride = task.profileOverride;
    if (!spec.readOnly) readOnly = task.readOnly;
    if (contextSources === null && task.contextSources.length > 0) {
      contextSources = task.contextSources;
    }
  }

  // Rewind: the flow runner seeds the upstream step outputs from the source run
  // so the new run resumes at the chosen stage. Works with an explicit flow too.
  let resumeFrom: ResumeFromInput | null = null;
  if (spec.resumeFrom) {
    resumeFrom = await resolveResumeFrom(detected.projectRoot, spec.resumeFrom);
  }

  // Choose the Flow transparently: forced (spec.flow) > default > orchestrator
  // selection. Skipped for resume (flow fixed by the source run) and checklist
  // runs (the pickup flow is implied). The chosen flow is always recorded.
  let selection: WorkflowSelection | null = null;
  if (!resumeFrom && !spec.checklistMode) {
    selection = await chooseRunFlow({
      projectRoot: detected.projectRoot,
      task: spec.task,
      config: loaded.config,
      forcedFlowId: spec.flow?.id ?? null,
      forceSelect: spec.select === true,
      noSelect: spec.select === false,
      specUpPhase: spec.specUpPhase === true,
      personaOverride: spec.persona ?? null,
      loaded,
      signal: opts.abortSignal,
    });
  }

  // Adaptive spec-up (P1): an under-specified brief is SPEC'D UP FIRST. This run
  // becomes the read-only `spec-up-intake` run (emits the gap questions); the
  // CHOSEN flow (selection.flowId) is carried to the post-spec-up `approve & build`
  // handoff via the spec-up-target sidecar - it is never replaced. The loop guard
  // (`spec.specUpPhase`) keeps spec-up-phase / executor runs from re-entering spec-up.
  const willSpecUp = selection?.needsSpecUp === true && spec.specUpPhase !== true;
  const specUpTargetFlowId = willSpecUp
    ? (selection?.flowId ?? spec.flow?.id ?? null)
    : (spec.specUpTargetFlowId ?? null);
  const effectiveFlowId = willSpecUp
    ? SPEC_UP_TARGET_FLOW
    : (selection?.flowId ?? spec.flow?.id ?? null);
  // Apply a recommended crew only when the request didn't specify one.
  const effectiveCrewId = spec.crewId ?? selection?.crewId ?? null;
  let resolvedFlow: ResolvedFlowSnapshot | null = null;
  if (effectiveFlowId) {
    const flow = await findFlowById(detected.projectRoot, effectiveFlowId);
    if (!flow) {
      const ids = (await discoverFlows(detected.projectRoot)).map((g) => g.id);
      throw new RunLaunchError(
        "flow_not_found",
        `No Flow named "${effectiveFlowId}". Found: ${ids.join(", ") || "(none)"}.`,
      );
    }
    // Safety clamp: a flow with no write step (no step produces a `diff`, e.g.
    // the plan-only flow) must never run write-capable. Force read-only so the
    // permission clamp in runRole applies to every role - regardless of how the
    // flow was chosen (grid pick, default, or auto-select). The real guard is
    // this clamp, NOT the mere absence of write steps (an agent-turn under a
    // write-capable profile can still touch disk unless readOnly is set).
    const flowProducesDiff = flow.definition.steps.some((s) =>
      (s.outputs ?? []).includes("diff"),
    );
    if (!flowProducesDiff && !readOnly) {
      readOnly = true;
    }
    const persona = resolvePersona(
      loaded.config,
      spec.persona ?? selection?.personaId ?? null,
    );
    resolvedFlow = resolveFlow({
      flow: flow.definition,
      source: flow.source,
      config: loaded.config,
      task: spec.task,
      crewId: effectiveCrewId,
      profileOverride,
      seatRoleOverrides: spec.seatRoleOverrides ?? {},
      brief: spec.flow?.brief ?? null,
      contextPolicy: spec.flow?.contextPolicy,
      stepProfileOverrides: spec.flow?.stepProfileOverrides ?? {},
      skippedOptionalSteps: spec.flow?.skippedOptionalSteps ?? [],
      reviewerProfile: persona.config.reviewerProfile ?? null,
    });
  }

  // Posture-applies (Slice 2b): fold a suggested posture into this run's effective
  // permissionMode + isolation, gated per-posture by config (default off). On
  // resume/checklist `selection` is null ⇒ posture "normal" ⇒ this reproduces the
  // prior `spec.permissionMode ?? (readOnly ? "read-only" : undefined)` exactly.
  const effectivePosture = resolveRunPosture({
    posture: selection?.posture ?? "normal",
    config: loaded.config.posture,
    specPermissionMode: spec.permissionMode ?? null,
    readOnly,
    unattended: spec.unattended ?? false,
  });

  const orchestrator = new Orchestrator({
    projectRoot: detected.projectRoot,
    config: loaded.config,
    rules: loaded.rules,
    task: spec.task,
    isGitRepo: detected.isGitRepo,
    runId: spec.runId ?? null,
    taskId: spec.taskId ?? null,
    crewId: effectiveCrewId,
    profileOverride,
    stepProfileOverrides: spec.flow?.stepProfileOverrides ?? {},
    seatRoleOverrides: spec.seatRoleOverrides ?? {},
    readOnly,
    unattended: spec.unattended ?? false,
    runtimeSkills: spec.runtimeSkills ?? [],
    concise: spec.concise ?? false,
    flow: resolvedFlow,
    selection,
    // The resolved persona id, independent of `selection` (null on resume), so the
    // orchestrator's reviewLens + specUpPosture fire on resumed/roadmap runs too.
    personaId: spec.persona ?? selection?.personaId ?? null,
    resumeFrom,
    checklistMode: spec.checklistMode ?? null,
    contextSources: contextSources ?? [],
    specUpTargetFlowId,
    specUpRound: spec.specUpRound ?? null,
    specUpRootRunId: spec.specUpRootRunId ?? null,
    // Permission mode (P4): explicit spec value > read-only/no-write clamp >
    // auto-applied approval posture (resolved in resolveRunPosture).
    permissionMode: effectivePosture.permissionMode,
    isolationOverride: effectivePosture.isolationOverride ?? null,
    postureNotes: effectivePosture.notes,
    abortSignal: opts.abortSignal,
    onProgress: opts.onProgress,
  });
  return orchestrator.run();
}
