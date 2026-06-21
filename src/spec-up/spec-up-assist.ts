// ── Shape: per-question assist (Simplify / Suggest) ──────────────────────────
//
// Two on-demand helpers on the spec-up-questions screen, both built on the SAME
// `runAssist` primitive consult uses - no second AI-call path:
//   - Simplify: re-explain a question in plain language + what it affects (+ an
//     optional non-developer analogy).
//   - Suggest:  draft an answer grounded in the user's prior answers. DRAFT-ONLY -
//     these functions return a value; they never submit it.
//
// Security (Tier-2 BLOCKER #1): `runAssist` does NOT redact its free-text input.
// The user's prior answers + brief are user-typed and may contain secrets, so we
// call `redactSecretsInText` HERE, explicitly, before the text reaches the prompt.

import { z } from "zod";
import { redactSecretsInText } from "../core/diff-service.js";
import {
  runAssist,
  type AssistProviderRunner,
} from "../assist/assist-runner.js";
import { readSpecUpQuestions, type ServedSpecUpQuestion, readAccumulatedAnswers } from "./spec-up-chain.js";
import { assertSafeRunId } from "../server/security.js";
import { VibestrateError } from "../utils/errors.js";

export class SpecUpAssistError extends VibestrateError {
  constructor(message: string, cause?: unknown) {
    super("SPEC_UP_ASSIST_ERROR", message, cause);
    this.name = "SpecUpAssistError";
  }
}

const AUDIT_BUCKET = "spec-up-assist";

const simplifySchema = z
  .object({
    text: z.string().min(1).max(1200),
    affects: z.string().min(1).max(800),
    analogy: z.string().max(800).default(""),
  })
  .strict();
export type SpecUpSimplifyResult = z.infer<typeof simplifySchema>;

const suggestSchema = z
  .object({
    suggestedValue: z.string().min(1).max(2000),
    why: z.string().min(1).max(600),
  })
  .strict();
export type SpecUpSuggestResult = z.infer<typeof suggestSchema>;

const suggestAllSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            questionId: z.string().min(1).max(80),
            suggestedValue: z.string().min(1).max(2000),
            why: z.string().min(1).max(600),
          })
          .strict(),
      )
      .max(20),
  })
  .strict();
export type SpecUpSuggestAllResult = z.infer<typeof suggestAllSchema>;

type Common = {
  projectRoot: string;
  sourceRunId: string;
  /** Test seam - a fake provider runner (the real one is the default). */
  runner?: AssistProviderRunner;
};

/** Load the run's questions + the REDACTED prior-answers/brief context block. */
async function loadContext(
  projectRoot: string,
  sourceRunId: string,
): Promise<{ questions: ServedSpecUpQuestion[]; brief: string; priorAnswers: string }> {
  assertSafeRunId(sourceRunId);
  const pending = await readSpecUpQuestions(projectRoot, sourceRunId);
  if (!pending) {
    throw new SpecUpAssistError(
      `No shape questions for run "${sourceRunId}".`,
    );
  }
  const rawAnswers = await readAccumulatedAnswers(projectRoot, sourceRunId);
  // Redact BOTH the prior answers and the brief - both are user-typed.
  const priorAnswers = redactSecretsInText(rawAnswers).redacted.trim();
  const brief = redactSecretsInText(pending.task).redacted.trim();
  return { questions: pending.questions, brief, priorAnswers };
}

function findQuestion(
  questions: ServedSpecUpQuestion[],
  questionId: string,
): ServedSpecUpQuestion {
  const q = questions.find((x) => x.id === questionId);
  if (!q) {
    throw new SpecUpAssistError(`No question "${questionId}" in this round.`);
  }
  return q;
}

function contextBlock(brief: string, priorAnswers: string): string {
  const parts: string[] = [];
  if (brief) parts.push(`The brief:\n${brief}`);
  if (priorAnswers) parts.push(`The user's answers so far:\n${priorAnswers}`);
  return parts.length ? `\n\n${parts.join("\n\n")}` : "";
}

