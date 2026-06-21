import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  getGitGraph,
  getGitHistory,
  getGitStatus,
} from "../../core/git-history-service.js";
import {
  predictMerge,
  applyMerge,
  applyResolvedMerge,
  undoMerge,
  MergeError,
} from "../../git/merge-service.js";
import { proposeResolutions, ResolveError } from "../../git/merge-resolve.js";
import { runStatePath } from "../../utils/paths.js";
import { pathExists } from "../../utils/fs.js";
import { readJson } from "../../utils/json.js";
import { runStateSchema } from "../../core/state-machine.js";
import { assertSafeRunId, HttpError } from "../security.js";
import { loadConfig } from "../../project/config-loader.js";

const SAFE_BRANCH = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,99}$/, "invalid branch name");

function mapMergeErr(err: unknown): HttpError {
  if (err instanceof MergeError || err instanceof ResolveError) {
    return new HttpError(409, err.message);
  }
  return new HttpError(500, err instanceof Error ? err.message : String(err));
}

export type GitRoutesDeps = { projectRoot: string };

export async function registerGitRoutes(
  app: FastifyInstance,
  deps: GitRoutesDeps,
): Promise<void> {
  const { projectRoot } = deps;

  app.get("/api/project/git/status", async () => {
    return { status: await getGitStatus(projectRoot) };
  });

  app.get<{ Querystring: { limit?: string } }>(
    "/api/project/git/history",
    async (req) => {
      const limit = parseLimit(req.query.limit, 20);
      return {
        history: await getGitHistory({ worktreePath: projectRoot, limit }),
      };
    },
  );

  // Read-only branch topology (commits + parents + branch heads) for the tree.
  app.get<{ Querystring: { maxNodes?: string } }>(
    "/api/project/git/graph",
    async (req) => {
      const maxNodes = parseLimit(req.query.maxNodes, 300);
      const loaded = await loadConfig(projectRoot);
      return {
        graph: await getGitGraph({
          worktreePath: projectRoot,
          maxNodes,
          mainBranch: loaded.config.git.mainBranch,
        }),
      };
    },
  );

  // ── Interactive git-tree merge (predict / propose / apply / undo) ──────────
  // All operate on the project root (the guarded root). Predict + propose are
  // read-only (scratch worktree only); the write routes are token-gated below.
  const pairBody = z.object({ source: SAFE_BRANCH, target: SAFE_BRANCH });

  app.post<{ Body: unknown }>("/api/project/git/tree/predict", async (req) => {
    const parsed = pairBody.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.message);
    try {
      return {
        prediction: await predictMerge({
          projectRoot,
          source: parsed.data.source,
          target: parsed.data.target,
        }),
      };
    } catch (err) {
      throw mapMergeErr(err);
    }
  });

  app.post<{ Body: unknown }>(
    "/api/project/git/tree/propose-resolutions",
    async (req) => {
      const parsed = pairBody.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, parsed.error.message);
      try {
        return {
          proposal: await proposeResolutions({
            projectRoot,
            source: parsed.data.source,
            target: parsed.data.target,
          }),
        };
      } catch (err) {
        throw mapMergeErr(err);
      }
    },
  );

  // Write routes touch real git history. Fail-closed surface gate (mirror the
  // guided merge-to-main): a tokenless loopback API is reachable by any local
  // process and the broker has no seeded git.merge policy, so refuse unless the
  // API is token-gated. There is no CLI for the interactive tree (UI-only).
  const requireToken = () => {
    if (!process.env.VIBESTRATE_API_TOKEN) {
      throw new HttpError(
        403,
        "Merging from the dashboard requires VIBESTRATE_API_TOKEN to be set (a tokenless local API is reachable by any local process). Set a token and restart `vibe ui`.",
      );
    }
  };

  const applyBody = z.object({
    source: SAFE_BRANCH,
    target: SAFE_BRANCH,
    confirm: z.literal("apply-merge"),
  });
  app.post<{ Body: unknown }>("/api/project/git/tree/apply", async (req) => {
    requireToken();
    const parsed = applyBody.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.message);
    try {
      return {
        result: await applyMerge({
          projectRoot,
          source: parsed.data.source,
          target: parsed.data.target,
          humanConfirmed: true,
        }),
      };
    } catch (err) {
      throw mapMergeErr(err);
    }
  });

  const resolvedBody = z.object({
    source: SAFE_BRANCH,
    target: SAFE_BRANCH,
    resolvedFiles: z
      .array(z.object({ path: z.string().min(1).max(400), content: z.string() }))
      .max(500),
    confirm: z.literal("apply-merge"),
  });
  app.post<{ Body: unknown }>(
    "/api/project/git/tree/apply-resolved",
    async (req) => {
      requireToken();
      const parsed = resolvedBody.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, parsed.error.message);
      try {
        return {
          result: await applyResolvedMerge({
            projectRoot,
            source: parsed.data.source,
            target: parsed.data.target,
            resolvedFiles: parsed.data.resolvedFiles,
            humanConfirmed: true,
          }),
        };
      } catch (err) {
        throw mapMergeErr(err);
      }
    },
  );

  const undoBody = z.object({
    target: SAFE_BRANCH,
    confirm: z.literal("undo-merge"),
  });
  app.post<{ Body: unknown }>("/api/project/git/tree/undo", async (req) => {
    requireToken();
    const parsed = undoBody.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.message);
    try {
      return {
        result: await undoMerge({ projectRoot, target: parsed.data.target }),
      };
    } catch (err) {
      throw mapMergeErr(err);
    }
  });

  app.get<{ Params: { runId: string } }>(
    "/api/runs/:runId/git/status",
    async (req) => {
      assertSafeRunId(req.params.runId);
      const state = await loadRunState(projectRoot, req.params.runId);
      if (!state.worktreePath) {
        throw new HttpError(409, "This run has no worktree yet.");
      }
      return { status: await getGitStatus(state.worktreePath) };
    },
  );

  app.get<{
    Params: { runId: string };
    Querystring: { limit?: string };
  }>("/api/runs/:runId/git/history", async (req) => {
    assertSafeRunId(req.params.runId);
    const state = await loadRunState(projectRoot, req.params.runId);
    if (!state.worktreePath) {
      throw new HttpError(409, "This run has no worktree yet.");
    }
    const limit = parseLimit(req.query.limit, 20);
    const loaded = await loadConfig(projectRoot);
    return {
      history: await getGitHistory({
        worktreePath: state.worktreePath,
        limit,
        baseRef: loaded.config.git.mainBranch,
      }),
    };
  });
}

async function loadRunState(projectRoot: string, runId: string) {
  const file = runStatePath(projectRoot, runId);
  if (!(await pathExists(file))) {
    throw new HttpError(404, `Run ${runId} not found.`);
  }
  const raw = await readJson<unknown>(file);
  return runStateSchema.parse(raw);
}

function parseLimit(v: string | undefined, fallback: number): number {
  if (v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
