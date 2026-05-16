// Pure renderer for the amaco shell TUI. Takes a snapshot + UI state
// (selection, view mode, last toast) and returns the lines that should
// fill the terminal frame. No I/O, no ANSI cursor moves — the main
// loop is responsible for clearing & redrawing.

import type {
  ShellRunRow,
  ShellSnapshot,
  ShellEvent,
} from "./shell-snapshot.js";
import type { RunStatus } from "../workflow/workflow-types.js";

const ESC = "\x1b[";
const COLOR_ENABLED = !process.env.NO_COLOR && process.stdout.isTTY === true;

function wrap(open: string, close: string, s: string): string {
  if (!COLOR_ENABLED) return s;
  return `${ESC}${open}m${s}${ESC}${close}m`;
}
const c = {
  bold: (s: string) => wrap("1", "22", s),
  dim: (s: string) => wrap("2", "22", s),
  red: (s: string) => wrap("31", "39", s),
  green: (s: string) => wrap("32", "39", s),
  yellow: (s: string) => wrap("33", "39", s),
  blue: (s: string) => wrap("34", "39", s),
  magenta: (s: string) => wrap("35", "39", s),
  cyan: (s: string) => wrap("36", "39", s),
  gray: (s: string) => wrap("90", "39", s),
  invert: (s: string) => wrap("7", "27", s),
};

const STATUS_COLORS: Partial<Record<RunStatus, (s: string) => string>> = {
  failed: c.red,
  aborted: c.red,
  blocked: c.red,
  paused: c.yellow,
  waiting_for_approval: c.yellow,
  merge_ready: c.green,
  planning: c.cyan,
  architecting: c.cyan,
  executing: c.magenta,
  validating: c.blue,
  reviewing: c.blue,
  fixing: c.magenta,
  verifying: c.blue,
};

function paintStatus(s: RunStatus): string {
  const fn = STATUS_COLORS[s] ?? c.dim;
  return fn(s);
}

function truncate(s: string, width: number): string {
  if (width <= 0) return "";
  if (s.length <= width) return s;
  return `${s.slice(0, Math.max(0, width - 1))}…`;
}

function padRight(s: string, width: number): string {
  if (s.length >= width) return s;
  return s + " ".repeat(width - s.length);
}

function hr(width: number, char = "─"): string {
  return c.dim(char.repeat(Math.max(0, width)));
}

export type ShellViewMode = "runs" | "inspector" | "help";

export type ShellUiState = {
  selectedIndex: number;
  view: ShellViewMode;
  toast: { kind: "ok" | "err" | "info"; message: string } | null;
  /**
   * The dialog that's currently waiting for user input. Each value is
   * a single-key confirmation prompt; the main loop resolves it on the
   * next keypress.
   */
  pendingConfirm:
    | { action: "abort"; runId: string }
    | null;
};

export type ShellSize = { cols: number; rows: number };

export type ShellRenderInput = {
  snapshot: ShellSnapshot;
  ui: ShellUiState;
  size: ShellSize;
};

export function renderShell(input: ShellRenderInput): string {
  const { snapshot, ui, size } = input;
  const cols = Math.max(60, size.cols);
  const rows = Math.max(15, size.rows);

  const lines: string[] = [];
  lines.push(renderHeader(snapshot, cols));
  lines.push(hr(cols));

  const selectedRow = snapshot.runs[ui.selectedIndex] ?? null;

  // Layout: runs list (top), inspector (middle), queue (lower), footer.
  // Budget the inspector + queue heights based on terminal rows so we
  // never overflow.
  const footerRows = 3 + (ui.toast ? 1 : 0) + (ui.pendingConfirm ? 1 : 0);
  const listMax = Math.max(3, Math.min(12, snapshot.runs.length || 1));
  const remaining = rows - 2 /* header */ - listMax - footerRows - 4;
  const inspectorRows = Math.max(4, Math.min(14, remaining));

  lines.push(...renderRuns(snapshot.runs, ui.selectedIndex, cols, listMax));
  lines.push(hr(cols));
  lines.push(...renderInspector(snapshot, selectedRow, cols, inspectorRows));
  lines.push(hr(cols));
  lines.push(...renderQueue(snapshot, cols));
  lines.push(hr(cols));
  lines.push(...renderFooter(ui, cols));

  if (ui.view === "help") {
    return renderHelpOverlay(cols, rows);
  }

  // Pad / truncate to terminal height so the alt-screen doesn't scroll.
  const padded: string[] = [];
  for (const line of lines.slice(0, rows)) padded.push(line);
  while (padded.length < rows) padded.push("");
  return padded.join("\n");
}

