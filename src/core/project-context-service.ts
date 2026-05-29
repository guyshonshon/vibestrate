import path from "node:path";
import { execa } from "execa";
import {
  vibestrateRoot,
  notificationsDir,
  projectRunsDir,
  schedulerDir,
} from "../utils/paths.js";
import { loadConfig, vibestrateExists } from "../project/config-loader.js";
import {
  defaultProjectName,
  detectPackageManager,
  detectProjectType,
  describeProjectType,
  type PackageManager,
  type ProjectType,
} from "../project/project-detector.js";
import { findGitRoot, getCurrentBranch } from "../git/git.js";
import { discoverSkills } from "../skills/skill-discovery.js";
import { runStateSchema, type RunState } from "../core/state-machine.js";
import { readDirSafe, pathExists, readText } from "../utils/fs.js";
import { runStatePath } from "../utils/paths.js";
import { RoadmapService } from "../roadmap/roadmap-service.js";
import { RunQueue } from "../scheduler/run-queue.js";
import type { ProjectConfig } from "../project/config-schema.js";

export type ProjectContextStatus = {
  /** True when .vibestrate/project.yml exists. */
  initialised: boolean;
  /** True when the project root is inside a git repository. */
  isGitRepo: boolean;
  /** True when we found a usable .vibestrate/notifications dir. */
  hasNotifications: boolean;
};

export type ProjectGitContext = {
  isGitRepo: boolean;
  gitRoot: string | null;
  mainBranch: string | null;
  currentBranch: string | null;
  /** Short SHA of HEAD, or null when not a repo / no HEAD yet. */
  headHash: string | null;
  /** First line of HEAD's commit message, when available. */
  headSubject: string | null;
};

export type ProjectMetadata = {
  status: ProjectContextStatus;
  projectRoot: string;
  vibestrateRoot: string;
  worktreeDir: string;
  projectName: string;
  projectType: ProjectType;
  projectTypeLabel: string;
  packageManager: PackageManager;
  git: ProjectGitContext;
  validationCommands: string[];
  providers: { id: string; type: string; command: string | null }[];
  defaultCrew: string | null;
  profiles: {
    id: string;
    provider: string;
    model: string | null;
    power: string | null;
  }[];
  crews: {
    id: string;
    label: string;
    roles: {
      id: string;
      label: string;
      seats: string[];
      profile: string;
      permissions: string;
      skills: string[];
    }[];
  }[];
  skills: {
    id: string;
    name: string;
    source: string;
    filePath: string;
  }[];
  scheduler: ProjectConfig["scheduler"];
  policies: {
    forbidMainBranchWrites: boolean;
    forbidSecretsAccess: boolean;
    forbidAutoPush: boolean;
    forbidAutoMerge: boolean;
    requireApprovalAtStages: string[];
  };
  counts: {
    runs: number;
    activeRuns: number;
    runningTaskIds: string[];
    queueLength: number;
    roadmapItems: number;
    tasks: number;
    pendingApprovals: number;
  };
  recentRuns: RunState[];
};

/**
 * Build a single, dashboard-friendly snapshot of the project Vibestrate is
 * supervising. Defensive: every step that can fail (git not installed, no
 * package.json, missing .vibestrate) degrades to null/empty rather than throwing.
 */
