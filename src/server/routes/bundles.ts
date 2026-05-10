import type { FastifyInstance } from "fastify";
import {
  SuggestionBundleError,
  SuggestionBundleService,
} from "../../reviews/suggestion-bundle-service.js";
import { runStatePath } from "../../utils/paths.js";
import { pathExists } from "../../utils/fs.js";
import { assertSafeRunId, HttpError } from "../security.js";

export type BundlesRoutesDeps = { projectRoot: string };

export async function registerBundlesRoutes(
  app: FastifyInstance,
  deps: BundlesRoutesDeps,
): Promise<void> {
  const { projectRoot } = deps;

  function svc(runId: string): SuggestionBundleService {
    return new SuggestionBundleService(projectRoot, runId);
  }

  async function requireRun(runId: string) {
    if (!(await pathExists(runStatePath(projectRoot, runId)))) {
      throw new HttpError(404, `Run ${runId} not found.`);
    }
  }

  app.get<{ Params: { runId: string } }>(
    "/api/runs/:runId/suggestion-bundles",
    async (req) => {
      assertSafeRunId(req.params.runId);
      await requireRun(req.params.runId);
      return { bundles: await svc(req.params.runId).list() };
    },
  );

  app.get<{ Params: { runId: string; bundleId: string } }>(
    "/api/runs/:runId/suggestion-bundles/:bundleId",
    async (req) => {
      assertSafeRunId(req.params.runId);
      await requireRun(req.params.runId);
      const b = await svc(req.params.runId).get(req.params.bundleId);
      if (!b) throw new HttpError(404, "Bundle not found.");
      return { bundle: b };
    },
  );

  app.post<{
    Params: { runId: string };
    Body: {
      title?: string;
      description?: string;
      suggestionIds?: string[];
    };
  }>("/api/runs/:runId/suggestion-bundles", async (req) => {
    assertSafeRunId(req.params.runId);
    await requireRun(req.params.runId);
    const body = req.body ?? {};
    const title = (body.title ?? "").toString().trim();
    if (!title) throw new HttpError(400, "title is required.");
    try {
      const b = await svc(req.params.runId).create({
        title,
        description: body.description,
        suggestionIds: body.suggestionIds,
      });
      return { bundle: b };
    } catch (err) {
      if (err instanceof SuggestionBundleError) {
        throw new HttpError(err.statusCode, err.message);
      }
      throw err;
    }
  });

  registerBundleAction(app, projectRoot, "add", async (s, req) => {
    const sid = (req.body as { suggestionId?: string } | null | undefined)
      ?.suggestionId;
    if (!sid) throw new HttpError(400, "suggestionId is required.");
    return s.addSuggestion((req.params as { bundleId: string }).bundleId, sid);
  });
  registerBundleAction(app, projectRoot, "remove", async (s, req) => {
    const sid = (req.body as { suggestionId?: string } | null | undefined)
      ?.suggestionId;
    if (!sid) throw new HttpError(400, "suggestionId is required.");
    return s.removeSuggestion(
      (req.params as { bundleId: string }).bundleId,
      sid,
    );
  });
  registerBundleAction(app, projectRoot, "approve", async (s, req) => {
    const note =
      (req.body as { note?: string } | null | undefined)?.note ?? null;
    return s.approve((req.params as { bundleId: string }).bundleId, note);
  });
  registerBundleAction(app, projectRoot, "reject", async (s, req) => {
    const note =
      (req.body as { note?: string } | null | undefined)?.note ?? null;
    return s.reject((req.params as { bundleId: string }).bundleId, note);
  });
  registerBundleAction(app, projectRoot, "apply", async (s, req) => {
    const body = (req.body ?? {}) as {
      validateAfterApply?: boolean;
      autoRevertOnValidationFail?: boolean;
    };
    if (body.autoRevertOnValidationFail && !body.validateAfterApply) {
      throw new HttpError(
        400,
        "autoRevertOnValidationFail requires validateAfterApply.",
      );
    }
    const r = await s.apply((req.params as { bundleId: string }).bundleId, {
      validateAfterApply: body.validateAfterApply,
      autoRevertOnValidationFail: body.autoRevertOnValidationFail,
    });
    return { bundle: r.bundle, preflight: r.preflight };
  });
  registerBundleAction(app, projectRoot, "smart-apply", async (s, req) => {
    const body = (req.body ?? {}) as {
      validateEachStep?: boolean;
      autoRevertFailing?: boolean;
    };
    if (body.autoRevertFailing && !body.validateEachStep) {
      throw new HttpError(
        400,
        "autoRevertFailing requires validateEachStep.",
      );
    }
    const r = await s.smartApply(
      (req.params as { bundleId: string }).bundleId,
      {
        validateEachStep: body.validateEachStep,
        autoRevertFailing: body.autoRevertFailing,
      },
    );
    return { bundle: r.bundle, result: r.result };
  });
  registerBundleAction(app, projectRoot, "validate", async (s, req) => {
    const r = await s.validate(
      (req.params as { bundleId: string }).bundleId,
    );
    return { bundle: r.bundle, result: r.result };
  });
  registerBundleAction(app, projectRoot, "revert", async (s, req) => {
    return s.revert((req.params as { bundleId: string }).bundleId);
  });

  app.get<{ Params: { runId: string; bundleId: string } }>(
    "/api/runs/:runId/suggestion-bundles/:bundleId/preflight",
    async (req) => {
      assertSafeRunId(req.params.runId);
      await requireRun(req.params.runId);
      try {
        const r = await svc(req.params.runId).preflight(req.params.bundleId);
        return r;
      } catch (err) {
        if (err instanceof SuggestionBundleError) {
          throw new HttpError(err.statusCode, err.message);
        }
        throw err;
      }
    },
  );
}

type BundleActionHandler = (
  service: SuggestionBundleService,
  req: import("fastify").FastifyRequest,
) => Promise<unknown>;

function registerBundleAction(
  app: FastifyInstance,
  projectRoot: string,
  action: string,
  handler: BundleActionHandler,
): void {
  app.post<{
    Params: { runId: string; bundleId: string };
    Body: unknown;
  }>(
    `/api/runs/:runId/suggestion-bundles/:bundleId/${action}`,
    async (req) => {
      assertSafeRunId(req.params.runId);
      if (!(await pathExists(runStatePath(projectRoot, req.params.runId)))) {
        throw new HttpError(404, `Run ${req.params.runId} not found.`);
      }
      try {
        const svc = new SuggestionBundleService(projectRoot, req.params.runId);
        const result = await handler(svc, req);
        if (result && typeof result === "object" && "id" in (result as object)) {
          return { bundle: result };
        }
        return result;
      } catch (err) {
        if (err instanceof SuggestionBundleError) {
          throw new HttpError(err.statusCode, err.message);
        }
        throw err;
      }
    },
  );
}