function renderHeader(snapshot: ShellSnapshot, cols: number): string {
  const left = c.bold("amaco shell");
  const sched = snapshot.scheduler;
  const schedBits: string[] = [];
  if (sched) {
    if (sched.paused) schedBits.push(c.yellow("scheduler paused"));
    schedBits.push(`policy ${sched.queuePolicy}`);
    schedBits.push(`max ${sched.maxConcurrentRuns}`);
    if (Object.keys(sched.sourceQuotas).length > 0) {
      schedBits.push(`quotas ${Object.keys(sched.sourceQuotas).length}`);
    }
  } else {
    schedBits.push(c.dim("no scheduler state"));
  }
  const captured = new Date(snapshot.capturedAt).toLocaleTimeString();
  const middle = c.dim(schedBits.join(" · "));
  const right = c.dim(captured);
  const used = left.length + middle.length + right.length + 4;
  if (used > cols) {
    return `${left}  ${c.dim(truncate(schedBits.join(" · "), cols - left.length - 4))}`;
  }
  return `${left}  ${middle}${" ".repeat(cols - used + 4)}${right}`;
}

function renderRuns(
  runs: ShellRunRow[],
  selectedIndex: number,
  cols: number,
  maxRows: number,
): string[] {
  const out: string[] = [];
  out.push(
    c.dim(
      "RUNS  " +
        padRight("run id", 18) +
        " " +
        padRight("status", 14) +
        " " +
        padRight("agent", 11) +
        " " +
        padRight("provider", 14) +
        " task",
    ),
  );
  if (runs.length === 0) {
    out.push(c.dim("  no runs found — start one with `amaco run <task>`"));
    return out;
  }
  const visible = runs.slice(0, maxRows);
  visible.forEach((r, i) => {
    const isSelected = i === selectedIndex;
    const cursor = isSelected ? c.cyan("›") : " ";
    const runIdShort = truncate(r.runId, 18);
    const status = padRight(paintStatus(r.status), 14 + (paintStatus(r.status).length - r.status.length));
    const agent = padRight(r.currentAgent ?? c.dim("—"), 11 + (r.currentAgent ? 0 : c.dim("—").length - 1));
    const providerRaw = r.currentProvider ?? r.resolvedProviderId ?? "—";
    const providerColored = r.currentProvider ? providerRaw : c.dim(providerRaw);
    const provider = padRight(providerColored, 14 + (providerColored.length - providerRaw.length));
    const effort = r.effort ? c.dim(` [${r.effort}]`) : "";
    const readOnly = r.readOnly ? c.dim(" [read-only]") : "";
    const pauseHint = r.pauseRequested && r.status !== "paused" ? c.yellow(" (pausing)") : "";
    const taskCol = cols - 4 - 18 - 1 - 14 - 1 - 11 - 1 - 14 - 1;
    const task = truncate(r.task + effort + readOnly + pauseHint, Math.max(10, taskCol));
    const line = `${cursor} ${padRight(runIdShort, 18)} ${status} ${agent} ${provider} ${task}`;
    out.push(isSelected ? c.invert(line) : line);
  });
  if (runs.length > visible.length) {
    out.push(c.dim(`  … ${runs.length - visible.length} more`));
  }
  return out;
}

