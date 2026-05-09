import type { ProjectConfig } from "../project/config-schema.js";
import type { ArtifactStore } from "./artifact-store.js";
import type { EventLog } from "./event-log.js";
import type { RunStateStore } from "./state-machine.js";
import type { PolicyWarning } from "./policy-engine.js";

export type RunContext = {
  runId: string;
  task: string;
  projectRoot: string;
  config: ProjectConfig;
  rules: string;
  worktreePath: string | null;
  branchName: string | null;
  artifactStore: ArtifactStore;
  stateStore: RunStateStore;
  eventLog: EventLog;
  policyWarnings: PolicyWarning[];
  onProgress?: (message: string) => void;
};
