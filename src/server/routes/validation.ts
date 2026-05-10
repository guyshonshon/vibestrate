import type { FastifyInstance } from "fastify";
import { loadConfig } from "../../project/config-loader.js";
import { listValidationProfiles } from "../../core/validation-profile-service.js";

export type ValidationRoutesDeps = { projectRoot: string };

export async function registerValidationRoutes(
  app: FastifyInstance,
  deps: ValidationRoutesDeps,
): Promise<void> {
  const { projectRoot } = deps;

  /**
   * Read-only listing of the implicit default + every named validation
   * profile. Pure projection over the parsed project config; never executes
   * anything; never reads secrets. The dashboard uses this to render the
   * profile selector and the per-row command preview.
   */
  app.get("/api/validation/profiles", async () => {
    const cfg = await loadConfig(projectRoot).catch(() => null);
    if (!cfg) return { profiles: [] };
    return { profiles: listValidationProfiles(cfg.config) };
  });
}
