// Pure aggregators that roll up runs + per-run metrics into the shapes
// the dashboard's Metrics and Agents pages want. Kept stateless so we
// can unit-test the math without spinning up the server.

import type { RunState } from "./state-machine.js";
import type { RunStatus } from "../workflow/workflow-types.js";
import type { RoleMetrics, RuntimeMetrics } from "./runtime-metrics.js";

export type OverviewRange = "24h" | "7d" | "30d" | "90d";

export type DailyOutcomeBucket = {
  /** YYYY-MM-DD in the project's local timezone. */
  date: string;
  /** Short human-friendly day label, e.g. "May 13". */
  label: string;
  merged: number;
  changes: number;
  failed: number;
};

export type SpendByRoleEntry = {
  providerId: string;
  label: string;
  dollars: number;
  runs: number;
};

export type PhaseLatencyEntry = {
  phase: string;
  p50: number;
  p95: number;
  samples: number;
};

export type HeatmapRow = {
  /** Short day-of-week label, "Sun"…"Sat". */
  day: string;
  /** Length 24, runs per hour-of-day for that weekday. */
  cells: number[];
};

export type LeaderboardEntry = {
  providerId: string;
  label: string;
  vendor: string | null;
  runs: number;
  /** 0..1 — null when the agent had no completed runs. */
  successRate: number | null;
  avgDurSeconds: number | null;
  p95Seconds: number | null;
  costUsd: number;
  /** Δ runs vs the prior window of equal length. */
  delta: number;
};

export type KpiSparks = {
  runs: number[];
  success: number[];
  duration: number[];
  spend: number[];
};

export type PerModelEntry = {
  /** Model id when known, else the provider id. */
  model: string;
  calls: number;
  tokens: number;
  costUsd: number;
};

export type TokensByRoleEntry = {
  /** Guide slot id when present, else the agent id (planner/executor/…). */
  role: string;
  tokens: number;
};

export type MetricsOverview = {
  range: OverviewRange;
  generatedAt: string;
  daily: DailyOutcomeBucket[];
  spendByRole: SpendByRoleEntry[];
  phaseLatency: PhaseLatencyEntry[];
  heatmap: HeatmapRow[];
  leaderboard: LeaderboardEntry[];
  kpiSparks: KpiSparks;
  /** Per-model usage breakdown over the window. */
  perModel: PerModelEntry[];
  /** Total tokens by agent role over the window. */
  tokensByRole: TokensByRoleEntry[];
  totals: {
    runs: number;
    merged: number;
    failed: number;
    changes: number;
    costUsd: number;
    /** Total tokens (input + output) over the window. */
    tokens: number;
    /** Δ tokens vs the prior window of equal length. */
    tokensDelta: number;
    successRate: number | null;
    avgDurationSeconds: number | null;
    /** Median run duration (complements the average). */
    medianDurationSeconds: number | null;
    spendCapDailyUsd: number | null;
  };
};

const RANGE_DAYS: Record<OverviewRange, number> = {
  "24h": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

const MERGED: RunStatus[] = ["merge_ready"];
const FAILED: RunStatus[] = ["failed", "aborted", "blocked"];
const CHANGES_REQUESTED: RunStatus[] = ["waiting_for_approval"];

export type ProviderLookup = Record<
  string,
  { label: string; vendor: string | null }
>;

type Inputs = {
  runs: RunState[];
  metricsByRun: Map<string, RuntimeMetrics | null>;
  providers: ProviderLookup;
  now?: number;
  spendCapDailyUsd?: number | null;
};

// ── Helpers ────────────────────────────────────────────────────────────────

function dayKeyLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function shortLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
}

function classifyRunOutcome(s: RunStatus): "merged" | "changes" | "failed" | null {
  if (MERGED.includes(s)) return "merged";
  if (FAILED.includes(s)) return "failed";
  if (CHANGES_REQUESTED.includes(s)) return "changes";
  return null;
}

/** Inclusive of `cutoff`, exclusive of `now`. */
function inWindow(iso: string, cutoff: number): boolean {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t >= cutoff;
}

function durationSeconds(run: RunState): number | null {
  const s = new Date(run.startedAt).getTime();
  const e = new Date(run.updatedAt).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) return null;
  return Math.max(0, Math.round((e - s) / 1000));
}

