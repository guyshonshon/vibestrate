import type { FastifyInstance } from "fastify";
import {
  ReviewSuggestionService,
  SuggestionServiceError,
} from "../../reviews/review-suggestion-service.js";
import { runStatePath } from "../../utils/paths.js";
import { pathExists } from "../../utils/fs.js";
import { readJson } from "../../utils/json.js";
import { runStateSchema } from "../../core/state-machine.js";
import { assertSafeRunId, HttpError } from "../security.js";

export type SuggestionsRoutesDeps = { projectRoot: string };

export async function registerSuggestionRoutes(
  app: FastifyInstance,
  deps: SuggestionsRoutesDeps,
): Promise<void> {
  const { projectRoot } = deps;

  function svc(runId: string): ReviewSuggestionService {
    return new ReviewSuggestionService(projectRoot, runId);
  }

  async function requireRun(runId: string) {
    if (!(await pathExists(runStatePath(projectRoot, runId)))) {
      throw new HttpError(404, `Run ${runId} not found.`);
    }
  }

  /**
   * Phase B guard: read-only runs refuse every write-side action on
   * suggestions (apply / validate / revert / approve). Reading them is
   * allowed — the user can still inspect what the reviewer proposed,
   * just not act on it. Returns 409 with a clear, actionable message.
   */
  async function refuseWritesOnReadOnlyRun(runId: string): Promise<void> {
    try {
      const raw = await readJson<unknown>(runStatePath(projectRoot, runId));
      const parsed = runStateSchema.safeParse(raw);
      if (parsed.success && parsed.data.readOnly === true) {
        throw new HttpError(
          409,
          `Run ${runId} is read-only (investigation-only). Apply / validate / revert / approve are disabled. Start a non-read-only run to act on these suggestions.`,
        );
      }
    } catch (err) {
      if (err instanceof HttpError) throw err;
      // If state.json is unreadable we leave the original handler to
      // surface its own error — failing open here would be silent.
    }
  }

  app.get<{ Params: { runId: string } }>(
    "/api/runs/:runId/suggestions",
    async (req) => {
      assertSafeRunId(req.params.runId);
      await requireRun(req.params.runId);
      return { suggestions: await svc(req.params.runId).list() };
    },
  );

  app.get<{ Params: { runId: string; suggestionId: string } }>(
    "/api/runs/:runId/suggestions/:suggestionId",
    async (req) => {
      assertSafeRunId(req.params.runId);
      await requireRun(req.params.runId);
      const s = await svc(req.params.runId).get(req.params.suggestionId);
      if (!s) throw new HttpError(404, "Suggestion not found.");
      return { suggestion: s };
    },
  );

  app.post<{
    Params: { runId: string };
    Body: {
      title?: string;
      body?: string;
      file?: string | null;
      lineStart?: number | null;
      lineEnd?: number | null;
      proposedPatch?: string | null;
      sourceArtifactPath?: string | null;
    };
  }>("/api/runs/:runId/suggestions", async (req) => {
    assertSafeRunId(req.params.runId);
    await requireRun(req.params.runId);
    const body = req.body ?? {};
    const title = (body.title ?? "").toString().trim();
    if (!title) throw new HttpError(400, "title is required.");
    const created = await svc(req.params.runId).addManual({
      title,
      body: body.body,
      file: body.file ?? null,
      lineStart: body.lineStart ?? null,
      lineEnd: body.lineEnd ?? null,
      proposedPatch: body.proposedPatch ?? null,
      sourceArtifactPath: body.sourceArtifactPath ?? null,
    });
    return { suggestion: created };
  });

  app.post<{
    Params: { runId: string; suggestionId: string };
    Body: { note?: string };
  }>(
    "/api/runs/:runId/suggestions/:suggestionId/approve",
    async (req) => {
      assertSafeRunId(req.params.runId);
      await requireRun(req.params.runId);
      try {
        const r = await svc(req.params.runId).approve(
          req.params.suggestionId,
          req.body?.note ?? null,
        );
        return { suggestion: r };
      } catch (err) {
        if (err instanceof SuggestionServiceError) {
          throw new HttpError(err.statusCode, err.message);
        }
        throw err;
      }
    },
  );

  app.post<{
    Params: { runId: string; suggestionId: string };
    Body: { note?: string };
  }>(
    "/api/runs/:runId/suggestions/:suggestionId/reject",
    async (req) => {
      assertSafeRunId(req.params.runId);
      await requireRun(req.params.runId);
      try {
        const r = await svc(req.params.runId).reject(
          req.params.suggestionId,
          req.body?.note ?? null,
        );
        return { suggestion: r };
      } catch (err) {
        if (err instanceof SuggestionServiceError) {
          throw new HttpError(err.statusCode, err.message);
        }
        throw err;
      }
    },
  );

  app.post<{
    Params: { runId: string; suggestionId: string };
    Body: {
      validateAfterApply?: boolean;
      autoRevertOnValidationFail?: boolean;
      validationProfile?: string | null;
    };
  }>(
    "/api/runs/:runId/suggestions/:suggestionId/apply",
    async (req) => {
      assertSafeRunId(req.params.runId);
      await requireRun(req.params.runId);
      await refuseWritesOnReadOnlyRun(req.params.runId);
      const body = req.body ?? {};
      if (body.autoRevertOnValidationFail && !body.validateAfterApply) {
        throw new HttpError(
          400,
          "autoRevertOnValidationFail requires validateAfterApply.",
        );
      }
      if (body.validationProfile && !body.validateAfterApply) {
        throw new HttpError(
          400,
          "validationProfile requires validateAfterApply (validation never runs from a plain apply).",
        );
      }
      try {
        const r = await svc(req.params.runId).apply(
          req.params.suggestionId,
          {
            validateAfterApply: body.validateAfterApply,
            autoRevertOnValidationFail: body.autoRevertOnValidationFail,
            profileName: body.validationProfile ?? null,
          },
        );
        return { suggestion: r };
      } catch (err) {
        if (err instanceof SuggestionServiceError) {
          throw new HttpError(err.statusCode, err.message);
        }
        throw err;
      }
    },
  );

  app.post<{
    Params: { runId: string; suggestionId: string };
    Body: { validationProfile?: string | null };
  }>(
    "/api/runs/:runId/suggestions/:suggestionId/validate",
    async (req) => {
      assertSafeRunId(req.params.runId);
      await requireRun(req.params.runId);
      await refuseWritesOnReadOnlyRun(req.params.runId);
      try {
        const r = await svc(req.params.runId).validate(
          req.params.suggestionId,
          { profileName: req.body?.validationProfile ?? null },
        );
        return { suggestion: r.suggestion, result: r.result };
      } catch (err) {
        if (err instanceof SuggestionServiceError) {
          throw new HttpError(err.statusCode, err.message);
        }
        throw err;
      }
    },
  );

  app.patch<{
    Params: { runId: string; suggestionId: string };
    Body: { validationProfile?: string | null };
  }>(
    "/api/runs/:runId/suggestions/:suggestionId/profile",
    async (req) => {
      assertSafeRunId(req.params.runId);
      await requireRun(req.params.runId);
      try {
        const r = await svc(req.params.runId).updateValidationProfile(
          req.params.suggestionId,
          req.body?.validationProfile ?? null,
        );
        return { suggestion: r };
      } catch (err) {
        if (err instanceof SuggestionServiceError) {
          throw new HttpError(err.statusCode, err.message);
        }
        throw err;
      }
    },
  );

  app.post<{
    Params: { runId: string; suggestionId: string };
  }>(
    "/api/runs/:runId/suggestions/:suggestionId/revert",
    async (req) => {
      assertSafeRunId(req.params.runId);
      await requireRun(req.params.runId);
      await refuseWritesOnReadOnlyRun(req.params.runId);
      try {
        const r = await svc(req.params.runId).revert(req.params.suggestionId);
        return { suggestion: r };
      } catch (err) {
        if (err instanceof SuggestionServiceError) {
          throw new HttpError(err.statusCode, err.message);
        }
        throw err;
      }
    },
  );
}
