import type { FastifyInstance } from "fastify";
import {
  listIssues,
  recordIssue,
  resolveIssue,
} from "../../core/issues-store.js";
import { HttpError } from "../security.js";

export type IssuesRoutesDeps = { projectRoot: string };

export async function registerIssuesRoutes(
  app: FastifyInstance,
  deps: IssuesRoutesDeps,
): Promise<void> {
  app.get("/api/issues", async () => {
    const issues = await listIssues(deps.projectRoot);
    return {
      issues,
      unresolved: issues.filter((i) => !i.resolved).length,
    };
  });

  app.post<{ Params: { id: string } }>(
    "/api/issues/:id/resolve",
    async (req) => {
      const r = await resolveIssue(deps.projectRoot, req.params.id);
      if (!r.ok) {
        throw new HttpError(404, `Issue "${req.params.id}" not found.`);
      }
      return { ok: true };
    },
  );

  // Manual record — lets the dashboard log a user-facing event into
  // the same stream (e.g. a UI action that failed client-side).
  app.post<{
    Body: {
      kind?: string;
      message?: string;
      detail?: string;
      fix?: string;
      context?: Record<string, unknown>;
    };
  }>("/api/issues", async (req) => {
    const body = req.body ?? {};
    if (!body.kind || !body.message) {
      throw new HttpError(400, "kind + message are required.");
    }
    const issue = await recordIssue(deps.projectRoot, {
      kind: body.kind,
      message: body.message,
      ...(body.detail !== undefined ? { detail: body.detail } : {}),
      ...(body.fix !== undefined ? { fix: body.fix } : {}),
      ...(body.context !== undefined ? { context: body.context } : {}),
    });
    return { ok: true, issue };
  });
}
