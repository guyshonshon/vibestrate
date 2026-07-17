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

// Honest drag targets: drag is a "dismiss" gesture, never an execution. The only
// safe, real move on a derived board is archiving a non-live card (-> Archived =
// cancelTask). Starting a task is an explicit action (the card's Start button),
// not a drag side effect. Everything else has no API and is not a valid drop
// (the card snaps back). (A true management-stage board - draggable lanes like
// "Needs planning" - needs a settable stage field; that's a separate slice.)
export function validDropTargets(task: Task): Set<CoarseId> {
  const targets = new Set<CoarseId>();
  if (task.archived || task.status === "done" || task.status === "cancelled") {
    return targets; // terminal - no honest move
  }
  const live = task.status === "running" || task.currentRunId != null;
  if (!live) targets.add("archived"); // cancelTask (live cards use the run controls)
  return targets;
}
