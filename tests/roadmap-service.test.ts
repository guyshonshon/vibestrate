import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { RoadmapService } from "../src/roadmap/roadmap-service.js";

async function tempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-rm-"));
}

describe("RoadmapService", () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await tempProject();
  });

  it("addRoadmapItem persists and lists", async () => {
    const svc = new RoadmapService(projectRoot);
    await svc.init();
    const item = await svc.addRoadmapItem({
      title: "Build onboarding",
      description: "First-run UX",
    });
    expect(item.id).toMatch(/^rm-/);
    const list = await svc.listRoadmapItems();
    expect(list).toHaveLength(1);
    expect(list[0]!.title).toBe("Build onboarding");
  });

  it("addTask requires existing roadmap item id when provided", async () => {
    const svc = new RoadmapService(projectRoot);
    await svc.init();
    await expect(
      svc.addTask({ title: "x", roadmapItemId: "ghost" }),
    ).rejects.toThrow();
  });

  it("addTask wires linkedTaskIds on the parent roadmap item", async () => {
    const svc = new RoadmapService(projectRoot);
    await svc.init();
    const parent = await svc.addRoadmapItem({ title: "Parent" });
    const t = await svc.addTask({
      title: "Child",
      roadmapItemId: parent.id,
    });
    const reloaded = await svc.getRoadmapItem(parent.id);
    expect(reloaded?.linkedTaskIds).toContain(t.id);
  });

  it("comments add/resolve flow updates open count on the task", async () => {
    const svc = new RoadmapService(projectRoot);
    await svc.init();
    const t = await svc.addTask({ title: "x" });
    const c1 = await svc.addComment(t.id, { body: "hello" });
    await svc.addComment(t.id, { body: "world" });
    const after = await svc.getTask(t.id);
    expect(after?.commentsCount).toBe(2);
    await svc.resolveComment(t.id, c1.id);
    const final = await svc.getTask(t.id);
    expect(final?.commentsCount).toBe(1);
  });

  it("path-safe ids are enforced (rejects ..)", async () => {
    const svc = new RoadmapService(projectRoot);
    await svc.init();
    await expect(svc.getTask("../etc/passwd")).rejects.toThrow();
    await expect(svc.getTask("..")).rejects.toThrow();
  });

  it("setTaskRun + clearTaskCurrentRun mirror the run lifecycle", async () => {
    const svc = new RoadmapService(projectRoot);
    await svc.init();
    const t = await svc.addTask({ title: "x" });
    const after = await svc.setTaskRun({
      taskId: t.id,
      runId: "20260509-r1",
      branchName: "vibestrate/r1",
      worktreePath: "/tmp/wt",
      status: "running",
    });
    expect(after.runIds).toContain("20260509-r1");
    expect(after.currentRunId).toBe("20260509-r1");
    expect(after.status).toBe("running");

    const cleared = await svc.clearTaskCurrentRun(t.id, "done");
    expect(cleared.currentRunId).toBeNull();
    expect(cleared.status).toBe("done");
    // run id is preserved in history.
    expect(cleared.runIds).toContain("20260509-r1");
  });

  it("deleteTask removes the task when not linked to an active run", async () => {
    const svc = new RoadmapService(projectRoot);
    await svc.init();
    const t = await svc.addTask({ title: "drop me" });
    await svc.deleteTask(t.id);
    expect(await svc.getTask(t.id)).toBeNull();
  });

  it("deleteTask refuses to remove a task currently linked to a run", async () => {
    const svc = new RoadmapService(projectRoot);
    await svc.init();
    const t = await svc.addTask({ title: "linked" });
    await svc.setTaskRun({ taskId: t.id, runId: "run-1" });
    await expect(svc.deleteTask(t.id)).rejects.toThrow(/active run/);
  });

  // The currentRunId guard alone is a near-no-op: during a live run the
  // scheduler sets status="running" but currentRunId stays null (it's only
  // set at run completion). These cover the real liveness signals.
  it.each(["queued", "running", "waiting_for_approval"] as const)(
    "deleteTask refuses to remove a %s task (real in-flight signal)",
    async (status) => {
      const svc = new RoadmapService(projectRoot);
      await svc.init();
      const t = await svc.addTask({ title: "busy" });
      await svc.updateTaskStatus(t.id, status);
      await expect(svc.deleteTask(t.id)).rejects.toThrow(/terminate|cancel/i);
      expect(await svc.getTask(t.id)).not.toBeNull();
    },
  );

  it("deleteTask refuses when an associated run-state file is non-terminal", async () => {
    const { RunStateStore, createInitialState } = await import(
      "../src/core/state-machine.js"
    );
    const svc = new RoadmapService(projectRoot);
    await svc.init();
    const t = await svc.addTask({ title: "leaked run" });
    // Associate a run, then clear currentRunId (leaves runIds + a done status)
    // - simulating a run that finished on the card but leaked a live state file.
    await svc.setTaskRun({ taskId: t.id, runId: "run-live" });
    await svc.clearTaskCurrentRun(t.id, "done");
    const store = new RunStateStore(projectRoot, "run-live");
    await store.write(
      createInitialState({
        runId: "run-live",
        task: "leaked run",
        projectRoot,
        worktreePath: null,
        branchName: null,
        maxReviewLoops: 1,
      }),
    ); // status "created" = non-terminal
    await expect(svc.deleteTask(t.id)).rejects.toThrow(/live run/i);
  });

  it("deleteTask refuses a task sitting in the scheduler queue", async () => {
    const { RunQueue } = await import("../src/scheduler/run-queue.js");
    const svc = new RoadmapService(projectRoot);
    await svc.init();
    const t = await svc.addTask({ title: "queued elsewhere" });
    // Leave the card status idle but enqueue it directly (scheduler-owned state).
    await new RunQueue(projectRoot).enqueue({
      taskId: t.id,
      priority: "medium",
      enqueuedAt: new Date(0).toISOString(),
      source: "manual",
    });
    await expect(svc.deleteTask(t.id)).rejects.toThrow(/queue/i);
    expect(await svc.getTask(t.id)).not.toBeNull();
  });

  it("deleteTask cleans up comments and the parent roadmap link", async () => {
    const svc = new RoadmapService(projectRoot);
    await svc.init();
    const item = await svc.addRoadmapItem({ title: "epic" });
    const t = await svc.addTask({ title: "child", roadmapItemId: item.id });
    await svc.addComment(t.id, { body: "a note" });
    // Pre-conditions: link + comment exist.
    expect((await svc.getRoadmapItem(item.id))!.linkedTaskIds).toContain(t.id);
    expect(await svc.store.listComments(t.id)).toHaveLength(1);

    const deleted = await svc.deleteTask(t.id);

    expect(deleted.id).toBe(t.id);
    expect(await svc.getTask(t.id)).toBeNull();
    expect(await svc.store.listComments(t.id)).toHaveLength(0);
    expect((await svc.getRoadmapItem(item.id))!.linkedTaskIds).not.toContain(
      t.id,
    );
  });
});
