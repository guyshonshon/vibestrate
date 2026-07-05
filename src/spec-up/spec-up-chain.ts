// ── Spec-up phase: the run-chain keystone ──────────────────────────────────────
//
// The Spec-up phase is a chain of fresh, human-initiated, read-only runs glued by
// the consult surface (no durable pause, no nested runs - see
// docs/design/spec-up-phase.md). This module is the one new primitive: it reads the
// intake run's structured questions, and - when the user answers them - launches
// the spec-up run through the SAME gated launch path the dashboard uses
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
  type FlowSpecUpQuestion,
} from "../flows/schemas/flow-output-contracts.js";
import { assertSafeRunId } from "../server/security.js";
import { ProposalService } from "../roadmap/proposal-service.js";
import { VibestrateError } from "../utils/errors.js";

export class SpecUpChainError extends VibestrateError {
  constructor(message: string, cause?: unknown) {
    super("SPEC_UP_CHAIN_ERROR", message, cause);
    this.name = "SpecUpChainError";
  }
}

const INTAKE_QUESTIONS_PATH = "flows/intake/questions.json";
// Terminator marker: written on a spec-up-intake run once its questions are
// consumed (answered or proceeded). Its presence means "no pending questions" -
// without it, an answered run reads as awaiting forever (it lands merge_ready and
// its questions.json never goes away).
const ANSWERED_PATH = "flows/intake/answered.json";
const IDEA_PATH = "00-idea.md";
const ANSWERS_PATH = "spec-up-answers.md";
const SYNTHESIZE_OUTPUT_PATH = "flows/synthesize/output.md";
/** The flow to BUILD after spec-up, written at run start by the orchestrator
 *  and carried across the detached chain (intake -> spec-up -> build). */
const TARGET_FLOW_PATH = "spec-up-target-flow.json";
/** Deep-questioning loop (server-owned): the current round, written at run start
 *  from RunSpec.specUpRound. */
const ROUND_PATH = "spec-up-round.json";
/** Deep-questioning loop: the FIRST intake run id (the chain root), where the
 *  accumulated cross-round answers live. Carried forward so every gap-check round
 *  appends to one growing doc instead of overwriting. */
const ROOT_RUN_PATH = "spec-up-root-run.json";
/** specUpPosture: the active supervisor persona id, written at run start by the
 *  orchestrator and carried across the chain so each link aims its planning agents
 *  with the same persona's posture. Fail-safe: absent -> default persona (no posture). */
const PERSONA_PATH = "spec-up-persona.json";
/** Hard cap on questioning rounds. Server-enforced: the loop NEVER asks past this,
 *  regardless of what the model judges - it finalizes into the spec instead. This
 *  is the anti-interrogation brake. */
export const ROUND_CAP = 4;
export const APPROVED_SPEC_PATH = "spec-up-approved-spec.md";
/** The shape flow's spec-producing step outputs, concatenated into the spec that
 *  seeds the chosen build flow. Step id -> output.md (see builtin-flows specUpFlow).
 *  Exported as the editable-section set for the guarded artifact-edit service. */
export const SPEC_UP_SPEC_STEPS = ["scope", "spec", "architecture", "risks"] as const;

/** Read the carried build-target flow id from a run's sidecar, or null. */
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

/** Read the carried supervisor persona id from a run's sidecar, or null. */
async function readPersonaId(store: ArtifactStore): Promise<string | null> {
  if (!(await store.exists(PERSONA_PATH))) return null;
  try {
    const parsed = JSON.parse(await store.read(PERSONA_PATH)) as {
      personaId?: unknown;
    };
    return typeof parsed.personaId === "string" && parsed.personaId.length > 0
      ? parsed.personaId
      : null;
  } catch {
    return null;
  }
}

/** Read the server-owned round counter from a run's sidecar. Defaults to 1 (the
 *  first intake run has no sidecar). The model NEVER controls this. */
async function readRound(store: ArtifactStore): Promise<number> {
  if (!(await store.exists(ROUND_PATH))) return 1;
  try {
    const parsed = JSON.parse(await store.read(ROUND_PATH)) as { round?: unknown };
    const n = typeof parsed.round === "number" ? Math.floor(parsed.round) : 1;
    return n >= 1 ? n : 1;
  } catch {
    return 1;
  }
}

/** Read the chain-root run id (where accumulated answers live). null = this run
 *  IS the root (round 1). */
