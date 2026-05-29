// Build a single snapshot of "what is vibestrate doing right now" by
// reading the on-disk state. The TUI repeatedly fetches a fresh
// snapshot and re-renders. Kept here so it can be tested without a
// terminal and reused by anything else that wants the same view
// (eg. a future `vibe status --live --json`).

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
import {
  deriveSchedulerLiveness,
  type SchedulerLiveness,
} from "../scheduler/scheduler-liveness.js";
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
  crewId: string | null;
  profileOverride: string | null;
  pauseRequested: boolean;
  pausedAtStatus: RunStatus | null;
  updatedAt: string;
  /** The agent the orchestrator most recently started and hasn't yet finished. */
  currentRole: string | null;
  currentProvider: string | null;
  currentSkills: string[];
  currentMcpServers: string[];
  /** Most-recent event of any kind (for the row's "last activity" line). */
  lastEvent: ShellEvent | null;
  /** Pending approvals / suggestions for this run (best-effort). */
  pendingApprovals: number;
  pendingSuggestions: number;
  /**
   * The last agent that ran, kept even after the run finished. Lets
   * terminal runs (failed/aborted/merge_ready) still surface "the
   * fixer was working on this" in the Overview pane.
   */
  lastRole: string | null;
  /**
   * Human-readable failure reason for terminal/blocked runs. Drawn
   * from state.error first, then the last failed event's message.
   */
  error: string | null;
  /** From the run's state.json — handy on the Overview for finished runs. */
  finalDecision: string | null;
  verification: string | null;
  flow: {
    label: string;
    flowId: string;
    currentStepId: string | null;
    currentStepLabel: string | null;
    currentStepStatus: string | null;
    completedSteps: number;
    totalSteps: number;
    participantContexts: string[];
  } | null;
};

export type ShellActivityEntry = {
  runId: string;
  event: ShellEvent;
};

export type ShellAggregates = {
  activeRuns: number;
  pendingApprovalsTotal: number;
  pendingSuggestionsTotal: number;
  queueWaiting: number;
  queueRunning: number;
};

export type ShellSnapshot = {
  capturedAt: string;
  projectRoot: string;
  scheduler: SchedulerState | null;
  /** Derived "is the scheduler actually picking up work?" verdict. */
  schedulerLiveness: SchedulerLiveness;
  queue: QueueEntry[];
  runs: ShellRunRow[];
  /** Tail of events keyed by runId, for the inspector pane. */
  recentEvents: Record<string, ShellEvent[]>;
  /** Most-recent events across all runs, newest first. Capped. */
  recentActivity: ShellActivityEntry[];
  aggregates: ShellAggregates;
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
  let pendingApprovalsTotal = 0;
  let pendingSuggestionsTotal = 0;
  for (const s of rowsSource) {
    const events = await readEventsTail(projectRoot, s.runId, eventTail);
    const live = deriveLive(events);
    const [pendingApprovals, pendingSuggestions] = await Promise.all([
      countPendingApprovals(projectRoot, s.runId),
      countPendingSuggestions(projectRoot, s.runId),
    ]);
    pendingApprovalsTotal += pendingApprovals;
    pendingSuggestionsTotal += pendingSuggestions;
    rows.push({
      runId: s.runId,
      task: s.task,
      taskId: s.taskId,
      status: s.status,
      effort: s.effort,
      readOnly: s.readOnly,
      crewId: s.crewId,
      profileOverride: s.profileOverride,
      pauseRequested: s.pauseRequested,
      pausedAtStatus: s.pausedAtStatus,
      updatedAt: s.updatedAt,
      ...live,
      pendingApprovals,
      pendingSuggestions,
      // state.error wins over the first failed event message (the
      // orchestrator stamps state.error with the final cause), but
      // fall back to the event when state.error is null.
      error: s.error ?? live.errorFromEvents,
      finalDecision: s.finalDecision ?? null,
      verification: s.verification ?? null,
      flow: deriveFlowSummary(s),
    });
    recentEvents[s.runId] = events;
  }

  const recentActivity = buildRecentActivity(recentEvents, 20);

  return {
    capturedAt: nowIso(),
    projectRoot,
    scheduler,
    schedulerLiveness: deriveSchedulerLiveness(scheduler),
    queue: queueEntries,
    runs: rows,
    recentEvents,
    recentActivity,
    aggregates: {
      activeRuns: rows.filter((r) => !isTerminal(r.status)).length,
      pendingApprovalsTotal,
      pendingSuggestionsTotal,
      queueWaiting: queueEntries.length,
      queueRunning: scheduler?.runningTaskIds.length ?? 0,
    },
  };
}

function deriveFlowSummary(state: RunState): ShellRunRow["flow"] {
  if (!state.flow) return null;
  const current =
    state.flow.steps.find((step) => step.id === state.flow?.currentStepId) ??
    null;
  return {
    label: state.flow.label,
    flowId: state.flow.flowId,
    currentStepId: state.flow.currentStepId,
    currentStepLabel: current?.label ?? null,
    currentStepStatus: current?.status ?? null,
    completedSteps: state.flow.steps.filter(
      (step) => step.status === "passed" || step.status === "skipped",
    ).length,
    totalSteps: state.flow.steps.length,
    participantContexts: state.flow.participants.map((participant) =>
      `${participant.label}:${participant.lastContextMode ?? participant.sessionReuse}`,
    ),
  };
}

