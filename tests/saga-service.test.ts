import { describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { RoadmapService } from "../src/roadmap/roadmap-service.js";
import { SAGA_DEFAULT_MAX_STEPS } from "../src/roadmap/roadmap-types.js";

async function tmpProject() {
  const dir = await mkdtemp(path.join(tmpdir(), "vibe-saga-"));
  const svc = new RoadmapService(dir);
  await svc.init();
  return { dir, svc };
}

describe("RoadmapService - saga authoring", () => {
  it("creates a task with kind=saga and reloads it", async () => {
    const { dir, svc } = await tmpProject();
    try {
      const task = await svc.addTask({ title: "Build dashboards", kind: "saga" });
      expect(task.kind).toBe("saga");
      expect((await svc.getTask(task.id))?.kind).toBe("saga");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("defaults kind to single when omitted", async () => {
    const { dir, svc } = await tmpProject();
    try {
      expect((await svc.addTask({ title: "One-off" })).kind).toBe("single");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("adds a step with objective, acceptance, trimmed file hints", async () => {
    const { dir, svc } = await tmpProject();
    try {
      const task = await svc.addTask({ title: "Feature", kind: "saga" });
      const { item } = await svc.addChecklistItem(task.id, "Wire the route", {
        objective: "Expose POST /api/x",
        acceptanceCheck: "curl returns 200",
        fileHints: ["src/server/routes/x.ts", "  "],
      });
      expect(item.objective).toBe("Expose POST /api/x");
      expect(item.acceptanceCheck).toBe("curl returns 200");
      expect(item.fileHints).toEqual(["src/server/routes/x.ts"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("seeds a saga with the default maxSteps so it is bounded out of the box", async () => {
    const { dir, svc } = await tmpProject();
    try {
      const task = await svc.addTask({ title: "Build dashboards", kind: "saga" });
      // The data-model gap fix: a freshly created saga must NOT ship unbounded.
      expect(task.sagaBudget.maxSteps).toBe(SAGA_DEFAULT_MAX_STEPS);
      expect(task.sagaBudget.maxSteps).not.toBeNull();
      expect(task.sagaBudget.maxSpendUsd).toBeNull();
      // Survives a reload (round-trips through the schema).
      expect((await svc.getTask(task.id))?.sagaBudget.maxSteps).toBe(
        SAGA_DEFAULT_MAX_STEPS,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("leaves a single task's sagaBudget fully null (no envelope)", async () => {
    const { dir, svc } = await tmpProject();
    try {
      const task = await svc.addTask({ title: "One-off" });
      expect(task.sagaBudget.maxSteps).toBeNull();
      expect(task.sagaBudget.maxSpendUsd).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("setSagaState('done') clears a prior sagaHalt (no stale halt on recovery)", async () => {
    const { dir, svc } = await tmpProject();
    try {
      const task = await svc.addTask({ title: "Recoverable", kind: "saga" });
      const halted = await svc.recordSagaHalt(task.id, {
        reason: "step failed",
        atStepId: null,
        summary: "self-heal exhausted",
      });
      expect(halted.sagaHalt).not.toBeNull();
      const done = await svc.setSagaState(task.id, "done");
      expect(done.sagaState).toBe("done");
      expect(done.sagaHalt).toBeNull();
      // And it is persisted, not just returned.
      expect((await svc.getTask(task.id))?.sagaHalt).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("setSagaState('sequencing') clears a prior sagaHalt on resume", async () => {
    const { dir, svc } = await tmpProject();
    try {
      const task = await svc.addTask({ title: "Resumable", kind: "saga" });
      await svc.recordSagaHalt(task.id, {
        reason: "max steps",
        atStepId: null,
        summary: "halted at step cap",
      });
      const resumed = await svc.setSagaState(task.id, "sequencing");
      expect(resumed.sagaState).toBe("sequencing");
      expect(resumed.sagaHalt).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("setSagaState('paused') leaves an existing sagaHalt intact", async () => {
    const { dir, svc } = await tmpProject();
    try {
      const task = await svc.addTask({ title: "Pauseable", kind: "saga" });
      await svc.recordSagaHalt(task.id, {
        reason: "halt",
        atStepId: null,
        summary: "s",
      });
      const paused = await svc.setSagaState(task.id, "paused");
      // Only sequencing/done clear the halt; other transitions preserve it.
      expect(paused.sagaHalt).not.toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("patches a step's objective via updateChecklistItem", async () => {
    const { dir, svc } = await tmpProject();
    try {
      const task = await svc.addTask({ title: "Feature", kind: "saga" });
      const { item } = await svc.addChecklistItem(task.id, "Step");
      const res = await svc.updateChecklistItem(task.id, item.id, { objective: "refined goal" });
      expect(res.item.objective).toBe("refined goal");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("trims objective and fileHints when updating a step", async () => {
    const { dir, svc } = await tmpProject();
    try {
      const task = await svc.addTask({ title: "Feature", kind: "saga" });
      const { item } = await svc.addChecklistItem(task.id, "Step");
      const res = await svc.updateChecklistItem(task.id, item.id, {
        objective: "  goal  ",
        fileHints: ["  src/x.ts  ", "  "],
      });
      expect(res.item.objective).toBe("goal");
      expect(res.item.fileHints).toEqual(["src/x.ts"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
