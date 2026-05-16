// Build a single snapshot of "what is amaco doing right now" by
// reading the on-disk state. The TUI repeatedly fetches a fresh
// snapshot and re-renders. Kept here so it can be tested without a
// terminal and reused by anything else that wants the same view
// (eg. a future `amaco status --live --json`).

import path from "node:path";
import { readDirSafe, pathExists, readText } from "../utils/fs.js";
import { readJson } from "../utils/json.js";
import {
  projectRunsDir,
  runStatePath,
  runEventsPath,
  schedulerQueueFile,
  schedulerStateFile,
} from "../utils/paths.js";
import {
  runStateSchema,
  isTerminal,
  type RunState,
} from "../core/state-machine.js";
import type { RunStatus } from "../workflow/workflow-types.js";
import {
  queueFileSchema,
  schedulerStateSchema,
  type QueueEntry,
  type SchedulerState,
} from "../scheduler/scheduler-types.js";
import { nowIso } from "../utils/time.js";

export type ShellEvent = {
  timestamp: string;
  type: string;
  message: string;
  data?: Record<string, unknown>;
};

/**
 * Per-run summary the TUI renders one row for. Everything past
 * `status` is derived from the event tail (best-effort — when the
 * event log is missing or unparseable, the row still renders, just
 * without the live fields).
 */
export type ShellRunRow = {
  runId: string;
  task: string;
  taskId: string | null;
  status: RunStatus;
  effort: "low" | "medium" | "high" | null;
  readOnly: boolean;
  providerOverride: string | null;
  resolvedProviderId: string | null;
  pauseRequested: boolean;
  pausedAtStatus: RunStatus | null;
  updatedAt: string;
  /** The agent the orchestrator most recently started and hasn't yet finished. */
  currentAgent: string | null;
  currentProvider: string | null;
  currentSkills: string[];
  currentMcpServers: string[];
  /** Most-recent event of any kind (for the row's "last activity" line). */
  lastEvent: ShellEvent | null;
};

export type ShellSnapshot = {
  capturedAt: string;
  projectRoot: string;
  scheduler: SchedulerState | null;
  queue: QueueEntry[];
  runs: ShellRunRow[];
  /** Tail of events keyed by runId, for the inspector pane. */
  recentEvents: Record<string, ShellEvent[]>;
};

type LoadOptions = {
  /** Cap on rows. Older terminal runs are dropped first. */
  maxRows?: number;
  /** Per-row tail of events kept for the inspector. */
  eventTail?: number;
};

const DEFAULT_MAX_ROWS = 20;
const DEFAULT_EVENT_TAIL = 60;

export async function buildShellSnapshot(
  projectRoot: string,
  opts: LoadOptions = {},
): Promise<ShellSnapshot> {
  const maxRows = opts.maxRows ?? DEFAULT_MAX_ROWS;
  const eventTail = opts.eventTail ?? DEFAULT_EVENT_TAIL;

  const [scheduler, queueEntries] = await Promise.all([
    readSchedulerState(projectRoot),
    readQueueEntries(projectRoot),
  ]);

  const runIds = (await readDirSafe(projectRunsDir(projectRoot))).sort();
  const states: RunState[] = [];
  for (const id of runIds) {
    const state = await readRunState(projectRoot, id);
    if (state) states.push(state);
  }

  // Active runs first (newest first within each group), then a tail of
  // recently-finished runs so the user keeps context after a run ends.
  const active = states
    .filter((s) => !isTerminal(s.status))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const terminal = states
    .filter((s) => isTerminal(s.status))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const rowsSource = [...active, ...terminal].slice(0, maxRows);

  const rows: ShellRunRow[] = [];
  const recentEvents: Record<string, ShellEvent[]> = {};
  for (const s of rowsSource) {
    const events = await readEventsTail(projectRoot, s.runId, eventTail);
    const live = deriveLive(events);
    rows.push({
      runId: s.runId,
      task: s.task,
      taskId: s.taskId,
      status: s.status,
      effort: s.effort,
      readOnly: s.readOnly,
      providerOverride: s.providerOverride,
      resolvedProviderId: s.resolvedProviderId,
      pauseRequested: s.pauseRequested,
      pausedAtStatus: s.pausedAtStatus,
      updatedAt: s.updatedAt,
      ...live,
    });
    recentEvents[s.runId] = events;
  }

  return {
    capturedAt: nowIso(),
    projectRoot,
    scheduler,
    queue: queueEntries,
    runs: rows,
    recentEvents,
  };
}