async function readRootRunId(store: ArtifactStore): Promise<string | null> {
  if (!(await store.exists(ROOT_RUN_PATH))) return null;
  try {
    const parsed = JSON.parse(await store.read(ROOT_RUN_PATH)) as {
      rootRunId?: unknown;
    };
    return typeof parsed.rootRunId === "string" && parsed.rootRunId.length > 0
      ? parsed.rootRunId
      : null;
  } catch {
    return null;
  }
}

/**
 * The deep-questioning brake, as a pure function so the cap is unit-testable and
 * lives in deterministic server state - never the model, never the request body.
 * Given the round of the run just answered, decide whether to ask one more
 * gap-check round or finalize into the spec.
 */
export function decideSpecUpNext(input: {
  round: number;
  proceed: boolean;
  cap: number;
}): { action: "gap-check" | "finalize"; nextRound: number } {
  if (input.proceed || input.round >= input.cap) {
    return { action: "finalize", nextRound: input.round };
  }
  return { action: "gap-check", nextRound: input.round + 1 };
}

/** One submitted answer. `id` must match a question's id; answers are bounded so
 *  a huge payload can't bloat the prompt. */
export const specUpAnswerSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9][a-z0-9_-]*$/),
    answer: z.string().min(1).max(2000),
  })
  .strict();
export type SpecUpAnswer = z.infer<typeof specUpAnswerSchema>;

export const specUpAnswersSchema = z.array(specUpAnswerSchema).min(1).max(20);

/** A question as SERVED to the UI/CLI: the model-emitted question plus the
 *  server-stamped round it was raised in. `round` is chain state, not model
 *  output - it never appears on the model-facing `flowSpecUpQuestionSchema`. */
export type ServedSpecUpQuestion = FlowSpecUpQuestion & { round: number };

export type PendingSpecUpQuestions = {
  questions: ServedSpecUpQuestion[];
  /** The original brief, carried forward as the spec-up run's task. */
  task: string;
  /** Adaptive spec-up: the flow to BUILD once the spec is approved, carried
   *  from the run that triggered spec-up. null = no bound flow (build with the
   *  project default at approve time). */
  targetFlowId: string | null;
  /** specUpPosture: the carried supervisor persona id, so the next link aims its
   *  planning agents with the same persona. null = default persona (no posture). */
  persona: string | null;
  /** Deep-questioning loop: the round these questions belong to (server-owned). */
  round: number;
  /** Deep-questioning loop: a gap-check round that found no further material gaps
   *  returns coverageComplete with an empty question set. */
  coverageComplete: boolean;
};

/**
 * Deterministically de-duplicate model-generated question ids (pure). The
 * `flowSpecUpQuestionSchema` does NOT enforce id uniqueness, but every downstream
 * consumer keys on `id`: the client keys answer/simplify/suggestion state and React
 * keys on it, `findQuestion` (assist) does a FIRST-match `find`, and the
 * record-path `appendAnswersDoc` builds a `byId` map (LAST-wins). With a collision
 * those three disagree and answers/assist attach to the wrong question.
 *
 * Fixing it at the single serve boundary (readSpecUpQuestions) means every consumer
 * - serve (UI/CLI), assist, AND the answer-record path - sees the SAME unique,
 * stable id-set, so an id can only ever name one question. Order is preserved (the
 * first occurrence keeps its id); later collisions are suffixed `-2`, `-3`, ...,
 * skipping any suffix that would itself collide with an id already in the set.
 */
export function dedupeQuestionIds<T extends { id: string }>(questions: T[]): T[] {
  const used = new Set<string>();
  return questions.map((q) => {
    if (!used.has(q.id)) {
      used.add(q.id);
      return q;
    }
    let n = 2;
    let candidate = `${q.id}-${n}`;
    while (used.has(candidate)) {
      n += 1;
      candidate = `${q.id}-${n}`;
    }
    used.add(candidate);
    return { ...q, id: candidate };
  });
}

/**
 * Read the pending intake questions for a run. Returns null when the run has no
 * parsed `questions` artifact (not an intake run, or it didn't parse).
 */