function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo]!;
  const frac = pos - lo;
  return sorted[lo]! * (1 - frac) + sorted[hi]! * frac;
}

function fmtPhase(stageId: string): string {
  // Normalize "plan" / "planning" / "executor" / "execute" into a single
  // human-readable phase label.
  const lower = stageId.toLowerCase();
  if (lower.startsWith("plan")) return "Plan";
  if (lower.startsWith("arch")) return "Arch";
  if (lower.startsWith("exec")) return "Execute";
  if (lower.startsWith("validat") || lower === "val") return "Validate";
  if (lower.startsWith("review")) return "Review";
  if (lower.startsWith("fix")) return "Fix";
  if (lower.startsWith("verif")) return "Verify";
  if (lower.startsWith("arbitr")) return "Arbitrate";
  if (lower.startsWith("summar")) return "Summary";
  return stageId.charAt(0).toUpperCase() + stageId.slice(1);
}

function providerLabel(
  id: string,
  providers: ProviderLookup,
): { label: string; vendor: string | null } {
  return providers[id] ?? { label: id, vendor: null };
}

// ── Daily outcome buckets ─────────────────────────────────────────────────

export function bucketDaily(
  runs: RunState[],
  days: number,
  now: number,
): DailyOutcomeBucket[] {
  const buckets: DailyOutcomeBucket[] = [];
  const today = new Date(now);
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() - i,
    );
    buckets.push({
      date: dayKeyLocal(d),
      label: shortLabel(d),
      merged: 0,
      changes: 0,
      failed: 0,
    });
  }
  const byKey = new Map(buckets.map((b) => [b.date, b]));
  for (const run of runs) {
    const t = new Date(run.updatedAt).getTime();
    if (!Number.isFinite(t)) continue;
    const key = dayKeyLocal(new Date(t));
    const bucket = byKey.get(key);
    if (!bucket) continue;
    const kind = classifyRunOutcome(run.status);
    if (kind) bucket[kind] += 1;
  }
  return buckets;
}

// ── Spend by agent ────────────────────────────────────────────────────────

