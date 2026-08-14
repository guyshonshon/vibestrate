// Harvested code TODOs, as the server computes them.
//
// The shapes mirror `src/project/todo-harvest.ts` and
// `src/roadmap/todo-promote-service.ts`. They are typed rather than parsed out
// of prose precisely so the UI can render them however it likes.

export type TodoMarker = "TODO" | "FIXME" | "HACK" | "XXX" | "BUG";

export type TodoState = "promotable" | "on_board" | "dismissed";

export type TodoView = {
  fingerprint: string;
  marker: TodoMarker;
  path: string;
  line: number;
  /** The comment line as found, redacted. */
  raw: string;
  /** Marker and separator stripped. */
  text: string;
  /** Card-ready title: what promoting uses unless overridden. */
  suggestedTitle: string;
  suggestedPriority: "low" | "medium" | "high";
  /** Top-level directory, for grouping. */
  area: string;
  /** Below the substance bar: counted, never offered for promotion. */
  lowSignal: boolean;
  state: TodoState;
  /** Set when `state === "on_board"`. */
  taskId: string | null;
  dismissedAt: string | null;
};

export type TodoOverview = {
  present: boolean;
  stale: boolean;
  generatedAt: string | null;
  truncated: boolean;
  notes: string[];
  items: TodoView[];
  counts: {
    promotable: number;
    onBoard: number;
    dismissed: number;
    lowSignal: number;
  };
};

export type TodoPromoteResult = {
  promoted: Array<{ fingerprint: string; taskId: string; title: string }>;
  failed: Array<{ fingerprint: string; reason: string }>;
  skipped: Array<{
    fingerprint: string;
    reason: "already_on_board" | "dismissed" | "unknown";
  }>;
};
