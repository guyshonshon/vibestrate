import path from "node:path";
import type { FastifyInstance } from "fastify";
import { detectFullProject } from "../../project/project-detector.js";
import { detectAllProviders } from "../../providers/provider-detection.js";
import { listConfiguredProviders } from "../../setup/provider-setup-service.js";
import { runDoctor } from "../../setup/doctor-service.js";
import { applySetup } from "../../setup/setup-service.js";
import { configExists, loadConfig } from "../../project/config-loader.js";
import { HttpError } from "../security.js";
import {
  PROVIDER_CATALOG,
  providerCapabilities,
  capabilitiesForProvider,
} from "../../providers/provider-catalog.js";
import {
  loadCatalogOverlay,
  mergeCatalog,
  providerOverlaySource,
} from "../../providers/provider-catalog-overlay.js";
import { refreshCatalog } from "../../providers/provider-probe.js";
import { providerCatalogOverlayPath } from "../../utils/paths.js";
import { pathExists } from "../../utils/fs.js";

export type SetupRoutesDeps = {
  projectRoot: string;
};

export async function registerSetupRoutes(
  app: FastifyInstance,
  deps: SetupRoutesDeps,
): Promise<void> {
  const { projectRoot } = deps;

  // Per-provider model / power suggestions for the Profile editor.
  // The static catalog covers the well-known providers; we merge the project's
  // actually-configured providers over it (api-aware) so a user's http-api
  // provider surfaces its real knobs (e.g. OpenAI effort) under its own id.
  app.get("/api/providers/catalog", async () => {
    // Built-in specs + the project's `.vibestrate/providers-catalog.yml` overlay
    // (empty when there's no file / no project), so user-declared knobs surface.
    // Also returns the overlay status + per-provider source so a UI can show the
    // same "where did this come from" view as `vibe provider catalog`.
    const overlay = await loadCatalogOverlay(projectRoot);
    const resolved = mergeCatalog(overlay);
    const overlayFile = providerCatalogOverlayPath(projectRoot);
    const overlayPresent = await pathExists(overlayFile);

    const catalog: Record<string, unknown> = {};
    const sources: Record<string, "overlay" | "built-in"> = {};
    for (const id of Object.keys(PROVIDER_CATALOG)) {
      catalog[id] = providerCapabilities(id, resolved);
      sources[id] = overlay.cli?.[id] ? "overlay" : "built-in";
    }
    if (await configExists(projectRoot)) {
      const { config } = await loadConfig(projectRoot);
      for (const [id, provider] of Object.entries(config.providers)) {
        catalog[id] = capabilitiesForProvider(id, provider, resolved);
        sources[id] = providerOverlaySource(overlay, id, provider);
      }
    }
    return { catalog, overlay: { present: overlayPresent, path: overlayFile }, sources };
  });

  // Probe configured CLI providers' --help and write discovered knobs into the
  // overlay for review (parity with `vibe provider refresh`). Local only - it
  // runs the provider's own --help, no egress, no keys. Gap-fill unless force.
  app.post<{ Body: { providerId?: string; force?: boolean; dryRun?: boolean } | null }>(
    "/api/providers/catalog/refresh",
    async (req) => {
      const body = req.body ?? {};
      const result = await refreshCatalog(projectRoot, {
        providerId: typeof body.providerId === "string" ? body.providerId : undefined,
        force: body.force === true,
        dryRun: body.dryRun === true,
      });
      return result;
    },
  );

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
  app.post<{ Body: { gitInit?: boolean } | null }>("/api/setup/init", async (req) => {
    // P7a: create a git repo ONLY on the explicit flag - never inferred from
    // the init request itself (creating repo history is never a side effect).
    // Idempotent for the web one-shot (review finding): if a previous attempt
    // created the repo but the scaffold failed, a retry must not 409 on the
    // nest-refusal - the git step becomes a no-op and setup continues.
    let git: import("../../git/git-init.js").GitInitResult | null = null;
    if (req.body?.gitInit === true) {
      const already = await detectFullProject(projectRoot).catch(() => null);
      if (already?.isGitRepo) {
        git = {
          ok: true,
          initialized: false,
          gitignoreWritten: false,
          commitSha: null,
          commitSkippedReason: "already a git repository",
          error: null,
        };
      } else {
        const { initGitRepository } = await import("../../git/git-init.js");
        git = await initGitRepository({ projectRoot });
        if (!git.ok) throw new HttpError(409, git.error ?? "git init failed");
      }
    }
    const { plan, init } = await applySetup({ options: { projectRoot } });
    return {
      ok: true,
      git,
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
