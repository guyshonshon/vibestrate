import { describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { RoadmapService } from "../src/roadmap/roadmap-service.js";
import { SUPERVISED_DEFAULT_MAX_STEPS } from "../src/roadmap/roadmap-types.js";

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
      const task = await svc.addTask({ title: "Build dashboards", runMode: "supervised" });
      expect(task.runMode).toBe("supervised");
      expect((await svc.getTask(task.id))?.runMode).toBe("supervised");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("defaults kind to single when omitted", async () => {
    const { dir, svc } = await tmpProject();
    try {
      expect((await svc.addTask({ title: "One-off" })).runMode).toBe("plain");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("seeds an empty invariants ledger and appends redacted, deduped, durably", async () => {
    const { dir, svc } = await tmpProject();
    try {
      const t = await svc.addTask({ title: "Export pipeline", runMode: "supervised" });
      expect(t.supervised.invariants).toEqual([]);

      await svc.appendSagaInvariants(t.id, [
        "all API responses use snake_case",
        "auth token is AKIAIOSFODNN7EXAMPLE", // secret-shaped -> must be scrubbed
      ]);
      // A dup (normalized) plus a genuinely new one.
      await svc.appendSagaInvariants(t.id, [
        "All API Responses Use Snake_Case",
        "errors return RFC7807",
      ]);

      const reloaded = await svc.getTask(t.id);
      expect(reloaded!.supervised.invariants).toContain("all API responses use snake_case");
      expect(reloaded!.supervised.invariants).toContain("errors return RFC7807");
      // dedup: snake_case appears exactly once
      expect(
        reloaded!.supervised.invariants.filter((i) => /snake_case/i.test(i)).length,
      ).toBe(1);
      // the secret never lands on disk verbatim
      expect(reloaded!.supervised.invariants.join("\n")).not.toContain("AKIAIOSFODNN7EXAMPLE");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("adds a step with objective, acceptance, trimmed file hints", async () => {
    const { dir, svc } = await tmpProject();
    try {
      const task = await svc.addTask({ title: "Feature", runMode: "supervised" });
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
      const task = await svc.addTask({ title: "Build dashboards", runMode: "supervised" });
      // The data-model gap fix: a freshly created saga must NOT ship unbounded.
      expect(task.runOptions.budget.maxSteps).toBe(SUPERVISED_DEFAULT_MAX_STEPS);
      expect(task.runOptions.budget.maxSteps).not.toBeNull();
      expect(task.runOptions.budget.maxSpendUsd).toBeNull();
      // Survives a reload (round-trips through the schema).
      expect((await svc.getTask(task.id))?.runOptions.budget.maxSteps).toBe(
        SUPERVISED_DEFAULT_MAX_STEPS,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("leaves a single task's sagaBudget fully null (no envelope)", async () => {
    const { dir, svc } = await tmpProject();
    try {
      const task = await svc.addTask({ title: "One-off" });
      expect(task.runOptions.budget.maxSteps).toBeNull();
      expect(task.runOptions.budget.maxSpendUsd).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("setSagaState('done') clears a prior sagaHalt (no stale halt on recovery)", async () => {
    const { dir, svc } = await tmpProject();
    try {
      const task = await svc.addTask({ title: "Recoverable", runMode: "supervised" });
      const halted = await svc.recordSagaHalt(task.id, {
        reason: "step failed",
        atStepId: null,
        summary: "self-heal exhausted",
      });
      expect(halted.supervised.halt).not.toBeNull();
      const done = await svc.setSagaState(task.id, "done");
      expect(done.supervised.state).toBe("done");
      expect(done.supervised.halt).toBeNull();
      // And it is persisted, not just returned.
      expect((await svc.getTask(task.id))?.supervised.halt).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("setSagaState('sequencing') clears a prior sagaHalt on resume", async () => {
    const { dir, svc } = await tmpProject();
    try {
      const task = await svc.addTask({ title: "Resumable", runMode: "supervised" });
      await svc.recordSagaHalt(task.id, {
        reason: "max steps",
        atStepId: null,
        summary: "halted at step cap",
      });
      const resumed = await svc.setSagaState(task.id, "sequencing");
      expect(resumed.supervised.state).toBe("sequencing");
      expect(resumed.supervised.halt).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("setSagaState('paused') leaves an existing sagaHalt intact", async () => {
    const { dir, svc } = await tmpProject();
    try {
      const task = await svc.addTask({ title: "Pauseable", runMode: "supervised" });
      await svc.recordSagaHalt(task.id, {
        reason: "halt",
        atStepId: null,
        summary: "s",
      });
      const paused = await svc.setSagaState(task.id, "paused");
      // Only sequencing/done clear the halt; other transitions preserve it.
      expect(paused.supervised.halt).not.toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("patches a step's objective via updateChecklistItem", async () => {
    const { dir, svc } = await tmpProject();
    try {
      const task = await svc.addTask({ title: "Feature", runMode: "supervised" });
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
      const task = await svc.addTask({ title: "Feature", runMode: "supervised" });
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
