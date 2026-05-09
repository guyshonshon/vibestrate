import type { WorkflowStage } from "./workflow-types.js";

export const defaultWorkflowStages: WorkflowStage[] = [
  {
    id: "planning",
    agentId: "planner",
    enteringStatus: "planning",
    exitingStatus: "planned",
  },
  {
    id: "architecting",
    agentId: "architect",
    enteringStatus: "architecting",
    exitingStatus: "architected",
  },
  {
    id: "executing",
    agentId: "executor",
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
    agentId: "reviewer",
    enteringStatus: "reviewing",
    exitingStatus: "verifying",
  },
  {
    id: "fixing",
    agentId: "fixer",
    enteringStatus: "fixing",
    exitingStatus: "validating",
  },
  {
    id: "verifying",
    agentId: "verifier",
    enteringStatus: "verifying",
    exitingStatus: "merge_ready",
  },
];