/** Simplify: plain-language restatement + what it affects (+ optional analogy). */
export async function specUpSimplify(
  input: Common & { questionId: string; forNonDeveloper?: boolean },
): Promise<SpecUpSimplifyResult> {
  const { questions, brief, priorAnswers } = await loadContext(
    input.projectRoot,
    input.sourceRunId,
  );
  const q = findQuestion(questions, input.questionId);
  const analogyAsk = input.forNonDeveloper
    ? " The user is NOT a developer: also give a short everyday-life ANALOGY in `analogy` that conveys the idea without jargon."
    : " Leave `analogy` an empty string.";
  const instruction =
    `Explain this shape question in plain language for someone deciding how to answer it. ` +
    `Question: "${q.question}" (why it matters: ${q.why}). ` +
    `In \`text\`, restate what it's really asking in one or two simple sentences. ` +
    `In \`affects\`, say in one line what this decision changes in what gets built.` +
    analogyAsk +
    contextBlock(brief, priorAnswers);

  const res = await runAssist({
    projectRoot: input.projectRoot,
    label: `spec-up-simplify:${q.id}`,
    instruction,
    schema: simplifySchema,
    schemaHint: '{ "text": "...", "affects": "...", "analogy": "" }',
    auditBucket: AUDIT_BUCKET,
    runner: input.runner,
  });
  return res.parsed;
}

/** Suggest: a DRAFT answer grounded in prior answers. Never submits. */
export async function specUpSuggest(
  input: Common & { questionId: string },
): Promise<SpecUpSuggestResult> {
  const { questions, brief, priorAnswers } = await loadContext(
    input.projectRoot,
    input.sourceRunId,
  );
  const q = findQuestion(questions, input.questionId);
  const optionsLine =
    q.kind === "choice" && q.options.length
      ? ` It is a choice between: ${q.options.join(" | ")}. Pick the best-fitting option as the value.`
      : "";
  const instruction =
    `Propose a DRAFT answer to this shape question, consistent with what the user has already decided. ` +
    `Question: "${q.question}" (why it matters: ${q.why}).${optionsLine} ` +
    `In \`suggestedValue\`, give the proposed answer the user can edit. ` +
    `In \`why\`, give a one-line justification that references their prior answers where relevant. ` +
    `Do not invent facts they haven't implied.` +
    contextBlock(brief, priorAnswers);

  const res = await runAssist({
    projectRoot: input.projectRoot,
    label: `spec-up-suggest:${q.id}`,
    instruction,
    schema: suggestSchema,
    schemaHint: '{ "suggestedValue": "...", "why": "..." }',
    auditBucket: AUDIT_BUCKET,
    runner: input.runner,
  });
  return res.parsed;
}

/** Suggest all: one grounded draft per requested blank (default: every question). */
export async function specUpSuggestAll(
  input: Common & { questionIds?: string[] },
): Promise<SpecUpSuggestAllResult> {
  const { questions, brief, priorAnswers } = await loadContext(
    input.projectRoot,
    input.sourceRunId,
  );
  const targets = input.questionIds?.length
    ? questions.filter((q) => input.questionIds!.includes(q.id))
    : questions;
  if (!targets.length) {
    throw new SpecUpAssistError("No questions to suggest answers for.");
  }
  const list = targets
    .map((q) => {
      const opts =
        q.kind === "choice" && q.options.length
          ? ` [choice: ${q.options.join(" | ")}]`
          : "";
      return `- id "${q.id}": ${q.question}${opts}`;
    })
    .join("\n");
  const instruction =
    `Propose a DRAFT answer for EACH of these shape questions, consistent with what the user has already decided. ` +
    `Return one item per question id below, each with the proposed \`suggestedValue\` (editable) and a one-line \`why\`. ` +
    `Do not invent facts they haven't implied.\n\nQuestions:\n${list}` +
    contextBlock(brief, priorAnswers);

  const res = await runAssist({
    projectRoot: input.projectRoot,
    label: "spec-up-suggest-all",
    instruction,
    schema: suggestAllSchema,
    schemaHint:
      '{ "items": [ { "questionId": "...", "suggestedValue": "...", "why": "..." } ] }',
    auditBucket: AUDIT_BUCKET,
    runner: input.runner,
  });
  return res.parsed;
}
