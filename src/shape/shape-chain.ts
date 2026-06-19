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

/** One submitted answer. `id` must match a question's id; answers are bounded so
 *  a huge payload can't bloat the prompt. */
export const shapeAnswerSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9][a-z0-9-]*$/),
    answer: z.string().min(1).max(2000),
  })
  .strict();
export type ShapeAnswer = z.infer<typeof shapeAnswerSchema>;

export const shapeAnswersSchema = z.array(shapeAnswerSchema).min(1).max(20);

export type PendingShapeQuestions = {
  questions: FlowShapeQuestion[];
  /** The original brief, carried forward as the shape run's task. */
  task: string;
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
  return { questions: parsed.data.questions, task };
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
    flow: { id: "shape-roadmap", brief: null },
    resumeFrom: { sourceRunId: input.shapeRunId, fromStage: "executing" },
  };
  const pid = await startDetachedRun({ spec, spawnedBy: "dashboard" });
  return { runId, pid };
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
}): Promise<{ runId: string; pid: number | null }> {
  const task = input.task.trim();
  if (!task) throw new ShapeChainError("A brief is required to start shaping.");
  const runId = makeUniqueRunId(input.projectRoot);
  const spec: RunSpec = {
    projectRoot: input.projectRoot,
    task,
    runId,
    persona: input.persona ?? null,
    flow: { id: "shape-intake", brief: null },
  };
  const pid = await startDetachedRun({ spec, spawnedBy: "dashboard" });
  return { runId, pid };
}
