import { z } from "zod";
import type { FastifyInstance } from "fastify";
import {
  ProposalService,
  ProposalServiceError,
} from "../../roadmap/proposal-service.js";
import {
  generateRoadmapProposal,
  RoadmapPlanError,
} from "../../roadmap/roadmap-planner.js";
import { HttpError } from "../security.js";

const PROPOSAL_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;

function assertProposalId(id: string): void {
  if (!PROPOSAL_ID_RE.test(id) || id.includes("..")) {
    throw new HttpError(400, `Invalid proposal id: ${id}`);
  }
}

const acceptBody = z.object({
  dryRun: z.boolean().optional(),
  allowUnresolvedDependencies: z.boolean().optional(),
});

const planBody = z.object({
  goal: z.string().min(1).max(2000),
  providerId: z.string().min(1).max(80).optional(),
});

export type ProposalsRoutesDeps = { projectRoot: string };

export async function registerProposalsRoutes(
  app: FastifyInstance,
  deps: ProposalsRoutesDeps,
): Promise<void> {
  const svc = new ProposalService(deps.projectRoot);

  app.get("/api/roadmap/proposals", async () => {
    const proposals = await svc.listProposals();
    return { proposals };
  });

  // Generate a proposal from a broad goal (the dashboard "Generate" action;
  // mirrors `vibe roadmap plan`). Runs the local planner provider inline - like
  // shapeAssist, this can take a while, so the client shows a working state.
  app.post<{ Body: unknown }>("/api/roadmap/proposals", async (req) => {
    const parsed = planBody.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid goal.");
    }
    try {
      const { proposalId } = await generateRoadmapProposal({
        projectRoot: deps.projectRoot,
        goal: parsed.data.goal,
        providerId: parsed.data.providerId,
      });
      return { ok: true, proposalId };
    } catch (err) {
      if (err instanceof RoadmapPlanError) throw new HttpError(400, err.message);
      throw err;
    }
  });

  app.get<{ Params: { proposalId: string } }>(
    "/api/roadmap/proposals/:proposalId",
    async (req) => {
      assertProposalId(req.params.proposalId);
      const text = await svc.getProposalText(req.params.proposalId);
      if (text === null) throw new HttpError(404, "Proposal not found.");
      const audit = await svc.readAuditIfPresent(req.params.proposalId);
      return { proposalId: req.params.proposalId, body: text, accepted: audit };
    },
  );

  app.get<{ Params: { proposalId: string } }>(
    "/api/roadmap/proposals/:proposalId/parse",
    async (req) => {
      assertProposalId(req.params.proposalId);
      const parsed = await svc.parseProposalById(req.params.proposalId);
      if (!parsed) throw new HttpError(404, "Proposal not found.");
      // Drop the rawText to keep responses small; the show endpoint already
      // returns it.
      const { rawText: _rawText, ...rest } = parsed;
      void _rawText;
      return rest;
    },
  );

  app.post<{ Params: { proposalId: string }; Body: unknown }>(
    "/api/roadmap/proposals/:proposalId/accept",
    async (req) => {
      assertProposalId(req.params.proposalId);
      const parsed = acceptBody.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw new HttpError(400, parsed.error.message);
      }
      try {
        if (parsed.data.dryRun) {
          const preview = await svc.dryRun({
            proposalId: req.params.proposalId,
            allowUnresolvedDependencies: parsed.data.allowUnresolvedDependencies,
          });
          return {
            dryRun: true,
            willCreate: preview.willCreate,
            warnings: preview.warnings,
            errors: preview.errors,
            cycle: preview.cycle,
            alreadyAccepted: preview.alreadyAccepted,
          };
        }
        const result = await svc.accept({
          proposalId: req.params.proposalId,
          options: {
            allowUnresolvedDependencies:
              parsed.data.allowUnresolvedDependencies,
          },
        });
        return { dryRun: false, result };
      } catch (err) {
        if (err instanceof ProposalServiceError) {
          throw new HttpError(409, err.message);
        }
        throw new HttpError(500, err instanceof Error ? err.message : String(err));
      }
    },
  );
}
