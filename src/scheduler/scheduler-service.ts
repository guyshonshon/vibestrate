import { spawn, type ChildProcess } from "node:child_process";
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
import { pickNextEntry } from "./picker.js";

export type SchedulerLogger = (line: string) => void;

export type StartSchedulerInput = {
  projectRoot: string;
  schedulerConfig: SchedulerConfig;
  log?: SchedulerLogger;
  /**
   * Override how a task run is launched. Default: spawn `vibe run --task <id> "<title>"`
   * as a child process. Tests inject a synchronous local runner.
   */
  runTask?: (
    task: Task,
    context: { signal: AbortSignal },
  ) => Promise<{ exitCode: number }>;
  /** Stop the loop after the queue is fully drained instead of polling forever. */
  exitWhenDrained?: boolean;
  /** Polling interval when the loop has nothing to do. */
  idlePollMs?: number;
};

type SchedulerRunTask = NonNullable<StartSchedulerInput["runTask"]>;

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

function terminateChildProcess(child: ChildProcess): void {
  const pid = child.pid;
  if (!pid) return;
  try {
    if (process.platform !== "win32") process.kill(-pid, "SIGTERM");
    else child.kill("SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }
  const timer = setTimeout(() => {
    try {
      if (process.platform !== "win32") process.kill(-pid, "SIGKILL");
      else child.kill("SIGKILL");
    } catch {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    }
  }, 3000);
  timer.unref?.();
}

function defaultRunTask(
  projectRoot: string,
): SchedulerRunTask {
  return async (task, context) => {
    return new Promise((resolve) => {
      const args = [
        "run",
        task.title,
        "--task",
        task.id,
      ];
      // Resolve the vibestrate entry point. Prefer dist next to this file (bundled),
      // fall back to dist resolved from source layout.
      const candidate = [DEFAULT_BIN.distInDist, DEFAULT_BIN.distFromSource].find(
        (p) => fs.existsSync(p),
      );
      const child = candidate
        ? spawn(process.execPath, [candidate, ...args], {
            cwd: projectRoot,
            stdio: "inherit",
            env: { ...process.env, VIBESTRATE_SCHEDULED: "1" },
            detached: process.platform !== "win32",
          })
        : spawn("vibe", args, {
            cwd: projectRoot,
            stdio: "inherit",
            env: { ...process.env, VIBESTRATE_SCHEDULED: "1" },
            detached: process.platform !== "win32",
          });
      const abort = (): void => terminateChildProcess(child);
      if (context.signal.aborted) abort();
      else context.signal.addEventListener("abort", abort, { once: true });
      child.on("exit", (code, signal) => {
        context.signal.removeEventListener("abort", abort);
        resolve({ exitCode: code ?? (signal ? 130 : -1) });
      });
      child.on("error", () => {
        context.signal.removeEventListener("abort", abort);
        resolve({ exitCode: -1 });
      });
    });
  };
}

/**
 * Run the local scheduler loop. Bound to this process: when this function
 * returns or the process exits, no scheduling happens. The queue and conflict
 * warnings remain on disk and another `vibe queue run` picks up where this
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
    sourceQuotas: cfg.sourceQuotas,
    defaultSourceConcurrency: cfg.defaultSourceConcurrency,
  });

  const runTask = input.runTask ?? defaultRunTask(input.projectRoot);
  const idlePollMs = input.idlePollMs ?? 1000;

  let stopRequested = false;
  let lastHeartbeatAt = Date.now();
  const runAbort = new AbortController();
  // Tracks the source for each in-flight task so the picker can apply
  // per-source quotas without re-reading the queue file.
  const inflight = new Map<string, { promise: Promise<void>; source: string }>();

  async function heartbeat(force = false): Promise<void> {
    const now = Date.now();
    if (!force && now - lastHeartbeatAt < 1000) return;
    const state = await queue.readState();
    await queue.writeState(state);
    lastHeartbeatAt = now;
  }

  async function sleepWithHeartbeat(ms: number): Promise<void> {
    const deadline = Date.now() + ms;
    while (!stopRequested) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      await new Promise((r) => setTimeout(r, Math.min(remaining, 1000)));
      await heartbeat();
    }
  }

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

    // Walk the queue (in policy order) and pick the first entry that
    // is dependency-ready AND respects its source quota. Blocked
    // entries stay queued and are reconsidered on the next tick —
    // this is what makes "queue B before A" work: we skip B and try A
    // next.
    const allTasks = await roadmap.listTasks();
    const graph = buildDependencyGraph(allTasks);

    // Drop any queued entries whose underlying task disappeared.
    for (const e of queueFile.entries) {
      const t = await roadmap.getTask(e.taskId);
      if (!t) {
        log(`[scheduler] queued task "${e.taskId}" not found; removing from queue.`);
        await queue.remove(e.taskId);
        return { launched: false, idle: false };
      }
    }

    const inflightSources = [...inflight.values()].map((v) => v.source);
    const verdict = pickNextEntry({
      queue: queueFile.entries,
      inflightSources,
      config: {
        queuePolicy: cfg.queuePolicy,
        maxConcurrentRuns: cfg.maxConcurrentRuns,
        sourceQuotas: cfg.sourceQuotas,
        defaultSourceConcurrency: cfg.defaultSourceConcurrency,
      },
      isEligible: (e) => isReady(graph, e.taskId),
    });
    if (verdict.kind === "empty") return { launched: false, idle: true };
    if (verdict.kind === "at-capacity") {
      return { launched: false, idle: false };
    }
    if (verdict.kind === "all-blocked") {
      for (const r of verdict.reasons) {
        if (r.reason === "deps") {
          const reason = explainBlock(graph, r.taskId);
          const human = [
            ...reason.blockedByOpenTaskIds.map(
              (id2) => `${id2} (${graph.taskById.get(id2)?.status ?? "?"})`,
            ),
            ...reason.blockedByMissing.map((id2) => `${id2} (missing)`),
          ];
          log(
            `[scheduler] task ${r.taskId} blocked by dependency: ${human.join(", ")}`,
          );
        } else {
          log(
            `[scheduler] task ${r.taskId} held: source quota exhausted.`,
          );
        }
      }
      return { launched: false, idle: true };
    }

    const candidateEntry = verdict.entry;
    const candidate = await roadmap.getTask(candidateEntry.taskId);
    if (!candidate) {
      // Should not happen — we filtered missing tasks above.
      await queue.remove(candidateEntry.taskId);
      return { launched: false, idle: false };
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
        const result = await runTask(candidate, { signal: runAbort.signal });
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
    inflight.set(candidate.id, { promise, source: candidateEntry.source });
    return { launched: true, idle: false };
  }

  const finished = (async () => {
    while (!stopRequested) {
      const { launched, idle } = await tick();
      await heartbeat();
      if (!launched && idle) {
        if (input.exitWhenDrained && inflight.size === 0) {
          // Re-check: someone might have added work between idle detection and now.
          const q = await queue.readQueue();
          if (q.entries.length === 0) break;
        }
        await sleepWithHeartbeat(idlePollMs);
      } else if (!launched) {
        // Loop was at capacity — wait briefly to free a slot.
        await sleepWithHeartbeat(200);
      }
    }
    // Drain in-flight before returning.
    await Promise.all([...inflight.values()].map((v) => v.promise));
    if (completedThisLoop.length > 0) {
      notify(draftQueueDrained({ completedTaskIds: completedThisLoop.slice() }));
    }
    const s = await queue.readState();
    await queue.writeState({ ...s, runningTaskIds: [] });
    await heartbeat(true);
  })();

  return {
    stop: async () => {
      stopRequested = true;
      runAbort.abort();
      await finished;
    },
    finished,
  };
}
