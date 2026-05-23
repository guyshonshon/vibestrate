import path from "node:path";

export const AMACO_DIR = ".amaco";
export const CONFIG_FILENAME = "project.yml";
export const RULES_FILENAME = "rules.md";
export const AGENTS_DIRNAME = "agents";
export const SKILLS_DIRNAME = "skills";
export const GUIDES_DIRNAME = "guides";
export const RUNS_DIRNAME = "runs";
export const ROADMAP_DIRNAME = "roadmap";
export const SCHEDULER_DIRNAME = "scheduler";
export const NOTIFICATIONS_DIRNAME = "notifications";
export const TERMINAL_DIRNAME = "terminal";
export const POLICIES_DIRNAME = "policies";

export function amacoRoot(projectRoot: string): string {
  return path.join(projectRoot, AMACO_DIR);
}

export function projectConfigPath(projectRoot: string): string {
  return path.join(amacoRoot(projectRoot), CONFIG_FILENAME);
}

export function projectRulesPath(projectRoot: string): string {
  return path.join(amacoRoot(projectRoot), RULES_FILENAME);
}

export function projectAgentsDir(projectRoot: string): string {
  return path.join(amacoRoot(projectRoot), AGENTS_DIRNAME);
}

export function projectSkillsDir(projectRoot: string): string {
  return path.join(amacoRoot(projectRoot), SKILLS_DIRNAME);
}

export function projectGuidesDir(projectRoot: string): string {
  return path.join(amacoRoot(projectRoot), GUIDES_DIRNAME);
}

export function projectRunsDir(projectRoot: string): string {
  return path.join(amacoRoot(projectRoot), RUNS_DIRNAME);
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

export function runGuideSnapshotPath(projectRoot: string, runId: string): string {
  return path.join(runDir(projectRoot, runId), "guide.json");
}

export function runGuideParticipantsPath(projectRoot: string, runId: string): string {
  return path.join(runDir(projectRoot, runId), "participants.json");
}

export function runGuideArbitrationPath(projectRoot: string, runId: string): string {
  return path.join(runDir(projectRoot, runId), "arbitration.json");
}

export function roadmapDir(projectRoot: string): string {
  return path.join(amacoRoot(projectRoot), ROADMAP_DIRNAME);
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
  return path.join(amacoRoot(projectRoot), SCHEDULER_DIRNAME);
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
  return path.join(amacoRoot(projectRoot), NOTIFICATIONS_DIRNAME);
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
  return path.join(amacoRoot(projectRoot), TERMINAL_DIRNAME);
}

export function terminalSessionsFile(projectRoot: string): string {
  return path.join(terminalDir(projectRoot), "sessions.json");
}

export function policiesDir(projectRoot: string): string {
  return path.join(amacoRoot(projectRoot), POLICIES_DIRNAME);
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
