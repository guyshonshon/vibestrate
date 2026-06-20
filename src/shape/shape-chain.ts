// ── Shape phase: the run-chain keystone ──────────────────────────────────────
//
// The Shape phase is a chain of fresh, human-initiated, read-only runs glued by
// the consult surface (no durable pause, no nested runs - see
// docs/design/shape-phase.md). This module is the one new primitive: it reads the
// intake run's structured questions, and - when the user answers them - launches
// the shape run through the SAME gated launch path the dashboard uses
// (`startDetachedRun` over a typed `RunSpec`), never spawning a command itself.
//
// Security invariants (Tier-2 reviewed):
//   - The browser/CLI submit a typed, length-capped answer-set; this module
//     builds the `RunSpec` server-side and calls `startDetachedRun`. There is no
//     path from a submitted answer to a shell argument.
//   - `sourceRunId` is validated (assertSafeRunId) before any path is built.
//   - Answers ride as a `file` contextSource (path-guarded + secret-redacted at
//     materialization), NOT the flow brief (which is injected verbatim).

import path from "node:path";
import { z } from "zod";
import { ArtifactStore } from "../core/artifact-store.js";
import { startDetachedRun } from "../core/detached-run.js";
import { discoverFlows, findFlowById } from "../flows/catalog/flow-discovery.js";
import { makeUniqueRunId } from "../utils/run-id.js";
import type { RunSpec } from "../core/run-launcher.js";
import {
  flowQuestionsOutputSchema,
  type FlowShapeQuestion,
} from "../flows/schemas/flow-output-contracts.js";
import { assertSafeRunId } from "../server/security.js";
import { ProposalService } from "../roadmap/proposal-service.js";
import { VibestrateError } from "../utils/errors.js";

export class ShapeChainError extends VibestrateError {
  constructor(message: string, cause?: unknown) {
    super("SHAPE_CHAIN_ERROR", message, cause);
    this.name = "ShapeChainError";
  }
}

const INTAKE_QUESTIONS_PATH = "flows/intake/questions.json";
const IDEA_PATH = "00-idea.md";
const ANSWERS_PATH = "shape-answers.md";
const SYNTHESIZE_OUTPUT_PATH = "flows/synthesize/output.md";
/** The flow to BUILD after shaping (P1), written at run start by the orchestrator
 *  and carried across the detached chain (intake -> shape -> build). */
const TARGET_FLOW_PATH = "shape-target-flow.json";
const APPROVED_SPEC_PATH = "shape-approved-spec.md";
/** The shape flow's spec-producing step outputs, concatenated into the spec that
 *  seeds the chosen build flow. Step id -> output.md (see builtin-flows shapeFlow). */
const SHAPE_SPEC_STEPS = ["scope", "spec", "architecture", "risks"] as const;

/** Read the carried build-target flow id (P1) from a run's sidecar, or null. */
async function readTargetFlowId(
  store: ArtifactStore,
): Promise<string | null> {
  if (!(await store.exists(TARGET_FLOW_PATH))) return null;
  try {
    const parsed = JSON.parse(await store.read(TARGET_FLOW_PATH)) as {
      flowId?: unknown;
    };
    return typeof parsed.flowId === "string" && parsed.flowId.length > 0
      ? parsed.flowId
      : null;
  } catch {
    return null;
  }
}

/** One submitted answer. `id` must match a question's id; answers are bounded so
 *  a huge payload can't bloat the prompt. */
export const shapeAnswerSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9][a-z0-9_-]*$/),
    answer: z.string().min(1).max(2000),
  })
  .strict();
export type ShapeAnswer = z.infer<typeof shapeAnswerSchema>;

export const shapeAnswersSchema = z.array(shapeAnswerSchema).min(1).max(20);

export type PendingShapeQuestions = {
  questions: FlowShapeQuestion[];
  /** The original brief, carried forward as the shape run's task. */
  task: string;
  /** Adaptive Shape (P1): the flow to BUILD once the spec is approved, carried
   *  from the run that triggered shaping. null = no bound flow (build with the
   *  project default at approve time). */
  targetFlowId: string | null;
};

/**
 * Read the pending intake questions for a run. Returns null when the run has no
 * parsed `questions` artifact (not an intake run, or it didn't parse).
 */
export async function readShapeQuestions(
  projectRoot: string,
  sourceRunId: string,
): Promise<PendingShapeQuestions | null> {
  assertSafeRunId(sourceRunId);
  const store = new ArtifactStore(projectRoot, sourceRunId);
  if (!(await store.exists(INTAKE_QUESTIONS_PATH))) return null;
  let parsed;
  try {
    parsed = flowQuestionsOutputSchema.safeParse(
      JSON.parse(await store.read(INTAKE_QUESTIONS_PATH)),
    );
  } catch {
    return null;
  }
  if (!parsed.success) return null;
  let task = "";
  if (await store.exists(IDEA_PATH)) {
    task = (await store.read(IDEA_PATH)).trim();
  }
  const targetFlowId = await readTargetFlowId(store);
  return { questions: parsed.data.questions, task, targetFlowId };
}

