// V0 default workflow execution lives inside Orchestrator.run().
// This module exists to keep the workflow concept first-class so future
// arbitrary-DAG runners can replace it without touching CLI surfaces.

export { defaultWorkflowStages } from "./default-workflow.js";
export type { WorkflowStage, RunStatus } from "./workflow-types.js";
export { Orchestrator, makeRunId } from "../core/orchestrator.js";
export type { OrchestratorInput, OrchestratorOutput } from "../core/orchestrator.js";