export async function getProjectMetadata(
  projectRoot: string,
): Promise<ProjectMetadata> {
  const status: ProjectContextStatus = {
    initialised: await vibestrateExists(projectRoot),
    isGitRepo: false,
    hasNotifications: await pathExists(notificationsDir(projectRoot)),
  };

  const gitRoot = await findGitRoot(projectRoot);
  status.isGitRepo = gitRoot !== null;
  const currentBranch = gitRoot ? await getCurrentBranch(gitRoot) : null;
  const head = gitRoot
    ? await readHeadCommit(gitRoot).catch(() => null)
    : null;

  const projectName = await defaultProjectName(projectRoot);
  const packageManager = await detectPackageManager(projectRoot);
  const projectType = await detectProjectType(projectRoot);

  let config: ProjectConfig | null = null;
  if (status.initialised) {
    try {
      const loaded = await loadConfig(projectRoot);
      config = loaded.config;
    } catch {
      config = null;
    }
  }

  const skills = status.initialised
    ? await discoverSkills(projectRoot).catch(() => [])
    : [];

  const recentRuns = await listRecentRuns(projectRoot, 10).catch(() => []);
  const activeRuns = recentRuns.filter((r) => isActiveStatus(r.status));
  const queueLength = status.initialised
    ? await new RunQueue(projectRoot)
        .readQueue()
        .then((q) => q.entries.length)
        .catch(() => 0)
    : 0;
  const runningTaskIds = status.initialised
    ? await new RunQueue(projectRoot)
        .readState()
        .then((s) => s.runningTaskIds)
        .catch(() => [])
    : [];
  const roadmapCounts = status.initialised
    ? await readRoadmapCounts(projectRoot).catch(() => ({
        roadmapItems: 0,
        tasks: 0,
      }))
    : { roadmapItems: 0, tasks: 0 };
  const pendingApprovals = await countPendingApprovals(projectRoot, recentRuns);

  return {
    status,
    projectRoot,
    vibestrateRoot: vibestrateRoot(projectRoot),
    worktreeDir: config?.git.worktreeDir ?? "../.vibestrate-worktrees",
    projectName,
    projectType,
    projectTypeLabel: describeProjectType(projectType),
    packageManager,
    git: {
      isGitRepo: status.isGitRepo,
      gitRoot,
      mainBranch: config?.git.mainBranch ?? "main",
      currentBranch,
      headHash: head?.shortHash ?? null,
      headSubject: head?.subject ?? null,
    },
    validationCommands: config?.commands.validate ?? [],
    providers: config
      ? Object.entries(config.providers).map(([id, p]) => ({
          id,
          type: p.type,
          command: "command" in p ? (p.command ?? null) : null,
        }))
      : [],
    defaultCrew: config?.defaultCrew ?? null,
    profiles: config
      ? Object.entries(config.profiles).map(([id, p]) => ({
          id,
          provider: p.provider,
          model: p.model,
          power: p.power,
        }))
      : [],
    crews: config
      ? Object.entries(config.crews).map(([crewId, crew]) => ({
          id: crewId,
          label: crew.label ?? crewId,
          roles: Object.entries(crew.roles).map(([id, r]) => ({
            id,
            label: r.label ?? id,
            seats: r.seats,
            profile: r.profile,
            permissions: r.permissions,
            skills: r.skills,
          })),
        }))
      : [],
    skills: skills.map((s) => ({
      id: s.id,
      name: s.name,
      source: s.source,
      filePath: s.filePath,
    })),
    scheduler: config?.scheduler ?? {
      maxConcurrentRuns: 1,
      maxConcurrentWriteRoles: 1,
      conflictPolicy: "warn",
      queuePolicy: "fifo",
      sourceQuotas: {},
    },
    policies: {
      forbidMainBranchWrites: config?.policies.forbidMainBranchWrites ?? true,
      forbidSecretsAccess: config?.policies.forbidSecretsAccess ?? true,
      forbidAutoPush: config?.policies.forbidAutoPush ?? true,
      forbidAutoMerge: config?.policies.forbidAutoMerge ?? true,
      requireApprovalAtStages: config?.policies.requireApprovalAtStages ?? [],
    },
    counts: {
      runs: recentRuns.length,
      activeRuns: activeRuns.length,
      runningTaskIds,
      queueLength,
      roadmapItems: roadmapCounts.roadmapItems,
      tasks: roadmapCounts.tasks,
      pendingApprovals,
    },
    recentRuns: recentRuns.slice(0, 10),
  };
  // ensures unused imports stay reachable in type-only paths
  void path;
}

function isActiveStatus(s: string): boolean {
  return (
    s !== "merge_ready" &&
    s !== "blocked" &&
    s !== "failed" &&
    s !== "aborted"
  );
}

async function readHeadCommit(
  cwd: string,
): Promise<{ shortHash: string; subject: string } | null> {
  const r = await execa(
    "git",
    ["log", "-1", "--pretty=format:%h%n%s", "HEAD"],
    { cwd, reject: false, timeout: 4_000 },
  );
  if (r.exitCode !== 0) return null;
  const lines = (r.stdout || "").split("\n");
  const shortHash = (lines[0] ?? "").trim();
  const subject = (lines[1] ?? "").trim();
  if (!shortHash) return null;
  return { shortHash, subject };
}

async function listRecentRuns(
  projectRoot: string,
  limit: number,
): Promise<RunState[]> {
  const ids = (await readDirSafe(projectRunsDir(projectRoot))).sort();
  const runs: RunState[] = [];
  for (const id of ids) {
    const file = runStatePath(projectRoot, id);
    if (!(await pathExists(file))) continue;
    try {
      const text = await readText(file);
      const parsed = runStateSchema.safeParse(JSON.parse(text));
      if (parsed.success) runs.push(parsed.data);
    } catch {
      // skip malformed run state
    }
  }
  return runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, limit);
}

async function readRoadmapCounts(
  projectRoot: string,
): Promise<{ roadmapItems: number; tasks: number }> {
  const svc = new RoadmapService(projectRoot);
  await svc.init();
  const items = await svc.listRoadmapItems();
  const tasks = await svc.listTasks();
  return { roadmapItems: items.length, tasks: tasks.length };
}

async function countPendingApprovals(
  projectRoot: string,
  runs: RunState[],
): Promise<number> {
  let total = 0;
  for (const run of runs) {
    const file = path.join(projectRunsDir(projectRoot), run.runId, "approvals.json");
    if (!(await pathExists(file))) continue;
    try {
      const text = await readText(file);
      const data = JSON.parse(text) as {
        approvals?: { status: string }[];
      };
      total += (data.approvals ?? []).filter(
        (a) => a.status === "pending",
      ).length;
    } catch {
      // skip malformed
    }
  }
  return total;
  void schedulerDir;
}
