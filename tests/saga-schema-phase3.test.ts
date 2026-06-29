import { describe, it, expect } from "vitest";
import { taskSchema, checklistItemSchema } from "../src/roadmap/roadmap-types.js";

// Phase 3 (Enhance) adds two fields, both `.default()`-ed for lossless upgrade
// (getTask parses inside a catch -> null, so a throwing field drops the task):
//   - ChecklistItem.provenance: who authored the step (owner vs the conductor's
//     autonomous Enhance pass). Drives the escalate-on-destructive authority
//     policy deterministically (the schema otherwise has no author field).
//   - Task.sagaPendingRevision: the saga-scoped overlay holding a conductor-
//     revised pending plan, written atomically so the resume guard is untouched.
describe("saga phase-3 schema (Enhance: provenance + pending overlay)", () => {
  it('defaults provenance to "owner" on a pre-phase-3 step', () => {
    const item = checklistItemSchema.parse({
      id: "ci-1",
      text: "do the thing",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(item.provenance).toBe("owner");
  });

  it('round-trips a conductor-authored step', () => {
    const item = checklistItemSchema.parse({
      id: "ci-2",
      text: "added by enhance",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      provenance: "conductor",
    });
    const round = checklistItemSchema.parse(JSON.parse(JSON.stringify(item)));
    expect(round.provenance).toBe("conductor");
  });

  it("rejects an unknown provenance", () => {
    expect(() =>
      checklistItemSchema.parse({
        id: "ci-3",
        text: "x",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        provenance: "robot",
      }),
    ).toThrow();
  });

  it("defaults sagaPendingRevision to null for a pre-phase-3 saga", () => {
    const task = taskSchema.parse({
      id: "task-1",
      title: "build feature",
      kind: "saga",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(task.sagaPendingRevision).toBeNull();
  });

  it("round-trips a pending revision overlay", () => {
    const task = taskSchema.parse({
      id: "task-2",
      title: "feature",
      kind: "saga",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      sagaPendingRevision: {
        revisedAtStepIndex: 2,
        pending: [
          {
            id: "ci-5",
            text: "refined step",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            objective: "do x cleanly",
          },
        ],
      },
    });
    const round = taskSchema.parse(JSON.parse(JSON.stringify(task)));
    expect(round.sagaPendingRevision?.revisedAtStepIndex).toBe(2);
    expect(round.sagaPendingRevision?.pending).toHaveLength(1);
    expect(round.sagaPendingRevision?.pending[0]!.id).toBe("ci-5");
    expect(round.sagaPendingRevision?.pending[0]!.objective).toBe("do x cleanly");
  });
});
