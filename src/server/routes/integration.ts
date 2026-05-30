import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { HttpError } from "../security.js";
import {
  listMergeReadyRuns,
  mergePreview,
  integrate,
  IntegrationError,
  type BranchTarget,
  type MergeReadyRun,
} from "../../integration/integration-service.js";

export type IntegrationRoutesDeps = { projectRoot: string };

const previewBody = z.object({
  runIds: z.array(z.string().min(1).max(200)).max(64).optional(),
});
const applyBody = z.object({
  into: z.string().min(1).max(100),
  runIds: z.array(z.string().min(1).max(200)).max(64).optional(),
});

function select(ready: MergeReadyRun[], runIds: string[] | undefined): BranchTarget[] {
  if (!runIds || runIds.length === 0) {
    return ready.map((r) => ({ branch: r.branchName, runId: r.runId }));
  }
  const byId = new Map(ready.map((r) => [r.runId, r]));
  return runIds
    .map((id) => byId.get(id))
    .filter((r): r is MergeReadyRun => !!r)
    .map((r) => ({ branch: r.branchName, runId: r.runId }));
}

export async function registerIntegrationRoutes(
  app: FastifyInstance,
  deps: IntegrationRoutesDeps,
): Promise<void> {
  app.get("/api/integration", async () => {
    const runs = await listMergeReadyRuns(deps.projectRoot);
    return { mergeReady: runs };
  });

  app.post<{ Body: unknown }>("/api/integration/preview", async (req) => {
    const parsed = previewBody.safeParse(req.body ?? {});
    if (!parsed.success) throw new HttpError(400, parsed.error.message);
    const ready = await listMergeReadyRuns(deps.projectRoot);
    const branches = select(ready, parsed.data.runIds);
    if (branches.length === 0) return { preview: { baseBranch: "", results: [], allClean: true } };
    const preview = await mergePreview({ projectRoot: deps.projectRoot, branches });
    return { preview };
  });

  // Gated, explicit write — creates a NEW integration branch, never main, never
  // pushes. Refusals (main branch, existing branch) → 409.
  app.post<{ Body: unknown }>("/api/integration/apply", async (req) => {
    const parsed = applyBody.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.message);
    const ready = await listMergeReadyRuns(deps.projectRoot);
    const branches = select(ready, parsed.data.runIds);
    if (branches.length === 0) throw new HttpError(400, "No merge-ready branches selected.");
    try {
      const result = await integrate({
        projectRoot: deps.projectRoot,
        branches,
        integrationBranch: parsed.data.into,
      });
      return { result };
    } catch (err) {
      if (err instanceof IntegrationError) throw new HttpError(409, err.message);
      throw new HttpError(500, err instanceof Error ? err.message : String(err));
    }
  });
}
