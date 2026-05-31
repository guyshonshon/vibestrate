// ── Workspace scheduler / dispatch queue (Multi-project slice d) ─────────────
//
// A cross-project queue of "run this in that project" intents, stored in one
// user-level file beside the registry (`~/.vibestrate/workspace-queue.json`).
// Draining launches eligible entries through the coordinator, respecting two
// honest, code-enforced caps:
//   • a GLOBAL concurrency cap across all projects, and
//   • a PER-PROJECT cap (so one project can't soak the whole budget).
// Capacity is measured from each project's real non-terminal runs on disk —
// not a daemon's in-memory guess — so the drain is correct even across separate
// `vibe ui` / CLI processes. This is a dispatcher, not a background daemon: a
// drain is one pass; the caller (CLI/UI/cron) decides when to run it. We never
// claim always-on scheduling we don't have.

import { z } from "zod";
import { pathExists, readText, writeText, ensureDir } from "../utils/fs.js";
import path from "node:path";
import { nowIso } from "../utils/time.js";
import { defaultWorkspaceQueueFile } from "./workspace-store.js";
import {
  workspaceRunRequestSchema,
  launchRunInProject,
  listActiveRunsInProject,
  appendDispatch,
  type WorkspaceRunRequest,
  type LaunchResult,
} from "./workspace-coordinator.js";
import {
  resolveTargetProject,
  WorkspaceSafetyError,
  type WorkspaceSafetyDeps,
} from "./workspace-safety.js";

export const workspaceQueueEntrySchema = z.object({
  id: z.string().min(1),
  enqueuedAt: z.string(),
  /** Free-form origin label (e.g. "user", "cron"). */
  source: z.string().min(1).max(64).default("user"),
  request: workspaceRunRequestSchema,
});
export type WorkspaceQueueEntry = z.infer<typeof workspaceQueueEntrySchema>;

export const workspaceQueueFileSchema = z.object({
  version: z.literal(1),
  entries: z.array(workspaceQueueEntrySchema).default([]),
});
export type WorkspaceQueueFile = z.infer<typeof workspaceQueueFileSchema>;

function emptyFile(): WorkspaceQueueFile {
  return { version: 1, entries: [] };
}

let counter = 0;
function genId(): string {
  counter = (counter + 1) % 1_000_000;
  return `wq-${Date.now().toString(36)}-${counter.toString(36)}`;
}

export class WorkspaceQueueStore {
  constructor(private readonly filePath: string = defaultWorkspaceQueueFile()) {}

  async read(): Promise<WorkspaceQueueFile> {
    if (!(await pathExists(this.filePath))) return emptyFile();
    try {
      const parsed = workspaceQueueFileSchema.safeParse(
        JSON.parse(await readText(this.filePath)),
      );
      return parsed.success ? parsed.data : emptyFile();
    } catch {
      return emptyFile();
    }
  }

  private async write(file: WorkspaceQueueFile): Promise<void> {
    await ensureDir(path.dirname(this.filePath));
    await writeText(
      this.filePath,
      `${JSON.stringify(workspaceQueueFileSchema.parse(file), null, 2)}\n`,
    );
  }

  /** FIFO order (oldest first). */
  async list(): Promise<WorkspaceQueueEntry[]> {
    const { entries } = await this.read();
    return entries;
  }

  async enqueue(
    request: WorkspaceRunRequest,
    source = "user",
  ): Promise<WorkspaceQueueEntry> {
    const file = await this.read();
    const entry: WorkspaceQueueEntry = {
      id: genId(),
      enqueuedAt: nowIso(),
      source,
      request,
    };
    file.entries.push(entry);
    await this.write(file);
    return entry;
  }

  async remove(id: string): Promise<boolean> {
    const file = await this.read();
    const before = file.entries.length;
    file.entries = file.entries.filter((e) => e.id !== id);
    if (file.entries.length === before) return false;
    await this.write(file);
    return true;
  }

  async clear(): Promise<number> {
    const file = await this.read();
    const n = file.entries.length;
    if (n > 0) await this.write(emptyFile());
    return n;
  }
}

