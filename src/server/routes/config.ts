import path from "node:path";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { configExists, loadConfig } from "../../project/config-loader.js";
import { showConfig } from "../../setup/config-update-service.js";
import { buildConfigView } from "../../setup/config-view.js";
import { projectConfigPath } from "../../utils/paths.js";
import { buildPersonaCatalog } from "../../orchestrator/personas.js";
import {
  addOwnerPreference,
  listPreferences,
  removePreference,
  confirmPreference,
  rejectPreference,
} from "../../project/preferences-service.js";

// UI parity for `vibe preferences` (preference-gates.ts M1). A narrow write
// surface: only the preferences array of a known persona is touched, body is
// schema-validated, and the service writes through the fail-closed config layer.
const addPreferenceBody = z
  .object({
    id: z.string().min(1).max(60),
    statement: z.string().min(1).max(300),
    correction: z.string().min(1).max(300).nullable().optional(),
    scopeLenses: z.array(z.string().min(1).max(40)).optional(),
  })
  .strict();

export type ConfigRoutesDeps = {
  projectRoot: string;
};

/**
 * Read-only "Config view" endpoint - the dashboard mirror of `vibe config
 * view`. Returns the grouped, readable projection of project.yml (not the raw
 * dump) so the web panel can show what each section controls and where it's
 * editable. Validation issues are surfaced honestly rather than hidden: an
 * invalid config returns `valid: false` + the error and an empty view.
 */
export async function registerConfigRoutes(
  app: FastifyInstance,
  deps: ConfigRoutesDeps,
): Promise<void> {
  const { projectRoot } = deps;

  app.get("/api/config/view", async () => {
    const configPath = path.relative(projectRoot, projectConfigPath(projectRoot));
    const empty = { project: { name: "", type: "" }, sections: [] };

    if (!(await configExists(projectRoot))) {
      return {
        configPath,
        valid: false,
        error: "No Vibestrate config found. Run `vibe init` first.",
        view: empty,
      };
    }

    const r = await showConfig(projectRoot);
    if (!r.parsed) {
      return { configPath, valid: false, error: r.error, view: empty };
    }
    return {
      configPath,
      valid: r.error === null,
      error: r.error,
      view: buildConfigView(r.parsed),
    };
  });

  // Supervisor personas (orchestrator-personas.md): the resolved catalog
  // (built-ins + project) + the active default, for the run composer's selector
  // and any read-only persona surface. Read-only.
  app.get("/api/personas", async () => {
    const loaded = await loadConfig(projectRoot).catch(() => null);
    return buildPersonaCatalog(loaded?.config ?? null);
  });

  app.get("/api/personas/:id/preferences", async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      return { preferences: await listPreferences(projectRoot, id) };
    } catch (e) {
      reply.code(404);
      return { error: e instanceof Error ? e.message : "Unknown persona." };
    }
  });

  app.post("/api/personas/:id/preferences", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = addPreferenceBody.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.issues.map((i) => i.message).join("; ") };
    }
    try {
      const preference = await addOwnerPreference(
        projectRoot,
        {
          personaId: id,
          id: parsed.data.id,
          statement: parsed.data.statement,
          correction: parsed.data.correction ?? null,
          scopeLenses: parsed.data.scopeLenses ?? [],
        },
        new Date().toISOString(),
      );
      return { preference };
    } catch (e) {
      reply.code(400);
      return { error: e instanceof Error ? e.message : "Could not add preference." };
    }
  });

  app.delete("/api/personas/:id/preferences/:prefId", async (req) => {
    const { id, prefId } = req.params as { id: string; prefId: string };
    return await removePreference(projectRoot, id, prefId);
  });

  app.post("/api/personas/:id/preferences/:prefId/confirm", async (req) => {
    const { id, prefId } = req.params as { id: string; prefId: string };
    return await confirmPreference(projectRoot, id, prefId, new Date().toISOString());
  });

  app.post("/api/personas/:id/preferences/:prefId/reject", async (req) => {
    const { id, prefId } = req.params as { id: string; prefId: string };
    return await rejectPreference(projectRoot, id, prefId);
  });
}
