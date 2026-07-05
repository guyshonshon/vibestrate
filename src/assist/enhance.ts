// ── "Enhance" - decompose a card into a checklist ───────────────────────────
//
// The meso-altitude planning move: take a task/card and break it into an
// ordered Checklist of concrete items. An assist run (read-only, structured
// output) proposes the items; appending them is a separate, explicit step
// (dry-run + accept), so the model never mutates the board on its own. Design:
// docs/design/roadmap-and-sequencing.md §1 ("Enhance").

import { z } from "zod";
import { loadConfig, type LoadedConfig } from "../project/config-loader.js";
import { RoadmapService } from "../roadmap/roadmap-service.js";
import { AssistError, runAssist, type AssistProviderRunner } from "./assist-runner.js";
import type { ChecklistItem, Task } from "../roadmap/roadmap-types.js";

const MAX_ITEMS = 12;

const checklistProposalSchema = z.object({
  items: z.array(z.string().min(1)).min(1).max(40),
});

// ── Guided plan: a bounded clarifying-questions round before the breakdown ────
// The meso-altitude cousin of spec-up's deep questioning: one round of short
// questions whose answers materially change the checklist, then `enhance` uses
// the answers. Reuses the assist runner (read-only, structured), NOT the
// spec-up chain (which produces cards, not a task's steps).
export const planQuestionSchema = z.object({
  id: z.string().min(1).max(80),
  question: z.string().min(1).max(300),
  why: z.string().max(300).default(""),
  kind: z.enum(["choice", "text"]).default("text"),
  options: z.array(z.string().min(1).max(160)).max(6).default([]),
});
export type PlanQuestion = z.infer<typeof planQuestionSchema>;

const planQuestionsProposalSchema = z.object({
  questions: z.array(planQuestionSchema).max(6),
});

export type PlanQuestionsProposal = {
  taskId: string;
  questions: PlanQuestion[];
  providerId: string;
  profileId: string;
  attempts: number;
};

/** A single answered clarifying question, fed back into the breakdown. */
export type PlanAnswer = { question: string; answer: string };

export type ChecklistProposal = {
  taskId: string;
  /** Cleaned, de-duplicated, capped item texts the model proposed. */
  items: string[];
  providerId: string;
  profileId: string;
  attempts: number;
};

export type EnhanceOptions = {
  profileId?: string | null;
  crewId?: string | null;
  loaded?: LoadedConfig;
  /** Test seam - forwarded to the assist runner. */
  runner?: AssistProviderRunner;
  signal?: AbortSignal;
  /** Guided plan: owner answers to the clarifying questions, used to shape steps. */
  answers?: PlanAnswer[];
};

