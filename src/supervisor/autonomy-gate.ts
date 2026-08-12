// ── Autonomy gate ───────────────────────────────────────────────────────────
//
// The one thing that decides whether the supervisor may act, checked before
// every intent. Two independent controls, both of which must say yes:
//
//   config `supervisor.autonomy`  - the standing setting, edited deliberately
//   the pause flag on disk        - the stop button, flipped in a hurry
//
// The pause flag is a file rather than a config field because the two are used
// at different speeds. Turning autonomy down is a decision; hitting stop is a
// reflex, and it has to work from the panel header, the CLI, or a text editor
// without a config round-trip or a schema validation that might itself fail.
//
// It FAILS CLOSED. Missing file means running (the honest default: nothing has
// ever been stopped). Anything else that is not a clean "not paused" - a
// corrupt file, a permissions error, a half-written JSON - reads as PAUSED. A
// stop button that silently degrades to "go" is not a stop button, and this is
// the last thing standing between a misrouted sentence and a run.

import path from "node:path";
import { z } from "zod";
import { pathExists, ensureDir, readText, writeText } from "../utils/fs.js";
import { supervisorDir } from "../utils/paths.js";
import { nowIso } from "../utils/time.js";
import type { SupervisorControlConfig } from "../project/config-schema.js";

const pauseFileSchema = z.object({
  paused: z.boolean(),
  /** Why, for the panel to show. Free text the user typed or the product wrote. */
  reason: z.string().max(500).default(""),
  updatedAt: z.string(),
});

export type SupervisorPauseState = z.infer<typeof pauseFileSchema>;

export function supervisorPausePath(projectRoot: string): string {
  return path.join(supervisorDir(projectRoot), "paused.json");
}

/**
 * Read the pause flag. Unreadable or malformed reads as PAUSED, on purpose:
 * when we cannot prove the supervisor was left running, it is stopped.
 */
export async function readPauseState(projectRoot: string): Promise<SupervisorPauseState> {
  const file = supervisorPausePath(projectRoot);
  if (!(await pathExists(file))) {
    return { paused: false, reason: "", updatedAt: nowIso() };
  }
  try {
    return pauseFileSchema.parse(JSON.parse(await readText(file)));
  } catch {
    return {
      paused: true,
      reason:
        "The pause flag could not be read, so the supervisor is stopped. Delete .vibestrate/supervisor/paused.json to clear it.",
      updatedAt: nowIso(),
    };
  }
}

export async function setPaused(
  projectRoot: string,
  paused: boolean,
  reason = "",
): Promise<SupervisorPauseState> {
  const state: SupervisorPauseState = {
    paused,
    reason: reason.slice(0, 500),
    updatedAt: nowIso(),
  };
  const file = supervisorPausePath(projectRoot);
  await ensureDir(path.dirname(file));
  await writeText(file, `${JSON.stringify(pauseFileSchema.parse(state), null, 2)}\n`);
  return state;
}

/** Why the supervisor may not act right now, or null when it may. */
export type AutonomyRefusal = {
  code: "advise_only" | "paused";
  message: string;
};

/**
 * The gate itself. Pure of I/O so the executor's decision is testable without
 * disk; the caller supplies the config slice and the pause state it read.
 */
export function checkAutonomy(input: {
  supervisor: SupervisorControlConfig;
  pause: SupervisorPauseState;
}): AutonomyRefusal | null {
  if (input.pause.paused) {
    return {
      code: "paused",
      message:
        input.pause.reason ||
        "The supervisor is paused. Resume it from the Supervisor panel to let it act again.",
    };
  }
  if (input.supervisor.autonomy !== "act") {
    return {
      code: "advise_only",
      message:
        'The supervisor is in advise mode, so it can suggest this but not do it. Set supervisorControl.autonomy to "act" (which needs a budget ceiling) to let it act.',
    };
  }
  return null;
}
