// Pure derivation of the status-bar fields from the shell's data sources.
// Import-free except for the (pure) terminal-status list, so it runs under
// the node-only Vitest environment.
import { TERMINAL_STATUSES } from "../../workflow/workflow-types.js";
import type { SafetyMode, SessionState } from "./ui-state.js";

export type StatusRun = {
  status: string;
  task: string;
  updatedAt: string;
};

export type StatusModelInput = {
  projectName: string;
  git: { branch: string | null; isLinkedWorktree: boolean } | null;
  session: SessionState;
  defaultCrewId: string | null;
  aggregates: {
    activeRuns: number;
    queueWaiting: number;
    queueRunning: number;
  } | null;
  runs: readonly StatusRun[];
};

export type StatusModel = {
  project: string;
  branch: string;
  worktree: boolean;
  mode: SafetyMode;
  /** Human activity line: "idle", "running · 1 active", "idle · 2 queued". */
  activity: string;
  busy: boolean;
  crew: string;
  flow: string;
  /** Task text of the most-recently-active run, truncated; null when idle. */
  runningTask: string | null;
};

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

export function buildStatusModel(input: StatusModelInput): StatusModel {
  const terminal = TERMINAL_STATUSES as readonly string[];
  const active = input.runs
    .filter((r) => !terminal.includes(r.status))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const running = active[0] ?? null;

  const activeRuns = input.aggregates?.activeRuns ?? active.length;
  const queued = input.aggregates?.queueWaiting ?? 0;
  const parts: string[] = [];
  if (activeRuns > 0) parts.push(`running · ${activeRuns} active`);
  else parts.push("idle");
  if (queued > 0) parts.push(`${queued} queued`);

  return {
    project: input.projectName || "—",
    branch: input.git?.branch ?? "—",
    worktree: input.git?.isLinkedWorktree ?? false,
    mode: input.session.mode,
    activity: parts.join(" · "),
    busy: activeRuns > 0,
    crew: input.session.crewId ?? input.defaultCrewId ?? "default",
    flow: input.session.flowId ?? "default",
    runningTask: running ? truncate(running.task, 48) : null,
  };
}
