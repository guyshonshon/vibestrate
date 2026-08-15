import { MetricsStore } from "./metrics-store.js";
import type { RuntimeMetrics } from "./runtime-metrics.js";
import { runStateSchema } from "../state-machine.js";
import type { RunState } from "../state-machine.js";
import { projectRunsDir, runStatePath } from "../../utils/paths.js";
import { readDirSafe, pathExists } from "../../utils/fs.js";
import { readJson } from "../../utils/json.js";

/**
 * Reading run state and its metrics off disk, and rolling spend up by provider.
 *
 * This lives here rather than in the metrics route because it now has two
 * callers: the Agents page rollup, and consult, which needs to answer "how much
 * did claude cost me this week". Asked that, consult used to have nothing to go
 * on - `assembleConsultContext` had no notion of cost at all - so it either
 * guessed or said nothing. Retrieval could not have helped: what the question
 * wants is not a page about spend, it is a number computed from these files.
 */

/**
 * Every run state on disk with its metrics.
 *
 * A run whose file fails schema validation is skipped rather than thrown on, so
 * one corrupt file cannot take down the rollup that reads all of them.
 */
export async function loadRunsWithMetrics(projectRoot: string): Promise<{
  runs: RunState[];
  metricsByRun: Map<string, RuntimeMetrics | null>;
}> {
  const runsDir = projectRunsDir(projectRoot);
  const ids = (await readDirSafe(runsDir)).sort();
  const runs: RunState[] = [];
  const metricsByRun = new Map<string, RuntimeMetrics | null>();
  for (const id of ids) {
    const stateFile = runStatePath(projectRoot, id);
    if (!(await pathExists(stateFile))) continue;
    try {
      const raw = await readJson<unknown>(stateFile);
      const parsed = runStateSchema.safeParse(raw);
      if (!parsed.success) continue;
      runs.push(parsed.data);
      const store = new MetricsStore(projectRoot, id);
      metricsByRun.set(id, await store.read().catch(() => null));
    } catch {
      // Unreadable run: skip it rather than fail the whole rollup.
    }
  }
  return { runs, metricsByRun };
}

export type ProviderSpend = {
  providerId: string;
  costUsd: number;
  runs: number;
  /** True when ANY turn behind this total was priced locally from tokens times
   *  a list price rather than reported by the CLI. One estimated turn makes the
   *  whole total an estimate - saying otherwise would overstate it. */
  estimated: boolean;
};

export type SpendWindow = {
  days: number;
  totalUsd: number;
  byProvider: ProviderSpend[];
  /** True when any contributing figure was locally priced. */
  estimated: boolean;
};

/**
 * Spend per provider over the last `days`, newest-cost-first.
 *
 * Windowed on the run's `updatedAt` because that is when the money was spent;
 * a run started last month and finished today belongs to today.
 */
export function spendByProvider(input: {
  runs: RunState[];
  metricsByRun: Map<string, RuntimeMetrics | null>;
  days: number;
  now?: number;
}): SpendWindow {
  const now = input.now ?? Date.now();
  const cutoff = now - input.days * 24 * 60 * 60 * 1000;
  const acc = new Map<string, { costUsd: number; runs: number; estimated: boolean }>();

  for (const run of input.runs) {
    const at = new Date(run.updatedAt).getTime();
    if (!Number.isFinite(at) || at < cutoff) continue;
    const metrics = input.metricsByRun.get(run.runId);
    if (!metrics) continue;
    const seen = new Set<string>();
    for (const role of metrics.roles) {
      const cost = role.totalCostUsd;
      // `null` means nothing was recorded; a real 0 means a turn genuinely cost
      // nothing (a local model). Both are skipped, because a provider whose
      // every turn is free would otherwise be reported as "$0.00 across 3 runs"
      // - a figure that reads like a measurement of spend when it is really the
      // absence of any.
      if (cost == null || cost === 0) continue;
      const entry = acc.get(role.providerId) ?? { costUsd: 0, runs: 0, estimated: false };
      entry.costUsd += cost;
      if (role.costEstimated) entry.estimated = true;
      // A run counts once per provider however many turns it took.
      if (!seen.has(role.providerId)) {
        entry.runs += 1;
        seen.add(role.providerId);
      }
      acc.set(role.providerId, entry);
    }
  }

  const byProvider = [...acc.entries()]
    .map(([providerId, v]) => ({ providerId, ...v }))
    .sort((a, b) => b.costUsd - a.costUsd);

  return {
    days: input.days,
    totalUsd: byProvider.reduce((s, p) => s + p.costUsd, 0),
    byProvider,
    estimated: byProvider.some((p) => p.estimated),
  };
}
