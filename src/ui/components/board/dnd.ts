// Pure drag-and-drop logic for the task board: which coarse column a task
// belongs to, and where a drag may honestly drop it. No React here.

import type { Task } from "../../lib/types.js";

export type CoarseId =
  | "planned"
  | "in_progress"
  | "needs_testing"
  | "completed"
  | "archived";

// Mirror of the canonical coarseColumn() in roadmap-types (server/UI type split).
export function coarseColumnOf(task: Task): CoarseId {
  if (task.archived) return "archived";
  if (task.needsTesting) return "needs_testing";
  switch (task.status) {
    case "backlog":
    case "ready":
      return "planned";
    case "done":
      return "completed";
    case "cancelled":
      return "archived";
    default:
      return "in_progress";
  }
}

/**
 * Which stage column a card sits in, once a project has named its stages.
 *
 * This is the OTHER axis. `coarseColumnOf` above projects run status - machine
 * owned, moves on its own. A stage is where a person filed the card, so the
 * board can be dragged without lying and without starting anything.
 *
 * A card whose stage is not in the configured list still has to appear
 * somewhere, or renaming a stage would make cards vanish. It falls to the
 * unstaged column with everything that was never filed.
 */
export const UNSTAGED = "__unstaged__";

export function stageColumnOf(task: Task, stages: readonly string[]): string {
  if (!task.stage) return UNSTAGED;
  return stages.includes(task.stage) ? task.stage : UNSTAGED;
}

/** Drop targets on a STAGE board: any stage, plus unstaged. Re-filing is inert -
 *  it moves a label, runs nothing - so every column is an honest target. */
export function validStageTargets(stages: readonly string[]): Set<string> {
  return new Set<string>([...stages, UNSTAGED]);
}

// Honest drag targets: drag is a "dismiss" gesture, never an execution. The only
// safe, real move on a derived board is archiving a non-live card (-> Archived =
// cancelTask). Starting a task is an explicit action (the card's Start button),
// not a drag side effect. Everything else has no API and is not a valid drop
// (the card snaps back). This applies to the DERIVED board only - a project with
// stages configured drags on the stage axis instead (validStageTargets), where
// every column is a real target because re-filing executes nothing.
export function validDropTargets(task: Task): Set<CoarseId> {
  const targets = new Set<CoarseId>();
  if (task.archived || task.status === "done" || task.status === "cancelled") {
    return targets; // terminal - no honest move
  }
  const live = task.status === "running" || task.currentRunId != null;
  if (!live) targets.add("archived"); // cancelTask (live cards use the run controls)
  return targets;
}