export function spendByRole(
  runs: RunState[],
  metricsByRun: Map<string, RuntimeMetrics | null>,
  providers: ProviderLookup,
): SpendByRoleEntry[] {
  const totals = new Map<string, { dollars: number; runs: number }>();
  for (const run of runs) {
    const m = metricsByRun.get(run.runId);
    if (!m) continue;
    for (const agent of m.roles) {
      const id = agent.providerId;
      const entry = totals.get(id) ?? { dollars: 0, runs: 0 };
      entry.dollars += agent.totalCostUsd ?? 0;
      entry.runs += 1;
      totals.set(id, entry);
    }
  }
  return [...totals.entries()]
    .map(([providerId, t]) => ({
      providerId,
      label: providerLabel(providerId, providers).label,
      dollars: round2(t.dollars),
      runs: t.runs,
    }))
    .sort((a, b) => b.dollars - a.dollars);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Phase latency ─────────────────────────────────────────────────────────

export function phaseLatency(
  metricsByRun: Map<string, RuntimeMetrics | null>,
): PhaseLatencyEntry[] {
  const buckets = new Map<string, number[]>();
  for (const m of metricsByRun.values()) {
    if (!m) continue;
    for (const agent of m.roles) {
      const phase = fmtPhase(agent.stageId);
      const secs = agent.durationMs / 1000;
      const arr = buckets.get(phase) ?? [];
      arr.push(secs);
      buckets.set(phase, arr);
    }
  }
  return [...buckets.entries()]
    .map(([phase, samples]) => ({
      phase,
      p50: Math.round(quantile(samples, 0.5)),
      p95: Math.round(quantile(samples, 0.95)),
      samples: samples.length,
    }))
    .sort((a, b) => b.samples - a.samples);
}

// ── Heatmap ───────────────────────────────────────────────────────────────

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function activityHeatmap(runs: RunState[]): HeatmapRow[] {
  const rows: HeatmapRow[] = WEEKDAYS.map((day) => ({
    day,
    cells: Array.from({ length: 24 }, () => 0),
  }));
  for (const run of runs) {
    const t = new Date(run.startedAt);
    if (!Number.isFinite(t.getTime())) continue;
    const row = rows[t.getDay()]!;
    row.cells[t.getHours()]! += 1;
  }
  return rows;
}

// ── Leaderboard ───────────────────────────────────────────────────────────

export function leaderboard({
  runs,
  metricsByRun,
  providers,
  windowStart,
  prevWindowStart,
}: {
  runs: RunState[];
  metricsByRun: Map<string, RuntimeMetrics | null>;
  providers: ProviderLookup;
  windowStart: number;
  prevWindowStart: number;
}): LeaderboardEntry[] {
  // Index runs into current vs prior windows for the Δ column.
  const cur = new Map<string, RunState[]>();
  const prev = new Map<string, RunState[]>();
  for (const run of runs) {
    const t = new Date(run.updatedAt).getTime();
    if (!Number.isFinite(t)) continue;
    const id = run.resolvedProviderId ?? run.providerOverride ?? null;
    if (!id) continue;
    const into = t >= windowStart ? cur : t >= prevWindowStart ? prev : null;
    if (!into) continue;
    const arr = into.get(id) ?? [];
    arr.push(run);
    into.set(id, arr);
  }
  // Cost + latency come from per-run metrics.
  const costByProvider = new Map<string, number>();
  const durByProvider = new Map<string, number[]>();
  for (const run of runs) {
    if (new Date(run.updatedAt).getTime() < windowStart) continue;
    const id = run.resolvedProviderId ?? run.providerOverride ?? null;
    if (!id) continue;
    const m = metricsByRun.get(run.runId);
    if (m) {
      const c = m.roles.reduce((a, x) => a + (x.totalCostUsd ?? 0), 0);
      costByProvider.set(id, (costByProvider.get(id) ?? 0) + c);
    }
    const d = durationSeconds(run);
    if (d !== null) {
      const arr = durByProvider.get(id) ?? [];
      arr.push(d);
      durByProvider.set(id, arr);
    }
  }

  const ids = new Set<string>([...cur.keys(), ...prev.keys()]);
  return [...ids]
    .map((id) => {
      const curRuns = cur.get(id) ?? [];
      const prevRuns = prev.get(id) ?? [];
      const completed = curRuns.filter((r) =>
        ["merge_ready", "failed", "aborted"].includes(r.status),
      );
      const merged = curRuns.filter((r) => r.status === "merge_ready");
      const successRate =
        completed.length > 0 ? merged.length / completed.length : null;
      const durs = durByProvider.get(id) ?? [];
      const meta = providerLabel(id, providers);
      return {
        providerId: id,
        label: meta.label,
        vendor: meta.vendor,
        runs: curRuns.length,
        successRate,
        avgDurSeconds:
          durs.length > 0
            ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length)
            : null,
        p95Seconds: durs.length > 0 ? Math.round(quantile(durs, 0.95)) : null,
        costUsd: round2(costByProvider.get(id) ?? 0),
        delta: curRuns.length - prevRuns.length,
      };
    })
    .sort((a, b) => b.runs - a.runs);
}

// ── KPI sparks (per-day series for the window) ────────────────────────────

export function kpiSparks(
  daily: DailyOutcomeBucket[],
  metricsByDay: Map<string, RuntimeMetrics[]>,
  runsByDay: Map<string, RunState[]>,
): KpiSparks {
  const runs: number[] = [];
  const success: number[] = [];
  const duration: number[] = [];
  const spend: number[] = [];
  for (const bucket of daily) {
    const total = bucket.merged + bucket.changes + bucket.failed;
    runs.push(total);
    const completed = bucket.merged + bucket.failed;
    success.push(
      completed > 0 ? Math.round((bucket.merged / completed) * 100) : 0,
    );
    const dayRuns = runsByDay.get(bucket.date) ?? [];
    const durs = dayRuns
      .map((r) => durationSeconds(r))
      .filter((d): d is number => d !== null);
    duration.push(
      durs.length > 0
        ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length)
        : 0,
    );
    const dayMetrics = metricsByDay.get(bucket.date) ?? [];
    const dollars = dayMetrics.reduce(
      (a, m) => a + m.roles.reduce((b, x) => b + (x.totalCostUsd ?? 0), 0),
      0,
    );
    spend.push(round2(dollars));
  }
  return { runs, success, duration, spend };
}

