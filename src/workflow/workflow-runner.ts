// Re-export facade for the run lifecycle. Execution is the single flow runner
// inside the Orchestrator (a plain run executes the built-in `default` flow);
// `defaultWorkflowStages` here is just the run-status lifecycle (the phases a
// run moves through), kept first-class for the dashboard rail and docs.

export { defaultWorkflowStages } from "./default-workflow.js";
export type { WorkflowStage, RunStatus } from "./workflow-types.js";
export { Orchestrator, makeRunId } from "../core/orchestrator.js";
export type { OrchestratorInput, OrchestratorOutput } from "../core/orchestrator.js";
