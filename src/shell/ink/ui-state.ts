// Pure UI state for the ink-based panel. Kept import-free so it can
// be exercised under the node-only Vitest environment.

export const PAGE_IDS = [
  "dashboard",
  "runs",
  "roadmap",
  "queue",
  "agents",
  "skills",
  "approvals",
  "suggestions",
  "notifications",
  "doctor",
] as const;
export type PageId = (typeof PAGE_IDS)[number];

export type ToastKind = "ok" | "err" | "info";
export type Toast = { id: number; kind: ToastKind; message: string };

export type PendingConfirm =
  | { action: "abort"; runId: string }
  | null;

/**
 * Sub-section the Runs page inspector is showing for the selected
 * run. "overview" is the default landing card; "events" is the full
 * scrollable tail; "validation" surfaces the most recent validation
 * results.
 */
export type RunInspectorTab = "overview" | "events" | "validation";
export const RUN_INSPECTOR_TABS: RunInspectorTab[] = [
  "overview",
  "events",
  "validation",
];

export type ShellUiStateV2 = {
  page: PageId;
  /**
   * Pages the user came from, newest last. Esc on a non-modal screen
   * pops the top and navigates there, giving the panel a real "back"
   * affordance. Capped so it can't grow unboundedly during long
   * navigation sessions.
   */
  pageHistory: PageId[];
  /**
   * Per-page selection cursor. We keep one index per page so switching
   * tabs round-trips back to where you were. Pages without a list
   * (Dashboard, Doctor) just ignore their slot.
   */
  selection: Record<PageId, number>;
  paletteOpen: boolean;
  paletteQuery: string;
  /** Cursor inside the filtered palette list — clamped by the view. */
  paletteSelectedIndex: number;
  helpOpen: boolean;
  /**
   * Free-form `amaco …` command runner overlay. Opens with `!`. The
   * runtime spawns the resolved amaco binary argv-only with the
   * user's input parsed via `parseArgs` (no shell expansion) and
   * streams the output back into `runner.output`.
   */
  runner: {
    open: boolean;
    input: string;
    output: string;
    running: boolean;
    exitCode: number | null;
    history: string[];
    historyIndex: number;
  };
  toasts: Toast[];
  pendingConfirm: PendingConfirm;
  /** Runs page state: which inspector sub-tab + event filter query. */
  runs: {
    inspectorTab: RunInspectorTab;
    eventFilter: string;
    eventFilterOpen: boolean;
  };
  /**
   * Roadmap page state: kanban cursor (column + row inside column),
   * and whether the form modal is open (with its own form state stored
   * by the page component since it owns the reducer).
   */
  roadmap: {
    cursor: { col: number; row: number };
    formOpen: boolean;
    pendingDeleteTaskId: string | null;
  };
};

export const initialUiState: ShellUiStateV2 = {
  page: "dashboard",
  pageHistory: [],
  selection: PAGE_IDS.reduce(
    (acc, id) => ({ ...acc, [id]: 0 }),
    {} as Record<PageId, number>,
  ),
  paletteOpen: false,
  paletteQuery: "",
  paletteSelectedIndex: 0,
  helpOpen: false,
  runner: {
    open: false,
    input: "",
    output: "",
    running: false,
    exitCode: null,
    history: [],
    historyIndex: -1,
  },
  toasts: [],
  pendingConfirm: null,
  runs: {
    inspectorTab: "overview",
    eventFilter: "",
    eventFilterOpen: false,
  },
  roadmap: {
    cursor: { col: 0, row: 0 },
    formOpen: false,
    pendingDeleteTaskId: null,
  },
};

