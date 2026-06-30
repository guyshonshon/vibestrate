import { describe, it, expect } from "vitest";
import { taskSchema, checklistItemSchema } from "../src/roadmap/roadmap-types.js";

describe("saga schema (zod-default migration)", () => {
  it("upgrades a pre-Saga checklist item losslessly", () => {
    const old = {
      id: "ci-1",
      text: "do the thing",
      status: "done",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      commitSha: "abc1234",
      promotedTaskId: null,
    };
    const item = checklistItemSchema.parse(old);
    expect(item.text).toBe("do the thing");
    expect(item.commitSha).toBe("abc1234");
    expect(item.objective).toBe("");
    expect(item.acceptanceCheck).toBe("");
    expect(item.fileHints).toEqual([]);
  });

  it("defaults task.kind to single for pre-Saga tasks", () => {
    const task = taskSchema.parse({
      id: "task-1",
      title: "old task",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(task.runMode).toBe("plain");
  });

  it("round-trips a saga task with enriched steps", () => {
    const saga = taskSchema.parse({
      id: "task-saga",
      title: "build feature",
      runMode: "supervised",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      checklist: [{
        id: "ci-a",
        text: "step a",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        objective: "make a",
        acceptanceCheck: "a works",
        fileHints: ["src/a.ts"],
      }],
    });
    const round = taskSchema.parse(JSON.parse(JSON.stringify(saga)));
    expect(round.runMode).toBe("supervised");
    expect(round.checklist[0]?.objective).toBe("make a");
    expect(round.checklist[0]?.fileHints).toEqual(["src/a.ts"]);
  });
});
