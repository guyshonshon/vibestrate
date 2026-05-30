import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { RoadmapService } from "../src/roadmap/roadmap-service.js";

async function tempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-promote-"));
}

describe("RoadmapService — promote checklist item to card", () => {
  let dir: string;
  let svc: RoadmapService;
  beforeEach(async () => {
    dir = await tempProject();
    svc = new RoadmapService(dir);
    await svc.init();
  });

  it("creates a derived card and links both directions (relation, not move)", async () => {
    const t = await svc.addTask({ title: "Parent card" });
    const { item } = await svc.addChecklistItem(t.id, "build the widget");
    const { task, card } = await svc.promoteChecklistItem(t.id, item.id);

    // New card carries the back-pointer + the item text as its title.
    expect(card.title).toBe("build the widget");
    expect(card.derivedFrom).toEqual({ taskId: t.id, itemId: item.id });
    // Origin item keeps its place AND gains the forward-pointer.
    expect(task.checklist).toHaveLength(1);
    expect(task.checklist[0]!.promotedTaskId).toBe(card.id);
    // Persisted both ways.
    const reloadedCard = await svc.getTask(card.id);
    expect(reloadedCard!.derivedFrom!.taskId).toBe(t.id);
  });

  it("inherits the parent's roadmap item so it stays under the same epic", async () => {
    const rm = await svc.addRoadmapItem({ title: "Epic" });
    const t = await svc.addTask({ title: "Parent", roadmapItemId: rm.id });
    const { item } = await svc.addChecklistItem(t.id, "sub-thing");
    const { card } = await svc.promoteChecklistItem(t.id, item.id);
    expect(card.roadmapItemId).toBe(rm.id);
  });

  it("refuses to promote a missing item or a missing task", async () => {
    const t = await svc.addTask({ title: "x" });
    await expect(svc.promoteChecklistItem(t.id, "ci-ghost")).rejects.toThrow();
    await expect(
      svc.promoteChecklistItem("task-ghost", "ci-x"),
    ).rejects.toThrow();
  });

  it("refuses to double-promote while the derived card still exists", async () => {
    const t = await svc.addTask({ title: "x" });
    const { item } = await svc.addChecklistItem(t.id, "thing");
    await svc.promoteChecklistItem(t.id, item.id);
    await expect(svc.promoteChecklistItem(t.id, item.id)).rejects.toThrow(
      /already promoted/,
    );
  });

  it("allows re-promotion after the derived card was deleted", async () => {
    const t = await svc.addTask({ title: "x" });
    const { item } = await svc.addChecklistItem(t.id, "thing");
    const { card } = await svc.promoteChecklistItem(t.id, item.id);
    await svc.deleteTask(card.id);
    // The delete cleared the origin item's forward-pointer…
    const afterDelete = await svc.getTask(t.id);
    expect(afterDelete!.checklist[0]!.promotedTaskId).toBeNull();
    // …so a fresh promotion succeeds and creates a new card.
    const { card: card2 } = await svc.promoteChecklistItem(t.id, item.id);
    expect(card2.id).not.toBe(card.id);
  });

  it("does not remove the item from the origin checklist", async () => {
    const t = await svc.addTask({ title: "x" });
    const a = (await svc.addChecklistItem(t.id, "a")).item;
    const b = (await svc.addChecklistItem(t.id, "b")).item;
    await svc.promoteChecklistItem(t.id, a.id);
    const reloaded = await svc.getTask(t.id);
    expect(reloaded!.checklist.map((c) => c.id)).toEqual([a.id, b.id]);
  });
});
