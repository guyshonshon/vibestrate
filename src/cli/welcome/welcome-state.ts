// `vibe welcome` progress: which steps of the guided walkthrough are done or
// skipped, persisted to .vibestrate/welcome-state.json so re-running the
// command resumes instead of restarting. Machine-managed, small, and
// non-authoritative - deleting it (or --reset) just starts the tour over; it
// never affects providers/crew/flows config, which live in project.yml.

import fs from "node:fs/promises";
import { z } from "zod";
import { pathExists, readText, writeTextAtomic } from "../../utils/fs.js";
import { welcomeStatePath } from "../../utils/paths.js";

export const WELCOME_STEP_ORDER = ["providers", "crew", "flows", "first-run"] as const;
export type WelcomeStepId = (typeof WELCOME_STEP_ORDER)[number];
export type WelcomeStepResult = "done" | "skipped";

export type WelcomeState = {
  schemaVersion: 1;
  steps: Partial<Record<WelcomeStepId, WelcomeStepResult>>;
  updatedAt: string | null;
};

const welcomeStateSchema = z.object({
  schemaVersion: z.literal(1),
  steps: z.record(z.string(), z.enum(["done", "skipped"])).default({}),
  updatedAt: z.string().nullable().default(null),
});

export function emptyWelcomeState(): WelcomeState {
  return { schemaVersion: 1, steps: {}, updatedAt: null };
}

/** Read the saved walkthrough progress. Missing or corrupt state is treated
 *  as a fresh walkthrough - never a crash, since this file is a convenience,
 *  not a source of truth. */
export async function loadWelcomeState(projectRoot: string): Promise<WelcomeState> {
  const file = welcomeStatePath(projectRoot);
  if (!(await pathExists(file))) return emptyWelcomeState();
  try {
    const parsed = welcomeStateSchema.safeParse(JSON.parse(await readText(file)));
    if (!parsed.success) return emptyWelcomeState();
    // Drop any step ids the schema doesn't know (forward/back compat) so a
    // stray key can never wedge sequencing.
    const steps: WelcomeState["steps"] = {};
    for (const id of WELCOME_STEP_ORDER) {
      const result = parsed.data.steps[id];
      if (result) steps[id] = result;
    }
    return { schemaVersion: 1, steps, updatedAt: parsed.data.updatedAt };
  } catch {
    return emptyWelcomeState();
  }
}

export async function writeWelcomeState(projectRoot: string, state: WelcomeState): Promise<void> {
  await writeTextAtomic(welcomeStatePath(projectRoot), `${JSON.stringify(state, null, 2)}\n`);
}

/** `--reset`: start the walkthrough over. Removes the file outright rather
 *  than writing an empty one, so a project that never ran `vibe welcome`
 *  looks identical to one that reset it. */
export async function resetWelcomeState(projectRoot: string): Promise<WelcomeState> {
  await fs.rm(welcomeStatePath(projectRoot), { force: true });
  return emptyWelcomeState();
}

/** Pure state transition - record a step's outcome and bump updatedAt.
 *  Exported separately from the write so sequencing tests don't need a
 *  filesystem. */
export function withStepResult(
  state: WelcomeState,
  stepId: WelcomeStepId,
  result: WelcomeStepResult,
): WelcomeState {
  return {
    schemaVersion: 1,
    steps: { ...state.steps, [stepId]: result },
    updatedAt: new Date().toISOString(),
  };
}

export async function recordWelcomeStep(
  projectRoot: string,
  state: WelcomeState,
  stepId: WelcomeStepId,
  result: WelcomeStepResult,
): Promise<WelcomeState> {
  const next = withStepResult(state, stepId, result);
  await writeWelcomeState(projectRoot, next);
  return next;
}

/** First step with no recorded result, in walkthrough order. `null` means
 *  every step is done or skipped. */
export function firstIncompleteStep(state: WelcomeState): WelcomeStepId | null {
  for (const id of WELCOME_STEP_ORDER) {
    if (!state.steps[id]) return id;
  }
  return null;
}

export function isWelcomeComplete(state: WelcomeState): boolean {
  return firstIncompleteStep(state) === null;
}
