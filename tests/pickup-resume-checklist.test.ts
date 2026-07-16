import { describe, it, expect } from "vitest";
import {
  reconstructDoneOutcomes,
  checklistIdsChanged,
  type ResumeChecklistItem,
} from "../src/core/resume-checklist.js";

const item = (
  id: string,
  status: string,
  commitSha: string | null = null,
): ResumeChecklistItem => ({ id, text: `do ${id}`, status, commitSha });

describe("reconstructDoneOutcomes", () => {
  it("returns one terse outcome per done item, in full-checklist order", () => {
    const checklist = [
      item("a", "done", "sha-a"),
      item("b", "done", null), // a zero-diff item: done, no commit
      item("c", "ready"),
      item("d", "in_progress"),
    ];
    const out = reconstructDoneOutcomes(checklist);
    expect(out.map((o) => o.itemId)).toEqual(["a", "b"]);
    expect(out.map((o) => o.index)).toEqual([0, 1]); // full-checklist positions
    expect(out.every((o) => o.total === 4)).toBe(true);
    expect(out[0]!.status).toBe("done");
    expect(out[0]!.commitSha).toBe("sha-a");
    expect(out[1]!.commitSha).toBe(null); // zero-diff item still carried
    expect(out[0]!.text).toBe("do a");
  });

  it("returns nothing when no item is done", () => {
    expect(
      reconstructDoneOutcomes([item("a", "ready"), item("b", "in_progress")]),
    ).toEqual([]);
  });

  it("preserves the full-checklist index even when done items are non-contiguous", () => {
    const checklist = [
      item("a", "ready"),
      item("b", "done"),
      item("c", "ready"),
      item("d", "done"),
    ];
    const out = reconstructDoneOutcomes(checklist);
    expect(out.map((o) => [o.itemId, o.index])).toEqual([
      ["b", 1],
      ["d", 3],
    ]);
  });
});

describe("checklistIdsChanged", () => {
  it("is false when a null fingerprint can't verify (fails open)", () => {
    expect(checklistIdsChanged(null, ["a", "b"])).toBe(false);
  });

  it("is false when ids and order match exactly", () => {
    expect(checklistIdsChanged(["a", "b", "c"], ["a", "b", "c"])).toBe(false);
  });

  it("is true when an id was added or removed", () => {
    expect(checklistIdsChanged(["a", "b"], ["a", "b", "c"])).toBe(true);
    expect(checklistIdsChanged(["a", "b", "c"], ["a", "b"])).toBe(true);
  });

  it("is true when ids were reordered (same set, different order)", () => {
    expect(checklistIdsChanged(["a", "b", "c"], ["a", "c", "b"])).toBe(true);
  });

  it("is true when an id changed (delete + re-add gives a new id)", () => {
    expect(checklistIdsChanged(["a", "b"], ["a", "b2"])).toBe(true);
  });
});
