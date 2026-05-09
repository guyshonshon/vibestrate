import type { FastifyInstance } from "fastify";
import { runStatePath } from "../../utils/paths.js";
import { pathExists } from "../../utils/fs.js";
import { readJson } from "../../utils/json.js";
import { runStateSchema } from "../../core/state-machine.js";
import { getDiffSnapshot, getFileDiff } from "../../core/diff-service.js";
import { assertSafeRunId, HttpError } from "../security.js";

export type DiffRoutesDeps = {
  projectRoot: string;
};

export async function registerDiffRoutes(
  app: FastifyInstance,
  deps: DiffRoutesDeps,
): Promise<void> {
  const { projectRoot } = deps;

  async function loadState(runId: string) {
    const stateFile = runStatePath(projectRoot, runId);
    if (!(await pathExists(stateFile))) {
      throw new HttpError(404, "Run not found.");
    }
    const raw = await readJson<unknown>(stateFile);
    return runStateSchema.parse(raw);
  }

  app.get<{ Params: { runId: string } }>(
    "/api/runs/:runId/diff",
    async (req) => {
      assertSafeRunId(req.params.runId);
      const state = await loadState(req.params.runId);
      if (!state.worktreePath) return { snapshot: null };
      const snapshot = await getDiffSnapshot({ worktreePath: state.worktreePath });
      return { snapshot };
    },
  );

  app.get<{
    Params: { runId: string };
    Querystring: { path?: string };
  }>("/api/runs/:runId/diff/file", async (req) => {
    assertSafeRunId(req.params.runId);
    const filePath = req.query.path;
    if (!filePath) throw new HttpError(400, "Query param 'path' is required.");
    const state = await loadState(req.params.runId);
    if (!state.worktreePath) {
      throw new HttpError(404, "Worktree not available for this run.");
    }
    const fileDiff = await getFileDiff({
      worktreePath: state.worktreePath,
      filePath,
    });
    return { fileDiff };
  });
}