function renderAnswersDoc(
  pending: PendingShapeQuestions,
  answers: ShapeAnswer[],
): string {
  const byId = new Map(pending.questions.map((q) => [q.id, q]));
  const lines: string[] = [
    "# Shape: the user's answers to the intake questions",
    "",
    "These answers scope the work. Treat them as the user's decisions.",
    "",
  ];
  for (const a of answers) {
    const q = byId.get(a.id);
    lines.push(`## ${q ? q.question : a.id}`);
    if (q) lines.push(`> Why it matters: ${q.why}`, "");
    lines.push(a.answer.trim(), "");
  }
  return `${lines.join("\n")}\n`;
}

/**
 * Submit answers to an intake run's questions and launch the shape run. Writes a
 * redactable answers artifact into the source run dir and references it as a
 * `file` contextSource on a typed RunSpec, then launches through the gated
 * detached-run path. The shape flow produces no diff, so the launcher clamps the
 * run read-only by construction.
 */
export async function submitShapeAnswers(input: {
  projectRoot: string;
  sourceRunId: string;
  answers: ShapeAnswer[];
}): Promise<{ runId: string; pid: number | null }> {
  const { projectRoot, sourceRunId } = input;
  assertSafeRunId(sourceRunId);
  const answers = shapeAnswersSchema.parse(input.answers);
  const pending = await readShapeQuestions(projectRoot, sourceRunId);
  if (!pending) {
    throw new ShapeChainError(
      `No pending shape questions for run "${sourceRunId}".`,
    );
  }
  const store = new ArtifactStore(projectRoot, sourceRunId);
  const absAnswers = await store.write(
    ANSWERS_PATH,
    renderAnswersDoc(pending, answers),
  );
  // Project-relative ref so the path guard (project root + worktree) accepts it.
  const ref = path.relative(projectRoot, absAnswers);
  const runId = makeUniqueRunId(projectRoot);
  const spec: RunSpec = {
    projectRoot,
    task: pending.task || "Shape this work (brief carried from intake).",
    runId,
    // A shape-phase run: never re-shaped (loop guard). The chosen build flow is
    // carried forward so the `approve & build` handoff can target it (P1).
    shaped: true,
    shapeTargetFlowId: pending.targetFlowId,
    flow: { id: "shape", brief: null },
    contextSources: [{ kind: "file", ref, label: "Shape: intake answers" }],
  };
  const pid = await startDetachedRun({ spec, spawnedBy: "dashboard" });
  return { runId, pid };
}

/**
 * Approve the shaped draft and launch link 3 (the roadmap run). Resumes the
 * shape run at stage "executing" so seedResumedSteps copies its scope/spec/
 * architecture/risks artifacts forward, and the `synthesize` step turns them
 * into a dependency-aware proposal. This is the only place resumeFrom is used in
 * the chain; the seeded step ids/stages must match the shape flow (guarded by
 * the chain-integrity test).
 */
export async function approveShapeAndStartRoadmap(input: {
  projectRoot: string;
  shapeRunId: string;
}): Promise<{ runId: string; pid: number | null }> {
  assertSafeRunId(input.shapeRunId);
  const src = new ArtifactStore(input.projectRoot, input.shapeRunId);
  if (!(await src.exists(IDEA_PATH))) {
    throw new ShapeChainError(`Shape run "${input.shapeRunId}" not found.`);
  }
  let task = "Synthesize the approved shape into a dependency-aware roadmap.";
  try {
    const idea = (await src.read(IDEA_PATH)).trim();
    if (idea) task = idea;
  } catch {
    /* keep the default task */
  }
  const runId = makeUniqueRunId(input.projectRoot);
  const spec: RunSpec = {
    projectRoot: input.projectRoot,
    task,
    runId,
    shaped: true,
    flow: { id: "shape-roadmap", brief: null },
    resumeFrom: { sourceRunId: input.shapeRunId, fromStage: "executing" },
  };
  const pid = await startDetachedRun({ spec, spawnedBy: "dashboard" });
  return { runId, pid };
}

/**
 * Approve the shaped draft and BUILD it (P1). Reads the shape run's spec outputs
 * (scope / spec / architecture / risks), concatenates them into one approved-spec
 * artifact, and launches the CHOSEN flow (carried via the shape-target sidecar,
 * or `fallbackFlowId` / the caller's override) seeded with that spec as a `file`
 * contextSource - so the executor builds FROM the spec, never re-derives from the
 * bare task. This is the terminal handoff that makes Shape an enrichment over the
 * chosen flow rather than a replacement. Fails fast (throws) if the chosen flow
 * is unknown or the shape run produced no spec, so an empty-context build is
 * impossible by construction.
 */
