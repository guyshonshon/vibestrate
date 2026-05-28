import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { RoadmapService } from "../src/roadmap/roadmap-service.js";
import { RunQueue } from "../src/scheduler/run-queue.js";
import { runSchedulerLoop } from "../src/scheduler/scheduler-service.js";
import { nowIso } from "../src/utils/time.js";

async function tempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-sched-dep-"));
}

describe("scheduler dependency handling", () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await tempProject();
  });

  it("does not run a task whose dependency is still open; runs after dep is done", async () => {
    const svc = new RoadmapService(projectRoot);
    await svc.init();
    const a = await svc.addTask({ title: "A", touchedFiles: ["a.ts"] });
    const b = await svc.addTask({
      title: "B",
      touchedFiles: ["b.ts"],
      dependencies: [a.id],
    });
    const queue = new RunQueue(projectRoot);
    // Queue B FIRST so the scheduler is forced to skip it; only when A is done
    // (we mark it manually) should B start.
    await queue.enqueue({ taskId: b.id, enqueuedAt: nowIso(), priority: "medium", source: "user" });

    const ranIds: string[] = [];
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
      idlePollMs: 30,
      exitWhenDrained: false, // we'll stop manually
      runTask: async (task) => {
        ranIds.push(task.id);
        await new Promise((r) => setTimeout(r, 50));
        return { exitCode: 0 };
      },
    });

    // Give the loop some time; it should NOT pick up B because A is open.
    await new Promise((r) => setTimeout(r, 400));
    expect(ranIds).toEqual([]);

    // Mark A as done so B becomes ready.
    await svc.updateTaskStatus(a.id, "done");

    // Wait long enough for the loop to notice + run B.
    await new Promise((r) => setTimeout(r, 800));
    await handle.stop();

    expect(ranIds).toContain(b.id);
  });
});
