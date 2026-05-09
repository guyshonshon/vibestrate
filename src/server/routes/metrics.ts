import type { FastifyInstance } from "fastify";
import { MetricsStore } from "../../core/metrics-store.js";
import { assertSafeRunId, HttpError } from "../security.js";

export type MetricsRoutesDeps = {
  projectRoot: string;
};

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
}
