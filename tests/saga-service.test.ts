import { describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { RoadmapService } from "../src/roadmap/roadmap-service.js";

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
});
