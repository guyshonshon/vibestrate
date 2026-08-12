/**
 * The filesystem layer under the roadmap: the roadmap item list, one JSON
 * file per task, one comments file per task, and raw proposal markdown, all
 * inside the project's `.vibestrate/` roadmap dirs (paths come from
 * utils/paths). This class owns reading, schema-validating and writing
 * them.
 *
 * What to understand before editing:
 *   - Reads of the roadmap file are split and the choice matters.
 *     `readRoadmap` throws RoadmapCorruptError so a display path names the
 *     damage instead of showing an empty board; `readRoadmapForWrite`
 *     renames the unreadable file aside and starts fresh so a write path
 *     can still make progress. The hazard both are shaped against is a read
 *     that returns an empty roadmap while leaving the file in place - a
 *     write path storing that result back erases every item.
 *   - Every id used to build a path is validated by `safeIdSchema`, either
 *     directly or through taskSchema, so a hostile id cannot walk out of
 *     the roadmap dirs.
 *   - `upsertRoadmapItem` wraps its read-modify-write in the file mutex
 *     because separate processes share the same roadmap.json.
 *     `writeRoadmap` on its own does not lock, so any new read-modify-write
 *     on that file has to take the same lock around both halves.
 *   - `listComments` returns an empty list when the comments file does not
 *     parse, and does not preserve it. A caller that reads, appends and then
 *     calls `writeComments` replaces the unreadable file with its one new
 *     entry, so the same empty-read-then-write-back hazard described above
 *     for roadmap.json is still open for comments.
 */

import path from "node:path";
import fs from "node:fs/promises";
import { ensureDir, pathExists, readText, writeText } from "../utils/fs.js";
import {
  roadmapCommentsDir,
  roadmapCommentsFile,
  roadmapDir,
  roadmapFile,
  roadmapProposalsDir,
  roadmapTaskFile,
  roadmapTasksDir,
} from "../utils/paths.js";
import {
  commentsFileSchema,
  roadmapFileSchema,
  safeIdSchema,
  taskSchema,
  type Comment,
  type RoadmapFile,
  type RoadmapItem,
  type Task,
} from "./roadmap-types.js";
import { migrateTaskShape } from "./migrate-task.js";
import { withFileMutex } from "../utils/file-mutex.js";

/** The roadmap file exists but does not parse. Carries the path so the caller
 *  can name it, and the reason so the quarantine message can quote it. */
export class RoadmapCorruptError extends Error {
  readonly code = "ROADMAP_CORRUPT";
  constructor(
    readonly filePath: string,
    readonly reason: string,
  ) {
    super(`Roadmap file at ${filePath} is unreadable: ${reason}`);
    this.name = "RoadmapCorruptError";
  }
}

export class RoadmapStore {
  constructor(private readonly projectRoot: string) {}

  async init(): Promise<void> {
    await ensureDir(roadmapDir(this.projectRoot));
    await ensureDir(roadmapTasksDir(this.projectRoot));
    await ensureDir(roadmapCommentsDir(this.projectRoot));
    await ensureDir(roadmapProposalsDir(this.projectRoot));
    if (!(await pathExists(roadmapFile(this.projectRoot)))) {
      await writeText(
        roadmapFile(this.projectRoot),
        `${JSON.stringify({ items: [] }, null, 2)}\n`,
      );
    }
  }

  /**
   * Throws on a corrupt file rather than reporting an empty roadmap. The old
   * behaviour swallowed the parse failure and returned `{ items: [] }`, which
   * the write path then wrote back - so a single hand-edit typo rendered the
   * board empty with no warning and the next `vibe roadmap add` replaced every
   * item with the new one. `.vibestrate/` is gitignored, so there was nothing to
   * recover from. Write paths use `readRoadmapForWrite`, which quarantines.
   */
  async readRoadmap(): Promise<RoadmapFile> {
    const file = roadmapFile(this.projectRoot);
    if (!(await pathExists(file))) return { items: [] };
    const text = await readText(file);
    if (!text.trim()) return { items: [] };
    try {
      return roadmapFileSchema.parse(JSON.parse(text));
    } catch (err) {
      throw new RoadmapCorruptError(
        file,
        err instanceof Error ? err.message : "unexpected shape",
      );
    }
  }