export async function approveShapeAndBuild(input: {
  projectRoot: string;
  shapeRunId: string;
  /** Override the carried build flow (e.g. the user picked a different one). */
  flowId?: string | null;
  /** Used when neither the sidecar nor `flowId` names a flow (the project default). */
  fallbackFlowId?: string | null;
}): Promise<{ runId: string; pid: number | null; flowId: string }> {
  assertSafeRunId(input.shapeRunId);
  const src = new ArtifactStore(input.projectRoot, input.shapeRunId);
  if (!(await src.exists(IDEA_PATH))) {
    throw new ShapeChainError(`Shape run "${input.shapeRunId}" not found.`);
  }
  const flowId =
    input.flowId ??
    (await readTargetFlowId(src)) ??
    input.fallbackFlowId ??
    null;
  if (!flowId) {
    throw new ShapeChainError(
      `No build flow for shape run "${input.shapeRunId}" (no carried target, no override, no default).`,
    );
  }
  // Validate the flow exists BEFORE spawning - otherwise the detached run dies in
  // the background while the caller sees a success. Fail fast with a clear error.
  if (!(await findFlowById(input.projectRoot, flowId))) {
    const ids = (await discoverFlows(input.projectRoot)).map((g) => g.id);
    throw new ShapeChainError(
      `Build flow "${flowId}" not found. Available: ${ids.join(", ") || "(none)"}.`,
    );
  }

  // Assemble the approved spec from the shape run's spec-producing steps. Fail
  // fast if NONE produced content - launching a build with empty context would
  // silently re-derive from the bare task (the P1 keystone failure).
  const sections: string[] = [];
  for (const step of SHAPE_SPEC_STEPS) {
    const p = `flows/${step}/output.md`;
    if (!(await src.exists(p))) continue;
    const body = (await src.read(p)).trim();
    if (body) sections.push(`# ${step[0]!.toUpperCase()}${step.slice(1)}\n\n${body}`);
  }
  if (sections.length === 0) {
    throw new ShapeChainError(
      `Shape run "${input.shapeRunId}" has no spec to build from (no scope/spec/architecture/risks output).`,
    );
  }
  const specDoc = `# Shape: the approved spec\n\nBuild strictly to this spec - it is the user's approved scope, derived during shaping. Treat it as ground truth.\n\n${sections.join("\n\n")}\n`;
  const absSpec = await src.write(APPROVED_SPEC_PATH, specDoc);
  const ref = path.relative(input.projectRoot, absSpec);

  let task = "Build the approved shaped work.";
  try {
    const idea = (await src.read(IDEA_PATH)).trim();
    if (idea) task = idea;
  } catch {
    /* keep the default task */
  }

  const runId = makeUniqueRunId(input.projectRoot);
  const spec: RunSpec = {
    projectRoot: input.projectRoot,
    task,
    runId,
    // The executor: already shaped, so it runs the chosen flow directly (loop
    // guard) seeded with the approved spec as context.
    shaped: true,
    flow: { id: flowId, brief: null },
    contextSources: [{ kind: "file", ref, label: "Shape: approved spec" }],
  };
  const pid = await startDetachedRun({ spec, spawnedBy: "dashboard" });
  return { runId, pid, flowId };
}

/**
 * Bridge link 3 -> the existing proposal pipeline: read a completed shape-roadmap
 * run's synthesis output (the VIBESTRATE_TASK marker text) and register it as a
 * roadmap proposal, which the proposals surface reviews and accepts into cards.
 * The chain stays human-stepped - this is invoked when the user opens the
 * finished roadmap run, never auto.
 */
export async function createRoadmapProposal(input: {
  projectRoot: string;
  runId: string;
}): Promise<{ proposalId: string }> {
  assertSafeRunId(input.runId);
  const store = new ArtifactStore(input.projectRoot, input.runId);
  if (!(await store.exists(SYNTHESIZE_OUTPUT_PATH))) {
    throw new ShapeChainError(
      `Run "${input.runId}" has no roadmap synthesis to turn into a proposal.`,
    );
  }
  const body = await store.read(SYNTHESIZE_OUTPUT_PATH);
  const proposalId = `shape-${input.runId}`;
  const svc = new ProposalService(input.projectRoot);
  await svc.writeProposalText(proposalId, body);
  return { proposalId };
}

/**
 * Launch the intake run - the "Plan" entry point. A fresh read-only run on the
 * `shape-intake` flow that emits the structured gap questions.
 */
export async function startShapeIntake(input: {
  projectRoot: string;
  task: string;
  persona?: string | null;
  /** Adaptive Shape (P1): the flow to BUILD once the spec is approved, carried to
   *  the `approve & build` handoff. null = build with the project default. */
  targetFlowId?: string | null;
}): Promise<{ runId: string; pid: number | null }> {
  const task = input.task.trim();
  if (!task) throw new ShapeChainError("A brief is required to start shaping.");
  const runId = makeUniqueRunId(input.projectRoot);
  const spec: RunSpec = {
    projectRoot: input.projectRoot,
    task,
    runId,
    persona: input.persona ?? null,
    // The intake run IS the shape phase: never re-shaped (loop guard); it carries
    // the chosen build flow forward via the shape-target sidecar.
    shaped: true,
    shapeTargetFlowId: input.targetFlowId ?? null,
    flow: { id: "shape-intake", brief: null },
  };
  const pid = await startDetachedRun({ spec, spawnedBy: "dashboard" });
  return { runId, pid };
}
