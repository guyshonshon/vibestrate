// ── Workspace registry (Multi-project, v1) ──────────────────────────────────
//
// A user-level registry of known projects so the dashboard can switch between
// them and so several projects can run side-by-side. Each `vibe ui` registers
// its project (and the port it bound) here. This is metadata only - project
// *paths*, labels, and last-seen ports - never project contents; nothing leaves
// the machine. Stays local-first: the registry is just a JSON file you own.

import os from "node:os";
import path from "node:path";
import { realpathSync } from "node:fs";
import { rename, rm } from "node:fs/promises";
import { z } from "zod";
import { readText, writeText, pathExists, ensureDir } from "../utils/fs.js";
import { withFileMutex } from "../utils/file-mutex.js";
import { nowIso } from "../utils/time.js";

/**
 * Canonical absolute root: resolves symlinks (e.g. macOS `/var` →
 * `/private/var`) so the SAME project never lands under two keys. Falls back to
 * `path.resolve` when the path doesn't exist yet (realpath would throw). This is
 * the dedup key for the registry and the match key for cross-project lookups.
 */
export function canonicalRoot(p: string): string {
  const resolved = path.resolve(p);
  try {
    return realpathSync(resolved);
  } catch {
    return resolved;
  }
}

export const workspaceProjectSchema = z
  .object({
    /** Absolute, normalized project root. The dedup key. */
    root: z.string().min(1),
    label: z.string().min(1).max(120),
    addedAt: z.string(),
    lastOpenedAt: z.string(),
    // NOTE: runtime state (port / pid of a running `vibe ui`) deliberately does
    // NOT live here anymore - it's per-project in `<root>/.vibestrate/ui.lock`
    // (see ui-lock.ts). The registry is durable intent only. `.strip()` drops
    // any legacy `lastPort` / `pid` keys from older files on read.
  })
  .strip();
export type WorkspaceProject = z.infer<typeof workspaceProjectSchema>;

export const workspaceFileSchema = z.object({
  version: z.literal(1),
  projects: z.array(workspaceProjectSchema).default([]),
});
export type WorkspaceFile = z.infer<typeof workspaceFileSchema>;

/** The registry path: `$VIBESTRATE_WORKSPACE_FILE` or `~/.vibestrate/workspace.json`. */
export function defaultWorkspaceFile(): string {
  const override = process.env.VIBESTRATE_WORKSPACE_FILE;
  if (override && override.trim()) return override.trim();
  return path.join(os.homedir(), ".vibestrate", "workspace.json");
}

/** The user-level dir holding the registry. Tracks `$VIBESTRATE_WORKSPACE_FILE`
 *  so tests that redirect the registry get siblings redirected alongside it. */
export function workspaceDir(): string {
  return path.dirname(defaultWorkspaceFile());
}

/** A fresh empty file - new arrays each call, never a shared mutable default. */
function emptyFile(): WorkspaceFile {
  return { version: 1, projects: [] };
}

/** The registry file exists but can't be understood. Carried as a typed error
 *  so callers branch on the kind rather than matching a message. */
export class WorkspaceRegistryCorruptError extends Error {
  constructor(
    readonly filePath: string,
    readonly reason: string,
  ) {
    super(`Workspace registry at ${filePath} is unreadable (${reason}).`);
    this.name = "WorkspaceRegistryCorruptError";
  }
}

export class WorkspaceStore {
  constructor(private readonly filePath: string = defaultWorkspaceFile()) {}

