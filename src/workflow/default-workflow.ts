import type { WorkflowStage } from "./workflow-types.js";

export const defaultWorkflowStages: WorkflowStage[] = [
  {
    id: "planning",
    roleId: "planner",
    enteringStatus: "planning",
    exitingStatus: "planned",
  },
  {
    id: "architecting",
    roleId: "architect",
    enteringStatus: "architecting",
    exitingStatus: "architected",
  },
  {
    id: "executing",
    roleId: "executor",
    enteringStatus: "executing",
    exitingStatus: "validating",
  },
  {
    id: "validating",
    enteringStatus: "validating",
    exitingStatus: "reviewing",
  },
  {
    id: "reviewing",
    roleId: "reviewer",
    enteringStatus: "reviewing",
    exitingStatus: "verifying",
  },
  {
    id: "fixing",
    roleId: "fixer",
    enteringStatus: "fixing",
    exitingStatus: "validating",
  },
  {
    id: "verifying",
    roleId: "verifier",
    enteringStatus: "verifying",
    exitingStatus: "merge_ready",
  },
];
