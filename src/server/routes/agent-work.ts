import type { FastifyInstance } from "fastify";
import { getRoleWork } from "../../core/agent-work-attribution-service.js";
import { runStatePath } from "../../utils/paths.js";
import { pathExists } from "../../utils/fs.js";
import { assertSafeRunId, HttpError } from "../security.js";

export type RoleWorkRoutesDeps = { projectRoot: string };

export async function registerRoleWorkRoutes(
  app: FastifyInstance,
  deps: RoleWorkRoutesDeps,
): Promise<void> {
  const { projectRoot } = deps;

  app.get<{ Params: { runId: string } }>(
    "/api/runs/:runId/agent-work",
    async (req) => {
      assertSafeRunId(req.params.runId);
      if (!(await pathExists(runStatePath(projectRoot, req.params.runId)))) {
        throw new HttpError(404, `Run ${req.params.runId} not found.`);
      }
      return {
        report: await getRoleWork({
          projectRoot,
          runId: req.params.runId,
        }),
      };
    },
  );
}
