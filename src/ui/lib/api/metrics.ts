// Metrics overview + budget settings.
import { jsonGet, jsonPatch } from "./http.js";
import type {
  OverviewRange,
  BudgetSettings,
  MetricsOverview,
} from "./types.js";

export const metricsApi = {
  async getMetricsOverview(range: OverviewRange): Promise<MetricsOverview> {
    return jsonGet(`/api/metrics/overview?range=${encodeURIComponent(range)}`);
  },
  async getBudget(): Promise<{ budget: BudgetSettings; todaySpendUsd: number }> {
    return jsonGet("/api/budget");
  },
  async updateBudget(
    patch: Partial<BudgetSettings>,
  ): Promise<{ ok: true; budget: BudgetSettings }> {
    return jsonPatch("/api/budget", patch);
  },
};
