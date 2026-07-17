// ── Cross-project "All projects" overview (Multi-project slice c) ────────────
//
// Reads each registered project's persisted runs and rolls them up into one
// at-a-glance view: per-project activity + a combined total. Pure read,
// local-first - nothing leaves the machine and nothing is written.
//
// Safety: the project roots come ONLY from the user-owned workspace registry
// (`~/.vibestrate/workspace.json`), never from a request. Reads are bounded to
// `<root>/.vibestrate/runs/<id>/state.json` (+ that run's runtime-metrics.json),
// each schema-validated; a single corrupt/foreign file is skipped, never
// trusted. No project source, no `.env`, no arbitrary content is ever read.

import {
  isTerminal,
  runStateSchema,
  type RunState,
} from "../core/state-machine.js";
import {
  buildMetricsOverview,
  type OverviewRange,
} from "../core/metrics/overview-aggregator.js";

export type { OverviewRange } from "../core/metrics/overview-aggregator.js";
import type { RuntimeMetrics } from "../core/metrics/runtime-metrics.js";
import { MetricsStore } from "../core/metrics/metrics-store.js";
import { projectRunsDir, runStatePath, vibestrateRoot } from "../utils/paths.js";
import { readDirSafe, pathExists } from "../utils/fs.js";
import { readJson } from "../utils/json.js";