export async function readSpecUpQuestions(
  projectRoot: string,
  sourceRunId: string,
): Promise<PendingSpecUpQuestions | null> {
  assertSafeRunId(sourceRunId);
  const store = new ArtifactStore(projectRoot, sourceRunId);
  if (!(await store.exists(INTAKE_QUESTIONS_PATH))) return null;
  // Once answered/superseded, there are no PENDING questions: the form stops
  // re-showing, a double-submit is refused, and the run stops reading as awaiting.
  if (await store.exists(ANSWERED_PATH)) return null;
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
  const persona = await readPersonaId(store);
  const round = await readRound(store);
  // De-dup BEFORE stamping the round: model ids aren't guaranteed unique, and
  // every consumer (serve, assist, AND the answer-record path that re-reads this
  // same function) keys on `id`. One serve boundary => one unique id-set.
  const questions: ServedSpecUpQuestion[] = dedupeQuestionIds(
    parsed.data.questions,
  ).map((q) => ({ ...q, round }));
  return {
    questions,
    task,
    targetFlowId,
    persona,
    round,
    coverageComplete: parsed.data.coverageComplete === true,
  };
}

/** Mark a spec-up-intake run's questions as consumed (answered or proceeded) so
 *  readSpecUpQuestions returns null for it - the terminator for "awaiting input". */
export async function markIntakeAnswered(
  projectRoot: string,
  runId: string,
): Promise<void> {
  assertSafeRunId(runId);
  const store = new ArtifactStore(projectRoot, runId);
  await store.writeJson(ANSWERED_PATH, { answeredAt: new Date().toISOString() });
}

/** True iff a run is a spec-up-intake run still AWAITING the user's answers
 *  (questions present and not yet consumed). The honest "awaiting input" signal,
 *  computed server-side for the run list / run detail. Cheap: only spec-up-intake
 *  runs touch the filesystem. */
export async function runAwaitsInput(
  projectRoot: string,
  run: { runId: string; flow?: { flowId?: string | null } | null },
): Promise<boolean> {
  if (run.flow?.flowId !== "spec-up-intake") return false;
  return (await readSpecUpQuestions(projectRoot, run.runId)) !== null;
}

/**
 * Append one round's answers to the accumulated answers doc (pure). The first
 * round seeds the header; later rounds are appended so the terminal spec run sees
 * the UNION of every round, grouped by round + category. Replaces the old
 * single-pass overwrite (reviewer SHOULD-FIX #3).
 */
export function appendAnswersDoc(
  priorDoc: string,
  questions: Array<{ id: string; question: string; why: string; category: string }>,
  answers: SpecUpAnswer[],
  round: number,
): string {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const head = priorDoc.trim()
    ? priorDoc.replace(/\s+$/, "")
    : [
        "# Spec-up: the user's answers to the intake questions",
        "",
        "These answers scope the work. Treat them as the user's decisions.",
      ].join("\n");

  // Group this round's answers by category for a legible spec.
  const byCategory = new Map<string, SpecUpAnswer[]>();
  for (const a of answers) {
    const cat = byId.get(a.id)?.category ?? "other";
    (byCategory.get(cat) ?? byCategory.set(cat, []).get(cat)!).push(a);
  }

  const lines: string[] = [head, "", `## Round ${round}`, ""];
  for (const [cat, as] of byCategory) {
    lines.push(`### ${cat}`, "");
    for (const a of as) {
      const q = byId.get(a.id);
      lines.push(`**${q ? q.question : a.id}**`);
      if (q) lines.push(`> Why it matters: ${q.why}`, "");
      lines.push(a.answer.trim(), "");
    }
  }
  return `${lines.join("\n")}\n`;
}

/**
 * Resolve the chain root (where accumulated answers live) for the run being
 * answered. A round-1 intake run is its own root; gap-check rounds carry the root
 * id forward via the `spec-up-root-run.json` sidecar.
 */
async function resolveRootRunId(
  projectRoot: string,
  sourceRunId: string,
): Promise<string> {
  const store = new ArtifactStore(projectRoot, sourceRunId);
  return (await readRootRunId(store)) ?? sourceRunId;
}

/**
 * Read the accumulated cross-round answers for a chain (resolving the root run),
 * or "" when none recorded yet. Used to ground the per-question assist helpers.
 */
export async function readAccumulatedAnswers(
  projectRoot: string,
  sourceRunId: string,
): Promise<string> {
  assertSafeRunId(sourceRunId);
  const rootRunId = await resolveRootRunId(projectRoot, sourceRunId);
  const rootStore = new ArtifactStore(projectRoot, rootRunId);
  return (await rootStore.exists(ANSWERS_PATH))
    ? rootStore.read(ANSWERS_PATH)
    : "";
}

/**
 * Terminal handoff: launch the `spec-up` flow seeded with the accumulated answers
 * (the union of every round) as a `file` contextSource, carrying the chosen build
 * flow forward. Shared by submit (finalize branch) and proceed.
 */