  /**
   * Move an unreadable roadmap aside instead of overwriting it, so a corrupt
   * file never costs the owner their roadmap - it stays on disk next to the new
   * one and can be salvaged by hand. Mirrors the workspace registry.
   */
  private async quarantineRoadmap(reason: string): Promise<string> {
    const file = roadmapFile(this.projectRoot);
    const dest = `${file}.corrupt-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    await fs.rename(file, dest);
    console.warn(
      `[vibestrate] roadmap at ${file} was unreadable (${reason}); moved it to ` +
        `${dest} and started a fresh one. Your items are still in that file if ` +
        `you want them back.`,
    );
    return dest;
  }

  /** `readRoadmap`, but a corrupt file is quarantined and treated as a fresh
   *  start. Only for the write paths, which must make progress. */
  private async readRoadmapForWrite(): Promise<RoadmapFile> {
    try {
      return await this.readRoadmap();
    } catch (err) {
      if (!(err instanceof RoadmapCorruptError)) throw err;
      await this.quarantineRoadmap(err.reason);
      return { items: [] };
    }
  }

  /** The read half of a read-modify-write, so an update or an archive hits the
   *  quarantine path rather than the throwing one. Callers that only display an
   *  item must use `getRoadmapItem`, which reports corruption honestly. */
  async getRoadmapItemForWrite(id: string): Promise<RoadmapItem | null> {
    safeIdSchema.parse(id);
    const file = await this.readRoadmapForWrite();
    return file.items.find((i) => i.id === id) ?? null;
  }

  async writeRoadmap(file: RoadmapFile): Promise<void> {
    const validated = roadmapFileSchema.parse(file);
    await ensureDir(roadmapDir(this.projectRoot));
    await writeText(
      roadmapFile(this.projectRoot),
      `${JSON.stringify(validated, null, 2)}\n`,
    );
  }

  async listRoadmapItems(): Promise<RoadmapItem[]> {
    return (await this.readRoadmap()).items;
  }

  async getRoadmapItem(id: string): Promise<RoadmapItem | null> {
    safeIdSchema.parse(id);
    const file = await this.readRoadmap();
    return file.items.find((i) => i.id === id) ?? null;
  }

  /** Serialized: this is a read-modify-write of one shared file from processes
   *  that do not know about each other (CLI, dashboard, TUI). Unlocked, two
   *  concurrent adds lose one item, and two concurrent quarantines race on the
   *  rename - one of them getting ENOENT. Every sibling store in this codebase
   *  takes the same lock for the same reason. */
  async upsertRoadmapItem(item: RoadmapItem): Promise<void> {
    await withFileMutex(`${roadmapFile(this.projectRoot)}.lock`, async () => {
      const file = await this.readRoadmapForWrite();
      const idx = file.items.findIndex((i) => i.id === item.id);
      if (idx >= 0) file.items[idx] = item;
      else file.items.push(item);
      await this.writeRoadmap(file);
    });
  }

  // ─── tasks ────────────────────────────────────────────────────────────────

  async listTaskIds(): Promise<string[]> {
    const dir = roadmapTasksDir(this.projectRoot);
    if (!(await pathExists(dir))) return [];
    const entries = await fs.readdir(dir);
    return entries
      .filter((e) => e.endsWith(".json") && !e.endsWith("-report.md"))
      .map((e) => e.replace(/\.json$/, ""));
  }

  async listTasks(): Promise<Task[]> {
    const ids = await this.listTaskIds();
    const out: Task[] = [];
    for (const id of ids) {
      const t = await this.getTask(id);
      if (t) out.push(t);
    }
    return out;
  }

  async getTask(id: string): Promise<Task | null> {
    safeIdSchema.parse(id);
    const file = roadmapTaskFile(this.projectRoot, id);
    if (!(await pathExists(file))) return null;
    const text = await readText(file);
    if (!text.trim()) return null;
    try {
      return taskSchema.parse(migrateTaskShape(JSON.parse(text)));
    } catch (err) {
      // A task file that can't be parsed (even after the run-mode migration) is
      // LOUD, not silently dropped: log the id + reason so a corrupt/unreadable
      // task is visible instead of just vanishing from the board and CLI. The
      // file is left on disk untouched (never auto-deleted).
      console.warn(
        `[roadmap] task "${id}" could not be read and was skipped: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }

