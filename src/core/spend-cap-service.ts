import { projectRunsDir } from "../utils/paths.js";
import { readDirSafe } from "../utils/fs.js";
import { MetricsStore } from "./metrics-store.js";
import type { BudgetConfig } from "../project/config-schema.js";

export type SpendCapState = "ok" | "warn" | "exceeded";
export type CapAction = BudgetConfig["capAction"];

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/**
 * Today's spend (local day) summed across ALL runs - real where the CLI
 * reported it, estimated otherwise (see pricing.ts). Reads each run's
 * runtime-metrics; a run with no cost contributes 0.
 */
export async function computeDailySpendUsd(
  projectRoot: string,
  now: number = Date.now(),
): Promise<number> {
  const ids = await readDirSafe(projectRunsDir(projectRoot));
  const today = dayKey(new Date(now));
  let total = 0;
  for (const id of ids) {
    const m = await new MetricsStore(projectRoot, id).read().catch(() => null);
    if (!m || m.totalCostUsd === null || m.totalCostUsd === undefined) continue;
    if (dayKey(new Date(m.updatedAt)) !== today) continue;
    total += m.totalCostUsd;
  }
  return total;
}

/**
 * Today's usage (local day) summed across runs - **count/time**, not dollars,
 * so it binds even when CLI cost is unmeasured (unattended-resilience U1).
 * Excludes `exceptRunId` (the current run, whose in-flight turns the caller adds
 * from memory to avoid double-counting its already-persisted turns).
 */
export async function computeDailyUsage(
  projectRoot: string,
  exceptRunId: string,
  now: number = Date.now(),
): Promise<{ turns: number; wallClockMs: number }> {
  const ids = await readDirSafe(projectRunsDir(projectRoot));
  const today = dayKey(new Date(now));
  let turns = 0;
  let wallClockMs = 0;
  for (const id of ids) {
    if (id === exceptRunId) continue;
    const m = await new MetricsStore(projectRoot, id).read().catch(() => null);
    if (!m) continue;
    if (dayKey(new Date(m.updatedAt)) !== today) continue;
    turns += m.roles.length;
    const start = new Date(m.startedAt).getTime();
    const end = new Date(m.updatedAt).getTime();
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
      wallClockMs += end - start;
    }
  }
  return { turns, wallClockMs };
}

export type SpendCapEvaluation = {
  state: SpendCapState;
  cap: number | null;
  dailySpendUsd: number;
  thresholdUsd: number | null;
  /** The action to take, set only when state is "exceeded". */
  action: CapAction | null;
};

/** Pure: classify today's spend against the budget. */
export function evaluateSpendCap(
  budget: BudgetConfig,
  dailySpendUsd: number,
): SpendCapEvaluation {
  const cap = budget.spendCapDailyUsd;
  if (cap === null || cap === undefined || cap <= 0) {
    return { state: "ok", cap: null, dailySpendUsd, thresholdUsd: null, action: null };
  }
  const thresholdUsd = cap * (budget.warnThresholdPct ?? 0.8);
  if (dailySpendUsd >= cap) {
    return { state: "exceeded", cap, dailySpendUsd, thresholdUsd, action: budget.capAction };
  }
  if (dailySpendUsd >= thresholdUsd) {
    return { state: "warn", cap, dailySpendUsd, thresholdUsd, action: null };
  }
  return { state: "ok", cap, dailySpendUsd, thresholdUsd, action: null };
}
