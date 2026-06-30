import { describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { RoadmapService } from "../src/roadmap/roadmap-service.js";

// Regression coverage for the Phase 3 overlay-staleness fix. A conductor pending
// overlay is computed against the plan as it was; ANY structural checklist edit
// invalidates it, so it must be cleared - otherwise a stale overlay drives a
// later sequence and `reconcileSagaPendingRevision` would silently drop an
// owner-added step (the never-auto-purge invariant).

async function sagaWithOverlay() {
  const dir = await mkdtemp(path.join(tmpdir(), "vibe-enh-ov-"));
  const svc = new RoadmapService(dir);
  await svc.init();
  const task = await svc.addTask({ title: "feature", runMode: "supervised" });
  const { item: a } = await svc.addChecklistItem(task.id, "step a");
  const { item: b } = await svc.addChecklistItem(task.id, "step b");
  await svc.setSagaPendingRevision(task.id, {
    revisedAtStepIndex: 0,
    pending: [a, { ...b, text: "step b refined" }],
  });
  // sanity: overlay is set
  expect((await svc.getTask(task.id))!.supervised.pendingRevision).not.toBeNull();
  return { dir, svc, taskId: task.id, aId: a.id, bId: b.id };
}

describe("saga pending overlay - staleness clearing", () => {
  it("clears the overlay when an owner ADDS a step", async () => {
    const { dir, svc, taskId } = await sagaWithOverlay();
    try {
      await svc.addChecklistItem(taskId, "step c (owner-added)");
      expect((await svc.getTask(taskId))!.supervised.pendingRevision).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("clears the overlay when an owner REMOVES a step", async () => {
    const { dir, svc, taskId, aId } = await sagaWithOverlay();
    try {
      await svc.removeChecklistItem(taskId, aId);
      expect((await svc.getTask(taskId))!.supervised.pendingRevision).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("clears the overlay when an owner REORDERS", async () => {
    const { dir, svc, taskId, aId, bId } = await sagaWithOverlay();
    try {
      await svc.reorderChecklist(taskId, [bId, aId]);
      expect((await svc.getTask(taskId))!.supervised.pendingRevision).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("clears the overlay on a STRUCTURAL update (text edit)", async () => {
    const { dir, svc, taskId, aId } = await sagaWithOverlay();
    try {
      await svc.updateChecklistItem(taskId, aId, { text: "step a edited" });
      expect((await svc.getTask(taskId))!.supervised.pendingRevision).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("PRESERVES the overlay on a status-only update (the run's own commit)", async () => {
    const { dir, svc, taskId, aId } = await sagaWithOverlay();
    try {
      await svc.setChecklistItemStatus(taskId, aId, "done");
      expect((await svc.getTask(taskId))!.supervised.pendingRevision).not.toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("reconcile folds refined text into the checklist and clears the overlay", async () => {
    const { dir, svc, taskId, bId } = await sagaWithOverlay();
    try {
      const after = await svc.reconcileSagaPendingRevision(taskId);
      expect(after.supervised.pendingRevision).toBeNull();
      expect(after.checklist.find((c) => c.id === bId)!.text).toBe("step b refined");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
