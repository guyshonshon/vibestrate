import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { RoadmapService } from "../src/roadmap/roadmap-service.js";
import { RunQueue } from "../src/scheduler/run-queue.js";
import {
  runSchedulerLoop,
  schedulerRunArgs,
} from "../src/scheduler/scheduler-service.js";
import { acquireTaskLock } from "../src/core/run-lock.js";
import { nowIso } from "../src/utils/time.js";

describe("scheduler saga launch", () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-sched-saga-")),
    );
  });

  it("sequences a saga task via `vibe saga sequence`, runs a plain task via `vibe run`", () => {
    expect(
      schedulerRunArgs({ id: "task-x", title: "Build it", kind: "saga" }),
    ).toEqual(["saga", "sequence", "task-x"]);
    expect(
      schedulerRunArgs({ id: "task-y", title: "Fix it", kind: "single" }),
    ).toEqual(["run", "Fix it", "--task", "task-y"]);
  });

  it("does NOT mark a task failed when its launch was rejected by a live run lock", async () => {
    const svc = new RoadmapService(projectRoot);
    await svc.init();
    const task = await svc.addTask({ title: "Locked saga", kind: "saga" });
    const queue = new RunQueue(projectRoot);
    await queue.enqueue({ taskId: task.id, enqueuedAt: nowIso(), priority: "medium", source: "user" });

    // Another run already holds the task lock (live: this test's pid).
    await acquireTaskLock(projectRoot, task.id, "other-live-run");

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
      // The spawned child would hit TaskLockedError and exit 1 WITHOUT running.
      runTask: async () => ({ exitCode: 1 }),
    });
    await handle.finished;

    // The live run owns the task; the scheduler must not mislabel it "failed".
    expect((await svc.getTask(task.id))?.status).not.toBe("failed");
  });

  it("DOES mark a task failed when the launch fails with no live lock holder", async () => {
    const svc = new RoadmapService(projectRoot);
    await svc.init();
    const task = await svc.addTask({ title: "Genuinely failing", kind: "single" });
    const queue = new RunQueue(projectRoot);
    await queue.enqueue({ taskId: task.id, enqueuedAt: nowIso(), priority: "medium", source: "user" });

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
      runTask: async () => ({ exitCode: 1 }),
    });
    await handle.finished;

    expect((await svc.getTask(task.id))?.status).toBe("failed");
  });
});