async function finalizeSpecUpSpec(input: {
  projectRoot: string;
  rootRunId: string;
  task: string;
  targetFlowId: string | null;
  /** Carried supervisor persona id (specUpPosture) - aims the spec-up agents. */
  persona: string | null;
}): Promise<{ runId: string; pid: number | null }> {
  const { projectRoot, rootRunId } = input;
  const rootStore = new ArtifactStore(projectRoot, rootRunId);
  if (!(await rootStore.exists(ANSWERS_PATH))) {
    throw new SpecUpChainError(
      `Cannot build a spec for "${rootRunId}": no answers have been recorded yet.`,
    );
  }
  const absAnswers = rootStore.resolveArtifactPath(ANSWERS_PATH);
  const ref = path.relative(projectRoot, absAnswers);
  const runId = makeUniqueRunId(projectRoot);
  const spec: RunSpec = {
    projectRoot,
    task: input.task || "Spec up this work (brief carried from intake).",
    runId,
    // A spec-up-phase run: never re-shaped (loop guard). The chosen build flow is
    // carried forward so the `approve & build` handoff can target it.
    specUpPhase: true,
    specUpTargetFlowId: input.targetFlowId,
    // Carry the persona so the spec-up agents (scope/spec/architecture) inherit its
    // specUpPosture - the spec-up link RunSpec otherwise carries no persona.
    persona: input.persona,
    flow: { id: "spec-up", brief: null },
    contextSources: [{ kind: "file", ref, label: "Spec-up: intake answers" }],
  };
  const pid = await startDetachedRun({ spec, spawnedBy: "dashboard" });
  return { runId, pid };
}

/**
 * Submit one round's answers. Accumulates them into the chain-root answers doc,
 * then either asks one more gap-check round (deep questioning) or finalizes into
 * the spec - the decision is the deterministic `decideSpecUpNext` brake (cap +
 * proceed are server-owned; the model and the request body never control it).
 *
 * The gap-check round is the SAME `spec-up-intake` flow, re-launched with the
 * accumulated answers as context; the intake prompt asks only for remaining gaps
 * and may declare coverage complete. The chosen build flow + the round counter +
 * the chain-root id are all re-threaded forward via sidecars (reviewer #2/#3).
 */
export async function submitSpecUpAnswers(input: {
  projectRoot: string;
  sourceRunId: string;
  answers: SpecUpAnswer[];
  /** The user clicked "Proceed to spec" - finalize now regardless of coverage. */
  proceed?: boolean;
}): Promise<{ runId: string; pid: number | null; action: "gap-check" | "finalize" }> {
  const { projectRoot, sourceRunId } = input;
  assertSafeRunId(sourceRunId);
  const answers = specUpAnswersSchema.parse(input.answers);
  const pending = await readSpecUpQuestions(projectRoot, sourceRunId);
  if (!pending) {
    throw new SpecUpChainError(
      `No pending spec-up questions for run "${sourceRunId}".`,
    );
  }

  // Accumulate this round's answers into the chain-root doc (read-forward + append).
  const rootRunId = await resolveRootRunId(projectRoot, sourceRunId);
  const rootStore = new ArtifactStore(projectRoot, rootRunId);
  const priorDoc = (await rootStore.exists(ANSWERS_PATH))
    ? await rootStore.read(ANSWERS_PATH)
    : "";
  await rootStore.write(
    ANSWERS_PATH,
    appendAnswersDoc(priorDoc, pending.questions, answers, pending.round),
  );
  // The viewed run's questions are now consumed: mark it so it stops reading as
  // awaiting and a re-open / double-submit can't spawn a duplicate round.
  await markIntakeAnswered(projectRoot, sourceRunId);

  const decision = decideSpecUpNext({
    round: pending.round,
    proceed: input.proceed === true,
    cap: ROUND_CAP,
  });

  if (decision.action === "finalize") {
    const r = await finalizeSpecUpSpec({
      projectRoot,
      rootRunId,
      task: pending.task,
      targetFlowId: pending.targetFlowId,
      persona: pending.persona,
    });
    return { ...r, action: "finalize" };
  }

  // Gap-check round: re-launch intake seeded with the answers so far, carrying the
  // round counter, the chain root, and the chosen build flow forward.
  const absAnswers = rootStore.resolveArtifactPath(ANSWERS_PATH);
  const ref = path.relative(projectRoot, absAnswers);
  const runId = makeUniqueRunId(projectRoot);
  const spec: RunSpec = {
    projectRoot,
    task: pending.task || "Spec up this work (brief carried from intake).",
    runId,
    specUpPhase: true,
    specUpTargetFlowId: pending.targetFlowId,
    specUpRound: decision.nextRound,
    specUpRootRunId: rootRunId,
    // Carry the persona forward so each gap-check round keeps the same posture.
    persona: pending.persona,
    flow: { id: "spec-up-intake", brief: null },
    contextSources: [{ kind: "file", ref, label: "Spec-up: answers so far" }],
  };
  const pid = await startDetachedRun({ spec, spawnedBy: "dashboard" });
  return { runId, pid, action: "gap-check" };
}

