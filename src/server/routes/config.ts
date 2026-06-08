import path from "node:path";
import type { FastifyInstance } from "fastify";
import { configExists, loadConfig } from "../../project/config-loader.js";
import { showConfig } from "../../setup/config-update-service.js";
import { buildConfigView } from "../../setup/config-view.js";
import { projectConfigPath } from "../../utils/paths.js";
import { BUILTIN_PERSONAS } from "../../orchestrator/personas.js";

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
    let defaultPersona = "staff-engineer";
    let projectPersonas: Record<string, unknown> = {};
    try {
      const loaded = await loadConfig(projectRoot);
      defaultPersona = loaded.config.defaultPersona;
      projectPersonas = loaded.config.personas ?? {};
    } catch {
      // fall back to the built-in default
    }
    const merged: Record<string, { label: string; description?: string; reviewLenses: string[]; builtin: boolean }> = {};
    for (const [id, p] of Object.entries(BUILTIN_PERSONAS)) {
      merged[id] = {
        label: p.label,
        description: p.description,
        reviewLenses: p.reviewLenses,
        builtin: true,
      };
    }
    for (const [id, p] of Object.entries(projectPersonas as Record<string, { label: string; description?: string; reviewLenses?: string[] }>)) {
      merged[id] = {
        label: p.label,
        description: p.description,
        reviewLenses: p.reviewLenses ?? [],
        builtin: false,
      };
    }
    return {
      defaultPersona,
      personas: Object.entries(merged).map(([id, p]) => ({ id, ...p })),
    };
  });
}
