import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { runConsult, ConsultError } from "../../consult/consult.js";
import { HttpError } from "../security.js";

export type ConsultRoutesDeps = { projectRoot: string };

const consultBody = z
  .object({
    question: z.string().min(1).max(4000),
    taskId: z.string().min(1).max(120).optional(),
    runId: z.string().min(1).max(120).optional(),
    files: z.array(z.string().min(1).max(400)).max(20).optional(),
  })
  .strict();

/**
 * Ask the project orchestrator a question, answered from controlled project
 * context (VIBESTRATE.md + config + run evidence + annotations + optional
 * task/run/files). Read-only and broker-gated via the assist primitive; no run
 * is created and nothing is written. Inherits the `/api/*` bearer-auth gate.
 */
export async function registerConsultRoutes(
  app: FastifyInstance,
  deps: ConsultRoutesDeps,
): Promise<void> {
  const { projectRoot } = deps;

  app.post<{ Body: unknown }>("/api/consult", async (req) => {
    const parsed = consultBody.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid consult request.");
    }
    const { question, taskId, runId, files } = parsed.data;
    try {
      const result = await runConsult({
        projectRoot,
        question,
        taskId: taskId ?? null,
        runId: runId ?? null,
        files: files ?? [],
      });
      return result;
    } catch (err) {
      if (err instanceof ConsultError) {
        const notInit = /not initialized/i.test(err.message);
        throw new HttpError(notInit ? 409 : 400, err.message);
      }
      throw err;
    }
  });
}
