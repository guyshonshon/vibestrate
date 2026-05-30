// ── Workspace registry (Multi-project, v1) ──────────────────────────────────
//
// A user-level registry of known projects so the dashboard can switch between
// them and so several projects can run side-by-side. Each `vibe ui` registers
// its project (and the port it bound) here. This is metadata only — project
// *paths*, labels, and last-seen ports — never project contents; nothing leaves
// the machine. Stays local-first: the registry is just a JSON file you own.

import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { readText, writeText, pathExists } from "../utils/fs.js";
import { nowIso } from "../utils/time.js";

export const workspaceProjectSchema = z.object({
  /** Absolute, normalized project root. The dedup key. */
  root: z.string().min(1),
  label: z.string().min(1).max(120),
  addedAt: z.string(),
  lastOpenedAt: z.string(),
  /** Port the most recent `vibe ui` bound for this project (best-effort). */
  lastPort: z.number().int().positive().nullable().default(null),
});
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

/** A fresh empty file — new arrays each call, never a shared mutable default. */
function emptyFile(): WorkspaceFile {
  return { version: 1, projects: [] };
}

export class WorkspaceStore {
  constructor(private readonly filePath: string = defaultWorkspaceFile()) {}

  async read(): Promise<WorkspaceFile> {
    if (!(await pathExists(this.filePath))) return emptyFile();
    try {
      const parsed = workspaceFileSchema.safeParse(JSON.parse(await readText(this.filePath)));
      return parsed.success ? parsed.data : emptyFile();
    } catch {
      return emptyFile();
    }
  }

  private async write(file: WorkspaceFile): Promise<void> {
    await writeText(this.filePath, `${JSON.stringify(workspaceFileSchema.parse(file), null, 2)}\n`);
  }

  /** Known projects, most-recently-opened first. */
  async list(): Promise<WorkspaceProject[]> {
    const { projects } = await this.read();
    return [...projects].sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt));
  }

  /**
   * Add or refresh a project. Dedups by normalized root; updates lastOpenedAt
   * and (when given) lastPort. Returns the stored entry.
   */
  async register(input: {
    root: string;
    label?: string;
    port?: number | null;
  }): Promise<WorkspaceProject> {
    const root = path.resolve(input.root);
    const file = await this.read();
    const ts = nowIso();
    const existing = file.projects.find((p) => p.root === root);
    let entry: WorkspaceProject;
    if (existing) {
      entry = {
        ...existing,
        label: input.label ?? existing.label,
        lastOpenedAt: ts,
        lastPort: input.port ?? existing.lastPort,
      };
      file.projects = file.projects.map((p) => (p.root === root ? entry : p));
    } else {
      entry = {
        root,
        label: input.label ?? (path.basename(root) || root),
        addedAt: ts,
        lastOpenedAt: ts,
        lastPort: input.port ?? null,
      };
      file.projects.push(entry);
    }
    await this.write(file);
    return entry;
  }

  /** Remove a project from the registry (does NOT touch the project on disk). */
  async remove(root: string): Promise<boolean> {
    const norm = path.resolve(root);
    const file = await this.read();
    const before = file.projects.length;
    file.projects = file.projects.filter((p) => p.root !== norm);
    if (file.projects.length === before) return false;
    await this.write(file);
    return true;
  }
}
