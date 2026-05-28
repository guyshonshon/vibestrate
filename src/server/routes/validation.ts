import type { FastifyInstance } from "fastify";
import { loadConfig } from "../../project/config-loader.js";
import { listValidationProfiles } from "../../core/validation-profile-service.js";
import {
  applyMigration,
  listMigrations,
  previewMigration,
  ValidationProfileMigrationError,
  type MigrationScope,
} from "../../core/validation-profile-migration-service.js";
import {
  applyRename,
  previewRename,
  ValidationProfileRenameError,
} from "../../core/validation-profile-rename-service.js";
import { readUsageReport } from "../../core/validation-profile-usage-service.js";
import { HttpError, assertSafeRunId } from "../security.js";

export type ValidationRoutesDeps = { projectRoot: string };

export async function registerValidationRoutes(
  app: FastifyInstance,
  deps: ValidationRoutesDeps,
): Promise<void> {
  const { projectRoot } = deps;

  /**
   * Read-only listing of the implicit default + every named validation
   * profile. Pure projection over the parsed project config; never executes
   * anything; never reads secrets.
   */
  app.get("/api/validation/profiles", async () => {
    const cfg = await loadConfig(projectRoot).catch(() => null);
    if (!cfg) return { profiles: [] };
    return { profiles: listValidationProfiles(cfg.config) };
  });

  /** Read-only validation-profile usage telemetry. */
  app.get("/api/validation/profile-usage", async () => {
    return readUsageReport(projectRoot);
  });

  /**
   * Preview a profile-reference migration. Writes nothing. The body shape
   * mirrors the CLI flags so a dashboard can call this before the apply
   * button is enabled.
   */
  app.post<{
    Body: {
      fromProfile?: string;
      toProfile?: string | null;
      scope?: { kind?: string; runId?: string; limit?: number };
    };
  }>("/api/validation/profile-migrations/preview", async (req) => {
    const body = req.body ?? {};
    const cfg = await requireConfig(projectRoot);
    try {
      const r = await previewMigration({
        projectRoot,
        config: cfg,
        fromProfile: body.fromProfile ?? "",
        toProfile: body.toProfile ?? null,
        scope: parseScope(body.scope),
      });
      return { preview: r };
    } catch (err) {
      if (err instanceof ValidationProfileMigrationError) {
        throw new HttpError(err.statusCode, err.message);
      }
      throw err;
    }
  });

  /**
   * Apply a profile-reference migration. Writes the affected
   * suggestions.json / suggestion-bundles.json files + an audit JSON.
   * Behind the same validation as preview.
   */
  app.post<{
    Body: {
      fromProfile?: string;
      toProfile?: string | null;
      scope?: { kind?: string; runId?: string; limit?: number };
    };
  }>("/api/validation/profile-migrations/apply", async (req) => {
    const body = req.body ?? {};
    const cfg = await requireConfig(projectRoot);
    try {
      const r = await applyMigration({
        projectRoot,
        config: cfg,
        fromProfile: body.fromProfile ?? "",
        toProfile: body.toProfile ?? null,
        scope: parseScope(body.scope),
      });
      return { audit: r };
    } catch (err) {
      if (err instanceof ValidationProfileMigrationError) {
        throw new HttpError(err.statusCode, err.message);
      }
      throw err;
    }
  });

  /** List previously-applied migrations (renames + reference-only). */
  app.get("/api/validation/profile-migrations", async () => {
    return { migrations: await listMigrations(projectRoot) };
  });

  /**
   * Preview a profile rename. Writes nothing. Returns what the project.yml
   * change would look like + the affected reference list. 4xx errors are
   * surfaced as `error` with the same status codes the CLI uses.
   */
  app.post<{
    Body: {
      fromProfile?: string;
      toProfile?: string;
      scope?: { kind?: string; runId?: string; limit?: number };
    };
  }>("/api/validation/profile-renames/preview", async (req) => {
    const body = req.body ?? {};
    const cfg = await requireConfig(projectRoot);
    try {
      const r = await previewRename({
        projectRoot,
        config: cfg,
        fromProfile: body.fromProfile ?? "",
        toProfile: body.toProfile ?? "",
        scope: parseScope(body.scope),
      });
      return { preview: r };
    } catch (err) {
      if (err instanceof ValidationProfileRenameError) {
        throw new HttpError(err.statusCode, err.message);
      }
      if (err instanceof ValidationProfileMigrationError) {
        throw new HttpError(err.statusCode, err.message);
      }
      throw err;
    }
  });

  /**
   * Apply a profile rename atomically. Mutates `.vibestrate/project.yml` and
   * every matching suggestion/bundle reference. Rolls back project.yml if
   * the reference migration step fails.
   */
  app.post<{
    Body: {
      fromProfile?: string;
      toProfile?: string;
      scope?: { kind?: string; runId?: string; limit?: number };
    };
  }>("/api/validation/profile-renames/apply", async (req) => {
    const body = req.body ?? {};
    const cfg = await requireConfig(projectRoot);
    try {
      const r = await applyRename({
        projectRoot,
        config: cfg,
        fromProfile: body.fromProfile ?? "",
        toProfile: body.toProfile ?? "",
        scope: parseScope(body.scope),
      });
      return { audit: r };
    } catch (err) {
      if (err instanceof ValidationProfileRenameError) {
        throw new HttpError(err.statusCode, err.message);
      }
      if (err instanceof ValidationProfileMigrationError) {
        throw new HttpError(err.statusCode, err.message);
      }
      throw err;
    }
  });
}

async function requireConfig(projectRoot: string) {
  const cfg = await loadConfig(projectRoot).catch(() => null);
  if (!cfg) {
    throw new HttpError(409, "Project is not initialised. Run `vibestrate init`.");
  }
  return cfg.config;
}

function parseScope(
  raw?: { kind?: string; runId?: string; limit?: number },
): MigrationScope {
  if (!raw || !raw.kind || raw.kind === "recent") {
    const limit = typeof raw?.limit === "number" ? raw.limit : undefined;
    return limit !== undefined ? { kind: "recent", limit } : { kind: "recent" };
  }
  if (raw.kind === "all") return { kind: "all" };
  if (raw.kind === "run") {
    const runId = (raw.runId ?? "").toString();
    assertSafeRunId(runId);
    return { kind: "run", runId };
  }
  throw new HttpError(400, `Unknown migration scope kind: ${raw.kind}`);
}
