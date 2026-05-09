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

export type WorkflowStage = {
  id: WorkflowStageId;
  agentId?: string;
  enteringStatus: RunStatus;
  exitingStatus: RunStatus;
};
