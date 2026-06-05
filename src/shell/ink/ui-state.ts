// Pure UI state for the ink-based panel. Kept node-safe so it can be exercised
// under the node-only Vitest environment - the imports below are either
// type-only (erased) or pure, dependency-free helpers.
import type { MdLine } from "./markdown-render.js";
import { looksVerbose } from "./output-window.js";

/** A docs topic for the in-shell browser (mirrors docs-source's DocTopic,
 *  duplicated here so this module pulls in no node-fs dependency). */
export type DocTopicLite = { slug: string; label: string; section: string };

export type DocsState = {
  open: boolean;
  topics: DocTopicLite[];
  index: number;
  lines: MdLine[];
  scroll: number;
  loadingContent: boolean;
  error: string | null;
};

// Order matters: number hotkeys 1-0 follow this list left-to-right,
// so the order is intentionally the natural workflow:
//   Dashboard → Flow → Crew (the setup) → Queue → Runs (execution)
//   → Approvals + Suggestions (gates) → Skills → Roadmap → Doctor.
// The first ten get number hotkeys 1-9/0; Notifs rides last (palette-only).
export const PAGE_IDS = [
  "dashboard",
  "flows",
  "crew",
  "profiles",
  "runs",
  "approvals",
  "suggestions",
  "skills",
  "roadmap",
  "doctor",
  "notifications",
  "config",
  "consult",
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

/**
 * The safety posture the next run launched from the prompt will use.
 * `write` = normal; `read-only` = investigation only (adds `--read-only`).
 * Cycled with the `m` key. (Strict-apply is a project-level policy, not a
 * per-run flag, so it's not part of this toggle.)
 */
export type SafetyMode = "write" | "read-only";
export const SAFETY_MODES: SafetyMode[] = ["write", "read-only"];

/** A pickable item in the in-shell Crew/Flow selector. */
export type PickerItem = { id: string; label: string };
export type PickerState = {
  kind: "crew" | "flow";
  items: PickerItem[];
  index: number;
} | null;

/**
 * Session context shown in the status bar and used to seed the next run
 * the user launches from the prompt. `crewId`/`flowId` are null until the
 * user picks one (null = the project default crew / the default flow).
 */
export type SessionState = {
  mode: SafetyMode;
  crewId: string | null;
  flowId: string | null;
};

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
  /** Cursor inside the filtered palette list - clamped by the view. */
  paletteSelectedIndex: number;
  helpOpen: boolean;
  /**
   * Free-form `vibe …` command runner overlay. Opens with `!`. The
   * runtime spawns the resolved vibestrate binary argv-only with the
   * user's input parsed via `parseArgs` (no shell expansion) and
   * streams the output back into `runner.output`.
   */
  runner: {
    input: string;
    output: string;
    running: boolean;
    exitCode: number | null;
    history: string[];
    historyIndex: number;
    /** Lines scrolled up from the bottom in the output pane (0 = tail). */
    scroll: number;
  };
  /**
   * Prompt command-completion overlay. `index` is the selected candidate;
   * `dismissed` hides the list until the input changes (Esc to dismiss). The
   * candidate list itself is derived in the view from the input + command spec,
   * not stored here.
   */
  completion: { index: number; dismissed: boolean };
  /** In-shell docs browser overlay. */
  docs: DocsState;
  /** Session context (status bar + seeds the next prompt-launched run). */
  session: SessionState;
  /** True while the persistent bottom prompt owns keyboard input. */
  promptFocused: boolean;
  /** When true, command output fills the body full-width (readable) instead of
   *  the narrow right pane. Toggled with `O`. */
  outputExpanded: boolean;
  /** Open Crew/Flow selector overlay, or null. */
  picker: PickerState;
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
    input: "",
    output: "",
    running: false,
    exitCode: null,
    history: [],
    historyIndex: -1,
    scroll: 0,
  },
  completion: { index: 0, dismissed: false },
  docs: {
    open: false,
    topics: [],
    index: 0,
    lines: [],
    scroll: 0,
    loadingContent: false,
    error: null,
  },
  session: {
    mode: "write",
    crewId: null,
    flowId: null,
  },
  promptFocused: false,
  outputExpanded: false,
  picker: null,
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
  | { type: "runner.input"; value: string }
  | { type: "runner.started" }
  | { type: "runner.append"; chunk: string }
  | { type: "runner.finished"; exitCode: number | null }
  | { type: "runner.history.prev" }
  | { type: "runner.history.next" }
  | { type: "runner.scroll"; delta: number }
  | { type: "completion.move"; delta: number; max: number }
  | { type: "completion.dismiss" }
  | { type: "docs.open" }
  | { type: "docs.close" }
  | { type: "docs.loaded"; topics: DocTopicLite[] }
  | { type: "docs.error"; message: string }
  | { type: "docs.select"; index: number }
  | { type: "docs.content"; lines: MdLine[] }
  | { type: "docs.scroll"; delta: number }
  | { type: "session.mode.cycle" }
  | { type: "session.crew.set"; crewId: string | null }
  | { type: "session.flow.set"; flowId: string | null }
  | { type: "prompt.focus" }
  | { type: "prompt.blur" }
  | { type: "output.expand.toggle" }
  | { type: "output.collapse" }
  | { type: "picker.open"; kind: "crew" | "flow"; items: PickerItem[]; index: number }
  | { type: "picker.move"; delta: number }
  | { type: "picker.close" }
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
    case "runner.input":
      // Editing the input re-arms the completion overlay from the top.
      return {
        ...state,
        runner: { ...state.runner, input: action.value, historyIndex: -1 },
        completion: { index: 0, dismissed: false },
      };
    case "runner.started":
      return {
        ...state,
        // Each run starts in the narrow pane + dismisses the completion list;
        // `runner.finished` re-opens the full-width view if the output is verbose.
        outputExpanded: false,
        completion: { index: 0, dismissed: true },
        runner: {
          ...state.runner,
          running: true,
          output: "",
          exitCode: null,
          scroll: 0,
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
      // Verbose output (YAML / tables) is unreadable truncated in the narrow
      // pane, so auto-open the full-width readable view; the user collapses
      // with O / Esc.
      return {
        ...state,
        outputExpanded: state.outputExpanded || looksVerbose(state.runner.output),
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
    case "session.mode.cycle": {
      const idx = SAFETY_MODES.indexOf(state.session.mode);
      const next = SAFETY_MODES[(idx + 1) % SAFETY_MODES.length] ?? "write";
      return { ...state, session: { ...state.session, mode: next } };
    }
    case "session.crew.set":
      return { ...state, session: { ...state.session, crewId: action.crewId } };
    case "session.flow.set":
      return { ...state, session: { ...state.session, flowId: action.flowId } };
    case "prompt.focus":
      // Focusing the prompt closes other modal layers so input isn't split,
      // and re-arms the completion overlay.
      return {
        ...state,
        promptFocused: true,
        paletteOpen: false,
        helpOpen: false,
        picker: null,
        completion: { index: 0, dismissed: false },
      };
    case "prompt.blur":
      return { ...state, promptFocused: false };
    case "output.expand.toggle":
      return { ...state, outputExpanded: !state.outputExpanded };
    case "output.collapse":
      return { ...state, outputExpanded: false };
    case "picker.open":
      return {
        ...state,
        picker: { kind: action.kind, items: action.items, index: action.index },
        promptFocused: false,
      };
    case "picker.move": {
      if (!state.picker) return state;
      const len = state.picker.items.length;
      if (len === 0) return state;
      const next = (state.picker.index + action.delta + len) % len;
      return { ...state, picker: { ...state.picker, index: next } };
    }
    case "picker.close":
      return { ...state, picker: null };
    case "runner.scroll": {
      const next = Math.max(0, state.runner.scroll + action.delta);
      return { ...state, runner: { ...state.runner, scroll: next } };
    }
    case "completion.move": {
      const next = Math.max(
        0,
        Math.min(action.max, state.completion.index + action.delta),
      );
      return { ...state, completion: { ...state.completion, index: next } };
    }
    case "completion.dismiss":
      return {
        ...state,
        completion: { ...state.completion, dismissed: true },
      };
    case "docs.open":
      return {
        ...state,
        docs: { ...state.docs, open: true, error: null },
        promptFocused: false,
        paletteOpen: false,
        helpOpen: false,
        picker: null,
      };
    case "docs.close":
      return { ...state, docs: { ...state.docs, open: false } };
    case "docs.loaded":
      return {
        ...state,
        docs: { ...state.docs, topics: action.topics, error: null },
      };
    case "docs.error":
      return { ...state, docs: { ...state.docs, error: action.message } };
    case "docs.select": {
      const len = state.docs.topics.length;
      const index = len === 0 ? 0 : ((action.index % len) + len) % len;
      return {
        ...state,
        docs: { ...state.docs, index, scroll: 0, lines: [], loadingContent: true },
      };
    }
    case "docs.content":
      return {
        ...state,
        docs: { ...state.docs, lines: action.lines, loadingContent: false, scroll: 0 },
      };
    case "docs.scroll": {
      const next = Math.max(0, state.docs.scroll + action.delta);
      return { ...state, docs: { ...state.docs, scroll: next } };
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
    case "flows":
      return "Flow";
    case "runs":
      return "Runs";
    case "roadmap":
      return "Roadmap";
    case "crew":
      return "Crew";
    case "profiles":
      return "Profiles";
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
    case "config":
      return "Config";
    case "consult":
      return "Consult";
  }
}

export function pageHotkey(id: PageId): string {
  const idx = PAGE_IDS.indexOf(id);
  // Hotkeys 1..9 then 0 for the tenth tab. Any page past the tenth has no
  // number key (reachable via the `:` palette) - returns "".
  if (idx < 9) return String(idx + 1);
  if (idx === 9) return "0";
  return "";
}

export function pageIdFromHotkey(key: string): PageId | null {
  if (key === "0") return PAGE_IDS[9] ?? null;
  const n = parseInt(key, 10);
  if (!Number.isFinite(n) || n < 1 || n > 9) return null;
  return PAGE_IDS[n - 1] ?? null;
}