export type ShellUiAction =
  | { type: "page.set"; page: PageId }
  | { type: "page.back" }
  | { type: "selection.set"; page: PageId; index: number }
  | { type: "selection.move"; page: PageId; delta: number; max: number }
  | { type: "palette.open" }
  | { type: "palette.close" }
  | { type: "palette.query"; value: string }
  | { type: "palette.cursor.move"; delta: number; max: number }
  | { type: "palette.cursor.set"; index: number }
  | { type: "runner.open"; seed?: string }
  | { type: "runner.close" }
  | { type: "runner.input"; value: string }
  | { type: "runner.started" }
  | { type: "runner.append"; chunk: string }
  | { type: "runner.finished"; exitCode: number | null }
  | { type: "runner.history.prev" }
  | { type: "runner.history.next" }
  | { type: "help.toggle" }
  | { type: "toast.push"; kind: ToastKind; message: string }
  | { type: "toast.dismiss"; id: number }
  | { type: "confirm.set"; value: PendingConfirm }
  | { type: "runs.inspector.set"; tab: RunInspectorTab }
  | { type: "runs.inspector.cycle"; direction: 1 | -1 }
  | { type: "runs.filter.open" }
  | { type: "runs.filter.close" }
  | { type: "runs.filter.set"; value: string }
  | { type: "roadmap.cursor.set"; cursor: { col: number; row: number } }
  | { type: "roadmap.form.open" }
  | { type: "roadmap.form.close" }
  | { type: "roadmap.confirm.delete"; taskId: string | null };

let toastId = 0;
function nextToastId(): number {
  toastId += 1;
  return toastId;
}

