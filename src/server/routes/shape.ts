import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError, assertSafeRunId } from "../security.js";
import {
  readShapeQuestions,
  submitShapeAnswers,
  proceedToShapeSpec,
  startShapeIntake,
  approveShapeAndStartRoadmap,
  approveShapeAndBuild,
  createRoadmapProposal,
  shapeAnswerSchema,
  ShapeChainError,
} from "../../shape/shape-chain.js";
import {
  shapeSimplify,
  shapeSuggest,
  shapeSuggestAll,
  ShapeAssistError,
} from "../../shape/shape-assist.js";
import { loadConfig } from "../../project/config-loader.js";

/** Best-effort project default flow (fallback build target for an unbound shape
 *  run). The built-in `default` flow always exists, so this never throws. */
async function defaultBuildFlow(projectRoot: string): Promise<string> {
  try {
    const loaded = await loadConfig(projectRoot);
    return loaded.config.defaultFlow ?? "default";
  } catch {
    return "default";
  }
}

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
    /** Adaptive Shape (P1): the flow to BUILD once the spec is approved. */
    flowId: z.string().min(1).max(80).optional(),
  })
  .strict();

const buildBody = z
  .object({
    shapeRunId: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/),
    /** Override the carried build flow (the user picked a different one). */
    flowId: z.string().min(1).max(80).optional(),
  })
  .strict();

const answersBody = z
  .object({
    sourceRunId: runIdParam,
    answers: z.array(shapeAnswerSchema).min(1).max(20),
    /** Deep-questioning loop: "Proceed to spec" - finalize now, skip gap-check. */
    proceed: z.boolean().optional(),
  })
  .strict();

const proceedShapeBody = z.object({ sourceRunId: runIdParam }).strict();

const questionIdParam = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9_-]*$/);

const assistBody = z
  .object({
    sourceRunId: runIdParam,
    mode: z.enum(["simplify", "suggest", "suggest-all"]),
    questionId: questionIdParam.optional(),
    questionIds: z.array(questionIdParam).max(20).optional(),
    forNonDeveloper: z.boolean().optional(),
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
        targetFlowId: parsed.data.flowId ?? null,
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
      return {
        questions: pending.questions,
        hasBrief: pending.task.length > 0,
        targetFlowId: pending.targetFlowId,
        round: pending.round,
        coverageComplete: pending.coverageComplete,
      };
    },
  );

  // Approve the shaped draft -> BUILD it (P1): launch the chosen flow seeded with
  // the approved spec as context. The chosen flow is the carried target unless
  // the body overrides it; falls back to the project default when unbound.
  app.post<{ Body: unknown }>("/api/shape/build", async (req) => {
    const parsed = buildBody.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues[0]?.message ?? "shapeRunId is required.");
    }
    try {
      const { runId, pid, flowId } = await approveShapeAndBuild({
        projectRoot,
        shapeRunId: parsed.data.shapeRunId,
        flowId: parsed.data.flowId ?? null,
        fallbackFlowId: await defaultBuildFlow(projectRoot),
      });
      return { ok: true, runId, pid, flowId };
    } catch (err) {
      if (err instanceof ShapeChainError) throw new HttpError(400, err.message);
      throw err;
    }
  });

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

  // Submit a round's answers -> either a gap-check round or the shape run.
  app.post<{ Body: unknown }>("/api/shape/answers", async (req) => {
    const parsed = answersBody.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid answers.");
    }
    try {
      const { runId, pid, action } = await submitShapeAnswers({
        projectRoot,
        sourceRunId: parsed.data.sourceRunId,
        answers: parsed.data.answers,
        proceed: parsed.data.proceed ?? false,
      });
      return { ok: true, runId, pid, action };
    } catch (err) {
      if (err instanceof ShapeChainError) throw new HttpError(400, err.message);
      throw err;
    }
  });

  // "Proceed to spec" without answering more: finalize with accumulated answers.
  app.post<{ Body: unknown }>("/api/shape/proceed", async (req) => {
    const parsed = proceedShapeBody.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, "sourceRunId is required.");
    try {
      const { runId, pid } = await proceedToShapeSpec({
        projectRoot,
        sourceRunId: parsed.data.sourceRunId,
      });
      return { ok: true, runId, pid };
    } catch (err) {
      if (err instanceof ShapeChainError) throw new HttpError(400, err.message);
      throw err;
    }
  });

  // Per-question assist: Simplify / Suggest / Suggest-all (read-only, draft-only).
  app.post<{ Body: unknown }>("/api/shape/assist", async (req) => {
    const parsed = assistBody.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid assist request.");
    }
    const { sourceRunId, mode, questionId, questionIds, forNonDeveloper } = parsed.data;
    try {
      if (mode === "simplify") {
        if (!questionId) throw new HttpError(400, "questionId is required for simplify.");
        const r = await shapeSimplify({ projectRoot, sourceRunId, questionId, forNonDeveloper });
        return { ok: true, mode, ...r };
      }
      if (mode === "suggest") {
        if (!questionId) throw new HttpError(400, "questionId is required for suggest.");
        const r = await shapeSuggest({ projectRoot, sourceRunId, questionId });
        return { ok: true, mode, ...r };
      }
      const r = await shapeSuggestAll({ projectRoot, sourceRunId, questionIds });
      return { ok: true, mode, ...r };
    } catch (err) {
      if (err instanceof ShapeAssistError) throw new HttpError(400, err.message);
      if (err instanceof ShapeChainError) throw new HttpError(400, err.message);
      throw err;
    }
  });
}