async function countPendingApprovals(
  projectRoot: string,
  runId: string,
): Promise<number> {
  const file = path.join(projectRunsDir(projectRoot), runId, "approvals.json");
  if (!(await pathExists(file))) return 0;
  try {
    const text = await readText(file);
    if (!text.trim()) return 0;
    const data = JSON.parse(text) as {
      approvals?: { status?: unknown }[];
    };
    return (data.approvals ?? []).filter(
      (a) => typeof a?.status === "string" && a.status === "pending",
    ).length;
  } catch {
    return 0;
  }
}

async function countPendingSuggestions(
  projectRoot: string,
  runId: string,
): Promise<number> {
  const file = path.join(projectRunsDir(projectRoot), runId, "suggestions.json");
  if (!(await pathExists(file))) return 0;
  try {
    const text = await readText(file);
    if (!text.trim()) return 0;
    const data = JSON.parse(text) as {
      suggestions?: { status?: unknown }[];
    };
    return (data.suggestions ?? []).filter(
      (s) => typeof s?.status === "string" && s.status === "pending",
    ).length;
  } catch {
    return 0;
  }
}

function buildRecentActivity(
  byRun: Record<string, ShellEvent[]>,
  limit: number,
): ShellActivityEntry[] {
  const out: ShellActivityEntry[] = [];
  for (const [runId, events] of Object.entries(byRun)) {
    for (const event of events) out.push({ runId, event });
  }
  out.sort((a, b) => b.event.timestamp.localeCompare(a.event.timestamp));
  return out.slice(0, limit);
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
 * orchestrator emits structured events for role.started / completed /
 * failed and mcp.attached; we walk forward and keep the most recent
 * role.started that hasn't been followed by a matching completed/failed.
 */
function deriveLive(events: ShellEvent[]): {
  currentRole: string | null;
  currentProvider: string | null;
  currentSkills: string[];
  currentMcpServers: string[];
  lastEvent: ShellEvent | null;
  /** Last agent that ran (kept after completion so terminal runs still show it). */
  lastRole: string | null;
  /** First failure/blocked event message (most useful for "why"). */
  errorFromEvents: string | null;
} {
  let currentRole: string | null = null;
  let currentProvider: string | null = null;
  let currentSkills: string[] = [];
  let currentMcpServers: string[] = [];
  let lastRole: string | null = null;
  let errorFromEvents: string | null = null;
  for (const ev of events) {
    const roleId =
      ev.data && typeof ev.data.roleId === "string"
        ? (ev.data.roleId as string)
        : null;
    if (ev.type === "role.started" && roleId) {
      currentRole = roleId;
      lastRole = roleId;
      currentProvider =
        ev.data && typeof ev.data.provider === "string"
          ? (ev.data.provider as string)
          : null;
      currentSkills = [];
      currentMcpServers = [];
    } else if (
      (ev.type === "role.completed" || ev.type === "role.failed") &&
      roleId === currentRole
    ) {
      currentRole = null;
      currentProvider = null;
      currentSkills = [];
      currentMcpServers = [];
    } else if (
      ev.type === "mcp.attached" &&
      roleId === currentRole &&
      Array.isArray(ev.data?.servers)
    ) {
      const servers = ev.data?.servers as Array<{ name?: unknown }>;
      currentMcpServers = servers
        .map((s) => (typeof s.name === "string" ? s.name : null))
        .filter((n): n is string => !!n);
    } else if (
      ev.type === "skill.assigned" &&
      roleId === currentRole &&
      typeof ev.data?.skillName === "string"
    ) {
      currentSkills = [...new Set([...currentSkills, ev.data.skillName as string])];
    }
    // Track the most relevant "why" message so the Overview can
    // answer "why did this run end up in its current state"
    // without forcing the user to scroll the events tail.
    //
    // Priority: a hard failure (role.failed / provider.failed /
    // run.failed / run.aborted) wins over a softer one (policy
    // warning, approval reject, generic state→blocked). We
    // OVERWRITE a softer earlier reason when a hard one shows up,
    // but never overwrite a hard reason with a softer follow-up.
    const eventReasonRank = (t: string): number => {
      if (
        t === "role.failed" ||
        t === "provider.failed" ||
        t === "run.failed" ||
        t === "run.aborted"
      ) {
        return 3;
      }
      if (t === "approval.rejected") return 2;
      if (t === "policy.warning") return 1;
      return 0;
    };
    const isBlockedTransition =
      ev.type === "state.changed" &&
      ev.data &&
      typeof ev.data.status === "string" &&
      ev.data.status === "blocked";
    const incomingRank = isBlockedTransition ? 1 : eventReasonRank(ev.type);
    if (incomingRank > 0 && ev.message) {
      if (!errorFromEvents || incomingRank >= 3) {
        errorFromEvents = ev.message;
      }
    }
  }
  return {
    currentRole,
    currentProvider,
    currentSkills,
    currentMcpServers,
    lastEvent: events.length > 0 ? events[events.length - 1] ?? null : null,
    lastRole,
    errorFromEvents,
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