async function readRunState(
  projectRoot: string,
  runId: string,
): Promise<RunState | null> {
  const file = runStatePath(projectRoot, runId);
  if (!(await pathExists(file))) return null;
  try {
    const raw = await readJson<unknown>(file);
    const parsed = runStateSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function readSchedulerState(
  projectRoot: string,
): Promise<SchedulerState | null> {
  const file = schedulerStateFile(projectRoot);
  if (!(await pathExists(file))) return null;
  try {
    const raw = await readJson<unknown>(file);
    const parsed = schedulerStateSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function readQueueEntries(projectRoot: string): Promise<QueueEntry[]> {
  const file = schedulerQueueFile(projectRoot);
  if (!(await pathExists(file))) return [];
  try {
    const text = await readText(file);
    if (!text.trim()) return [];
    const parsed = queueFileSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data.entries : [];
  } catch {
    return [];
  }
}

async function readEventsTail(
  projectRoot: string,
  runId: string,
  tail: number,
): Promise<ShellEvent[]> {
  const file = runEventsPath(projectRoot, runId);
  if (!(await pathExists(file))) return [];
  let text: string;
  try {
    text = await readText(file);
  } catch {
    return [];
  }
  // Walk lines from the end so we don't materialize huge logs.
  const lines = text.split(/\r?\n/);
  const out: ShellEvent[] = [];
  for (let i = lines.length - 1; i >= 0 && out.length < tail; i -= 1) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    try {
      const v = JSON.parse(line) as unknown;
      if (v && typeof v === "object") {
        const o = v as Record<string, unknown>;
        out.push({
          timestamp: String(o.timestamp ?? ""),
          type: String(o.type ?? ""),
          message: String(o.message ?? ""),
          data:
            o.data && typeof o.data === "object"
              ? (o.data as Record<string, unknown>)
              : undefined,
        });
      }
    } catch {
      // Tolerate a partial last line — common when the run is writing.
    }
  }
  return out.reverse();
}

/**
 * Derive "what's happening right now" from the events tail. The
 * orchestrator emits structured events for agent.started / completed /
 * failed and mcp.attached; we walk forward and keep the most recent
 * agent.started that hasn't been followed by a matching completed/failed.
 */
function deriveLive(events: ShellEvent[]): {
  currentAgent: string | null;
  currentProvider: string | null;
  currentSkills: string[];
  currentMcpServers: string[];
  lastEvent: ShellEvent | null;
} {
  let currentAgent: string | null = null;
  let currentProvider: string | null = null;
  let currentSkills: string[] = [];
  let currentMcpServers: string[] = [];
  for (const ev of events) {
    const agentId =
      ev.data && typeof ev.data.agentId === "string"
        ? (ev.data.agentId as string)
        : null;
    if (ev.type === "agent.started" && agentId) {
      currentAgent = agentId;
      currentProvider =
        ev.data && typeof ev.data.provider === "string"
          ? (ev.data.provider as string)
          : null;
      currentSkills = [];
      currentMcpServers = [];
    } else if (
      (ev.type === "agent.completed" || ev.type === "agent.failed") &&
      agentId === currentAgent
    ) {
      currentAgent = null;
      currentProvider = null;
      currentSkills = [];
      currentMcpServers = [];
    } else if (
      ev.type === "mcp.attached" &&
      agentId === currentAgent &&
      Array.isArray(ev.data?.servers)
    ) {
      const servers = ev.data?.servers as Array<{ name?: unknown }>;
      currentMcpServers = servers
        .map((s) => (typeof s.name === "string" ? s.name : null))
        .filter((n): n is string => !!n);
    } else if (
      ev.type === "skill.assigned" &&
      agentId === currentAgent &&
      typeof ev.data?.skillName === "string"
    ) {
      currentSkills = [...new Set([...currentSkills, ev.data.skillName as string])];
    }
  }
  return {
    currentAgent,
    currentProvider,
    currentSkills,
    currentMcpServers,
    lastEvent: events.length > 0 ? events[events.length - 1] ?? null : null,
  };
}

/** Convenience for callers that just want the active-run rows. */
export function activeRunRows(snapshot: ShellSnapshot): ShellRunRow[] {
  return snapshot.runs.filter((r) => !isTerminal(r.status));
}

// Re-export so callers don't have to import from state-machine.
export { isTerminal };

// Resolve a project-relative path for any utility that wants to surface
// short paths in the TUI footer. Tiny helper kept here to avoid
// re-importing path in the renderer.
export function relProjectPath(projectRoot: string, abs: string): string {
  const rel = path.relative(projectRoot, abs);
  return rel || abs;
}