const RANGE_DAYS: Record<OverviewRange, number> = {
  "24h": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export type RecentRunRef = {
  runId: string;
  task: string;
  status: RunState["status"];
  updatedAt: string;
};

export type ProjectRunsSummary = {
  /** Absolute project root (the registry dedup key). */
  root: string;
  label: string;
  /** True for the project this dashboard/CLI is itself serving. */
  current: boolean;
  /** Last `vibe ui` port (best-effort) - lets the UI deep-link the dashboard. */
  lastPort: number | null;
  lastOpenedAt: string | null;
  /** `.vibestrate/` exists here (the project was `vibe init`-ed). */
  initialized: boolean;
  /** Whether a dashboard is currently answering for this project. The pure
   *  builder can't know this (it's a network probe), so it defaults to false;
   *  callers (server route / CLI) fill it after `probeLiveness`. */
  live: boolean;
  /** Reading this project's runs dir failed (kept distinct from "no runs"). */
  unreadable: boolean;
  /** All-time counts (not windowed) - answer "what's live right now". */
  totalRuns: number;
  activeRuns: number;
  needsTesting: number;
  lastActivityAt: string | null;
  /** Rollup over the requested range (reuses the canonical metrics aggregator). */
  window: {
    runs: number;
    merged: number;
    failed: number;
    changes: number;
    costUsd: number;
    tokens: number;
    successRate: number | null;
  };
  /** A few most-recent runs for a sparkline-free "latest activity" list. */
  recentRuns: RecentRunRef[];
};

export type WorkspaceOverview = {
  generatedAt: string;
  range: OverviewRange;
  projects: ProjectRunsSummary[];
  totals: {
    projects: number;
    /** All-time runs across every project. */
    runs: number;
    activeRuns: number;
    /** Runs within the window across every project. */
    windowRuns: number;
    merged: number;
    failed: number;
    needsTesting: number;
    costUsd: number;
    tokens: number;
  };
};

export type ProjectRegistryEntry = {
  root: string;
  label: string;
  current: boolean;
  lastPort: number | null;
  lastOpenedAt: string | null;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Pure roll-up for ONE project's runs. Window stats reuse the canonical
 * `buildMetricsOverview` so the math (what counts as merged/failed, how cost
 * and tokens sum) never diverges from the single-project Metrics page.
 */
export function summarizeProjectRuns(input: {
  entry: ProjectRegistryEntry;
  initialized: boolean;
  unreadable: boolean;
  runs: RunState[];
  metricsByRun: Map<string, RuntimeMetrics | null>;
  range: OverviewRange;
  now: number;
}): ProjectRunsSummary {
  const { entry, runs, range, now } = input;
  const cutoff = now - RANGE_DAYS[range] * 24 * 60 * 60 * 1000;

  let activeRuns = 0;
  let needsTesting = 0;
  let lastActivityMs = 0;
  // Count every run touching the window (incl. in-progress) - the metrics
  // aggregator's `totals.runs` only counts terminal *outcomes*, which would
  // hide live runs on a cross-project board.
  let windowRunCount = 0;
  for (const r of runs) {
    if (!isTerminal(r.status)) activeRuns += 1;
    if (r.needsTesting) needsTesting += 1;
    const t = new Date(r.updatedAt).getTime();
    const s = new Date(r.startedAt).getTime();
    if (Number.isFinite(t) && t > lastActivityMs) lastActivityMs = t;
    if ((Number.isFinite(t) && t >= cutoff) || (Number.isFinite(s) && s >= cutoff)) {
      windowRunCount += 1;
    }
  }

  const overview = buildMetricsOverview(range, {
    runs,
    metricsByRun: input.metricsByRun,
    providers: {},
    now,
  });

  const recentRuns: RecentRunRef[] = [...runs]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5)
    .map((r) => ({
      runId: r.runId,
      task: r.task,
      status: r.status,
      updatedAt: r.updatedAt,
    }));

  return {
    root: entry.root,
    label: entry.label,
    current: entry.current,
    lastPort: entry.lastPort,
    lastOpenedAt: entry.lastOpenedAt,
    initialized: input.initialized,
    live: false,
    unreadable: input.unreadable,
    totalRuns: runs.length,
    activeRuns,
    needsTesting,
    lastActivityAt: lastActivityMs > 0 ? new Date(lastActivityMs).toISOString() : null,
    window: {
      runs: windowRunCount,
      merged: overview.totals.merged,
      failed: overview.totals.failed,
      changes: overview.totals.changes,
      costUsd: overview.totals.costUsd,
      tokens: overview.totals.tokens,
      successRate: overview.totals.successRate,
    },
    recentRuns,
  };
}

/**
 * Read one project's run states (all-time) plus per-run metrics for runs that
 * fall within the metrics window. Defensive: a missing runs dir yields an
 * empty list; a corrupt state file is skipped; any unexpected IO error flips
 * `unreadable` rather than throwing (one bad project can't sink the overview).
 */
async function loadProjectRuns(
  root: string,
  metricsSinceMs: number,
): Promise<{
  runs: RunState[];
  metricsByRun: Map<string, RuntimeMetrics | null>;
  initialized: boolean;
  unreadable: boolean;
}> {
  const initialized = await pathExists(vibestrateRoot(root));
  const runs: RunState[] = [];
  const metricsByRun = new Map<string, RuntimeMetrics | null>();
  try {
    const runsDir = projectRunsDir(root);
    const ids = (await readDirSafe(runsDir)).sort();
    for (const id of ids) {
      const stateFile = runStatePath(root, id);
      if (!(await pathExists(stateFile))) continue;
      try {
        const raw = await readJson<unknown>(stateFile);
        const parsed = runStateSchema.safeParse(raw);
        if (!parsed.success) continue;
        const run = parsed.data;
        runs.push(run);
        const recent =
          new Date(run.updatedAt).getTime() >= metricsSinceMs ||
          new Date(run.startedAt).getTime() >= metricsSinceMs;
        if (recent) {
          const store = new MetricsStore(root, id);
          metricsByRun.set(id, await store.read().catch(() => null));
        }
      } catch {
        // skip a single unreadable run
      }
    }
    return { runs, metricsByRun, initialized, unreadable: false };
  } catch {
    return { runs, metricsByRun, initialized, unreadable: true };
  }
}

/**
 * Build the cross-project overview from a list of registered projects. The
 * caller supplies the registry entries (and which one is `current`); this
 * reads each project's runs from disk and rolls them up.
 */
export async function buildWorkspaceOverview(input: {
  projects: ProjectRegistryEntry[];
  range: OverviewRange;
  now?: number;
}): Promise<WorkspaceOverview> {
  const now = input.now ?? Date.now();
  // Cover the doubled window the metrics aggregator inspects (current + prior).
  const metricsSinceMs = now - 2 * RANGE_DAYS[input.range] * 24 * 60 * 60 * 1000;

  const projects: ProjectRunsSummary[] = [];
  for (const entry of input.projects) {
    const loaded = await loadProjectRuns(entry.root, metricsSinceMs);
    projects.push(
      summarizeProjectRuns({
        entry,
        initialized: loaded.initialized,
        unreadable: loaded.unreadable,
        runs: loaded.runs,
        metricsByRun: loaded.metricsByRun,
        range: input.range,
        now,
      }),
    );
  }

  // Order: most-recently-active first, then by all-time run volume. Keeps the
  // project you're actually working in near the top without special-casing it.
  projects.sort((a, b) => {
    const at = a.lastActivityAt ? Date.parse(a.lastActivityAt) : 0;
    const bt = b.lastActivityAt ? Date.parse(b.lastActivityAt) : 0;
    if (bt !== at) return bt - at;
    return b.totalRuns - a.totalRuns;
  });

  const totals = projects.reduce(
    (acc, p) => ({
      runs: acc.runs + p.totalRuns,
      activeRuns: acc.activeRuns + p.activeRuns,
      windowRuns: acc.windowRuns + p.window.runs,
      merged: acc.merged + p.window.merged,
      failed: acc.failed + p.window.failed,
      needsTesting: acc.needsTesting + p.needsTesting,
      costUsd: acc.costUsd + p.window.costUsd,
      tokens: acc.tokens + p.window.tokens,
    }),
    {
      runs: 0,
      activeRuns: 0,
      windowRuns: 0,
      merged: 0,
      failed: 0,
      needsTesting: 0,
      costUsd: 0,
      tokens: 0,
    },
  );

  return {
    generatedAt: new Date(now).toISOString(),
    range: input.range,
    projects,
    totals: { projects: projects.length, ...totals, costUsd: round2(totals.costUsd) },
  };
}
