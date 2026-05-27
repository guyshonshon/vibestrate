import { z } from "zod";
import type { FastifyInstance } from "fastify";
import {
  detectAllProviders,
  type DetectedProvider,
} from "../../providers/provider-detection.js";
import { loadConfig } from "../../project/config-loader.js";
import { MetricsStore } from "../../core/metrics-store.js";
import { runStateSchema } from "../../core/state-machine.js";
import {
  buildProvidersOverview,
  buildMetricsOverview,
  type OverviewRange,
  type ProviderLookup,
} from "../../core/overview-aggregator.js";
import type { RuntimeMetrics } from "../../core/runtime-metrics.js";
import { projectRunsDir, runStatePath } from "../../utils/paths.js";
import { readDirSafe, pathExists } from "../../utils/fs.js";
import { readJson } from "../../utils/json.js";
import { assertSafeRunId, HttpError } from "../security.js";

export type MetricsRoutesDeps = {
  projectRoot: string;
};

const rangeSchema = z
  .enum(["24h", "7d", "30d", "90d"])
  .default("7d");

/**
 * Iterate every run state on disk. Mirrors the loader in
 * `/api/runs` — runs that fail schema validation are silently skipped
 * so a single corrupt file can't take the whole overview down.
 */
async function loadAllRuns(projectRoot: string) {
  const runsDir = projectRunsDir(projectRoot);
  const ids = (await readDirSafe(runsDir)).sort();
  const runs = [];
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
      // skip
    }
  }
  return { runs, metricsByRun };
}

async function loadProviderLookup(
  projectRoot: string,
): Promise<{
  lookup: ProviderLookup;
  detected: DetectedProvider[];
  configuredIds: Set<string>;
}> {
  const [detected, loaded] = await Promise.all([
    detectAllProviders(),
    loadConfig(projectRoot).catch(() => null),
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
 * Best-effort vendor classification — driven off the provider id slug
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
   * Cross-run rollup for the Metrics page. Pure read — no writes, no
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
      const [{ runs, metricsByRun }, { lookup }, loaded] = await Promise.all([
        loadAllRuns(projectRoot),
        loadProviderLookup(projectRoot),
        loadConfig(projectRoot).catch(() => null),
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
        loadAllRuns(projectRoot),
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
