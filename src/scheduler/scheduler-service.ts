import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import { RoadmapService } from "../roadmap/roadmap-service.js";
import { RunQueue } from "./run-queue.js";
import { ConflictsStore, detectConflicts } from "./conflict-detector.js";
import type { SchedulerConfig } from "../project/config-schema.js";
import type { Task } from "../roadmap/roadmap-types.js";
import {
  buildDependencyGraph,
  explainBlock,
  isReady,
} from "../roadmap/dependency-graph.js";
import { NotificationService } from "../notifications/notification-service.js";
import {
  draftQueueDrained,
  draftSchedulerConflict,
} from "../notifications/notification-router.js";
import { nowIso } from "../utils/time.js";
import type { QueueEntry } from "./scheduler-types.js";

const PRIORITY_RANK: Record<"low" | "medium" | "high", number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function orderQueue(
  entries: QueueEntry[],
  policy: "fifo" | "priority",
): QueueEntry[] {
  if (policy === "fifo") return entries;
  return [...entries].sort((a, b) => {
    const pa = PRIORITY_RANK[a.priority];
    const pb = PRIORITY_RANK[b.priority];
    if (pa !== pb) return pa - pb;
    return a.enqueuedAt.localeCompare(b.enqueuedAt);
  });
}

export type SchedulerLogger = (line: string) => void;

export type StartSchedulerInput = {
  projectRoot: string;
  schedulerConfig: SchedulerConfig;
  log?: SchedulerLogger;
  /**
   * Override how a task run is launched. Default: spawn `amaco run --task <id> "<title>"`
   * as a child process. Tests inject a synchronous local runner.
   */
  runTask?: (task: Task) => Promise<{ exitCode: number }>;
  /** Stop the loop after the queue is fully drained instead of polling forever. */
  exitWhenDrained?: boolean;
  /** Polling interval when the loop has nothing to do. */
  idlePollMs?: number;
};

export type SchedulerHandle = {
  stop: () => Promise<void>;
  finished: Promise<void>;
};

const DEFAULT_BIN = (() => {
  // dist/index.js sits beside the dist/ui folder. From this file:
  // - source: src/scheduler/scheduler-service.ts → dist/index.js is two levels up + dist/.
  // - bundled: dist/index.js is the file being imported, so import.meta.url already in dist/.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const distInDist = path.resolve(here, "index.js");
  const distFromSource = path.resolve(here, "..", "..", "dist", "index.js");
  return { distInDist, distFromSource };
})();

function defaultRunTask(projectRoot: string): (task: Task) => Promise<{ exitCode: number }> {
  return async (task) => {
    return new Promise((resolve) => {
      const args = [
        "run",
        task.title,
        "--task",
        task.id,
      ];
      // Resolve the amaco entry point. Prefer dist next to this file (bundled),
      // fall back to dist resolved from source layout.
      const candidate = [DEFAULT_BIN.distInDist, DEFAULT_BIN.distFromSource].find(
        (p) => fs.existsSync(p),
      );
      const child = candidate
        ? spawn(process.execPath, [candidate, ...args], {
            cwd: projectRoot,
            stdio: "inherit",
            env: { ...process.env, AMACO_SCHEDULED: "1" },
          })
        : spawn("amaco", args, {
            cwd: projectRoot,
            stdio: "inherit",
            env: { ...process.env, AMACO_SCHEDULED: "1" },
          });
      child.on("exit", (code) => resolve({ exitCode: code ?? -1 }));
      child.on("error", () => resolve({ exitCode: -1 }));
    });
  };
}

/**
 * Run the local scheduler loop. Bound to this process: when this function
 * returns or the process exits, no scheduling happens. The queue and conflict
 * warnings remain on disk and another `amaco queue run` picks up where this
 * left off.
 */
