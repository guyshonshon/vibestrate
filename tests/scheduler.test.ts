import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { RoadmapService } from "../src/roadmap/roadmap-service.js";
import { RunQueue } from "../src/scheduler/run-queue.js";
import {
  ConflictsStore,
  detectConflicts,
} from "../src/scheduler/conflict-detector.js";
import { runSchedulerLoop } from "../src/scheduler/scheduler-service.js";
import { nowIso } from "../src/utils/time.js";

async function tempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-sched-"));
}

describe("RunQueue", () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await tempProject();
  });

  it("enqueue is idempotent (no duplicate task ids)", async () => {
    const q = new RunQueue(projectRoot);
    await q.enqueue({ taskId: "task-aaa", enqueuedAt: nowIso(), priority: "medium", source: "user" });
    await q.enqueue({ taskId: "task-aaa", enqueuedAt: nowIso(), priority: "medium", source: "user" });
    const file = await q.readQueue();
    expect(file.entries).toHaveLength(1);
  });

  it("fifo policy returns the oldest entry first", async () => {
    const q = new RunQueue(projectRoot);
    await q.enqueue({ taskId: "task-aaa", enqueuedAt: "2026-01-01T00:00:00Z", priority: "low", source: "user" });
    await q.enqueue({ taskId: "task-bbb", enqueuedAt: "2026-01-02T00:00:00Z", priority: "high", source: "user" });
    const file = await q.readQueue();
    expect(q.pickNext(file, "fifo")?.taskId).toBe("task-aaa");
  });

  it("priority policy returns highest priority first; FIFO within tie", async () => {
    const q = new RunQueue(projectRoot);
    await q.enqueue({ taskId: "task-low", enqueuedAt: "2026-01-01T00:00:00Z", priority: "low", source: "user" });
    await q.enqueue({ taskId: "task-high1", enqueuedAt: "2026-01-02T00:00:00Z", priority: "high", source: "user" });
    await q.enqueue({ taskId: "task-high2", enqueuedAt: "2026-01-01T00:00:00Z", priority: "high", source: "user" });
    const file = await q.readQueue();
    expect(q.pickNext(file, "priority")?.taskId).toBe("task-high2");
  });

  it("queue persists across instances", async () => {
    await new RunQueue(projectRoot).enqueue({
      taskId: "task-aaa",
      enqueuedAt: nowIso(),
      priority: "medium",
      source: "user",
    });
    const fresh = await new RunQueue(projectRoot).readQueue();
    expect(fresh.entries).toHaveLength(1);
  });
});

describe("conflict detector", () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await tempProject();
  });

  it("returns no overlap when files differ", async () => {
    const svc = new RoadmapService(projectRoot);
    await svc.init();
    const a = await svc.addTask({ title: "A", touchedFiles: ["src/a.ts"] });
    const b = await svc.addTask({ title: "B", touchedFiles: ["src/b.ts"] });
    const r = await detectConflicts({
      candidate: b,
      runningTasks: [a],
    });
    expect(r.overlappingFiles).toEqual([]);
    expect(r.conflictsWith).toEqual([]);
  });

  it("detects overlap on a shared file", async () => {
    const svc = new RoadmapService(projectRoot);
    await svc.init();
    const a = await svc.addTask({
      title: "A",
      touchedFiles: ["src/shared.ts", "src/a.ts"],
    });
    const b = await svc.addTask({
      title: "B",
      touchedFiles: ["src/shared.ts"],
    });
    const r = await detectConflicts({
      candidate: b,
      runningTasks: [a],
    });
    expect(r.overlappingFiles).toEqual(["src/shared.ts"]);
    expect(r.conflictsWith).toEqual([a.id]);
  });

  it("does not consider the candidate against itself", async () => {
    const svc = new RoadmapService(projectRoot);
    await svc.init();
    const a = await svc.addTask({ title: "A", touchedFiles: ["src/a.ts"] });
    const r = await detectConflicts({ candidate: a, runningTasks: [a] });
    expect(r.conflictsWith).toEqual([]);
  });

  it("ConflictsStore records and clears warnings", async () => {
    const store = new ConflictsStore(projectRoot);
    const w = await store.record({
      taskId: "task-a",
      conflictsWith: ["task-b"],
      overlappingFiles: ["src/x.ts"],
      policy: "warn",
      blocked: false,
    });
    expect(w.id).toBeTruthy();
    const file = await store.read();
    expect(file.warnings).toHaveLength(1);
    await store.clearForTask("task-a");
    const after = await store.read();
    expect(after.warnings).toHaveLength(0);
  });
});