/**
 * "Proceed to spec" without answering more: finalize the chain with whatever
 * answers are already accumulated. Used when a gap-check declared coverage
 * complete (no questions to answer) or the user stops early. Never traps the user
 * in the loop.
 */
export async function proceedToSpecUpSpec(input: {
  projectRoot: string;
  sourceRunId: string;
}): Promise<{ runId: string; pid: number | null }> {
  const { projectRoot, sourceRunId } = input;
  assertSafeRunId(sourceRunId);
  const rootRunId = await resolveRootRunId(projectRoot, sourceRunId);
  // Task + target flow come from the run being viewed (carried across the chain).
  const srcStore = new ArtifactStore(projectRoot, sourceRunId);
  let task = "";
  if (await srcStore.exists(IDEA_PATH)) task = (await srcStore.read(IDEA_PATH)).trim();
  const targetFlowId = await readTargetFlowId(srcStore);
  const persona = await readPersonaId(srcStore);
  await markIntakeAnswered(projectRoot, sourceRunId);
  return finalizeSpecUpSpec({ projectRoot, rootRunId, task, targetFlowId, persona });
}

/**
 * Approve the spec-up draft and launch link 3 (the roadmap run). Resumes the
 * spec-up run at stage "executing" so seedResumedSteps copies its scope/spec/
 * architecture/risks artifacts forward, and the `synthesize` step turns them
 * into a dependency-aware proposal. This is the only place resumeFrom is used in
 * the chain; the seeded step ids/stages must match the spec-up flow (guarded by
 * the chain-integrity test).
 */
export async function approveSpecUpAndStartRoadmap(input: {
  projectRoot: string;
  specUpRunId: string;
}): Promise<{ runId: string; pid: number | null }> {
  assertSafeRunId(input.specUpRunId);
  const src = new ArtifactStore(input.projectRoot, input.specUpRunId);
  if (!(await src.exists(IDEA_PATH))) {
    throw new SpecUpChainError(`Spec-up run "${input.specUpRunId}" not found.`);
  }
  let task = "Synthesize the approved spec into a dependency-aware roadmap.";
  try {
    const idea = (await src.read(IDEA_PATH)).trim();
    if (idea) task = idea;
  } catch {
    /* keep the default task */
  }
  const persona = await readPersonaId(src);
  const runId = makeUniqueRunId(input.projectRoot);
  const spec: RunSpec = {
    projectRoot: input.projectRoot,
    task,
    runId,
    specUpPhase: true,
    // Carry the persona so the roadmap planning keeps the same spec-up posture.
    persona,
    flow: { id: "spec-up-roadmap", brief: null },
    resumeFrom: { sourceRunId: input.specUpRunId, fromStage: "executing" },
  };
  const pid = await startDetachedRun({ spec, spawnedBy: "dashboard" });
  return { runId, pid };
}

/**
 * Approve the spec-up draft and BUILD it. Reads the spec-up run's spec outputs
 * (scope / spec / architecture / risks), concatenates them into one approved-spec
 * artifact, and launches the CHOSEN flow (carried via the spec-up-target sidecar,
 * or `fallbackFlowId` / the caller's override) seeded with that spec as a `file`
 * contextSource - so the executor builds FROM the spec, never re-derives from the
 * bare task. This is the terminal handoff that makes spec-up an enrichment over the
 * chosen flow rather than a replacement. Fails fast (throws) if the chosen flow
 * is unknown or the spec-up run produced no spec, so an empty-context build is
 * impossible by construction.
 */
