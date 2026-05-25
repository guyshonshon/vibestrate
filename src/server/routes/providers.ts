import type { FastifyInstance } from "fastify";
import {
  detectAllProviders,
  type DetectedProvider,
} from "../../providers/provider-detection.js";
import { loadConfig } from "../../project/config-loader.js";
import {
  addProvider,
  buildClaudeProviderFromDetection,
  buildCodexProviderFromDetection,
  buildOllamaProviderFromDetection,
  runSafeProviderTest,
  setDefaultProvider,
} from "../../setup/provider-setup-service.js";
import { HttpError } from "../security.js";

export type ProvidersRoutesDeps = { projectRoot: string };

export type ProviderRow = {
  id: string;
  label: string;
  command: string;
  available: boolean;
  version: string | null;
  confidence: DetectedProvider["confidence"];
  recommended: boolean;
  notes: string[];
  /** True when the project's loaded config has a matching `providers.<id>`. */
  configured: boolean;
};

/**
 * Read-only discovery surface for the dashboard's composer. Returns the
 * known detected providers (Claude / Codex / OpenCode / Aider / Ollama) plus a
 * `configured` flag derived from the project's loaded config — so the
 * UI can both let the user pick a *detected* provider and indicate
 * which ones are wired into project.yml already.
 *
 * Detection runs `<command> --version` with a 4s timeout. Cached lightly
 * (one snapshot per minute) so refreshes don't flood the system. No
 * shell, no secrets, no side effects.
 */
let cached: { at: number; rows: ProviderRow[] } | null = null;
const CACHE_TTL_MS = 60_000;

function bustCache() {
  cached = null;
}

const PROVIDER_ID_RE = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;
function assertSafeProviderId(id: string): void {
  if (!PROVIDER_ID_RE.test(id)) {
    throw new HttpError(400, "Invalid provider id.");
  }
}

export async function registerProvidersRoutes(
  app: FastifyInstance,
  deps: ProvidersRoutesDeps,
): Promise<void> {
  const { projectRoot } = deps;

  app.get("/api/providers", async () => {
    const now = Date.now();
    if (cached && now - cached.at < CACHE_TTL_MS) {
      return {
        providers: cached.rows,
        cachedFor: CACHE_TTL_MS - (now - cached.at),
      };
    }
    const [detected, loaded] = await Promise.all([
      detectAllProviders(),
      loadConfig(projectRoot).catch(() => null),
    ]);
    const configuredIds = new Set(
      loaded ? Object.keys(loaded.config.providers ?? {}) : [],
    );
    const rows: ProviderRow[] = detected.map((d) => ({
      id: d.id,
      label: d.label,
      command: d.command,
      available: d.available,
      version: d.version ?? null,
      confidence: d.confidence,
      recommended: d.recommended,
      notes: d.notes,
      configured: configuredIds.has(d.id),
    }));
    cached = { at: now, rows };
    return { providers: rows, cachedFor: CACHE_TTL_MS };
  });

  /**
   * Setup a detected provider with its preset config. Only the known
   * preset ids (claude / codex / ollama) can be set up via this route;
   * for anything else the user has to hand-edit project.yml. We refuse
   * unknown ids rather than blindly writing a config we can't reason
   * about.
   */
  app.post<{
    Params: { providerId: string };
    Body: { setAsDefault?: boolean } | undefined;
  }>("/api/providers/:providerId/setup", async (req) => {
    const id = req.params.providerId;
    assertSafeProviderId(id);
    const detected = await detectAllProviders();
    const d = detected.find((row) => row.id === id);
    if (!d) {
      throw new HttpError(
        404,
        `Provider "${id}" is not a known detectable CLI. Add it manually in .amaco/project.yml.`,
      );
    }
    let cfg;
    if (id === "claude") cfg = buildClaudeProviderFromDetection(d);
    else if (id === "codex") cfg = buildCodexProviderFromDetection(d);
    else if (id === "ollama") cfg = buildOllamaProviderFromDetection(d);
    else {
      throw new HttpError(
        409,
        `No preset is bundled for "${id}". Edit .amaco/project.yml to configure it.`,
      );
    }
    await addProvider(projectRoot, {
      id,
      config: cfg,
      alsoAssignAllAgents: req.body?.setAsDefault === true,
    });
    bustCache();
    return { ok: true, providerId: id, configured: true };
  });

  /**
   * Assign every agent in project.yml to the chosen provider — the
   * "set as default" action. Refuses ids that aren't already configured.
   */
  app.post<{ Params: { providerId: string } }>(
    "/api/providers/:providerId/default",
    async (req) => {
      const id = req.params.providerId;
      assertSafeProviderId(id);
      const result = await setDefaultProvider(projectRoot, id);
      if (!result.ok) {
        throw new HttpError(409, result.reason);
      }
      bustCache();
      return result;
    },
  );

  /**
   * Run the canned safe-test prompt against the configured provider.
   * Returns the exit code + stdout + a `matchedMagic` flag the UI can
   * surface as a green/red banner. Capped at 60 s by the underlying
   * service.
   */
  app.post<{ Params: { providerId: string } }>(
    "/api/providers/:providerId/test",
    async (req) => {
      const id = req.params.providerId;
      assertSafeProviderId(id);
      const result = await runSafeProviderTest({
        projectRoot,
        providerId: id,
        timeoutMs: 45_000,
      });
      return result;
    },
  );
}