export async function runSchedulerLoop(input: StartSchedulerInput): Promise<SchedulerHandle> {
  const log: SchedulerLogger = input.log ?? ((line) => console.log(line));
  const roadmap = new RoadmapService(input.projectRoot);
  const queue = new RunQueue(input.projectRoot);
  const conflicts = new ConflictsStore(input.projectRoot);
  const notifications = new NotificationService(input.projectRoot);
  const notify = (
    draft: import("../notifications/notification-router.js").NotificationDraft,
  ): void => {
    void notifications.notify(draft).catch(() => {});
  };
  const cfg = input.schedulerConfig;
  const completedThisLoop: string[] = [];

  await queue.writeState({
    paused: false,
    runningTaskIds: [],
    lastUpdatedAt: nowIso(),
    maxConcurrentRuns: cfg.maxConcurrentRuns,
    conflictPolicy: cfg.conflictPolicy,
    queuePolicy: cfg.queuePolicy,
  });

  const runTask = input.runTask ?? defaultRunTask(input.projectRoot);
  const idlePollMs = input.idlePollMs ?? 1000;

  let stopRequested = false;
  const inflight = new Map<string, Promise<void>>();

  async function tick(): Promise<{ launched: boolean; idle: boolean }> {
    const state = await queue.readState();
    if (state.paused) return { launched: false, idle: true };
    if (inflight.size >= cfg.maxConcurrentRuns) {
      return { launched: false, idle: false };
    }
    const queueFile = await queue.readQueue();
    if (queueFile.entries.length === 0) {
      return { launched: false, idle: true };
    }

    // Walk the queue (in policy order) and pick the first entry whose
    // dependencies are all satisfied. Blocked entries stay queued and are
    // reconsidered on the next tick — this is what makes "queue B before A"
    // work: we skip B and try A next.
    const allTasks = await roadmap.listTasks();
    const graph = buildDependencyGraph(allTasks);
    const orderedIds = orderQueue(queueFile.entries.slice(), cfg.queuePolicy).map(
      (e) => e.taskId,
    );
    let candidate: typeof allTasks[number] | null = null;
    let everyEntryBlocked = true;
    for (const id of orderedIds) {
      const t = await roadmap.getTask(id);
      if (!t) {
        log(`[scheduler] queued task "${id}" not found; removing from queue.`);
        await queue.remove(id);
        return { launched: false, idle: false };
      }
      if (!isReady(graph, t.id)) {
        const reason = explainBlock(graph, t.id);
        const human = [
          ...reason.blockedByOpenTaskIds.map(
            (id2) => `${id2} (${graph.taskById.get(id2)?.status ?? "?"})`,
          ),
          ...reason.blockedByMissing.map((id2) => `${id2} (missing)`),
        ];
        log(
          `[scheduler] task ${t.id} blocked by dependency: ${human.join(", ")}`,
        );
        continue;
      }
      candidate = t;
      everyEntryBlocked = false;
      break;
    }
    if (!candidate) {
      // Every queued task is blocked on a dependency. Stay idle and let the
      // next loop tick re-check (the user may mark a dep done, or another
      // task may finish via concurrent runs).
      return { launched: false, idle: everyEntryBlocked };
    }

    // Conflict detection against currently-running tasks.
    const runningTasks = allTasks.filter((t) => inflight.has(t.id));
    const overlap = await detectConflicts({
      candidate,
      runningTasks,
    });
    if (overlap.overlappingFiles.length > 0) {
      const blocked = cfg.conflictPolicy === "block";
      await conflicts.record({
        taskId: candidate.id,
        conflictsWith: overlap.conflictsWith,
        overlappingFiles: overlap.overlappingFiles,
        policy: cfg.conflictPolicy,
        blocked,
      });
      notify(
        draftSchedulerConflict({
          taskId: candidate.id,
          conflictsWith: overlap.conflictsWith,
          blocked,
          overlappingFiles: overlap.overlappingFiles,
        }),
      );
      if (blocked) {
        log(
          `[scheduler] task ${candidate.id} blocked by file overlap with ${overlap.conflictsWith.join(", ")}`,
        );
        await roadmap.updateTaskStatus(candidate.id, "blocked");
        await queue.remove(candidate.id);
        return { launched: false, idle: false };
      }
      log(
        `[scheduler] WARN: task ${candidate.id} starts despite overlap with ${overlap.conflictsWith.join(", ")} on ${overlap.overlappingFiles.length} file(s).`,
      );
    }

    // Launch.
    await queue.remove(candidate.id);
    await roadmap.updateTaskStatus(candidate.id, "running");
    const stateNow = await queue.readState();
    await queue.writeState({
      ...stateNow,
      runningTaskIds: [...new Set([...stateNow.runningTaskIds, candidate.id])],
    });
    log(`[scheduler] starting task ${candidate.id}: ${candidate.title}`);

    const promise = (async () => {
      try {
        const result = await runTask(candidate);
        const after = await roadmap.getTask(candidate.id);
        // The orchestrator already wrote the task's final status (done / blocked /
        // failed). If for some reason it didn't, mirror the exit code.
        if (after && after.status === "running") {
          await roadmap.updateTaskStatus(
            candidate.id,
            result.exitCode === 0 ? "done" : "failed",
          );
        }
      } catch (err) {
        log(
          `[scheduler] task ${candidate.id} failed to launch: ${err instanceof Error ? err.message : String(err)}`,
        );
        await roadmap.updateTaskStatus(candidate.id, "failed");
      } finally {
        inflight.delete(candidate.id);
        const s = await queue.readState();
        await queue.writeState({
          ...s,
          runningTaskIds: s.runningTaskIds.filter((id) => id !== candidate.id),
        });
        completedThisLoop.push(candidate.id);
      }
    })();
    inflight.set(candidate.id, promise);
    return { launched: true, idle: false };
  }

  const finished = (async () => {
    while (!stopRequested) {
      const { launched, idle } = await tick();
      if (!launched && idle) {
        if (input.exitWhenDrained && inflight.size === 0) {
          // Re-check: someone might have added work between idle detection and now.
          const q = await queue.readQueue();
          if (q.entries.length === 0) break;
        }
        await new Promise((r) => setTimeout(r, idlePollMs));
      } else if (!launched) {
        // Loop was at capacity — wait briefly to free a slot.
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    // Drain in-flight before returning.
    await Promise.all(inflight.values());
    if (completedThisLoop.length > 0) {
      notify(draftQueueDrained({ completedTaskIds: completedThisLoop.slice() }));
    }
    const s = await queue.readState();
    await queue.writeState({ ...s, runningTaskIds: [] });
  })();

  return {
    stop: async () => {
      stopRequested = true;
      await finished;
    },
    finished,
  };
}