// ── Main: build the overview ──────────────────────────────────────────────

function roleTokens(a: RoleMetrics): number {
  const t = a.tokenUsage;
  if (!t) return 0;
  return (t.input ?? 0) + (t.output ?? 0);
}

function sumTokens(
  runs: RunState[],
  metricsByRun: Map<string, RuntimeMetrics | null>,
): number {
  let n = 0;
  for (const r of runs) {
    const m = metricsByRun.get(r.runId);
    if (m) for (const a of m.roles) n += roleTokens(a);
  }
  return n;
}

function tokensByRole(
  runs: RunState[],
  metricsByRun: Map<string, RuntimeMetrics | null>,
): TokensByRoleEntry[] {
  const map = new Map<string, number>();
  for (const r of runs) {
    const m = metricsByRun.get(r.runId);
    if (!m) continue;
    for (const a of m.roles) {
      const role = a.guideSlotId ?? a.roleId;
      map.set(role, (map.get(role) ?? 0) + roleTokens(a));
    }
  }
  return [...map.entries()]
    .map(([role, tokens]) => ({ role, tokens }))
    .filter((e) => e.tokens > 0)
    .sort((x, y) => y.tokens - x.tokens);
}

function perModelBreakdown(
  runs: RunState[],
  metricsByRun: Map<string, RuntimeMetrics | null>,
): PerModelEntry[] {
  const map = new Map<string, { calls: number; tokens: number; costUsd: number }>();
  for (const r of runs) {
    const m = metricsByRun.get(r.runId);
    if (!m) continue;
    for (const a of m.roles) {
      const model = a.model ?? a.providerId;
      const e = map.get(model) ?? { calls: 0, tokens: 0, costUsd: 0 };
      e.calls += 1;
      e.tokens += roleTokens(a);
      e.costUsd += a.totalCostUsd ?? 0;
      map.set(model, e);
    }
  }
  return [...map.entries()]
    .map(([model, e]) => ({ model, calls: e.calls, tokens: e.tokens, costUsd: round2(e.costUsd) }))
    .sort((x, y) => y.tokens - x.tokens);
}

function medianDurationSeconds(runs: RunState[]): number | null {
  const ds = runs
    .map(durationSeconds)
    .filter((v): v is number => v !== null && v > 0)
    .sort((a, b) => a - b);
  if (ds.length === 0) return null;
  const mid = Math.floor(ds.length / 2);
  return ds.length % 2 === 1
    ? Math.round(ds[mid]!)
    : Math.round((ds[mid - 1]! + ds[mid]!) / 2);
}

