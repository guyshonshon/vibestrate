import path from "node:path";
import fs from "node:fs/promises";
import { getGitStatus, type GitStatus } from "./git-history-service.js";

export type CodebaseWatchEvent =
  | {
      kind: "project.git.changed";
      timestamp: string;
      summary: GitStatusSummary;
    }
  | {
      kind: "run.git.changed";
      runId: string;
      timestamp: string;
      summary: GitStatusSummary;
    }
  | {
      kind: "filetree.changed";
      rootKind: "project" | "worktree";
      runId?: string;
      timestamp: string;
      changedPaths: string[];
    }
  | {
      kind: "codebase.snapshot.updated";
      timestamp: string;
      summary: GitStatusSummary | null;
    };

export type GitStatusSummary = {
  branch: string | null;
  isDirty: boolean;
  changedFileCount: number;
  headHash: string | null;
};

/**
 * Lightweight polling watcher for a single git worktree (project root or run
 * worktree). Emits diffs only — never raw file contents — and never spawns
 * file-system watchers on huge trees. The poll cadence is intentionally low
 * (default 4 s) so it stays cheap on idle projects.
 */
export class GitStatusWatcher {
  private timer: NodeJS.Timeout | null = null;
  private last: GitStatusSummary | null = null;
  private subscribers = new Set<(summary: GitStatusSummary) => void>();
  private stopped = false;

  constructor(
    private readonly worktreePath: string,
    private readonly intervalMs: number = 4_000,
  ) {}

  start(): void {
    if (this.timer) return;
    this.stopped = false;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    // Avoid keeping the event loop alive when nothing else is open.
    this.timer.unref?.();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.subscribers.clear();
  }

  subscribe(fn: (summary: GitStatusSummary) => void): () => void {
    this.subscribers.add(fn);
    if (this.last) fn(this.last);
    return () => this.subscribers.delete(fn);
  }

  /** Force a poll right now. Used by SSE clients on first connect. */
  async pollNow(): Promise<GitStatusSummary | null> {
    await this.tick();
    return this.last;
  }

  private async tick(): Promise<void> {
    if (this.stopped) return;
    let status: GitStatus;
    try {
      status = await getGitStatus(this.worktreePath);
    } catch {
      return;
    }
    if (!status.available) return;
    const summary: GitStatusSummary = {
      branch: status.branch,
      isDirty: status.isDirty,
      changedFileCount: status.changedFiles.length,
      headHash: status.headHash,
    };
    if (sameSummary(this.last, summary)) return;
    this.last = summary;
    for (const fn of this.subscribers) {
      try {
        fn(summary);
      } catch {
        // ignore subscriber errors so one bad client doesn't break others
      }
    }
  }
}

function sameSummary(
  a: GitStatusSummary | null,
  b: GitStatusSummary,
): boolean {
  if (!a) return false;
  return (
    a.branch === b.branch &&
    a.isDirty === b.isDirty &&
    a.changedFileCount === b.changedFileCount &&
    a.headHash === b.headHash
  );
}

/**
 * Cheap recursive mtime sweep used to detect that *something* in the tree
 * changed without reading file bodies. Excludes the same noisy directories as
 * the file-tree service. Walk caps at MAX_ENTRIES so we never scan huge trees.
 */
export type TreeSnapshot = {
  /** Most-recent mtime seen across the walked subset (ms since epoch). */
  newestMtimeMs: number;
  /** Up to 32 most-recently-modified relative paths, newest first. */
  recentPaths: string[];
};

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "out",
  "coverage",
  ".next",
  ".turbo",
  ".cache",
  ".parcel-cache",
  ".vite",
  ".svelte-kit",
  ".gradle",
  ".idea",
  ".pytest_cache",
  ".mypy_cache",
  "__pycache__",
  "target",
  "venv",
  ".venv",
  ".amaco-worktrees",
]);

const MAX_ENTRIES = 8_000;

export async function snapshotTree(
  rootPath: string,
  options?: { includeAmaco?: boolean },
): Promise<TreeSnapshot> {
  const includeAmaco = options?.includeAmaco === true;
  const recents: { path: string; mtimeMs: number }[] = [];
  let newest = 0;
  let visited = 0;

  async function walk(rel: string): Promise<void> {
    if (visited >= MAX_ENTRIES) return;
    let entries: import("node:fs").Dirent[];
    const abs = rel ? path.join(rootPath, rel) : rootPath;
    try {
      entries = await fs.readdir(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (visited >= MAX_ENTRIES) return;
      visited++;
      if (e.isSymbolicLink()) continue;
      if (SKIP_DIRS.has(e.name)) continue;
      if (!includeAmaco && e.name === ".amaco") continue;
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      const childAbs = path.join(rootPath, childRel);
      if (e.isDirectory()) {
        await walk(childRel);
        continue;
      }
      if (!e.isFile()) continue;
      try {
        const st = await fs.stat(childAbs);
        const m = st.mtimeMs;
        if (m > newest) newest = m;
        recents.push({ path: childRel, mtimeMs: m });
      } catch {
        // ignore stat failures
      }
    }
  }

  await walk("");
  recents.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return {
    newestMtimeMs: newest,
    recentPaths: recents.slice(0, 32).map((r) => r.path),
  };
}

/**
 * Detect filesystem-side changes by comparing successive snapshots. Returns
 * the diff, or null when nothing visible changed. We compare set-membership
 * + the newest mtime so a touch-without-content-change still surfaces.
 */
export class FileTreeWatcher {
  private last: TreeSnapshot | null = null;
  private timer: NodeJS.Timeout | null = null;
  private subscribers = new Set<(diff: TreeChangeDiff) => void>();
  private stopped = false;

  constructor(
    private readonly rootPath: string,
    private readonly intervalMs: number = 8_000,
    private readonly opts?: { includeAmaco?: boolean },
  ) {}

  start(): void {
    if (this.timer) return;
    this.stopped = false;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.subscribers.clear();
  }

  subscribe(fn: (diff: TreeChangeDiff) => void): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  private async tick(): Promise<void> {
    if (this.stopped) return;
    let snap: TreeSnapshot;
    try {
      snap = await snapshotTree(this.rootPath, this.opts);
    } catch {
      return;
    }
    if (!this.last) {
      this.last = snap;
      return;
    }
    const diff = compareSnapshots(this.last, snap);
    this.last = snap;
    if (!diff) return;
    for (const fn of this.subscribers) {
      try {
        fn(diff);
      } catch {
        // ignore
      }
    }
  }
}

export type TreeChangeDiff = {
  added: string[];
  removed: string[];
  modified: string[];
};

function compareSnapshots(
  a: TreeSnapshot,
  b: TreeSnapshot,
): TreeChangeDiff | null {
  const aSet = new Set(a.recentPaths);
  const bSet = new Set(b.recentPaths);
  const added: string[] = [];
  const removed: string[] = [];
  for (const p of bSet) if (!aSet.has(p)) added.push(p);
  for (const p of aSet) if (!bSet.has(p)) removed.push(p);
  const modified =
    b.newestMtimeMs > a.newestMtimeMs && added.length === 0 && removed.length === 0
      ? b.recentPaths.slice(0, 5)
      : [];
  if (added.length === 0 && removed.length === 0 && modified.length === 0) {
    return null;
  }
  return { added, removed, modified };
}
