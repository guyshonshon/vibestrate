import path from "node:path";
import type { FastifyInstance } from "fastify";
import { detectFullProject } from "../../project/project-detector.js";
import { detectAllProviders } from "../../providers/provider-detection.js";
import { listConfiguredProviders } from "../../setup/provider-setup-service.js";
import { runDoctor } from "../../setup/doctor-service.js";
import { applySetup } from "../../setup/setup-service.js";
import { configExists, loadConfig } from "../../project/config-loader.js";
import {
  PROVIDER_CATALOG,
  capabilitiesForProvider,
} from "../../providers/provider-catalog.js";

export type SetupRoutesDeps = {
  projectRoot: string;
};

export async function registerSetupRoutes(
  app: FastifyInstance,
  deps: SetupRoutesDeps,
): Promise<void> {
  const { projectRoot } = deps;

  // Per-provider model / power / budget suggestions for the Profile editor.
  // The static catalog covers the well-known providers; we merge the project's
  // actually-configured providers over it (api-aware) so a user's http-api
  // provider surfaces its real knobs (e.g. OpenAI effort) under its own id.
  app.get("/api/providers/catalog", async () => {
    const catalog: Record<string, unknown> = { ...PROVIDER_CATALOG };
    if (await configExists(projectRoot)) {
      const { config } = await loadConfig(projectRoot);
      for (const [id, provider] of Object.entries(config.providers)) {
        catalog[id] = capabilitiesForProvider(id, provider);
      }
    }
    return { catalog };
  });

  app.get("/api/setup/summary", async () => {
    const [project, providers, configured, doctor] = await Promise.all([
      detectFullProject(projectRoot),
      detectAllProviders(),
      listConfiguredProviders(projectRoot).catch(() => []),
      runDoctor({ cwd: projectRoot }).catch((err: unknown) => ({
        projectRoot,
        inGitRepo: false,
        findings: [],
        recommendedNextSteps: [
          err instanceof Error ? err.message : String(err),
        ],
      })),
    ]);
    return { project, providers, configured, doctor };
  });

  // Has this project been initialized (does `.vibestrate/` config exist)? The
  // dashboard gates on this to show the onboarding screen on first run.
  app.get("/api/setup/status", async () => {
    const [initialized, project] = await Promise.all([
      configExists(projectRoot),
      detectFullProject(projectRoot).catch(() => null),
    ]);
    return {
      initialized,
      isGitRepo: project?.isGitRepo ?? false,
      projectName: path.basename(projectRoot),
      projectRoot,
    };
  });

  // Initialize the project from the dashboard (parity with `vibe init`): scaffold
  // `.vibestrate/`, detect providers, write the default config. Returns a summary
  // the onboarding screen renders. Idempotent-ish: re-running without force won't
  // clobber an existing config (init skips what's present).
  app.post("/api/setup/init", async () => {
    const { plan, init } = await applySetup({ options: { projectRoot } });
    return {
      ok: true,
      created: init.created,
      detections: plan.detections.map((d) => ({
        id: d.id,
        label: d.label,
        available: d.available,
        confidence: d.confidence,
        recommended: d.recommended,
      })),
      recommendedProvider: plan.recommendedProvider?.id ?? null,
      providerComplete: plan.providerComplete,
    };
  });
}
