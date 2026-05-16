import { ensureDir, pathExists, readText, writeText } from "../utils/fs.js";
import {
  schedulerDir,
  schedulerQueueFile,
  schedulerStateFile,
} from "../utils/paths.js";
import { nowIso } from "../utils/time.js";
import {
  queueFileSchema,
  schedulerStateSchema,
  type QueueEntry,
  type QueueFile,
  type SchedulerState,
} from "./scheduler-types.js";
import type { Priority } from "../roadmap/roadmap-types.js";

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

export class RunQueue {
  constructor(private readonly projectRoot: string) {}

  async readQueue(): Promise<QueueFile> {
    const file = schedulerQueueFile(this.projectRoot);
    if (!(await pathExists(file))) return { entries: [] };
    const text = await readText(file);
    if (!text.trim()) return { entries: [] };
    try {
      return queueFileSchema.parse(JSON.parse(text));
    } catch {
      return { entries: [] };
    }
  }

  async writeQueue(file: QueueFile): Promise<void> {
    const validated = queueFileSchema.parse(file);
    await ensureDir(schedulerDir(this.projectRoot));
    await writeText(
      schedulerQueueFile(this.projectRoot),
      `${JSON.stringify(validated, null, 2)}\n`,
    );
  }

  async readState(): Promise<SchedulerState> {
    const file = schedulerStateFile(this.projectRoot);
    if (!(await pathExists(file))) {
      return {
        paused: false,
        runningTaskIds: [],
        lastUpdatedAt: nowIso(),
        maxConcurrentRuns: 1,
        conflictPolicy: "warn",
        queuePolicy: "fifo",
        sourceQuotas: {},
      };
    }
    const text = await readText(file);
    try {
      return schedulerStateSchema.parse(JSON.parse(text));
    } catch {
      return {
        paused: false,
        runningTaskIds: [],
        lastUpdatedAt: nowIso(),
        maxConcurrentRuns: 1,
        conflictPolicy: "warn",
        queuePolicy: "fifo",
        sourceQuotas: {},
      };
    }
  }

  async writeState(state: SchedulerState): Promise<void> {
    const validated = schedulerStateSchema.parse({
      ...state,
      lastUpdatedAt: nowIso(),
    });
    await ensureDir(schedulerDir(this.projectRoot));
    await writeText(
      schedulerStateFile(this.projectRoot),
      `${JSON.stringify(validated, null, 2)}\n`,
    );
  }

  async enqueue(entry: QueueEntry): Promise<QueueFile> {
    const queue = await this.readQueue();
    if (queue.entries.some((e) => e.taskId === entry.taskId)) {
      return queue;
    }
    queue.entries.push(entry);
    await this.writeQueue(queue);
    return queue;
  }

  async remove(taskId: string): Promise<QueueFile> {
    const queue = await this.readQueue();
    queue.entries = queue.entries.filter((e) => e.taskId !== taskId);
    await this.writeQueue(queue);
    return queue;
  }

  pickNext(queue: QueueFile, policy: "fifo" | "priority"): QueueEntry | null {
    if (queue.entries.length === 0) return null;
    if (policy === "fifo") return queue.entries[0]!;
    // priority: highest first; FIFO within same priority.
    const sorted = [...queue.entries].sort((a, b) => {
      const pa = PRIORITY_RANK[a.priority];
      const pb = PRIORITY_RANK[b.priority];
      if (pa !== pb) return pa - pb;
      return a.enqueuedAt.localeCompare(b.enqueuedAt);
    });
    return sorted[0]!;
  }
}