function renderInspector(
  snapshot: ShellSnapshot,
  row: ShellRunRow | null,
  cols: number,
  budget: number,
): string[] {
  const out: string[] = [];
  if (!row) {
    out.push(c.dim("INSPECTOR  (no run selected)"));
    return out;
  }
  out.push(c.dim(`INSPECTOR  ${row.runId}  ${paintStatus(row.status)}`));
  const facts: string[] = [];
  if (row.taskId) facts.push(`task=${row.taskId}`);
  if (row.effort) facts.push(`effort=${row.effort}`);
  if (row.providerOverride)
    facts.push(`providerOverride=${row.providerOverride}`);
  if (row.resolvedProviderId && row.resolvedProviderId !== row.providerOverride)
    facts.push(`resolved=${row.resolvedProviderId}`);
  if (row.readOnly) facts.push(c.yellow("read-only"));
  if (row.pauseRequested) facts.push(c.yellow("pause requested"));
  if (row.pausedAtStatus) facts.push(`pausedAt=${row.pausedAtStatus}`);
  out.push("  " + (facts.length > 0 ? facts.join("  ") : c.dim("—")));

  const live: string[] = [];
  if (row.currentAgent) {
    live.push(
      `agent=${c.cyan(row.currentAgent)}` +
        (row.currentProvider ? `  provider=${row.currentProvider}` : ""),
    );
  } else {
    live.push(c.dim("no active agent"));
  }
  if (row.currentSkills.length > 0) {
    live.push(`skills: ${row.currentSkills.join(", ")}`);
  }
  if (row.currentMcpServers.length > 0) {
    live.push(`mcp: ${row.currentMcpServers.join(", ")}`);
  }
  for (const l of live) out.push("  " + truncate(l, cols - 4));

  out.push("");
  out.push(c.dim("  recent events"));
  const events = snapshot.recentEvents[row.runId] ?? [];
  const slice = events.slice(-Math.max(2, budget - out.length - 1));
  if (slice.length === 0) {
    out.push("  " + c.dim("no events yet"));
  } else {
    for (const ev of slice) {
      out.push("  " + renderEventLine(ev, cols - 4));
    }
  }
  return out;
}

function renderEventLine(ev: ShellEvent, width: number): string {
  const time = ev.timestamp ? c.dim(ev.timestamp.slice(11, 19)) : "";
  const tag = colorEventType(ev.type);
  const message = truncate(ev.message, Math.max(20, width - tag.length - 12));
  return `${time}  ${tag}  ${message}`;
}

function colorEventType(type: string): string {
  if (type.endsWith(".failed")) return c.red(type);
  if (type === "run.aborted") return c.red(type);
  if (type === "run.completed" || type === "agent.completed")
    return c.green(type);
  if (type.startsWith("approval.")) return c.yellow(type);
  if (type.startsWith("run.pause") || type.startsWith("run.resume"))
    return c.yellow(type);
  if (type === "mcp.attached") return c.magenta(type);
  if (type === "agent.started" || type === "provider.started")
    return c.cyan(type);
  return c.dim(type);
}

function renderQueue(snapshot: ShellSnapshot, cols: number): string[] {
  const out: string[] = [];
  const q = snapshot.queue;
  const sched = snapshot.scheduler;
  const inflight = sched?.runningTaskIds.length ?? 0;
  out.push(
    c.dim(
      `QUEUE  ${q.length} waiting · ${inflight} running` +
        (sched ? ` · ${sched.queuePolicy}` : ""),
    ),
  );
  if (q.length === 0) {
    out.push(c.dim("  queue is empty"));
    return out;
  }
  const visible = q.slice(0, 4);
  for (const e of visible) {
    const line = `  ${padRight(e.taskId, 24)} ${c.dim(`prio=${e.priority}`)}  ${c.dim(`src=${e.source}`)}`;
    out.push(truncate(line, cols));
  }
  if (q.length > visible.length) {
    out.push(c.dim(`  … ${q.length - visible.length} more`));
  }
  return out;
}

function renderFooter(ui: ShellUiState, cols: number): string[] {
  const out: string[] = [];
  out.push(
    c.dim(
      "↑/↓ select   p pause   r resume   a abort   i inspect   ? help   q quit",
    ),
  );
  if (ui.pendingConfirm?.action === "abort") {
    out.push(
      c.yellow(
        `confirm abort of ${ui.pendingConfirm.runId}? press y to confirm, any other key to cancel.`,
      ),
    );
  }
  if (ui.toast) {
    const paint =
      ui.toast.kind === "ok"
        ? c.green
        : ui.toast.kind === "err"
          ? c.red
          : c.cyan;
    out.push(paint(truncate(ui.toast.message, cols)));
  }
  return out;
}

function renderHelpOverlay(cols: number, rows: number): string {
  const lines = [
    c.bold("amaco shell — keybindings"),
    "",
    "  ↑ / k         move selection up",
    "  ↓ / j         move selection down",
    "  enter         focus inspector (placeholder for now)",
    "  p             request pause for selected run",
    "  r             request resume for selected run",
    "  a             abort selected run (asks for confirmation)",
    "  i             switch inspector view (events / details)",
    "  ?             toggle this help",
    "  q / Ctrl+C    quit",
    "",
    c.dim("press ? again to close"),
  ];
  const out: string[] = [];
  for (const l of lines.slice(0, rows)) out.push(l);
  while (out.length < rows) out.push("");
  void cols;
  return out.join("\n");
}
