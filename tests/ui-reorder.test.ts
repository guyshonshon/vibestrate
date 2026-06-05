import { describe, it, expect } from "vitest";
import { applyOrder, reorderByDrop } from "../src/ui/lib/reorder.js";

describe("reorderByDrop (checklist drag-and-drop math)", () => {
  const ids = ["a", "b", "c", "d"];

  it("moves an item down to the drop target's slot", () => {
    expect(reorderByDrop(ids, "a", "c")).toEqual(["b", "c", "a", "d"]);
  });

  it("moves an item up to the drop target's slot", () => {
    expect(reorderByDrop(ids, "d", "b")).toEqual(["a", "d", "b", "c"]);
  });

  it("moving onto the first slot puts the item at the front", () => {
    expect(reorderByDrop(ids, "c", "a")).toEqual(["c", "a", "b", "d"]);
  });

  it("dropping on itself is a no-op", () => {
    expect(reorderByDrop(ids, "b", "b")).toEqual(ids);
  });

  it("adjacent swap (drag down by one)", () => {
    expect(reorderByDrop(ids, "b", "c")).toEqual(["a", "c", "b", "d"]);
  });

  it("unknown ids return the order unchanged and never mutate input", () => {
    const copy = [...ids];
    expect(reorderByDrop(ids, "ghost", "a")).toEqual(ids);
    expect(reorderByDrop(ids, "a", "ghost")).toEqual(ids);
    expect(ids).toEqual(copy); // input untouched
  });

  it("result is always a permutation of the input", () => {
    const out = reorderByDrop(ids, "a", "d");
    expect([...out].sort()).toEqual([...ids].sort());
    expect(out).toHaveLength(ids.length);
  });
});

describe("applyOrder (persisted provider drag preference)", () => {
  const rows = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];

  it("with no saved order, returns rows in their original order (a copy)", () => {
    const out = applyOrder(rows, []);
    expect(out.map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
    expect(out).not.toBe(rows);
  });

  it("reorders rows to match the saved id order", () => {
    expect(applyOrder(rows, ["c", "a", "d", "b"]).map((r) => r.id)).toEqual([
      "c",
      "a",
      "d",
      "b",
    ]);
  });

  it("ids missing from the saved order keep their position, after the placed ones", () => {
    // User placed only c then a; b and d were detected later -> trail in their
    // original relative order.
    expect(applyOrder(rows, ["c", "a"]).map((r) => r.id)).toEqual([
      "c",
      "a",
      "b",
      "d",
    ]);
  });

  it("ignores saved ids that no longer exist (uninstalled provider)", () => {
    expect(applyOrder(rows, ["ghost", "b", "a"]).map((r) => r.id)).toEqual([
      "b",
      "a",
      "c",
      "d",
    ]);
  });

  it("never mutates the input rows", () => {
    const copy = rows.map((r) => ({ ...r }));
    applyOrder(rows, ["d", "c", "b", "a"]);
    expect(rows).toEqual(copy);
  });
});
