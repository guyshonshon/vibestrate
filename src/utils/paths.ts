import path from "node:path";

export const VIBESTRATE_DIR = ".vibestrate";
export const CONFIG_FILENAME = "project.yml";
export const PROVIDERS_CATALOG_FILENAME = "providers-catalog.yml";
export const RULES_FILENAME = "rules.md";
/** Root-level operating manual the responsible orchestrator reads (committed,
 *  project-owned). NOT under `.vibestrate/` - it sits at the project root. */
export const MANUAL_FILENAME = "VIBESTRATE.md";
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

/** Append-only project continuity ledger (T9): one JSON entry per line. */
export function projectLedgerPath(projectRoot: string): string {
  return path.join(vibestrateRoot(projectRoot), "ledger.ndjson");
}

/** Durable project profile (Profiling): typed param answers persisted across
 *  runs. A single JSON object, mutex-guarded, secret-safe (secrets are
 *  `env:NAME` refs, never raw). See docs/design/profiling-intake.md. */
export function projectProfilePath(projectRoot: string): string {
  return path.join(vibestrateRoot(projectRoot), "project-profile.json");
}

/** `VIBESTRATE.md` at the project root - the orchestrator's durable operating
 *  manual (project model, dev commands, orchestration preferences, risk rules).
 *  Distinct from `.vibestrate/rules.md` (per-turn prompt guidance). */
export function vibestrateManualPath(projectRoot: string): string {
  return path.join(projectRoot, MANUAL_FILENAME);
}

/** `.vibestrate/providers-catalog.yml` - the user's provider-capability overlay
 *  (models + effort levels + apply-spec), merged over the built-in catalog. */
export function providerCatalogOverlayPath(projectRoot: string): string {
  return path.join(vibestrateRoot(projectRoot), PROVIDERS_CATALOG_FILENAME);
}

/** `.vibestrate/providers-detected.json` - machine-managed model/effort catalog
 *  auto-probed at run start (codex `debug models --bundled`). Merged BELOW the
 *  hand-authored providers-catalog.yml overlay and ABOVE the built-in curated
 *  catalog. Delete to clear; a hand overlay always wins. */
export function providersDetectedPath(projectRoot: string): string {
  return path.join(vibestrateRoot(projectRoot), "providers-detected.json");
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

/**
 * Absolute path of a run's git worktree. `worktreeDir` is the configured
 * `git.worktreeDir` (default `../.vibestrate-worktrees`), resolved relative to
 * the project root when not already absolute. The per-run subdir is the runId.
 * Pure path math - no fs or git, so id generators can import it without
 * dragging in execa.
 */
export function resolveWorktreePath(
  projectRoot: string,
  worktreeDir: string,
  runId: string,
): string {
  const base = path.isAbsolute(worktreeDir)
    ? worktreeDir
    : path.resolve(projectRoot, worktreeDir);
  return path.join(base, runId);
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

/** Append-only Action Broker evidence log: one JSON line per brokered action
 *  (decision + evidence). The audit trail of every real effect a run attempted. */
export function runActionsPath(projectRoot: string, runId: string): string {
  return path.join(runDir(projectRoot, runId), "actions.ndjson");
}

export function runAssurancePath(projectRoot: string, runId: string): string {
  return path.join(runDir(projectRoot, runId), "assurance.json");
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

/** Proposed VIBESTRATE.md updates awaiting human review (one JSON per proposal). */
export function manualProposalsDir(projectRoot: string): string {
  return path.join(vibestrateRoot(projectRoot), "manual-proposals");
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
