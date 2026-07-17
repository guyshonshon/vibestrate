// Pure derivation of the status-bar fields from the shell's data sources.
// Import-free except for the (pure) terminal-status list, so it runs under
// the node-only Vitest environment.
import { TERMINAL_STATUSES } from "../../core/workflow/workflow-types.js";
import type { SafetyMode, SessionState } from "./ui-state.js";
import type { SpendCapState } from "../../core/metrics/spend-cap-service.js";

export type StatusRun = {
  status: string;
  task: string;
  updatedAt: string;
};

/** Today's spend vs the daily cap, already evaluated (see evaluateSpendCap). */
export type StatusBudgetInput = {
  spentUsd: number;
  /** Daily USD cap, or null when none is configured. */
  cap: number | null;
  state: SpendCapState;
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
    pendingApprovals: number;
  } | null;
  /** null while config/spend is still loading. */
  budget: StatusBudgetInput | null;
  runs: readonly StatusRun[];
};

export type StatusBudget = {
  /** Compact display string, e.g. "$2.34 / $10.00" or "$2.34 today". */
  label: string;
  state: SpendCapState;
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
  /** Today's spend vs cap; null when there's nothing worth showing. */
  budget: StatusBudget | null;
  /** Approvals waiting on the user across all runs (0 = none). */
  pendingApprovals: number;
};

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

function formatUsd(n: number): string {
  // Clamp tiny negatives/NaN to 0 so the header never shows "$-0.00"/"$NaN".
  const v = Number.isFinite(n) && n > 0 ? n : 0;
  return `$${v.toFixed(2)}`;
}

/**
 * Compact budget chip. With a cap, show the ratio so the headroom is visible;
 * with no cap, show today's spend only (and nothing at all when it's $0, so an
 * idle project with no budget configured stays uncluttered).
 */
function buildBudget(input: StatusBudgetInput | null): StatusBudget | null {
  if (!input) return null;
  if (input.cap !== null) {
    return { label: `${formatUsd(input.spentUsd)} / ${formatUsd(input.cap)}`, state: input.state };
  }
  if (input.spentUsd > 0) {
    return { label: `${formatUsd(input.spentUsd)} today`, state: input.state };
  }
  return null;
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
    project: input.projectName || "-",
    branch: input.git?.branch ?? "-",
    worktree: input.git?.isLinkedWorktree ?? false,
    mode: input.session.mode,
    activity: parts.join(" · "),
    busy: activeRuns > 0,
    crew: input.session.crewId ?? input.defaultCrewId ?? "default",
    flow: input.session.flowId ?? "default",
    runningTask: running ? truncate(running.task, 48) : null,
    budget: buildBudget(input.budget),
    pendingApprovals: input.aggregates?.pendingApprovals ?? 0,
  };
}
