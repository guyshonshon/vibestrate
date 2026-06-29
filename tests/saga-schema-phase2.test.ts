import { describe, it, expect } from "vitest";
import { taskSchema, checklistItemSchema } from "../src/roadmap/roadmap-types.js";

// Phase 2 adds saga execution state. Every new field is `.default()`-ed so that
// a saga task written by Phase 1 (which has none of these) upgrades losslessly
// on read - `getTask` parses inside a `catch { return null }`, so a throwing
// field would silently drop the task (roadmap-store.ts:100-111).
describe("saga phase-2 schema (zod-default migration)", () => {
  it("defaults sagaState/sagaHalt/sagaBudget for a pre-phase-2 saga", () => {
    const task = taskSchema.parse({
      id: "task-1",
      title: "build feature",
      kind: "saga",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(task.sagaState).toBe("idle");
    expect(task.sagaHalt).toBeNull();
    expect(task.sagaBudget).toEqual({ maxSpendUsd: null, maxSteps: null });
  });

  it("defaults runId/outcomeSummary on a pre-phase-2 step", () => {
    const item = checklistItemSchema.parse({
      id: "ci-1",
      text: "do the thing",
      status: "done",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      commitSha: "abc1234",
    });
    expect(item.runId).toBeNull();
    expect(item.outcomeSummary).toBe("");
  });

  it("round-trips a halted saga with a sagaHalt payload and explicit budget", () => {
    const halted = taskSchema.parse({
      id: "task-2",
      title: "feature",
      kind: "saga",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      sagaState: "halted",
      sagaHalt: {
        reason: "step blocked",
        atStepId: "ci-3",
        summary: "review never approved after self-heal",
      },
      sagaBudget: { maxSpendUsd: 5, maxSteps: 10 },
    });
    const round = taskSchema.parse(JSON.parse(JSON.stringify(halted)));
    expect(round.sagaState).toBe("halted");
    expect(round.sagaHalt?.atStepId).toBe("ci-3");
    expect(round.sagaBudget.maxSpendUsd).toBe(5);
    expect(round.sagaBudget.maxSteps).toBe(10);
  });

  it("rejects an unknown sagaState", () => {
    expect(() =>
      taskSchema.parse({
        id: "task-3",
        title: "x",
        kind: "saga",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        sagaState: "running",
      }),
    ).toThrow();
  });
});
