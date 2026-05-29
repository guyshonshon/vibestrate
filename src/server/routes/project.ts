import fs from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import {
  buildProjectRoots,
  PathGuardError,
  resolveSafePath,
} from "../../core/path-guard.js";
import { getProjectMetadata } from "../../core/project-context-service.js";
import { buildFileTree } from "../../core/file-tree-service.js";
import { FileViewError, viewFile } from "../../core/file-view-service.js";
import { runStatePath } from "../../utils/paths.js";
import { pathExists } from "../../utils/fs.js";
import { readJson } from "../../utils/json.js";
import { runStateSchema } from "../../core/state-machine.js";
import { configExists, loadConfig } from "../../project/config-loader.js";
import {
  setCrewRoleFields,
  setProfileFields,
} from "../../setup/config-update-service.js";
import { assertSafeRunId, HttpError } from "../security.js";

const ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export type ProjectRoutesDeps = { projectRoot: string };

export async function registerProjectRoutes(
  app: FastifyInstance,
  deps: ProjectRoutesDeps,
): Promise<void> {
  const { projectRoot } = deps;

  app.get("/api/project/metadata", async () => {
    return { metadata: await getProjectMetadata(projectRoot) };
  });

  // ─── Profiles: reusable runtime setups (provider + model/power/budget) ───
  app.get("/api/profiles", async () => {
    if (!(await configExists(projectRoot))) return { profiles: [] };
    const { config } = await loadConfig(projectRoot);
    const profiles = Object.entries(config.profiles).map(([id, p]) => ({
      id,
      provider: p.provider,
      providerConfigured: Boolean(config.providers[p.provider]),
      label: p.label ?? id,
      model: p.model,
      power: p.power,
      budget: p.budget,
      maxTokens: p.maxTokens,
      timeoutMs: p.timeoutMs,
    }));
    return { profiles };
  });

  // Edit a Profile (provider/model/power/budget/maxTokens/timeoutMs).
  app.patch<{ Params: { profileId: string }; Body: unknown }>(
    "/api/profiles/:profileId",
    async (req) => {
      const profileId = req.params.profileId;
      if (!ID_RE.test(profileId)) throw new HttpError(400, "Invalid profile id.");
      const body = (req.body ?? {}) as Record<string, unknown>;
      const allowed = ["provider", "label", "model", "power", "budget", "maxTokens", "timeoutMs"];
      const patch: Record<string, unknown> = {};
      for (const key of allowed) {
        if (key in body) patch[key] = body[key];
      }
      if (Object.keys(patch).length === 0) {
        throw new HttpError(400, `Body must include at least one of: ${allowed.join(", ")}.`);
      }
      try {
        await setProfileFields(projectRoot, profileId, patch);
      } catch (err) {
        throw new HttpError(400, err instanceof Error ? err.message : String(err));
      }
      return { ok: true, profileId };
    },
  );

  // ─── Crews: local Role rosters and the Seats each Role fills ─────────────
  app.get("/api/crews", async () => {
    if (!(await configExists(projectRoot))) return { crews: [], defaultCrew: null };
    const { config } = await loadConfig(projectRoot);
    const crews = Object.entries(config.crews).map(([id, crew]) =>
      serializeCrew(config, id, crew),
    );
    return { crews, defaultCrew: config.defaultCrew };
  });

  app.get<{ Params: { crewId: string } }>("/api/crews/:crewId", async (req) => {
    const crewId = req.params.crewId;
    if (!ID_RE.test(crewId)) throw new HttpError(400, "Invalid crew id.");
    if (!(await configExists(projectRoot))) {
      throw new HttpError(404, "Vibestrate is not initialized here.");
    }
    const { config } = await loadConfig(projectRoot);
    const crew = config.crews[crewId];
    if (!crew) throw new HttpError(404, `No crew "${crewId}".`);
    return { crew: serializeCrew(config, crewId, crew) };
  });

  // Edit a Crew Role: profile, seats filled, permissions, label, skills.
  app.patch<{ Params: { crewId: string; roleId: string }; Body: unknown }>(
    "/api/crews/:crewId/roles/:roleId",
    async (req) => {
      const { crewId, roleId } = req.params;
      if (!ID_RE.test(crewId) || !ID_RE.test(roleId)) {
        throw new HttpError(400, "Invalid crew or role id.");
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const allowed = ["profile", "seats", "permissions", "label", "skills"];
      const patch: Record<string, unknown> = {};
      for (const key of allowed) {
        if (key in body) patch[key] = body[key];
      }
      if (Object.keys(patch).length === 0) {
        throw new HttpError(400, `Body must include at least one of: ${allowed.join(", ")}.`);
      }
      try {
        await setCrewRoleFields(projectRoot, crewId, roleId, patch);
      } catch (err) {
        throw new HttpError(400, err instanceof Error ? err.message : String(err));
      }
      return { ok: true, crewId, roleId };
    },
  );

  // Read a Role's context (its prompt — the "brain") for inline editing.
  app.get<{ Params: { crewId: string; roleId: string } }>(
    "/api/crews/:crewId/roles/:roleId/context",
    async (req) => {
      const { crewId, roleId } = req.params;
      if (!ID_RE.test(crewId) || !ID_RE.test(roleId)) {
        throw new HttpError(400, "Invalid crew or role id.");
      }
      if (!(await configExists(projectRoot))) {
        throw new HttpError(404, "Vibestrate is not initialized here.");
      }
      const { config } = await loadConfig(projectRoot);
      const role = config.crews[crewId]?.roles[roleId];
      if (!role) throw new HttpError(404, `No role "${roleId}" in crew "${crewId}".`);
      const roots = buildProjectRoots({ projectRoot });
      let resolved;
      try {
        resolved = await resolveSafePath(role.prompt, roots);
      } catch (err) {
        if (err instanceof PathGuardError) {
          throw new HttpError(err.statusCode, err.message);
        }
        throw err;
      }
      let content = "";
      try {
        content = await fs.readFile(resolved.absolutePath, "utf8");
      } catch {
        // No prompt file yet — treat as an empty context to author.
      }
      return {
        crewId,
        roleId,
        profile: role.profile,
        seats: role.seats,
        permissions: role.permissions,
        skills: role.skills,
        promptPath: role.prompt,
        content,
      };
    },
  );

  // Write a Role's context (prompt). Path-guarded; creates the file if missing.
  app.put<{ Params: { crewId: string; roleId: string }; Body: unknown }>(
    "/api/crews/:crewId/roles/:roleId/context",
    async (req) => {
      const { crewId, roleId } = req.params;
      if (!ID_RE.test(crewId) || !ID_RE.test(roleId)) {
        throw new HttpError(400, "Invalid crew or role id.");
      }
      const body = (req.body ?? {}) as { content?: unknown };
      if (typeof body.content !== "string") {
        throw new HttpError(400, "Body must include a string `content`.");
      }
      if (body.content.length > 100_000) {
        throw new HttpError(400, "Prompt is too large (100k character max).");
      }
      if (!(await configExists(projectRoot))) {
        throw new HttpError(404, "Vibestrate is not initialized here.");
      }
      const { config } = await loadConfig(projectRoot);
      const role = config.crews[crewId]?.roles[roleId];
      if (!role) throw new HttpError(404, `No role "${roleId}" in crew "${crewId}".`);
      const roots = buildProjectRoots({ projectRoot });
      let resolved;
      try {
        resolved = await resolveSafePath(role.prompt, roots);
      } catch (err) {
        if (err instanceof PathGuardError) {
          throw new HttpError(err.statusCode, err.message);
        }
        throw err;
      }
      await fs.mkdir(path.dirname(resolved.absolutePath), { recursive: true });
      await fs.writeFile(resolved.absolutePath, body.content, "utf8");
      return { ok: true, crewId, roleId, promptPath: role.prompt };
    },
  );

  app.get<{
    Querystring: {
      depth?: string;
      maxEntries?: string;
      includeHidden?: string;
      includeVibestrate?: string;
    };
  }>("/api/project/tree", async (req) => {
    const tree = await buildFileTree({
      rootPath: projectRoot,
      rootKind: "project",
      rootLabel: "project",
      depth: parseIntOrDefault(req.query.depth, 4),
      maxEntries: parseIntOrDefault(req.query.maxEntries, 2000),
      includeHidden: req.query.includeHidden === "true",
      includeVibestrate: req.query.includeVibestrate === "true",
    });
    return { tree };
  });

  app.get<{
    Querystring: { path?: string; lineStart?: string; lineEnd?: string };
  }>("/api/project/file", async (req) => {
    const requested = (req.query.path ?? "").trim();
    if (!requested) throw new HttpError(400, "?path is required.");
    const roots = buildProjectRoots({ projectRoot });
    let resolved;
    try {
      resolved = await resolveSafePath(requested, roots);
    } catch (err) {
      if (err instanceof PathGuardError) {
        throw new HttpError(err.statusCode, err.message);
      }
      throw err;
    }
    try {
      const view = await viewFile({
        resolved,
        lineStart: parseIntOrNull(req.query.lineStart),
        lineEnd: parseIntOrNull(req.query.lineEnd),
      });
      return { file: view };
    } catch (err) {
      if (err instanceof FileViewError) {
        throw new HttpError(err.statusCode, err.message);
      }
      throw err;
    }
  });

  app.get<{
    Params: { runId: string };
    Querystring: {
      depth?: string;
      maxEntries?: string;
      includeHidden?: string;
    };
  }>("/api/runs/:runId/tree", async (req) => {
    assertSafeRunId(req.params.runId);
    const state = await loadRunState(projectRoot, req.params.runId);
    if (!state.worktreePath) {
      throw new HttpError(409, "This run has no worktree yet.");
    }
    const tree = await buildFileTree({
      rootPath: state.worktreePath,
      rootKind: "worktree",
      rootLabel: `worktree:${req.params.runId}`,
      depth: parseIntOrDefault(req.query.depth, 4),
      maxEntries: parseIntOrDefault(req.query.maxEntries, 2000),
      includeHidden: req.query.includeHidden === "true",
      includeVibestrate: false,
    });
    return { tree };
  });

  app.get<{
    Params: { runId: string };
    Querystring: { path?: string; lineStart?: string; lineEnd?: string };
  }>("/api/runs/:runId/file", async (req) => {
    assertSafeRunId(req.params.runId);
    const state = await loadRunState(projectRoot, req.params.runId);
    if (!state.worktreePath) {
      throw new HttpError(409, "This run has no worktree yet.");
    }
    const requested = (req.query.path ?? "").trim();
    if (!requested) throw new HttpError(400, "?path is required.");
    const roots = buildProjectRoots({
      projectRoot,
      worktreePath: state.worktreePath,
      worktreeLabel: `worktree:${req.params.runId}`,
    });
    let resolved;
    try {
      resolved = await resolveSafePath(requested, roots);
    } catch (err) {
      if (err instanceof PathGuardError) {
        throw new HttpError(err.statusCode, err.message);
      }
      throw err;
    }
    try {
      const view = await viewFile({
        resolved,
        lineStart: parseIntOrNull(req.query.lineStart),
        lineEnd: parseIntOrNull(req.query.lineEnd),
      });
      return { file: view };
    } catch (err) {
      if (err instanceof FileViewError) {
        throw new HttpError(err.statusCode, err.message);
      }
      throw err;
    }
  });
}

function serializeCrew(
  config: Awaited<ReturnType<typeof loadConfig>>["config"],
  crewId: string,
  crew: Awaited<ReturnType<typeof loadConfig>>["config"]["crews"][string],
) {
  return {
    id: crewId,
    label: crew.label ?? crewId,
    roles: Object.entries(crew.roles).map(([roleId, role]) => {
      const profile = config.profiles[role.profile];
      return {
        id: roleId,
        label: role.label ?? roleId,
        seats: role.seats,
        profile: role.profile,
        profileConfigured: Boolean(profile),
        provider: profile?.provider ?? null,
        providerConfigured: Boolean(profile && config.providers[profile.provider]),
        permissions: role.permissions,
        skills: role.skills,
      };
    }),
  };
}

async function loadRunState(projectRoot: string, runId: string) {
  const file = runStatePath(projectRoot, runId);
  if (!(await pathExists(file))) {
    throw new HttpError(404, `Run ${runId} not found.`);
  }
  const raw = await readJson<unknown>(file);
  return runStateSchema.parse(raw);
}

function parseIntOrDefault(v: string | undefined, fallback: number): number {
  if (v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parseIntOrNull(v: string | undefined): number | null {
  if (v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
