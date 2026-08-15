/**
 * HTTP routes for run metrics: the per-run reads plus the cross-run rollups.
 * Pure reads - nothing here writes to the project, and this file keeps no
 * response cache of its own.
 *
 * The rollups walk every run directory under the project on each request and
 * parse each run state, skipping any run that fails schema validation so one
 * corrupt file cannot blank a whole page. They are written for repeated
 * polling: provider detection goes through the cached detector, and config is
 * loaded once per request and threaded into the provider lookup instead of
 * being loaded again per helper. Keep both if you add work here.
 */
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import {
  detectAllProvidersCached,
  type DetectedProvider,
} from "../../providers/provider-detection.js";
import { loadConfig } from "../../project/config-loader.js";
import type { LoadedConfig } from "../../project/config-loader.js";
import { MetricsStore } from "../../core/metrics/metrics-store.js";
import { loadRunsWithMetrics } from "../../core/metrics/run-spend.js";
import {
  buildProvidersOverview,
  buildMetricsOverview,
  type OverviewRange,
  type ProviderLookup,
} from "../../core/metrics/overview-aggregator.js";
import { assertSafeRunId, HttpError } from "../security.js";

export type MetricsRoutesDeps = {
  projectRoot: string;
};

const rangeSchema = z
  .enum(["24h", "7d", "30d", "90d"])
  .default("7d");

async function loadProviderLookup(
  projectRoot: string,
  // The poll caller already loads config for the spend cap; pass it through
  // to avoid a second `loadConfig` on the same request. `undefined` means
  // "load it here"; `null` means "already tried, and it failed".
  preloadedConfig?: LoadedConfig | null,
): Promise<{
  lookup: ProviderLookup;
  detected: DetectedProvider[];
  configuredIds: Set<string>;
}> {
  // Poll path: use the cached, in-flight-deduped detection so overlapping
  // Metrics/Providers-overview polls share ONE `--version` sweep instead of
  // each spawning up to 16 subprocesses.
  const [detected, loaded] = await Promise.all([
    detectAllProvidersCached(),
    preloadedConfig !== undefined
      ? Promise.resolve(preloadedConfig)
      : loadConfig(projectRoot).catch(() => null),
  ]);
  const configuredIds = new Set(
    loaded ? Object.keys(loaded.config.providers ?? {}) : [],
  );
  const lookup: ProviderLookup = {};
  for (const d of detected) {
    lookup[d.id] = { label: d.label, vendor: vendorFor(d.id) };
  }
  return { lookup, detected, configuredIds };
}

/**
 * Best-effort vendor classification - driven off the provider id slug
 * so the labels stay consistent with the design (Anthropic / OpenAI /
 * Google / Ollama).
 */
function vendorFor(providerId: string): string | null {
  const lower = providerId.toLowerCase();
  if (lower.includes("claude") || lower.includes("anthropic"))
    return "Anthropic";
  if (lower.includes("codex") || lower.includes("openai") || lower.includes("gpt"))
    return "OpenAI";
  if (lower.includes("gemini") || lower.includes("google")) return "Google";
  if (lower.includes("ollama") || lower.includes("llama")) return "Ollama";
  if (lower.includes("aider")) return "Aider";
  if (lower.includes("opencode")) return "OpenCode";
  return null;
}

export async function registerMetricsRoutes(
  app: FastifyInstance,
  deps: MetricsRoutesDeps,
): Promise<void> {
  const { projectRoot } = deps;

  app.get<{ Params: { runId: string } }>(
    "/api/runs/:runId/metrics",
    async (req) => {
      assertSafeRunId(req.params.runId);
      const store = new MetricsStore(projectRoot, req.params.runId);
      const metrics = await store.read();
      if (!metrics) {
        throw new HttpError(404, "Metrics not yet recorded for this run.");
      }
      return { metrics };
    },
  );

  app.get<{ Params: { runId: string } }>(
    "/api/runs/:runId/validation",
    async (req) => {
      assertSafeRunId(req.params.runId);
      const store = new MetricsStore(projectRoot, req.params.runId);
      const metrics = await store.read();
      if (!metrics) return { validation: null };
      return { validation: metrics.validationSummary };
    },
  );

  /**
   * Cross-run rollup for the Metrics page. Pure read - no writes, no
   * cache. Aggregation logic lives in `core/overview-aggregator.ts` and
   * is covered by unit tests; the route just stitches together the
   * inputs (runs on disk, per-run metrics, detected providers).
   */
  app.get<{ Querystring: { range?: string } }>(
    "/api/metrics/overview",
    async (req) => {
      const parsed = rangeSchema.safeParse(req.query.range ?? "7d");
      if (!parsed.success) throw new HttpError(400, parsed.error.message);
      const range = parsed.data as OverviewRange;
      // Load config once and thread it into the provider lookup so this
      // request hits `loadConfig` a single time (spend cap + configured ids),
      // while still running the disk/detection work concurrently.
      const configPromise = loadConfig(projectRoot).catch(() => null);
      const [{ runs, metricsByRun }, { lookup }, loaded] = await Promise.all([
        loadRunsWithMetrics(projectRoot),
        configPromise.then((cfg) => loadProviderLookup(projectRoot, cfg)),
        configPromise,
      ]);
      return buildMetricsOverview(range, {
        runs,
        metricsByRun,
        providers: lookup,
        spendCapDailyUsd: loaded?.config.budget?.spendCapDailyUsd ?? null,
      });
    },
  );

  /**
   * Agents-page rollup. Joins detected providers with their last-7-day
   * activity so the roster + KPI strip + detail panels can render
   * straight from one payload.
   */
  app.get("/api/providers/overview", async () => {
    const [{ runs, metricsByRun }, { detected, configuredIds }] =
      await Promise.all([
        loadRunsWithMetrics(projectRoot),
        loadProviderLookup(projectRoot),
      ]);
    const providers = detected.map((d) => ({
      id: d.id,
      label: d.label,
      vendor: vendorFor(d.id),
      available: d.available,
      configured: configuredIds.has(d.id),
    }));
    return buildProvidersOverview({ runs, metricsByRun, providers });
  });
}
