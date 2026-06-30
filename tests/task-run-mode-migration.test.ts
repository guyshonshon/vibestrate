import { describe, it, expect } from "vitest";
import { migrateTaskShape } from "../src/roadmap/migrate-task.js";
import { taskSchema } from "../src/roadmap/roadmap-types.js";

// The safety-critical migration: a task persisted under the legacy "saga" shape
// (kind + flat saga* fields) must load losslessly as the new run-mode shape
// (runMode + nested supervised{} + runOptions). migrateTaskShape runs BEFORE
// taskSchema.parse, so a legacy task never throws and is never silently dropped
// by getTask's `catch { return null }`.

const legacyBase = {
  id: "task-1",
  title: "Build the thing",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("migrateTaskShape - legacy saga -> run mode", () => {
  it('maps kind:"saga" -> runMode:"supervised" and groups the saga* state', () => {
    const legacy = {
      ...legacyBase,
      kind: "saga",
      sagaState: "halted",
      sagaHalt: { reason: "supervisor-escalate", atStepId: "ci-2", summary: "off goal" },
      sagaInvariants: ["all responses use snake_case"],
      sagaPendingRevision: null,
      sagaBudget: { maxSpendUsd: 5, maxSteps: 10 },
    };
    const migrated = taskSchema.parse(migrateTaskShape(legacy));
    expect(migrated.runMode).toBe("supervised");
    expect(migrated.supervised.state).toBe("halted");
    expect(migrated.supervised.halt?.atStepId).toBe("ci-2");
    expect(migrated.supervised.invariants).toEqual(["all responses use snake_case"]);
    expect(migrated.runOptions.budget.maxSpendUsd).toBe(5);
    expect(migrated.runOptions.budget.maxSteps).toBe(10);
  });

  it('maps kind:"single" -> runMode:"plain"', () => {
    const migrated = taskSchema.parse(migrateTaskShape({ ...legacyBase, kind: "single" }));
    expect(migrated.runMode).toBe("plain");
    expect(migrated.supervised.state).toBe("idle");
  });

  it("preserves a saga pendingRevision overlay through the move", () => {
    const legacy = {
      ...legacyBase,
      kind: "saga",
      sagaPendingRevision: {
        revisedAtStepIndex: 1,
        pending: [
          {
            id: "ci-3",
            text: "refined",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    };
    const migrated = taskSchema.parse(migrateTaskShape(legacy));
    expect(migrated.supervised.pendingRevision?.pending[0]!.id).toBe("ci-3");
  });

  it("leaves an already-migrated (new-shape) task untouched", () => {
    const modern = {
      ...legacyBase,
      runMode: "supervised",
      supervised: { state: "sequencing", halt: null, invariants: ["x"], pendingRevision: null },
      runOptions: { budget: { maxSpendUsd: null, maxSteps: 7 } },
    };
    const migrated = taskSchema.parse(migrateTaskShape(modern));
    expect(migrated.runMode).toBe("supervised");
    expect(migrated.supervised.state).toBe("sequencing");
    expect(migrated.supervised.invariants).toEqual(["x"]);
    expect(migrated.runOptions.budget.maxSteps).toBe(7);
  });

  it("defaults a pre-saga task (no kind, no saga*) to plain", () => {
    const migrated = taskSchema.parse(migrateTaskShape({ ...legacyBase }));
    expect(migrated.runMode).toBe("plain");
    expect(migrated.supervised.state).toBe("idle");
  });

  it("is a no-op on non-objects (defensive)", () => {
    expect(migrateTaskShape(null)).toBeNull();
    expect(migrateTaskShape("nope")).toBe("nope");
  });
});
