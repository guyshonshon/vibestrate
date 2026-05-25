import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { loadConfig } from "../../project/config-loader.js";
import {
  discoverGuides,
  findGuideById,
} from "../../guides/catalog/guide-discovery.js";
import {
  GuideResolutionError,
  resolveGuide,
} from "../../guides/runtime/guide-resolver.js";
import { guideContextPolicySchema } from "../../guides/schemas/guide-schema.js";
import { suggestGuidesForProject } from "../../guides/runtime/guide-suggestion.js";
import {
  applyGuidePatch,
  guidePatchInputSchema,
} from "../../guides/runtime/guide-patch.js";
import { HttpError } from "../security.js";

const providerOverridesSchema = z
  .record(z.string().min(1).max(80), z.string().min(1).max(128))
  .optional();

const resolveGuideBody = z
  .object({
    task: z.string().min(1).max(2000),
    brief: z.string().max(4000).nullable().optional(),
    contextPolicy: guideContextPolicySchema.optional(),
    slotProviders: providerOverridesSchema,
    stepProviders: providerOverridesSchema,
    skippedOptionalSteps: z.array(z.string().min(1).max(80)).max(64).optional(),
  })
  .strict();

const suggestGuidesBody = z
  .object({
    task: z.string().min(1).max(2000),
    files: z.array(z.string().min(1).max(500)).max(256).optional(),
    riskLevel: z.enum(["low", "medium", "high"]).nullable().optional(),
  })
  .strict();

export type GuidesRoutesDeps = {
  projectRoot: string;
};

export async function registerGuidesRoutes(
  app: FastifyInstance,
  deps: GuidesRoutesDeps,
): Promise<void> {
  const { projectRoot } = deps;

  app.get("/api/guides", async () => {
    return { guides: await discoverGuides(projectRoot) };
  });

  app.post<{ Body: unknown }>("/api/guides/suggest", async (req) => {
    const parsed = suggestGuidesBody.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.message);
    return {
      suggestions: await suggestGuidesForProject({
        projectRoot,
        ...parsed.data,
      }),
    };
  });

  app.get<{ Params: { guideId: string } }>(
    "/api/guides/:guideId",
    async (req) => {
      const guide = await guideOr404(projectRoot, req.params.guideId);
      return { guide };
    },
  );

  app.patch<{ Params: { guideId: string }; Body: unknown }>(
    "/api/guides/:guideId",
    async (req) => {
      const parsed = guidePatchInputSchema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, parsed.error.message);
      const result = await applyGuidePatch({
        projectRoot,
        guideId: decodeURIComponent(req.params.guideId),
        patch: parsed.data,
      });
      if (!result.ok) {
        throw new HttpError(result.status, result.reasons.join("\n"));
      }
      return {
        ok: true,
        guideId: result.guideId,
        definitionPath: result.definitionPath,
        guide: await guideOr404(projectRoot, result.guideId),
      };
    },
  );

  app.post<{ Params: { guideId: string }; Body: unknown }>(
    "/api/guides/:guideId/resolve",
    async (req) => {
      const parsed = resolveGuideBody.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, parsed.error.message);

      const [guide, loaded] = await Promise.all([
        guideOr404(projectRoot, req.params.guideId),
        loadConfig(projectRoot),
      ]);
      try {
        return {
          snapshot: resolveGuide({
            guide: guide.definition,
            source: guide.source,
            config: loaded.config,
            ...parsed.data,
          }),
        };
      } catch (err) {
        if (err instanceof GuideResolutionError) {
          throw new HttpError(400, err.message);
        }
        throw err;
      }
    },
  );
}

async function guideOr404(projectRoot: string, guideId: string) {
  const decoded = decodeURIComponent(guideId);
  const guide = await findGuideById(projectRoot, decoded);
  if (!guide) {
    throw new HttpError(
      404,
      `Guide "${decoded}" not found. Use GET /api/guides to list available Guide ids.`,
    );
  }
  return guide;
}