describe("scheduler loop", () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await tempProject();
  });

  it("respects FIFO and runs tasks one at a time when maxConcurrentRuns=1", async () => {
    const svc = new RoadmapService(projectRoot);
    await svc.init();
    const a = await svc.addTask({ title: "A", touchedFiles: ["a.ts"] });
    const b = await svc.addTask({ title: "B", touchedFiles: ["b.ts"] });
    const queue = new RunQueue(projectRoot);
    await queue.enqueue({ taskId: a.id, enqueuedAt: "2026-01-01T00:00:00Z", priority: "medium", source: "user" });
    await queue.enqueue({ taskId: b.id, enqueuedAt: "2026-01-02T00:00:00Z", priority: "medium", source: "user" });

    const ranIds: string[] = [];
    const concurrencyObserved: number[] = [];
    let active = 0;

    const handle = await runSchedulerLoop({
      projectRoot,
      schedulerConfig: {
        maxConcurrentRuns: 1,
        maxConcurrentWriteRoles: 1,
        conflictPolicy: "warn",
        queuePolicy: "fifo",
        sourceQuotas: {},
      },
      log: () => {},
      idlePollMs: 50,
      exitWhenDrained: true,
      runTask: async (task) => {
        active += 1;
        concurrencyObserved.push(active);
        ranIds.push(task.id);
        await new Promise((r) => setTimeout(r, 80));
        active -= 1;
        return { exitCode: 0 };
      },
    });
    await handle.finished;

    expect(ranIds).toEqual([a.id, b.id]);
    // Never more than 1 active at a time.
    expect(Math.max(...concurrencyObserved)).toBe(1);
    const queueAfter = await queue.readQueue();
    expect(queueAfter.entries).toEqual([]);
    const aAfter = await svc.getTask(a.id);
    const bAfter = await svc.getTask(b.id);
    expect(aAfter?.status).toBe("done");
    expect(bAfter?.status).toBe("done");
  });

  it("runs two non-overlapping tasks concurrently when maxConcurrentRuns=2", async () => {
    const svc = new RoadmapService(projectRoot);
    await svc.init();
    const a = await svc.addTask({ title: "A", touchedFiles: ["a.ts"] });
    const b = await svc.addTask({ title: "B", touchedFiles: ["b.ts"] });
    const queue = new RunQueue(projectRoot);
    await queue.enqueue({ taskId: a.id, enqueuedAt: nowIso(), priority: "medium", source: "user" });
    await queue.enqueue({ taskId: b.id, enqueuedAt: nowIso(), priority: "medium", source: "user" });

    let active = 0;
    let maxActive = 0;

    const handle = await runSchedulerLoop({
      projectRoot,
      schedulerConfig: {
        maxConcurrentRuns: 2,
        maxConcurrentWriteRoles: 2,
        conflictPolicy: "warn",
        queuePolicy: "fifo",
        sourceQuotas: {},
      },
      log: () => {},
      idlePollMs: 50,
      exitWhenDrained: true,
      runTask: async () => {
        active += 1;
        if (active > maxActive) maxActive = active;
        await new Promise((r) => setTimeout(r, 120));
        active -= 1;
        return { exitCode: 0 };
      },
    });
    await handle.finished;
    expect(maxActive).toBe(2);
  });

  it("signals in-flight tasks when the scheduler is stopped", async () => {
    const svc = new RoadmapService(projectRoot);
    await svc.init();
    const task = await svc.addTask({ title: "Long task", touchedFiles: ["a.ts"] });
    const queue = new RunQueue(projectRoot);
    await queue.enqueue({
      taskId: task.id,
      enqueuedAt: nowIso(),
      priority: "medium",
      source: "user",
    });

    let started = false;
    let aborted = false;
    const handle = await runSchedulerLoop({
      projectRoot,
      schedulerConfig: {
        maxConcurrentRuns: 1,
        maxConcurrentWriteRoles: 1,
        conflictPolicy: "warn",
        queuePolicy: "fifo",
        sourceQuotas: {},
      },
      log: () => {},
      idlePollMs: 20,
      exitWhenDrained: false,
      runTask: async (_task, context) => {
        started = true;
        return new Promise((resolve) => {
          context.signal.addEventListener(
            "abort",
            () => {
              aborted = true;
              resolve({ exitCode: 130 });
            },
            { once: true },
          );
        });
      },
    });

    while (!started) {
      await new Promise((r) => setTimeout(r, 10));
    }
    await handle.stop();

    expect(aborted).toBe(true);
    const state = await queue.readState();
    expect(state.runningTaskIds).toEqual([]);
  });

  it("blocks the second task when conflictPolicy=block and files overlap", async () => {
    const svc = new RoadmapService(projectRoot);
    await svc.init();
    const a = await svc.addTask({ title: "A", touchedFiles: ["src/shared.ts"] });
    const b = await svc.addTask({ title: "B", touchedFiles: ["src/shared.ts"] });
    const queue = new RunQueue(projectRoot);
    await queue.enqueue({ taskId: a.id, enqueuedAt: "2026-01-01T00:00:00Z", priority: "medium", source: "user" });
    await queue.enqueue({ taskId: b.id, enqueuedAt: "2026-01-02T00:00:00Z", priority: "medium", source: "user" });

    const ranIds: string[] = [];
    const handle = await runSchedulerLoop({
      projectRoot,
      schedulerConfig: {
        maxConcurrentRuns: 2,
        maxConcurrentWriteRoles: 2,
        conflictPolicy: "block",
        queuePolicy: "fifo",
        sourceQuotas: {},
      },
      log: () => {},
      idlePollMs: 30,
      exitWhenDrained: true,
      runTask: async (task) => {
        ranIds.push(task.id);
        await new Promise((r) => setTimeout(r, 80));
        return { exitCode: 0 };
      },
    });
    await handle.finished;

    expect(ranIds).toEqual([a.id]); // B never ran because of overlap.
    const bAfter = await svc.getTask(b.id);
    expect(bAfter?.status).toBe("blocked");
    const conflicts = await new ConflictsStore(projectRoot).read();
    expect(conflicts.warnings.some((w) => w.taskId === b.id && w.blocked)).toBe(true);
  });

  it("conflictPolicy=warn allows the second task to start, with a recorded warning", async () => {
    const svc = new RoadmapService(projectRoot);
    await svc.init();
    const a = await svc.addTask({ title: "A", touchedFiles: ["src/shared.ts"] });
    const b = await svc.addTask({ title: "B", touchedFiles: ["src/shared.ts"] });
    const queue = new RunQueue(projectRoot);
    await queue.enqueue({ taskId: a.id, enqueuedAt: "2026-01-01T00:00:00Z", priority: "medium", source: "user" });
    await queue.enqueue({ taskId: b.id, enqueuedAt: "2026-01-02T00:00:00Z", priority: "medium", source: "user" });

    const ranIds: string[] = [];
    const handle = await runSchedulerLoop({
      projectRoot,
      schedulerConfig: {
        maxConcurrentRuns: 2,
        maxConcurrentWriteRoles: 2,
        conflictPolicy: "warn",
        queuePolicy: "fifo",
        sourceQuotas: {},
      },
      log: () => {},
      idlePollMs: 30,
      exitWhenDrained: true,
      runTask: async (task) => {
        ranIds.push(task.id);
        await new Promise((r) => setTimeout(r, 60));
        return { exitCode: 0 };
      },
    });
    await handle.finished;

    expect(ranIds).toContain(a.id);
    expect(ranIds).toContain(b.id);
    const conflicts = await new ConflictsStore(projectRoot).read();
    expect(conflicts.warnings.some((w) => w.taskId === b.id && !w.blocked)).toBe(true);
  });
});
