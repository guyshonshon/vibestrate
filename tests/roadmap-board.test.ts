import { describe, it, expect } from "vitest";
import {
  buildBoard,
  moveCursor,
  clampCursor,
  selectedTask,
  BOARD_COLUMNS,
} from "../src/shell/ink/roadmap/board.js";
import type { Task } from "../src/roadmap/roadmap-types.js";

function task(id: string, status: Task["status"], updatedAt: string): Task {
  return {
    id,
    roadmapItemId: null,
    title: id,
    description: "",
    status,
    priority: "medium",
    dependencies: [],
    createdAt: updatedAt,
    updatedAt,
    assignedRoles: [],
    requiredSkills: [],
    validationProfile: null,
    branchName: null,
    worktreePath: null,
    runIds: [],
    currentRunId: null,
    touchedFiles: [],
    riskLevel: "medium",
    commentsCount: 0,
    lastEventAt: updatedAt,
    effort: null,
    profileOverride: null,
    readOnly: false,
    checklist: [],
    needsTesting: false,
    needsTestingReason: null,
    derivedFrom: null,
    archived: false,
    contextSources: [],
  };
}

describe("buildBoard", () => {
  it("groups tasks into the documented columns", () => {
    const board = buildBoard([
      task("a", "backlog", "t1"),
      task("b", "ready", "t2"),
      task("c", "queued", "t3"),
      task("d", "running", "t4"),
      task("e", "blocked", "t5"),
      task("f", "done", "t6"),
      task("g", "failed", "t7"),
      task("h", "cancelled", "t8"),
    ]);
    const ids = (label: string) =>
      board.columns.find((c) => c.label === label)?.tasks.map((t) => t.id);
    expect(ids("Backlog")).toEqual(["a"]);
    expect(ids("Ready")).toEqual(["b"]);
    expect(ids("Queued")).toEqual(["c"]);
    expect(ids("Running")).toEqual(["d"]);
    expect(ids("Blocked")).toEqual(["e"]);
    expect(ids("Done")).toEqual(["f"]);
    // failed + cancelled fold into "Closed".
    expect(ids("Closed")?.sort()).toEqual(["g", "h"]);
  });

  it("sorts within a column by updatedAt desc", () => {
    const board = buildBoard([
      task("old", "backlog", "2026-01-01"),
      task("new", "backlog", "2026-05-01"),
    ]);
    expect(
      board.columns.find((c) => c.label === "Backlog")?.tasks.map((t) => t.id),
    ).toEqual(["new", "old"]);
  });
});

describe("moveCursor", () => {
  const board = buildBoard([
    task("a", "backlog", "t1"),
    task("b", "backlog", "t2"),
    task("c", "ready", "t3"),
    task("d", "done", "t4"),
  ]);
  const backlogIdx = BOARD_COLUMNS.findIndex((c) => c.id === "backlog");
  const readyIdx = BOARD_COLUMNS.findIndex((c) => c.id === "ready");

  it("moves down within a column and clamps at the bottom", () => {
    const c1 = moveCursor(board, { col: backlogIdx, row: 0 }, "down");
    expect(c1.row).toBe(1);
    const c2 = moveCursor(board, c1, "down");
    expect(c2.row).toBe(1); // clamped, only 2 tasks
  });

  it("moves right and skips empty columns", () => {
    // From backlog (has 2), moving right should land on the next non-empty
    // column (ready), not on the empty Queued column in between.
    const c1 = moveCursor(board, { col: backlogIdx, row: 0 }, "right");
    expect(c1.col).toBe(readyIdx);
  });

  it("clampCursor reins in out-of-bounds inputs", () => {
    const c = clampCursor(board, { col: 999, row: 999 });
    expect(c.col).toBeLessThan(BOARD_COLUMNS.length);
  });

  it("selectedTask returns the task at the cursor or null", () => {
    expect(
      selectedTask(board, { col: backlogIdx, row: 0 })?.id,
    ).toBeDefined();
    expect(selectedTask(buildBoard([]), { col: 0, row: 0 })).toBeNull();
  });
});