export function reduceShellUi(
  state: ShellUiStateV2,
  action: ShellUiAction,
): ShellUiStateV2 {
  switch (action.type) {
    case "page.set":
      // Closing any modal layer when navigating keeps the keymap honest.
      // Push the current page onto history (deduped) so Esc has a
      // sensible "back" target later. Capped at 16 entries.
      return {
        ...state,
        page: action.page,
        pageHistory:
          action.page === state.page
            ? state.pageHistory
            : [...state.pageHistory, state.page].slice(-16),
        paletteOpen: false,
        paletteQuery: "",
        helpOpen: false,
        pendingConfirm: null,
        roadmap: {
          ...state.roadmap,
          formOpen: false,
          pendingDeleteTaskId: null,
        },
      };
    case "page.back": {
      const prev = state.pageHistory[state.pageHistory.length - 1];
      if (!prev) return state;
      return {
        ...state,
        page: prev,
        pageHistory: state.pageHistory.slice(0, -1),
        paletteOpen: false,
        paletteQuery: "",
        helpOpen: false,
        pendingConfirm: null,
        roadmap: {
          ...state.roadmap,
          formOpen: false,
          pendingDeleteTaskId: null,
        },
      };
    }
    case "selection.set":
      return {
        ...state,
        selection: { ...state.selection, [action.page]: Math.max(0, action.index) },
      };
    case "selection.move": {
      const current = state.selection[action.page] ?? 0;
      const next = Math.max(0, Math.min(action.max, current + action.delta));
      return {
        ...state,
        selection: { ...state.selection, [action.page]: next },
      };
    }
    case "palette.open":
      return {
        ...state,
        paletteOpen: true,
        paletteQuery: "",
        paletteSelectedIndex: 0,
      };
    case "palette.close":
      return {
        ...state,
        paletteOpen: false,
        paletteQuery: "",
        paletteSelectedIndex: 0,
      };
    case "palette.query":
      // Reset cursor when the query changes so the top match is
      // always highlighted first.
      return { ...state, paletteQuery: action.value, paletteSelectedIndex: 0 };
    case "palette.cursor.move": {
      const next = Math.max(
        0,
        Math.min(action.max, state.paletteSelectedIndex + action.delta),
      );
      return { ...state, paletteSelectedIndex: next };
    }
    case "palette.cursor.set":
      return { ...state, paletteSelectedIndex: Math.max(0, action.index) };
    case "runner.open":
      return {
        ...state,
        runner: {
          ...state.runner,
          open: true,
          input: action.seed ?? state.runner.input,
          historyIndex: -1,
        },
      };
    case "runner.close":
      return {
        ...state,
        runner: { ...state.runner, open: false, historyIndex: -1 },
      };
    case "runner.input":
      return {
        ...state,
        runner: { ...state.runner, input: action.value, historyIndex: -1 },
      };
    case "runner.started":
      return {
        ...state,
        runner: {
          ...state.runner,
          running: true,
          output: "",
          exitCode: null,
          // Push to history (deduped against the most-recent entry,
          // capped at 50).
          history:
            state.runner.input.trim().length === 0 ||
            state.runner.history[state.runner.history.length - 1] ===
              state.runner.input
              ? state.runner.history
              : [...state.runner.history, state.runner.input].slice(-50),
        },
      };
    case "runner.append":
      return {
        ...state,
        runner: {
          ...state.runner,
          output: (state.runner.output + action.chunk).slice(-64 * 1024),
        },
      };
    case "runner.finished":
      return {
        ...state,
        runner: { ...state.runner, running: false, exitCode: action.exitCode },
      };
    case "runner.history.prev": {
      if (state.runner.history.length === 0) return state;
      const idx =
        state.runner.historyIndex < 0
          ? state.runner.history.length - 1
          : Math.max(0, state.runner.historyIndex - 1);
      return {
        ...state,
        runner: {
          ...state.runner,
          historyIndex: idx,
          input: state.runner.history[idx] ?? state.runner.input,
        },
      };
    }
    case "runner.history.next": {
      if (state.runner.history.length === 0) return state;
      if (state.runner.historyIndex < 0) return state;
      const next = state.runner.historyIndex + 1;
      if (next >= state.runner.history.length) {
        return {
          ...state,
          runner: { ...state.runner, historyIndex: -1, input: "" },
        };
      }
      return {
        ...state,
        runner: {
          ...state.runner,
          historyIndex: next,
          input: state.runner.history[next] ?? state.runner.input,
        },
      };
    }
    case "help.toggle":
      return { ...state, helpOpen: !state.helpOpen };
    case "toast.push":
      return {
        ...state,
        toasts: [
          ...state.toasts,
          { id: nextToastId(), kind: action.kind, message: action.message },
        ].slice(-3),
      };
    case "toast.dismiss":
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.id),
      };
    case "confirm.set":
      return { ...state, pendingConfirm: action.value };
    case "runs.inspector.set":
      return {
        ...state,
        runs: { ...state.runs, inspectorTab: action.tab, eventFilterOpen: false },
      };
    case "runs.inspector.cycle": {
      const idx = RUN_INSPECTOR_TABS.indexOf(state.runs.inspectorTab);
      const next =
        RUN_INSPECTOR_TABS[
          (idx + action.direction + RUN_INSPECTOR_TABS.length) %
            RUN_INSPECTOR_TABS.length
        ] ?? "overview";
      return {
        ...state,
        runs: { ...state.runs, inspectorTab: next, eventFilterOpen: false },
      };
    }
    case "runs.filter.open":
      return {
        ...state,
        runs: {
          ...state.runs,
          eventFilterOpen: true,
          inspectorTab: "events",
        },
      };
    case "runs.filter.close":
      return {
        ...state,
        runs: { ...state.runs, eventFilterOpen: false },
      };
    case "runs.filter.set":
      return {
        ...state,
        runs: { ...state.runs, eventFilter: action.value },
      };
    case "roadmap.cursor.set":
      return {
        ...state,
        roadmap: { ...state.roadmap, cursor: action.cursor },
      };
    case "roadmap.form.open":
      return {
        ...state,
        roadmap: { ...state.roadmap, formOpen: true, pendingDeleteTaskId: null },
      };
    case "roadmap.form.close":
      return {
        ...state,
        roadmap: { ...state.roadmap, formOpen: false },
      };
    case "roadmap.confirm.delete":
      return {
        ...state,
        roadmap: { ...state.roadmap, pendingDeleteTaskId: action.taskId },
      };
  }
}

export function pageLabel(id: PageId): string {
  switch (id) {
    case "dashboard":
      return "Dashboard";
    case "runs":
      return "Runs";
    case "roadmap":
      return "Roadmap";
    case "queue":
      return "Queue";
    case "agents":
      return "Agents";
    case "skills":
      return "Skills";
    case "approvals":
      return "Approvals";
    case "suggestions":
      return "Suggestions";
    case "notifications":
      return "Notifs";
    case "doctor":
      return "Doctor";
  }
}

export function pageHotkey(id: PageId): string {
  const idx = PAGE_IDS.indexOf(id);
  // Hotkeys 1..9 then 0 for the tenth tab — matches the user's mental
  // model of a numbered tab strip.
  if (idx < 9) return String(idx + 1);
  return "0";
}

export function pageIdFromHotkey(key: string): PageId | null {
  if (key === "0") return PAGE_IDS[9] ?? null;
  const n = parseInt(key, 10);
  if (!Number.isFinite(n) || n < 1 || n > 9) return null;
  return PAGE_IDS[n - 1] ?? null;
}