export function buildMetricsOverview(
  range: OverviewRange,
  inputs: Inputs,
): MetricsOverview {
  const now = inputs.now ?? Date.now();
  const days = RANGE_DAYS[range];
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  const prevCutoff = cutoff - days * 24 * 60 * 60 * 1000;

  const windowRuns = inputs.runs.filter(
    (r) => inWindow(r.updatedAt, cutoff) || inWindow(r.startedAt, cutoff),
  );
  const allRuns = inputs.runs.filter(
    (r) => inWindow(r.updatedAt, prevCutoff) || inWindow(r.startedAt, prevCutoff),
  );

  // Sparkline buckets always cover `days` days so the strip stays
  // consistently sized regardless of range.
  const daily = bucketDaily(windowRuns, days, now);

  // Index per-day for KPI sparks.
  const metricsByDay = new Map<string, RuntimeMetrics[]>();
  const runsByDay = new Map<string, RunState[]>();
  for (const run of windowRuns) {
    const day = dayKeyLocal(new Date(run.updatedAt));
    const ra = runsByDay.get(day) ?? [];
    ra.push(run);
    runsByDay.set(day, ra);
    const m = inputs.metricsByRun.get(run.runId);
    if (m) {
      const ma = metricsByDay.get(day) ?? [];
      ma.push(m);
      metricsByDay.set(day, ma);
    }
  }

  const sparks = kpiSparks(daily, metricsByDay, runsByDay);
  const spend = spendByRole(windowRuns, inputs.metricsByRun, inputs.providers);
  const latency = phaseLatency(
    new Map(
      [...inputs.metricsByRun.entries()].filter(([runId]) =>
        windowRuns.some((r) => r.runId === runId),
      ),
    ),
  );
  const heat = activityHeatmap(windowRuns);
  const board = leaderboard({
    runs: allRuns,
    metricsByRun: inputs.metricsByRun,
    providers: inputs.providers,
    windowStart: cutoff,
    prevWindowStart: prevCutoff,
  });

  const totals = daily.reduce(
    (acc, d) => ({
      merged: acc.merged + d.merged,
      changes: acc.changes + d.changes,
      failed: acc.failed + d.failed,
    }),
    { merged: 0, changes: 0, failed: 0 },
  );
  const totalRuns = totals.merged + totals.changes + totals.failed;
  const completed = totals.merged + totals.failed;
  const costUsd = spend.reduce((a, e) => a + e.dollars, 0);
  const avgDurAll = sparks.duration.filter((v) => v > 0);

  // Token/cost ledger over the window (+ Δ vs the prior window).
  const windowTokens = sumTokens(windowRuns, inputs.metricsByRun);
  const priorRuns = allRuns.filter((r) => !windowRuns.includes(r));
  const tokensDelta = windowTokens - sumTokens(priorRuns, inputs.metricsByRun);

  return {
    range,
    generatedAt: new Date(now).toISOString(),
    daily,
    spendByRole: spend,
    phaseLatency: latency,
    heatmap: heat,
    leaderboard: board,
    kpiSparks: sparks,
    perModel: perModelBreakdown(windowRuns, inputs.metricsByRun),
    tokensByRole: tokensByRole(windowRuns, inputs.metricsByRun),
    totals: {
      runs: totalRuns,
      merged: totals.merged,
      failed: totals.failed,
      changes: totals.changes,
      costUsd: round2(costUsd),
      tokens: windowTokens,
      tokensDelta,
      successRate: completed > 0 ? totals.merged / completed : null,
      avgDurationSeconds:
        avgDurAll.length > 0
          ? Math.round(avgDurAll.reduce((a, b) => a + b, 0) / avgDurAll.length)
          : null,
      medianDurationSeconds: medianDurationSeconds(windowRuns),
      spendCapDailyUsd: inputs.spendCapDailyUsd ?? null,
    },
  };
}

// ── Agents overview ───────────────────────────────────────────────────────

export type ProviderProfile = {
  providerId: string;
  label: string;
  vendor: string | null;
  available: boolean;
  configured: boolean;
  /** Total runs in the requested window. */
  runs: number;
  /** Sum of per-agent cost USD across runs in the window. */
  costUsd: number;
  /** Median latency (ms) across this provider's agent metrics. */
  latencyP50Ms: number | null;
  /** 95p latency (ms). */
  latencyP95Ms: number | null;
  /** 0..1; null when no completed runs. */
  successRate: number | null;
  /** Most recent run that used this provider, ISO timestamp. */
  lastSeenAt: string | null;
  /** Hourly throughput sparkline — last 14 hours. */
  throughputSpark: number[];
  /** Skills that have been attached in any agent invocation. */
  skills: string[];
};

export type ProvidersOverview = {
  generatedAt: string;
  providers: ProviderProfile[];
  kpi: {
    onlineCount: number;
    totalCount: number;
    runs24h: number;
    spend24hUsd: number;
    avgP95Seconds: number | null;
  };
};

