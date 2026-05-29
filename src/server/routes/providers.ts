import type { FastifyInstance } from "fastify";
import {
  detectAllProviders,
  type DetectedProvider,
} from "../../providers/provider-detection.js";
import { loadConfig } from "../../project/config-loader.js";
import {
  addProvider,
  listConfiguredProviders,
  removeProvider,
  runSafeProviderTest,
  setDefaultProvider,
} from "../../setup/provider-setup-service.js";
import {
  buildProviderFromDetection,
  PROVIDER_PRESETS,
} from "../../providers/provider-presets.js";
import { cliProviderSchema } from "../../providers/provider-schema.js";
import { HttpError } from "../security.js";
import { z } from "zod";

export type ProvidersRoutesDeps = { projectRoot: string };

export type ProviderRow = {
  id: string;
  label: string;
  command: string;
  available: boolean;
  version: string | null;
  confidence: DetectedProvider["confidence"];
  recommended: boolean;
  /** A popular, out-of-the-box provider (vs an optional opt-in one). */
  popular: boolean;
  /** One-line install command/hint for the CLI, or null if none is known. */
  installHint: string | null;
  notes: string[];
  /** True when the project's loaded config has a matching `providers.<id>`. */
  configured: boolean;
  /** Command to run OUTSIDE Vibestrate to authenticate (null = API-key/local). */
  loginCommand: string | null;
  /** One-line human note about auth, shown when login is needed. */
  loginNote: string;
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
      popular: d.popular,
      installHint: d.installHint,
      notes: d.notes,
      configured: configuredIds.has(d.id),
      loginCommand: PROVIDER_PRESETS[d.id].loginCommand,
      loginNote: PROVIDER_PRESETS[d.id].loginNote,
    }));
    cached = { at: now, rows };
    return { providers: rows, cachedFor: CACHE_TTL_MS };
  });

  /**
   * Get the currently-saved YAML representation of a single provider.
   * Returns a minimal stub (preset defaults if we have one, otherwise
   * just `{ type: "cli", command: id }`) when the provider isn't in
   * project.yml yet so the dashboard can show a "this is what will be
   * written" preview.
   */
  app.get<{ Params: { providerId: string } }>(
    "/api/providers/:providerId/config",
    async (req) => {
      const id = req.params.providerId;
      assertSafeProviderId(id);
      const configured = await listConfiguredProviders(projectRoot);
      const existing = configured.find((c) => c.id === id);
      if (existing) {
        return {
          providerId: id,
          configured: true,
          config: {
            type: "cli" as const,
            command: existing.command,
            args: existing.args,
            input: existing.input,
          },
          rolesUsing: existing.rolesUsing,
        };
      }
      // Pre-fill from the provider's preset (every known provider ships one).
      const detected = await detectAllProviders();
      const d = detected.find((row) => row.id === id);
      const preset = d ? buildProviderFromDetection(d.id, d.command) : null;
      return {
        providerId: id,
        configured: false,
        config: preset ?? {
          type: "cli" as const,
          command: d?.command ?? id,
          args: [] as string[],
          input: "stdin" as const,
        },
        rolesUsing: [],
      };
    },
  );

  /**
   * Setup or update a provider. Accepts either:
   *   - empty body — uses the bundled preset (claude / codex / ollama
   *     only)
   *   - { config: { command, args, input } } — writes the explicit
   *     config the user composed in the Configure overlay
   * Either way, the optional `setAsDefault` flag assigns every agent
   * in project.yml to this provider.
   */
  const setupBody = z
    .object({
      setAsDefault: z.boolean().optional(),
      config: cliProviderSchema.partial({ args: true, input: true }).optional(),
    })
    .strict()
    .optional();

  app.post<{
    Params: { providerId: string };
    Body: unknown;
  }>("/api/providers/:providerId/setup", async (req) => {
    const id = req.params.providerId;
    assertSafeProviderId(id);
    const parsed = setupBody.safeParse(req.body ?? {});
    if (!parsed.success) throw new HttpError(400, parsed.error.message);
    const body = parsed.data ?? {};

    let cfg;
    if (body.config) {
      cfg = {
        type: "cli" as const,
        command: body.config.command,
        args: body.config.args ?? [],
        input: body.config.input ?? "stdin",
      };
    } else {
      const detected = await detectAllProviders();
      const d = detected.find((row) => row.id === id);
      if (!d) {
        throw new HttpError(
          404,
          `Provider "${id}" is not a known detectable CLI. Pass a config in the body or hand-edit .vibestrate/project.yml.`,
        );
      }
      // Every known provider ships a preset now.
      cfg = buildProviderFromDetection(d.id, d.command);
    }
    await addProvider(projectRoot, {
      id,
      config: cfg,
      alsoAssignAllRoles: body.setAsDefault === true,
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

  /**
   * Remove a provider from project.yml. Refuses with 409 if a role still
   * uses it (the user reassigns those roles first) — mirrors the CLI
   * `vibe provider remove`. Narrow + audited: deletes only `providers.<id>`.
   */
  app.delete<{ Params: { providerId: string } }>(
    "/api/providers/:providerId",
    async (req) => {
      const id = req.params.providerId;
      assertSafeProviderId(id);
      const result = await removeProvider(projectRoot, id);
      if (!result.ok) {
        throw new HttpError(409, `${result.reason} ${result.hint}`);
      }
      bustCache();
      return result;
    },
  );
}
