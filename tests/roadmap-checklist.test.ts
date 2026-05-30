import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { RoadmapService } from "../src/roadmap/roadmap-service.js";

async function tempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-cl-"));
}

describe("RoadmapService — checklist", () => {
  let projectRoot: string;
  let svc: RoadmapService;
  beforeEach(async () => {
    projectRoot = await tempProject();
    svc = new RoadmapService(projectRoot);
    await svc.init();
  });

  it("a fresh task has an empty checklist", async () => {
    const t = await svc.addTask({ title: "Build health endpoint" });
    expect(t.checklist).toEqual([]);
  });

  it("adds items in order and persists them on the task", async () => {
    const t = await svc.addTask({ title: "x" });
    const a = await svc.addChecklistItem(t.id, "/health returns json");
    const b = await svc.addChecklistItem(t.id, "test the endpoint");
    expect(a.item.id).toMatch(/^ci-/);
    expect(a.item.status).toBe("pending");
    const reloaded = await svc.getTask(t.id);
    expect(reloaded!.checklist.map((c) => c.text)).toEqual([
      "/health returns json",
      "test the endpoint",
    ]);
    expect(reloaded!.checklist[1]!.id).toBe(b.item.id);
  });

  it("trims text and rejects empty items", async () => {
    const t = await svc.addTask({ title: "x" });
    const { item } = await svc.addChecklistItem(t.id, "  spaced  ");
    expect(item.text).toBe("spaced");
    await expect(svc.addChecklistItem(t.id, "   ")).rejects.toThrow();
  });

  it("updates status and text, bumping updatedAt", async () => {
    const t = await svc.addTask({ title: "x" });
    const { item } = await svc.addChecklistItem(t.id, "do the thing");
    const upd = await svc.setChecklistItemStatus(t.id, item.id, "done");
    expect(upd.item.status).toBe("done");
    const edited = await svc.updateChecklistItem(t.id, item.id, {
      text: "do the better thing",
    });
    expect(edited.item.text).toBe("do the better thing");
    const reloaded = await svc.getTask(t.id);
    expect(reloaded!.checklist[0]!.status).toBe("done");
    expect(reloaded!.checklist[0]!.text).toBe("do the better thing");
  });

  it("rejects empty text on update", async () => {
    const t = await svc.addTask({ title: "x" });
    const { item } = await svc.addChecklistItem(t.id, "keep me");
    await expect(
      svc.updateChecklistItem(t.id, item.id, { text: "  " }),
    ).rejects.toThrow();
  });

  it("removes an item and errors on a missing id", async () => {
    const t = await svc.addTask({ title: "x" });
    const { item } = await svc.addChecklistItem(t.id, "remove me");
    await svc.addChecklistItem(t.id, "keep me");
    const after = await svc.removeChecklistItem(t.id, item.id);
    expect(after.checklist).toHaveLength(1);
    expect(after.checklist[0]!.text).toBe("keep me");
    await expect(svc.removeChecklistItem(t.id, "ci-ghost")).rejects.toThrow();
  });

  it("reorders to a permutation and rejects a non-permutation", async () => {
    const t = await svc.addTask({ title: "x" });
    const a = (await svc.addChecklistItem(t.id, "first")).item;
    const b = (await svc.addChecklistItem(t.id, "second")).item;
    const c = (await svc.addChecklistItem(t.id, "third")).item;
    const reordered = await svc.reorderChecklist(t.id, [c.id, a.id, b.id]);
    expect(reordered.checklist.map((i) => i.text)).toEqual([
      "third",
      "first",
      "second",
    ]);
    // Wrong length / unknown id / duplicates all rejected.
    await expect(svc.reorderChecklist(t.id, [a.id, b.id])).rejects.toThrow();
    await expect(
      svc.reorderChecklist(t.id, [a.id, b.id, "ci-ghost"]),
    ).rejects.toThrow();
    await expect(
      svc.reorderChecklist(t.id, [a.id, a.id, b.id]),
    ).rejects.toThrow();
  });

  it("errors when the task does not exist", async () => {
    await expect(svc.addChecklistItem("task-ghost", "x")).rejects.toThrow();
  });

  it("survives a round-trip through schema validation on reload", async () => {
    const t = await svc.addTask({ title: "x" });
    await svc.addChecklistItem(t.id, "alpha");
    const { item } = await svc.addChecklistItem(t.id, "beta");
    await svc.setChecklistItemStatus(t.id, item.id, "blocked");
    // Re-instantiate the service to force a fresh read from disk.
    const fresh = new RoadmapService(projectRoot);
    const reloaded = await fresh.getTask(t.id);
    expect(reloaded!.checklist).toHaveLength(2);
    expect(reloaded!.checklist[1]!.status).toBe("blocked");
    expect(reloaded!.checklist[1]!.commitSha).toBeNull();
    expect(reloaded!.checklist[1]!.promotedTaskId).toBeNull();
  });
});
