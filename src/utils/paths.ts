import path from "node:path";

export const VIBESTRATE_DIR = ".vibestrate";
export const CONFIG_FILENAME = "project.yml";
export const RULES_FILENAME = "rules.md";
export const ROLES_DIRNAME = "roles";
export const SKILLS_DIRNAME = "skills";
export const FLOWS_DIRNAME = "flows";
export const RUNS_DIRNAME = "runs";
export const ROADMAP_DIRNAME = "roadmap";
export const SCHEDULER_DIRNAME = "scheduler";
export const NOTIFICATIONS_DIRNAME = "notifications";
export const TERMINAL_DIRNAME = "terminal";
export const POLICIES_DIRNAME = "policies";

export function vibestrateRoot(projectRoot: string): string {
  return path.join(projectRoot, VIBESTRATE_DIR);
}

export function projectConfigPath(projectRoot: string): string {
  return path.join(vibestrateRoot(projectRoot), CONFIG_FILENAME);
}

export function projectRulesPath(projectRoot: string): string {
  return path.join(vibestrateRoot(projectRoot), RULES_FILENAME);
}

export function projectRolesDir(projectRoot: string): string {
  return path.join(vibestrateRoot(projectRoot), ROLES_DIRNAME);
}

export function projectSkillsDir(projectRoot: string): string {
  return path.join(vibestrateRoot(projectRoot), SKILLS_DIRNAME);
}

export function projectFlowsDir(projectRoot: string): string {
  return path.join(vibestrateRoot(projectRoot), FLOWS_DIRNAME);
}

export function projectRunsDir(projectRoot: string): string {
  return path.join(vibestrateRoot(projectRoot), RUNS_DIRNAME);
}

export function runDir(projectRoot: string, runId: string): string {
  return path.join(projectRunsDir(projectRoot), runId);
}

export function runArtifactsDir(projectRoot: string, runId: string): string {
  return path.join(runDir(projectRoot, runId), "artifacts");
}

export function runStatePath(projectRoot: string, runId: string): string {
  return path.join(runDir(projectRoot, runId), "state.json");
}

export function runEventsPath(projectRoot: string, runId: string): string {
  return path.join(runDir(projectRoot, runId), "events.ndjson");
}

export function runFlowSnapshotPath(projectRoot: string, runId: string): string {
  return path.join(runDir(projectRoot, runId), "flow.json");
}

export function runFlowParticipantsPath(projectRoot: string, runId: string): string {
  return path.join(runDir(projectRoot, runId), "participants.json");
}

export function runFlowArbitrationPath(projectRoot: string, runId: string): string {
  return path.join(runDir(projectRoot, runId), "arbitration.json");
}

export function roadmapDir(projectRoot: string): string {
  return path.join(vibestrateRoot(projectRoot), ROADMAP_DIRNAME);
}

export function roadmapFile(projectRoot: string): string {
  return path.join(roadmapDir(projectRoot), "roadmap.json");
}

export function roadmapTasksDir(projectRoot: string): string {
  return path.join(roadmapDir(projectRoot), "tasks");
}

export function roadmapTaskFile(projectRoot: string, taskId: string): string {
  return path.join(roadmapTasksDir(projectRoot), `${taskId}.json`);
}

export function roadmapCommentsDir(projectRoot: string): string {
  return path.join(roadmapDir(projectRoot), "comments");
}

export function roadmapCommentsFile(projectRoot: string, taskId: string): string {
  return path.join(roadmapCommentsDir(projectRoot), `${taskId}.json`);
}

export function roadmapProposalsDir(projectRoot: string): string {
  return path.join(roadmapDir(projectRoot), "proposals");
}

export function roadmapTaskReportFile(projectRoot: string, taskId: string): string {
  return path.join(roadmapTasksDir(projectRoot), `${taskId}-report.md`);
}

export function schedulerDir(projectRoot: string): string {
  return path.join(vibestrateRoot(projectRoot), SCHEDULER_DIRNAME);
}

export function schedulerQueueFile(projectRoot: string): string {
  return path.join(schedulerDir(projectRoot), "queue.json");
}

export function schedulerStateFile(projectRoot: string): string {
  return path.join(schedulerDir(projectRoot), "state.json");
}

export function schedulerConflictsFile(projectRoot: string): string {
  return path.join(schedulerDir(projectRoot), "conflicts.json");
}

export function notificationsDir(projectRoot: string): string {
  return path.join(vibestrateRoot(projectRoot), NOTIFICATIONS_DIRNAME);
}

export function notificationsFile(projectRoot: string): string {
  return path.join(notificationsDir(projectRoot), "notifications.json");
}

export function notificationRulesFile(projectRoot: string): string {
  return path.join(notificationsDir(projectRoot), "rules.json");
}

export function notificationReceiptsFile(projectRoot: string): string {
  return path.join(notificationsDir(projectRoot), "receipts.json");
}

export function notificationGatewaysFile(projectRoot: string): string {
  return path.join(notificationsDir(projectRoot), "gateways.json");
}

export function terminalDir(projectRoot: string): string {
  return path.join(vibestrateRoot(projectRoot), TERMINAL_DIRNAME);
}

export function terminalSessionsFile(projectRoot: string): string {
  return path.join(terminalDir(projectRoot), "sessions.json");
}

export function policiesDir(projectRoot: string): string {
  return path.join(vibestrateRoot(projectRoot), POLICIES_DIRNAME);
}

export function isPathInside(parent: string, candidate: string): boolean {
  const rel = path.relative(parent, candidate);
  if (!rel) return true;
  if (rel.startsWith("..")) return false;
  if (path.isAbsolute(rel)) return false;
  return true;
}

export function safeJoin(parent: string, ...segments: string[]): string {
  const joined = path.join(parent, ...segments);
  if (!isPathInside(parent, joined)) {
    throw new Error(`Path traversal blocked: ${segments.join("/")}`);
  }
  return joined;
}