function cleanItems(raw: string[], existing: string[]): string[] {
  const seen = new Set(existing.map((t) => t.trim().toLowerCase()));
  const out: string[] = [];
  for (const r of raw) {
    const text = r.trim().replace(/\s+/g, " ");
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

/**
 * Propose (but do NOT append) a checklist for a task. Read-only - the caller
 * decides whether to apply the result.
 */
export async function proposeChecklist(
  projectRoot: string,
  taskId: string,
  opts: EnhanceOptions = {},
): Promise<ChecklistProposal> {
  const loaded = opts.loaded ?? (await loadConfig(projectRoot));
  const svc = new RoadmapService(projectRoot);
  await svc.init();
  const task = await svc.getTask(taskId);
  if (!task) {
    throw new AssistError(`Task "${taskId}" not found.`);
  }

  const existing = task.checklist.map((c) => c.text);
  const instruction = [
    "Break the following task into an ordered checklist of concrete, verifiable steps.",
    "Each step should be a single actionable item, short and specific (a few words to one sentence).",
    "Aim for 3–8 steps. Do not include meta-steps like \"start\" or \"done\". Order them so each builds on the previous.",
    "",
    `Task title: ${task.title}`,
    task.description ? `Task description: ${task.description}` : "",
    task.acceptanceCriteria ? `Acceptance criteria: ${task.acceptanceCriteria}` : "",
    existing.length
      ? `It already has these items - do NOT repeat them, only propose what's missing:\n${existing.map((t) => `- ${t}`).join("\n")}`
      : "",
    opts.answers && opts.answers.length
      ? `The owner answered these clarifying questions - use the answers to shape the steps:\n${opts.answers
          .map((a) => `Q: ${a.question}\nA: ${a.answer}`)
          .join("\n\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const result = await runAssist({
    projectRoot,
    label: "enhance:checklist",
    instruction,
    schema: checklistProposalSchema,
    schemaHint: '{ "items": ["first concrete step", "second step", "..."] }',
    profileId: opts.profileId,
    crewId: opts.crewId,
    loaded,
    runner: opts.runner,
    signal: opts.signal,
  });

  const items = cleanItems(result.parsed.items, existing);
  if (items.length === 0) {
    throw new AssistError(
      "Enhance produced no new checklist items (all proposals were empty or duplicates).",
    );
  }
  return {
    taskId,
    items,
    providerId: result.providerId,
    profileId: result.profileId,
    attempts: result.attempts,
  };
}

/**
 * Guided plan: propose a short round of clarifying questions whose answers would
 * materially change the checklist breakdown. Read-only; returns [] when the task
 * is already clear enough (the caller then goes straight to `enhanceChecklist`).
 */
export async function proposeChecklistQuestions(
  projectRoot: string,
  taskId: string,
  opts: EnhanceOptions = {},
): Promise<PlanQuestionsProposal> {
  const loaded = opts.loaded ?? (await loadConfig(projectRoot));
  const svc = new RoadmapService(projectRoot);
  await svc.init();
  const task = await svc.getTask(taskId);
  if (!task) {
    throw new AssistError(`Task "${taskId}" not found.`);
  }

  const existing = task.checklist.map((c) => c.text);
  const instruction = [
    "You will break the following task into an ordered checklist of steps - but FIRST ask the owner a few short clarifying questions whose answers would materially change how you break it down.",
    "Ask ONLY what you genuinely need to plan well - between 0 and 5 questions. If the task is already clear, return an empty list.",
    "Prefer a concrete choice (kind: \"choice\" with 2-5 options) when the answer is one of a few obvious paths; use kind: \"text\" only for open-ended answers. Keep each question to one sentence.",
    "",
    `Task title: ${task.title}`,
    task.description ? `Task description: ${task.description}` : "",
    task.acceptanceCriteria ? `Acceptance criteria: ${task.acceptanceCriteria}` : "",
    existing.length
      ? `It already has these steps:\n${existing.map((t) => `- ${t}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const result = await runAssist({
    projectRoot,
    label: "enhance:questions",
    instruction,
    schema: planQuestionsProposalSchema,
    schemaHint:
      '{ "questions": [{ "id": "scope", "question": "Should this cover X only, or also Y?", "why": "changes how many steps", "kind": "choice", "options": ["X only", "X and Y"] }] }',
    profileId: opts.profileId,
    crewId: opts.crewId,
    loaded,
    runner: opts.runner,
    signal: opts.signal,
  });

  return {
    taskId,
    questions: result.parsed.questions,
    providerId: result.providerId,
    profileId: result.profileId,
    attempts: result.attempts,
  };
}

/**
 * Propose a checklist and append the proposed items to the task. Returns the
 * updated task plus the items that were added.
 */
export async function enhanceChecklist(
  projectRoot: string,
  taskId: string,
  opts: EnhanceOptions = {},
): Promise<{ task: Task; added: ChecklistItem[]; proposal: ChecklistProposal }> {
  const proposal = await proposeChecklist(projectRoot, taskId, opts);
  const svc = new RoadmapService(projectRoot);
  await svc.init();
  const added: ChecklistItem[] = [];
  let task = await svc.getTask(taskId);
  for (const text of proposal.items) {
    const r = await svc.addChecklistItem(taskId, text);
    added.push(r.item);
    task = r.task;
  }
  if (!task) throw new AssistError(`Task "${taskId}" not found.`);
  return { task, added, proposal };
}
