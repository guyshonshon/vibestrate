import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError, assertSafeRunId } from "../security.js";
import {
  readShapeQuestions,
  submitShapeAnswers,
  startShapeIntake,
  approveShapeAndStartRoadmap,
  createRoadmapProposal,
  shapeAnswerSchema,
  ShapeChainError,
} from "../../shape/shape-chain.js";

const runIdParam = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/);

export type ShapeRoutesDeps = { projectRoot: string };

const startBody = z
  .object({
    task: z.string().min(1).max(2000),
    persona: z.string().min(1).max(40).optional(),
  })
  .strict();

const answersBody = z
  .object({
    sourceRunId: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/),
    answers: z.array(shapeAnswerSchema).min(1).max(20),
  })
  .strict();

/**
 * The Shape phase HTTP surface (docs/design/shape-phase.md). All three routes
 * inherit the `/api/*` localhost + CSRF + bearer gates. Runs are launched only
 * through the gated `startDetachedRun` path inside shape-chain - the browser
 * never passes a command.
 */
export async function registerShapeRoutes(
  app: FastifyInstance,
  deps: ShapeRoutesDeps,
): Promise<void> {
  const { projectRoot } = deps;

  // Start the chain: launch the intake run from a brief (the "Plan" affordance).
  app.post<{ Body: unknown }>("/api/shape/intake", async (req) => {
    const parsed = startBody.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid brief.");
    }
    try {
      const { runId, pid } = await startShapeIntake({
        projectRoot,
        task: parsed.data.task,
        persona: parsed.data.persona ?? null,
      });
      return { ok: true, runId, pid };
    } catch (err) {
      if (err instanceof ShapeChainError) throw new HttpError(400, err.message);
      throw err;
    }
  });

  // Read an intake run's pending questions so the consult surface can render the
  // form. `questions: null` means the run has no parsed questions (not intake).
  app.get<{ Params: { id: string } }>(
    "/api/runs/:id/shape-questions",
    async (req) => {
      assertSafeRunId(req.params.id);
      const pending = await readShapeQuestions(projectRoot, req.params.id);
      if (!pending) return { questions: null };
      return { questions: pending.questions, hasBrief: pending.task.length > 0 };
    },
  );

  // Approve the shaped draft -> launch the roadmap run (resumeFrom the shape run).
  app.post<{ Body: { shapeRunId?: unknown } }>("/api/shape/roadmap", async (req) => {
    const shapeRunId = runIdParam.safeParse(
      (req.body as { shapeRunId?: unknown } | undefined)?.shapeRunId,
    );
    if (!shapeRunId.success) throw new HttpError(400, "shapeRunId is required.");
    try {
      const { runId, pid } = await approveShapeAndStartRoadmap({
        projectRoot,
        shapeRunId: shapeRunId.data,
      });
      return { ok: true, runId, pid };
    } catch (err) {
      if (err instanceof ShapeChainError) throw new HttpError(400, err.message);
      throw err;
    }
  });

  // Turn a finished shape-roadmap run into a reviewable proposal (cards).
  app.post<{ Body: { runId?: unknown } }>(
    "/api/shape/roadmap-proposal",
    async (req) => {
      const runId = runIdParam.safeParse(
        (req.body as { runId?: unknown } | undefined)?.runId,
      );
      if (!runId.success) throw new HttpError(400, "runId is required.");
      try {
        const { proposalId } = await createRoadmapProposal({
          projectRoot,
          runId: runId.data,
        });
        return { ok: true, proposalId };
      } catch (err) {
        if (err instanceof ShapeChainError) throw new HttpError(400, err.message);
        throw err;
      }
    },
  );

  // Submit answers -> launch the shape run seeded with the answers as context.
  app.post<{ Body: unknown }>("/api/shape/answers", async (req) => {
    const parsed = answersBody.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid answers.");
    }
    try {
      const { runId, pid } = await submitShapeAnswers({
        projectRoot,
        sourceRunId: parsed.data.sourceRunId,
        answers: parsed.data.answers,
      });
      return { ok: true, runId, pid };
    } catch (err) {
      if (err instanceof ShapeChainError) throw new HttpError(400, err.message);
      throw err;
    }
  });
}
