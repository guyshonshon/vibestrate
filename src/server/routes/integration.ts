import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { HttpError } from "../security.js";
import {
  listMergeReadyRuns,
  mergePreview,
  integrate,
  finishIntegration,
  IntegrationError,
  type BranchTarget,
  type MergeReadyRun,
} from "../../integration/integration-service.js";
import {
  adviseMergeReadyRuns,
  mergeReadyOverview,
} from "../../integration/merge-advisor.js";

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

  // T13 slice 1b: cheap read-only projection for the Merge page hub list -
  // lanes + topology only (rev-list/diff counts; NO scratch-worktree preview,
  // NO recommendation). Full advice is fetched on drill-in via /advice.
  app.get("/api/integration/overview", async () => {
    const rows = await mergeReadyOverview(deps.projectRoot);
    return { rows };
  });

  // T13 slice 1a (design/merge-advisor.md): READ-ONLY merge advice. Same
  // gating and cost class as /preview (it wraps mergePreview's scratch
  // worktree + cheap rev-list/diff facts): open on a tokenless loopback bind,
  // bearer-gated when a token is configured. Mutates no branch; the
  // deterministic recommendation contains no model output.
  app.post<{ Body: unknown }>("/api/integration/advice", async (req) => {
    const parsed = previewBody.safeParse(req.body ?? {});
    if (!parsed.success) throw new HttpError(400, parsed.error.message);
    try {
      const result = await adviseMergeReadyRuns({
        projectRoot: deps.projectRoot,
        runIds: parsed.data.runIds,
      });
      return { advice: result.advice, missing: result.missing };
    } catch (err) {
      if (err instanceof IntegrationError) throw new HttpError(409, err.message);
      throw new HttpError(500, err instanceof Error ? err.message : String(err));
    }
  });

  // Gated, explicit write - creates a NEW integration branch, never main, never
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

  // P7b guided merge: merge a COMPLETE integration branch into main, locally.
  // The body `confirm` token is an accident guard, NOT authorization (anything
  // that can POST can include it) - the real gates are the broker (`git.merge`
  // policies), the completeness record, the lock + re-checked preconditions,
  // and the dashboard's human confirm modal in front of this call. Honest
  // exposure note: on a tokenless loopback bind this route is reachable by
  // local processes, like every write route - set VIBESTRATE_API_TOKEN to gate
  // it (documented in the HTTP API page). Never pushes.
  const finishBody = z.object({
    integrationBranch: z.string().min(1).max(100),
    confirm: z.literal("merge-to-main"),
  });
  app.post<{ Body: unknown }>("/api/integration/finish", async (req) => {
    // Fail-closed surface gate (adversarial-review fix): on a tokenless bind
    // any local process can POST here, and the broker has no seeded git.merge
    // policy - so the HTTP surface itself refuses unless the API is
    // token-gated. The CLI (a real human terminal with typed confirmation)
    // is the default path.
    if (!process.env.VIBESTRATE_API_TOKEN) {
      throw new HttpError(
        403,
        "Merge-to-main from the dashboard requires VIBESTRATE_API_TOKEN to be set (a tokenless local API is reachable by any local process). Use `vibe integrate finish <branch>` instead, or set a token and restart vibe ui.",
      );
    }
    const parsed = finishBody.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(
        400,
        'finish requires { integrationBranch, confirm: "merge-to-main" }',
      );
    }
    try {
      const result = await finishIntegration({
        projectRoot: deps.projectRoot,
        integrationBranch: parsed.data.integrationBranch,
        humanConfirmed: true,
      });
      return { result };
    } catch (err) {
      if (err instanceof IntegrationError) throw new HttpError(409, err.message);
      throw new HttpError(500, err instanceof Error ? err.message : String(err));
    }
  });
}