  /**
   * Read the registry. A missing file is an empty registry; an existing file
   * that doesn't parse raises `WorkspaceRegistryCorruptError` rather than
   * quietly reading as empty.
   *
   * That distinction matters because `register` writes back whatever `read`
   * returned: reading a corrupt file as empty would erase every other
   * registered project on the next write, with no error and no copy kept.
   * Callers decide what to do - `list` degrades to no projects (read-only, so
   * nothing is lost), `register` quarantines the bad file first.
   */
  async read(): Promise<WorkspaceFile> {
    if (!(await pathExists(this.filePath))) return emptyFile();
    let json: unknown;
    try {
      json = JSON.parse(await readText(this.filePath));
    } catch (err) {
      throw new WorkspaceRegistryCorruptError(
        this.filePath,
        `not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const parsed = workspaceFileSchema.safeParse(json);
    if (!parsed.success) {
      throw new WorkspaceRegistryCorruptError(
        this.filePath,
        parsed.error.issues[0]?.message ?? "unexpected shape",
      );
    }
    return parsed.data;
  }

  /**
   * Move an unreadable registry aside instead of overwriting it, so a corrupt
   * file never costs the owner their project list - it stays on disk next to
   * the new one and can be salvaged by hand. Returns the archived path.
   */
  private async quarantine(reason: string): Promise<string> {
    const dest = `${this.filePath}.corrupt-${nowIso().replace(/[:.]/g, "-")}`;
    await rename(this.filePath, dest);
    console.warn(
      `[vibestrate] workspace registry at ${this.filePath} was unreadable (${reason}); ` +
        `moved it to ${dest} and started a fresh one. Your other registered ` +
        `projects are still in that file if you want them back.`,
    );
    return dest;
  }

  /** `read`, but a corrupt file is quarantined and treated as a fresh start.
   *  Only for the write paths, which must make progress. */
  private async readForWrite(): Promise<WorkspaceFile> {
    try {
      return await this.read();
    } catch (err) {
      if (!(err instanceof WorkspaceRegistryCorruptError)) throw err;
      await this.quarantine(err.reason);
      return emptyFile();
    }
  }

  private async write(file: WorkspaceFile): Promise<void> {
    // Atomic write: serialize to a unique temp file, then rename over the
    // target. rename(2) is atomic on the same filesystem, so a concurrent
    // reader never sees a half-written registry. Note this protects file
    // INTEGRITY only, not the read-modify-write above it: two writers racing
    // would each rename a whole file and the loser's registration would
    // vanish. `register`/`remove` take a mutex for that reason.
    const body = `${JSON.stringify(workspaceFileSchema.parse(file), null, 2)}\n`;
    const tmp = `${this.filePath}.tmp-${process.pid}-${nowIso().replace(/[:.]/g, "-")}`;
    await ensureDir(path.dirname(this.filePath));
    await writeText(tmp, body);
    try {
      await rename(tmp, this.filePath);
    } catch {
      // Fall back to a direct write if rename isn't available (rare).
      await writeText(this.filePath, body);
      await rm(tmp, { force: true }).catch(() => undefined);
    }
  }

  /** Known projects, most-recently-opened first. A corrupt registry reads as
   *  no projects rather than throwing - this is the read path, so degrading
   *  costs nothing, and the next write quarantines the file with a warning. */
  async list(): Promise<WorkspaceProject[]> {
    let projects: WorkspaceProject[];
    try {
      ({ projects } = await this.read());
    } catch (err) {
      if (!(err instanceof WorkspaceRegistryCorruptError)) throw err;
      return [];
    }
    return [...projects].sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt));
  }

  /**
   * Add or refresh a project. Dedups by normalized root; updates lastOpenedAt.
   * Returns the stored entry.
   *
   * The read-modify-write runs under a cross-process mutex: every `vibe ui`
   * self-registers on startup and the dashboard can register over HTTP, so
   * two writers racing without it would each rewrite the whole file and one
   * registration would silently disappear.
   */
  async register(input: {
    root: string;
    label?: string;
  }): Promise<WorkspaceProject> {
    const root = canonicalRoot(input.root);
    return withFileMutex(`${this.filePath}.lock`, async () => {
      const file = await this.readForWrite();
      const ts = nowIso();
      const existing = file.projects.find((p) => p.root === root);
      let entry: WorkspaceProject;
      if (existing) {
        entry = {
          ...existing,
          label: input.label ?? existing.label,
          lastOpenedAt: ts,
        };
        file.projects = file.projects.map((p) => (p.root === root ? entry : p));
      } else {
        entry = {
          root,
          // Clamped to the schema's own cap: a directory name longer than that
          // would otherwise fail validation inside write(), turning a legal
          // path into an opaque server error.
          label: (input.label ?? (path.basename(root) || root)).slice(0, 120),
          addedAt: ts,
          lastOpenedAt: ts,
        };
        file.projects.push(entry);
      }
      await this.write(file);
      return entry;
    });
  }

  /** Remove a project from the registry (does NOT touch the project on disk).
   *  Same mutex as `register` - it is the other half of the same
   *  read-modify-write. */
  async remove(root: string): Promise<boolean> {
    const norm = canonicalRoot(root);
    return withFileMutex(`${this.filePath}.lock`, async () => {
      const file = await this.readForWrite();
      const before = file.projects.length;
      file.projects = file.projects.filter((p) => p.root !== norm);
      if (file.projects.length === before) return false;
      await this.write(file);
      return true;
    });
  }
}
