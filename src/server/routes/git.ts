import type { FastifyInstance } from "fastify";
import {
  getGitHistory,
  getGitStatus,
} from "../../core/git-history-service.js";
import { runStatePath } from "../../utils/paths.js";
import { pathExists } from "../../utils/fs.js";
import { readJson } from "../../utils/json.js";
import { runStateSchema } from "../../core/state-machine.js";
import { assertSafeRunId, HttpError } from "../security.js";

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
    return {
      history: await getGitHistory({
        worktreePath: state.worktreePath,
        limit,
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
