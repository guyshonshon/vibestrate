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

  async readRoadmap(): Promise<RoadmapFile> {
    const file = roadmapFile(this.projectRoot);
    if (!(await pathExists(file))) return { items: [] };
    const text = await readText(file);
    if (!text.trim()) return { items: [] };
    try {
      return roadmapFileSchema.parse(JSON.parse(text));
    } catch {
      return { items: [] };
    }
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

  async upsertRoadmapItem(item: RoadmapItem): Promise<void> {
    const file = await this.readRoadmap();
    const idx = file.items.findIndex((i) => i.id === item.id);
    if (idx >= 0) file.items[idx] = item;
    else file.items.push(item);
    await this.writeRoadmap(file);
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
      return taskSchema.parse(JSON.parse(text));
    } catch {
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

  async deleteTask(id: string): Promise<void> {
    safeIdSchema.parse(id);
    const file = roadmapTaskFile(this.projectRoot, id);
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
