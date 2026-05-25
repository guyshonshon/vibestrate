import type { FastifyInstance } from "fastify";
import { HttpError } from "../security.js";
import {
  composerPresetSchema,
  deleteComposerPreset,
  readComposerPresets,
  slugifyPresetName,
  upsertComposerPreset,
} from "../composer-presets.js";

export type ComposerPresetsRoutesDeps = {
  projectRoot: string;
};

const upsertBodySchema = composerPresetSchema.omit({
  createdAt: true,
  updatedAt: true,
});

export async function registerComposerPresetsRoutes(
  app: FastifyInstance,
  deps: ComposerPresetsRoutesDeps,
): Promise<void> {
  const { projectRoot } = deps;

  app.get("/api/composer/presets", async () => {
    return { presets: await readComposerPresets(projectRoot) };
  });

  app.post<{ Body: unknown }>("/api/composer/presets", async (req, reply) => {
    const parsed = upsertBodySchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.message);
    const { preset, created } = await upsertComposerPreset({
      projectRoot,
      preset: parsed.data,
    });
    reply.code(created ? 201 : 200);
    return { ok: true, preset };
  });

  app.delete<{ Params: { name: string } }>(
    "/api/composer/presets/:name",
    async (req) => {
      const decoded = decodeURIComponent(req.params.name);
      const result = await deleteComposerPreset({
        projectRoot,
        name: decoded,
      });
      if (!result.deleted) {
        throw new HttpError(
          404,
          `Preset "${slugifyPresetName(decoded)}" not found.`,
        );
      }
      return { ok: true };
    },
  );
}