  async writeTask(task: Task): Promise<void> {
    const validated = taskSchema.parse(task);
    await ensureDir(roadmapTasksDir(this.projectRoot));
    await writeText(
      roadmapTaskFile(this.projectRoot, validated.id),
      `${JSON.stringify(validated, null, 2)}\n`,
    );
  }

  /**
   * Read a task, transform it, and write the result under one lock.
   *
   * Every task mutation is a read-modify-write of the whole JSON file from
   * processes that do not know about each other: the dashboard, the CLI, the
   * TUI, and a live run's checklist band. Unlocked, they lose each other's
   * writes, and the loss is silent because the band's own write is wrapped in a
   * catch. The concrete case: a run marks checklist item 3 done with its commit
   * sha, someone adds an item from another surface a moment later off a copy
   * read before that, and item 3 goes back to pending with the sha gone.
   *
   * Locking `writeTask` alone would NOT fix this. The read has to be inside the
   * same lock as the write, which is what this gives callers and a bare
   * write cannot. `upsertRoadmapItem` above does the same thing for the roadmap
   * items file, for the same reason.
   *
   * The lock is link-based and NOT reentrant: never call another mutating store
   * method from inside `mutate`.
   *
   * Returns the written task, or null when the task does not exist or the
   * mutator declines by returning null.
   */
  async mutateTask(
    id: string,
    mutate: (current: Task) => Task | null | Promise<Task | null>,
  ): Promise<Task | null> {
    safeIdSchema.parse(id);
    const file = roadmapTaskFile(this.projectRoot, id);
    return withFileMutex(`${file}.lock`, async () => {
      const current = await this.getTask(id);
      if (!current) return null;
      const next = await mutate(current);
      if (!next) return null;
      await this.writeTask(next);
      return next;
    });
  }

  async deleteTask(id: string): Promise<void> {
    safeIdSchema.parse(id);
    const file = roadmapTaskFile(this.projectRoot, id);
    if (await pathExists(file)) {
      await fs.unlink(file);
    }
  }

  /** Remove a task's comments file (metadata, not user code). Path-guarded
   *  like every other fs op here so a bad id can't escape the project. */
  async deleteComments(taskId: string): Promise<void> {
    safeIdSchema.parse(taskId);
    const file = roadmapCommentsFile(this.projectRoot, taskId);
    if (await pathExists(file)) {
      await fs.unlink(file);
    }
  }

  // ─── comments ─────────────────────────────────────────────────────────────

  async listComments(taskId: string): Promise<Comment[]> {
    safeIdSchema.parse(taskId);
    const file = roadmapCommentsFile(this.projectRoot, taskId);
    if (!(await pathExists(file))) return [];
    const text = await readText(file);
    if (!text.trim()) return [];
    try {
      return commentsFileSchema.parse(JSON.parse(text));
    } catch {
      return [];
    }
  }

  async writeComments(taskId: string, comments: Comment[]): Promise<void> {
    safeIdSchema.parse(taskId);
    const validated = commentsFileSchema.parse(comments);
    await ensureDir(roadmapCommentsDir(this.projectRoot));
    await writeText(
      roadmapCommentsFile(this.projectRoot, taskId),
      `${JSON.stringify(validated, null, 2)}\n`,
    );
  }

  // ─── proposals (raw text) ─────────────────────────────────────────────────

  async writeProposal(id: string, body: string): Promise<string> {
    safeIdSchema.parse(id);
    await ensureDir(roadmapProposalsDir(this.projectRoot));
    const target = path.join(roadmapProposalsDir(this.projectRoot), `${id}.md`);
    await writeText(target, body);
    return target;
  }

  async readProposal(id: string): Promise<string | null> {
    safeIdSchema.parse(id);
    const target = path.join(roadmapProposalsDir(this.projectRoot), `${id}.md`);
    if (!(await pathExists(target))) return null;
    return readText(target);
  }

  async listProposalIds(): Promise<string[]> {
    const dir = roadmapProposalsDir(this.projectRoot);
    if (!(await pathExists(dir))) return [];
    return (await fs.readdir(dir))
      .filter((e) => e.endsWith(".md"))
      .map((e) => e.replace(/\.md$/, ""));
  }
}