export type DrainOptions = WorkspaceSafetyDeps & {
  /** The dispatch queue (defaults to the user-level file). Named distinctly
   *  from the registry `store` it inherits from WorkspaceSafetyDeps so the two
   *  never collide. */
  queueStore?: WorkspaceQueueStore;
  /** Max concurrent runs across ALL projects (incl. already-running). */
  maxConcurrent?: number;
  /** Max concurrent runs per single project. */
  maxPerProject?: number;
  spawnedBy?: string;
  /** Launcher override (tests inject a fake to exercise caps without spawning).
   *  Defaults to the real detached-process launcher. */
  launch?: (
    req: WorkspaceRunRequest,
    deps: WorkspaceSafetyDeps & { spawnedBy?: string },
  ) => Promise<LaunchResult>;
};

export type DrainSkip = {
  id: string;
  project: string;
  reason: "global-cap" | "project-cap" | "unsafe";
  detail: string;
};

export type DrainResult = {
  launched: Array<LaunchResult & { id: string }>;
  skipped: DrainSkip[];
  remaining: number;
};

/**
 * One drain pass. Launches queued entries in FIFO order until the global cap is
 * hit; entries blocked only by a per-project cap (or an unsafe target) are left
 * in the queue and reported. Returns what launched, what was skipped and why,
 * and how many entries remain queued.
 */
export async function drainWorkspaceQueue(
  opts: DrainOptions = { currentRoot: process.cwd() },
): Promise<DrainResult> {
  const store = opts.queueStore ?? new WorkspaceQueueStore();
  const maxConcurrent = Math.max(1, opts.maxConcurrent ?? 2);
  const maxPerProject = Math.max(1, opts.maxPerProject ?? 1);
  const spawnedBy = opts.spawnedBy ?? "workspace-drain";
  const launch = opts.launch ?? launchRunInProject;

  const entries = await store.list();
  const launched: Array<LaunchResult & { id: string }> = [];
  const skipped: DrainSkip[] = [];

  // Live active-run counts per resolved root (cached; updated as we launch).
  const activeByRoot = new Map<string, number>();
  const ensureActive = async (root: string): Promise<number> => {
    if (!activeByRoot.has(root)) {
      activeByRoot.set(root, (await listActiveRunsInProject(root)).length);
    }
    return activeByRoot.get(root)!;
  };

  let globalActive = 0; // recomputed lazily below as roots are touched
  const countedRoots = new Set<string>();

  for (const entry of entries) {
    // Resolve + vet the target. An unsafe entry is dropped from the queue
    // (it can never run) and reported.
    let root: string;
    let label: string;
    try {
      const target = await resolveTargetProject(entry.request.project, opts);
      root = target.root;
      label = target.label;
    } catch (err) {
      const msg = err instanceof WorkspaceSafetyError ? err.message : String(err);
      skipped.push({ id: entry.id, project: entry.request.project, reason: "unsafe", detail: msg });
      await store.remove(entry.id);
      continue;
    }

    // Seed the global count from every distinct root the first time we see it.
    if (!countedRoots.has(root)) {
      globalActive += await ensureActive(root);
      countedRoots.add(root);
    }

    if (globalActive >= maxConcurrent) {
      skipped.push({
        id: entry.id,
        project: label,
        reason: "global-cap",
        detail: `global cap ${maxConcurrent} reached`,
      });
      continue;
    }
    const projActive = await ensureActive(root);
    if (projActive >= maxPerProject) {
      skipped.push({
        id: entry.id,
        project: label,
        reason: "project-cap",
        detail: `${label} at its cap (${maxPerProject})`,
      });
      continue;
    }

    const result = await launch(entry.request, { ...opts, spawnedBy });
    launched.push({ ...result, id: entry.id });
    await store.remove(entry.id);
    activeByRoot.set(root, projActive + 1);
    globalActive += 1;
    await appendDispatch({
      action: "drain-launch",
      root,
      label,
      detail: { id: entry.id, task: entry.request.task },
      spawnedBy,
    });
  }

  const remaining = (await store.list()).length;
  return { launched, skipped, remaining };
}
