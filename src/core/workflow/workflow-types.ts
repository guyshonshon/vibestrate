import type { WorkflowStageId } from "./workflow-schema.js";

export type RunStatus =
  | "created"
  | "planning"
  | "planned"
  | "architecting"
  | "architected"
  | "executing"
  | "validating"
  | "reviewing"
  | "fixing"
  | "verifying"
  | "waiting_for_approval"
  | "paused"
  | "merge_ready"
  | "blocked"
  | "failed"
  | "aborted";

export const TERMINAL_STATUSES: RunStatus[] = [
  "merge_ready",
  "blocked",
  "failed",
  "aborted",
];

/**
 * Statuses where a `pauseRequested` flag is meaningful. Pause only takes
 * effect between stages, and we never pause a run that's already terminal
 * or already paused.
 */
export const PAUSABLE_STATUSES: RunStatus[] = [
  "created",
  "planning",
  "planned",
  "architecting",
  "architected",
  "executing",
  "validating",
  "reviewing",
  "fixing",
  "verifying",
  // waiting_for_approval is excluded: the pause flag can still be set while
  // a run is in this state, but it only fires at the next normal stage
  // boundary, never during an approval wait.
];

export type WorkflowStage = {
  id: WorkflowStageId;
  roleId?: string;
  enteringStatus: RunStatus;
  exitingStatus: RunStatus;
};
