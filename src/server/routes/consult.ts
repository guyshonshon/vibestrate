import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { runConsult, persistConsultProposal, ConsultError } from "../../consult/consult.js";
import {
  loadProjectManual,
  writeProjectManual,
  STARTER_MANUAL,
  ManualWriteError,
} from "../../project/project-manual.js";
import {
  listManualProposals,
  applyManualProposal,
  rejectManualProposal,
  ManualProposalError,
} from "../../project/manual-proposals.js";
import { HttpError } from "../security.js";

export type ConsultRoutesDeps = { projectRoot: string };

const consultBody = z
  .object({
    question: z.string().min(1).max(4000),
    taskId: z.string().min(1).max(120).optional(),
    runId: z.string().min(1).max(120).optional(),
    files: z.array(z.string().min(1).max(400)).max(20).optional(),
    /** Explicit profile to answer with; omitted = the crew's read-only planner. */
    profileId: z.string().min(1).max(200).optional(),
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
    const { question, taskId, runId, files, profileId } = parsed.data;
    try {
      const result = await runConsult({
        projectRoot,
        question,
        taskId: taskId ?? null,
        runId: runId ?? null,
        files: files ?? [],
        profileId: profileId ?? null,
      });
      const proposalId = await persistConsultProposal(projectRoot, result).catch(() => null);
      return { ...result, proposalId };
    } catch (err) {
      if (err instanceof ConsultError) {
        const notInit = /not initialized/i.test(err.message);
        throw new HttpError(notInit ? 409 : 400, err.message);
      }
      throw err;
    }
  });

  // ── VIBESTRATE.md: read, scaffold, and apply/reject reviewed proposals ──────
  app.get("/api/vibestrate", async () => {
    const manual = await loadProjectManual(projectRoot);
    return { present: manual.present, path: manual.path, content: manual.content };
  });

  app.post("/api/vibestrate/init", async () => {
    const manual = await loadProjectManual(projectRoot);
    if (manual.present) throw new HttpError(409, "VIBESTRATE.md already exists.");
    try {
      const { path } = await writeProjectManual(projectRoot, STARTER_MANUAL, { reason: "init" });
      return { ok: true, path };
    } catch (err) {
      if (err instanceof ManualWriteError) throw new HttpError(400, err.message);
      throw err;
    }
  });

  app.get("/api/vibestrate/proposals", async (req) => {
    const all = (req.query as { all?: string } | undefined)?.all;
    const list = await listManualProposals(
      projectRoot,
      all === "1" || all === "true" ? undefined : { status: "open" },
    );
    return { proposals: list };
  });

  app.post<{ Params: { id: string } }>("/api/vibestrate/proposals/:id/apply", async (req) => {
    try {
      const { proposal, created } = await applyManualProposal(projectRoot, req.params.id);
      return { ok: true, proposal, created };
    } catch (err) {
      if (err instanceof ManualProposalError || err instanceof ManualWriteError) {
        throw new HttpError(400, err.message);
      }
      throw err;
    }
  });

  app.post<{ Params: { id: string } }>("/api/vibestrate/proposals/:id/reject", async (req) => {
    try {
      const proposal = await rejectManualProposal(projectRoot, req.params.id);
      return { ok: true, proposal };
    } catch (err) {
      if (err instanceof ManualProposalError) throw new HttpError(400, err.message);
      throw err;
    }
  });
}
