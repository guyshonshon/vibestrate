import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import {
  pauseScheduler,
  removeQueueEntry,
  resumeScheduler,
} from "../src/shell/ink/queue/queue-actions.js";
import { RunQueue } from "../src/scheduler/run-queue.js";
import { RoadmapService } from "../src/roadmap/roadmap-service.js";
import { nowIso } from "../src/utils/time.js";

async function tempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-shell-q-"));
}

describe("queue panel actions", () => {
  let root: string;
  beforeEach(async () => {
    root = await tempProject();
    await fs.mkdir(path.join(root, ".vibestrate", "scheduler"), { recursive: true });
  });

  it("pauseScheduler sets paused=true and resumeScheduler clears it", async () => {
    const r1 = await pauseScheduler(root);
    expect(r1.ok).toBe(true);
    const state1 = await new RunQueue(root).readState();
    expect(state1.paused).toBe(true);

    const r2 = await resumeScheduler(root);
    expect(r2.ok).toBe(true);
    const state2 = await new RunQueue(root).readState();
    expect(state2.paused).toBe(false);
  });

  it("removeQueueEntry takes the task out of the queue and flips status back to ready", async () => {
    const svc = new RoadmapService(root);
    await svc.init();
    const t = await svc.addTask({ title: "x" });
    await svc.updateTaskStatus(t.id, "queued");
    const queue = new RunQueue(root);
    await queue.enqueue({
      taskId: t.id,
      enqueuedAt: nowIso(),
      priority: "medium",
      source: "user",
    });

    const r = await removeQueueEntry(root, t.id);
    expect(r.ok).toBe(true);
    const q = await queue.readQueue();
    expect(q.entries.map((e) => e.taskId)).not.toContain(t.id);
    const after = await svc.getTask(t.id);
    expect(after?.status).toBe("ready");
  });

  it("removeQueueEntry is idempotent for a missing task id", async () => {
    const r = await removeQueueEntry(root, "no-such-task");
    expect(r.ok).toBe(true);
  });
});
