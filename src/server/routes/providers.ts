import type { FastifyInstance } from "fastify";
import {
  detectAllProviders,
  type DetectedProvider,
} from "../../providers/provider-detection.js";
import { loadConfig } from "../../project/config-loader.js";

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
 * known detected providers (Claude / Codex / OpenCode / Aider) plus a
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

export async function registerProvidersRoutes(
  app: FastifyInstance,
  deps: ProvidersRoutesDeps,
): Promise<void> {
  app.get("/api/providers", async () => {
    const now = Date.now();
    if (cached && now - cached.at < CACHE_TTL_MS) {
      return { providers: cached.rows, cachedFor: CACHE_TTL_MS - (now - cached.at) };
    }
    const [detected, loaded] = await Promise.all([
      detectAllProviders(),
      loadConfig(deps.projectRoot).catch(() => null),
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
}
