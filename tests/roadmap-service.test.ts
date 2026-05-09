import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { RoadmapService } from "../src/roadmap/roadmap-service.js";

async function tempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "amaco-rm-"));
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
      branchName: "amaco/r1",
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
});
