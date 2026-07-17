// Per-saga budget + stop-conditions.
//
// A saga is one orchestrator run iterating a checklist on a per-item review
// band. This module bounds a saga's TOTAL cost/length and lets the conductor
// halt it cleanly BETWEEN steps when a cap is hit.
//
// CRITICAL SEMANTIC: `maxSpendUsd` is a BETWEEN-STEPS checkpoint, NOT a mid-step
// wall. It is evaluated only after a step has finished and committed, before the
// next step starts. A single step can therefore overshoot `maxSpendUsd` by up
// to one step's cost before the check fires. The only mid-step ceiling is the
// existing global DAILY spend cap (`enforceSpendCap` -> `computeDailySpendUsd`
// in src/core/spend-cap-service.ts), which is checked pre-turn. Do not treat
// `maxSpendUsd` as a hard per-step limit.

import type { MetricsStore } from "../metrics/metrics-store.js";

/**
 * The run's total USD spend so far - the sum of per-role costs, surfaced as
 * `metrics.totalCostUsd` by `recomputeRunTotals`. Reads the run's runtime
 * metrics via the store; returns 0 when no metrics exist yet or no cost was
 * reported (an unmeasured run contributes 0, mirroring computeDailySpendUsd).
 */
export async function computeRunSpendUsd(
  metricsStore: MetricsStore,
): Promise<number> {
  const metrics = await metricsStore.read().catch(() => null);
  if (!metrics) return 0;
  return metrics.totalCostUsd ?? 0;
}

export type SagaBudgetEnvelope = {
  maxSpendUsd: number | null;
  maxSteps: number | null;
};

export type SagaStopDecision = {
  halt: boolean;
  reason: string | null;
};

/**
 * Pure between-steps gate. Returns `halt: true` with a human-readable reason
 * when a cap is reached. A null budget field means no limit on that axis;
 * boundaries are inclusive (`>=` halts). Spend is checked before step count so
 * the more expensive signal wins when both trip in the same check.
 */
export function checkSagaStopConditions(args: {
  spentUsd: number;
  stepsCompleted: number;
  budget: SagaBudgetEnvelope;
}): SagaStopDecision {
  const { spentUsd, stepsCompleted, budget } = args;
  if (budget.maxSpendUsd != null && spentUsd >= budget.maxSpendUsd) {
    return {
      halt: true,
      reason: `per-saga budget reached: $${spentUsd.toFixed(2)} >= $${budget.maxSpendUsd.toFixed(2)}`,
    };
  }
  if (budget.maxSteps != null && stepsCompleted >= budget.maxSteps) {
    return {
      halt: true,
      reason: `max steps reached: ${stepsCompleted}`,
    };
  }
  return { halt: false, reason: null };
}