export function buildProvidersOverview(input: {
  runs: RunState[];
  metricsByRun: Map<string, RuntimeMetrics | null>;
  providers: Array<{
    id: string;
    label: string;
    vendor?: string | null;
    available: boolean;
    configured: boolean;
  }>;
  now?: number;
}): ProvidersOverview {
  const now = input.now ?? Date.now();
  const cutoff7d = now - 7 * 24 * 60 * 60 * 1000;
  const cutoff24h = now - 24 * 60 * 60 * 1000;

  const byProvider = new Map<
    string,
    {
      runs: RunState[];
      roles: RoleMetrics[];
      cost: number;
      lastSeenMs: number;
      skills: Set<string>;
    }
  >();

  for (const run of input.runs) {
    if (new Date(run.updatedAt).getTime() < cutoff7d) continue;
    const id = run.resolvedProviderId ?? run.providerOverride ?? null;
    if (!id) continue;
    const entry = byProvider.get(id) ?? {
      runs: [],
      roles: [] as RoleMetrics[],
      cost: 0,
      lastSeenMs: 0,
      skills: new Set<string>(),
    };
    entry.runs.push(run);
    const t = new Date(run.updatedAt).getTime();
    if (Number.isFinite(t)) entry.lastSeenMs = Math.max(entry.lastSeenMs, t);
    const m = input.metricsByRun.get(run.runId);
    if (m) {
      for (const a of m.roles) {
        if (a.providerId !== id) continue;
        entry.roles.push(a);
        entry.cost += a.totalCostUsd ?? 0;
        for (const sk of a.skillsAttached) entry.skills.add(sk);
      }
    }
    byProvider.set(id, entry);
  }

  // Hourly throughput buckets — last 14 hours, oldest → newest.
  function hourlySpark(runs: RunState[]): number[] {
    const buckets = Array.from({ length: 14 }, () => 0);
    const start = now - 14 * 60 * 60 * 1000;
    for (const r of runs) {
      const t = new Date(r.startedAt).getTime();
      if (!Number.isFinite(t) || t < start) continue;
      const idx = Math.min(13, Math.floor((t - start) / (60 * 60 * 1000)));
      buckets[idx]! += 1;
    }
    return buckets;
  }

  const profiles: ProviderProfile[] = input.providers.map((p) => {
    const entry = byProvider.get(p.id);
    if (!entry) {
      return {
        providerId: p.id,
        label: p.label,
        vendor: p.vendor ?? null,
        available: p.available,
        configured: p.configured,
        runs: 0,
        costUsd: 0,
        latencyP50Ms: null,
        latencyP95Ms: null,
        successRate: null,
        lastSeenAt: null,
        throughputSpark: Array.from({ length: 14 }, () => 0),
        skills: [],
      };
    }
    const durs = entry.roles.map((a) => a.durationMs);
    const completed = entry.runs.filter((r) =>
      ["merge_ready", "failed", "aborted"].includes(r.status),
    );
    const merged = entry.runs.filter((r) => r.status === "merge_ready");
    return {
      providerId: p.id,
      label: p.label,
      vendor: p.vendor ?? null,
      available: p.available,
      configured: p.configured,
      runs: entry.runs.length,
      costUsd: round2(entry.cost),
      latencyP50Ms: durs.length > 0 ? Math.round(quantile(durs, 0.5)) : null,
      latencyP95Ms: durs.length > 0 ? Math.round(quantile(durs, 0.95)) : null,
      successRate:
        completed.length > 0 ? merged.length / completed.length : null,
      lastSeenAt:
        entry.lastSeenMs > 0 ? new Date(entry.lastSeenMs).toISOString() : null,
      throughputSpark: hourlySpark(entry.runs),
      skills: [...entry.skills].slice(0, 12),
    };
  });

  const runs24h = input.runs.filter(
    (r) => new Date(r.updatedAt).getTime() >= cutoff24h,
  );
  let spend24h = 0;
  for (const r of runs24h) {
    const m = input.metricsByRun.get(r.runId);
    if (!m) continue;
    spend24h += m.roles.reduce((a, x) => a + (x.totalCostUsd ?? 0), 0);
  }
  const p95Samples = profiles
    .map((p) => p.latencyP95Ms)
    .filter((v): v is number => v !== null && v > 0);
  return {
    generatedAt: new Date(now).toISOString(),
    providers: profiles,
    kpi: {
      onlineCount: profiles.filter((p) => p.available).length,
      totalCount: profiles.length,
      runs24h: runs24h.length,
      spend24hUsd: round2(spend24h),
      avgP95Seconds:
        p95Samples.length > 0
          ? Math.round(
              p95Samples.reduce((a, b) => a + b, 0) / p95Samples.length / 100,
            ) / 10
          : null,
    },
  };
}
