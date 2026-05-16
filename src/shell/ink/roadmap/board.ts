// Pure roadmap-board helpers: group tasks by status column and let
// the keyboard cursor (column + row) move through them. Designed so
// the view layer just renders whatever the reducer says, and tests
// can exercise the navigation without any ink involvement.

import type { Task, TaskStatus } from "../../../roadmap/roadmap-types.js";

export type BoardColumnId =
  | "backlog"
  | "ready"
  | "queued"
  | "running"
  | "review"
  | "waiting_for_approval"
  | "blocked"
  | "done"
  | "closed";

export const BOARD_COLUMNS: ReadonlyArray<{
  id: BoardColumnId;
  label: string;
  statuses: TaskStatus[];
}> = [
  { id: "backlog", label: "Backlog", statuses: ["backlog"] },
  { id: "ready", label: "Ready", statuses: ["ready"] },
  { id: "queued", label: "Queued", statuses: ["queued"] },
  { id: "running", label: "Running", statuses: ["running"] },
  {
    id: "waiting_for_approval",
    label: "Approval",
    statuses: ["waiting_for_approval"],
  },
  { id: "review", label: "Review", statuses: ["review"] },
  { id: "blocked", label: "Blocked", statuses: ["blocked"] },
  { id: "done", label: "Done", statuses: ["done"] },
  { id: "closed", label: "Closed", statuses: ["failed", "cancelled"] },
];

export type BoardSnapshot = {
  columns: Array<{
    id: BoardColumnId;
    label: string;
    tasks: Task[];
  }>;
};

export function buildBoard(tasks: ReadonlyArray<Task>): BoardSnapshot {
  return {
    columns: BOARD_COLUMNS.map((col) => ({
      id: col.id,
      label: col.label,
      tasks: tasks
        .filter((t) => col.statuses.includes(t.status))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    })),
  };
}

export type BoardCursor = { col: number; row: number };

export function clampCursor(
  board: BoardSnapshot,
  cursor: BoardCursor,
): BoardCursor {
  const col = Math.max(0, Math.min(board.columns.length - 1, cursor.col));
  const rows = board.columns[col]?.tasks.length ?? 0;
  const row = Math.max(0, Math.min(rows - 1, cursor.row));
  return { col, row };
}

export function moveCursor(
  board: BoardSnapshot,
  cursor: BoardCursor,
  direction: "up" | "down" | "left" | "right",
): BoardCursor {
  const clamped = clampCursor(board, cursor);
  if (direction === "left" || direction === "right") {
    const delta = direction === "left" ? -1 : 1;
    // Skip over empty columns so left/right always lands on a real
    // task — feels like the kanban app you're used to.
    const total = board.columns.length;
    for (let step = 1; step <= total; step += 1) {
      const next = (clamped.col + delta * step + total) % total;
      if ((board.columns[next]?.tasks.length ?? 0) > 0) {
        return clampCursor(board, { col: next, row: 0 });
      }
    }
    return clamped;
  }
  const delta = direction === "up" ? -1 : 1;
  return clampCursor(board, { col: clamped.col, row: clamped.row + delta });
}

export function selectedTask(
  board: BoardSnapshot,
  cursor: BoardCursor,
): Task | null {
  const clamped = clampCursor(board, cursor);
  return board.columns[clamped.col]?.tasks[clamped.row] ?? null;
}