export async function approveSpecUpAndBuild(input: {
  projectRoot: string;
  specUpRunId: string;
  /** Override the carried build flow (e.g. the user picked a different one). */
  flowId?: string | null;
  /** Used when neither the sidecar nor `flowId` names a flow (the project default). */
  fallbackFlowId?: string | null;
}): Promise<{ runId: string; pid: number | null; flowId: string }> {
  assertSafeRunId(input.specUpRunId);
  const src = new ArtifactStore(input.projectRoot, input.specUpRunId);
  if (!(await src.exists(IDEA_PATH))) {
    throw new SpecUpChainError(`Spec-up run "${input.specUpRunId}" not found.`);
  }
  const flowId =
    input.flowId ??
    (await readTargetFlowId(src)) ??
    input.fallbackFlowId ??
    null;
  if (!flowId) {
    throw new SpecUpChainError(
      `No build flow for spec-up run "${input.specUpRunId}" (no carried target, no override, no default).`,
    );
  }
  // Validate the flow exists BEFORE spawning - otherwise the detached run dies in
  // the background while the caller sees a success. Fail fast with a clear error.
  if (!(await findFlowById(input.projectRoot, flowId))) {
    const ids = (await discoverFlows(input.projectRoot)).map((g) => g.id);
    throw new SpecUpChainError(
      `Build flow "${flowId}" not found. Available: ${ids.join(", ") || "(none)"}.`,
    );
  }

  // Assemble the approved spec from the spec-up run's spec-producing steps. Fail
  // fast if NONE produced content - launching a build with empty context would
  // silently re-derive from the bare task (the keystone failure this guards against).
  const sections: string[] = [];
  for (const step of SPEC_UP_SPEC_STEPS) {
    const p = `flows/${step}/output.md`;
    if (!(await src.exists(p))) continue;
    const body = (await src.read(p)).trim();
    if (body) sections.push(`# ${step[0]!.toUpperCase()}${step.slice(1)}\n\n${body}`);
  }
  if (sections.length === 0) {
    throw new SpecUpChainError(
      `Spec-up run "${input.specUpRunId}" has no spec to build from (no scope/spec/architecture/risks output).`,
    );
  }
  const specDoc = `# Spec-up: the approved spec\n\nBuild strictly to this spec - it is the user's approved scope, derived during spec-up. Treat it as ground truth.\n\n${sections.join("\n\n")}\n`;
  const absSpec = await src.write(APPROVED_SPEC_PATH, specDoc);
  const ref = path.relative(input.projectRoot, absSpec);

  let task = "Build the approved spec-up work.";
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
    // The executor: already spec'd up, so it runs the chosen flow directly (loop
    // guard) seeded with the approved spec as context.
    specUpPhase: true,
    flow: { id: flowId, brief: null },
    contextSources: [{ kind: "file", ref, label: "Spec-up: approved spec" }],
  };
  const pid = await startDetachedRun({ spec, spawnedBy: "dashboard" });
  return { runId, pid, flowId };
}

/**
 * Bridge link 3 -> the existing proposal pipeline: read a completed spec-up-roadmap
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
    throw new SpecUpChainError(
      `Run "${input.runId}" has no roadmap synthesis to turn into a proposal.`,
    );
  }
  const body = await store.read(SYNTHESIZE_OUTPUT_PATH);
  const proposalId = `spec-up-${input.runId}`;
  const svc = new ProposalService(input.projectRoot);
  await svc.writeProposalText(proposalId, body);
  return { proposalId };
}

/**
 * Launch the intake run - the "Plan" entry point. A fresh read-only run on the
 * `spec-up-intake` flow that emits the structured gap questions.
 */
export async function startSpecUpIntake(input: {
  projectRoot: string;
  task: string;
  persona?: string | null;
  /** Adaptive spec-up: the flow to BUILD once the spec is approved, carried to
   *  the `approve & build` handoff. null = build with the project default. */
  targetFlowId?: string | null;
}): Promise<{ runId: string; pid: number | null }> {
  const task = input.task.trim();
  if (!task) throw new SpecUpChainError("A brief is required to start spec-up.");
  const runId = makeUniqueRunId(input.projectRoot);
  const spec: RunSpec = {
    projectRoot: input.projectRoot,
    task,
    runId,
    persona: input.persona ?? null,
    // The intake run IS the shape phase: never re-shaped (loop guard); it carries
    // the chosen build flow forward via the spec-up-target sidecar.
    specUpPhase: true,
    specUpTargetFlowId: input.targetFlowId ?? null,
    // Round 1 of the deep-questioning loop; this run is its own chain root (where
    // accumulated answers will live).
    specUpRound: 1,
    specUpRootRunId: runId,
    flow: { id: "spec-up-intake", brief: null },
  };
  const pid = await startDetachedRun({ spec, spawnedBy: "dashboard" });
  return { runId, pid };
}
