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
import { setRoleProvider } from "../../setup/config-update-service.js";
import { assertSafeRunId, HttpError } from "../security.js";

export type ProjectRoutesDeps = { projectRoot: string };

export async function registerProjectRoutes(
  app: FastifyInstance,
  deps: ProjectRoutesDeps,
): Promise<void> {
  const { projectRoot } = deps;

  app.get("/api/project/metadata", async () => {
    return { metadata: await getProjectMetadata(projectRoot) };
  });

  // The workflow *roles* (planner, architect, …) and their bindings: which
  // provider each runs on, its permission profile, and skills. Config
  // references only — never the prompt contents (no secret leakage).
  app.get("/api/roles", async () => {
    if (!(await configExists(projectRoot))) return { roles: [] };
    const { config } = await loadConfig(projectRoot);
    const roles = Object.entries(config.roles).map(([id, a]) => ({
      id,
      provider: a.provider,
      providerConfigured: Boolean(config.providers[a.provider]),
      permissions: a.permissions,
      skills: a.skills,
    }));
    return { roles };
  });

  // Configure a role: point it at a (configured) provider. Narrow + audited —
  // the only role field the dashboard may write.
  app.patch<{ Params: { roleId: string }; Body: unknown }>(
    "/api/roles/:roleId",
    async (req) => {
      const roleId = req.params.roleId;
      if (!/^[a-z][a-z0-9-]*$/.test(roleId)) {
        throw new HttpError(400, "Invalid role id.");
      }
      const body = (req.body ?? {}) as { provider?: unknown };
      if (typeof body.provider !== "string" || !body.provider.trim()) {
        throw new HttpError(400, "Body must include a non-empty `provider`.");
      }
      try {
        await setRoleProvider(projectRoot, roleId, body.provider.trim());
      } catch (err) {
        throw new HttpError(
          400,
          err instanceof Error ? err.message : String(err),
        );
      }
      return { ok: true, roleId, provider: body.provider.trim() };
    },
  );

  // Read a single role's context (its prompt — the "brain") for inline editing.
  // Unlike the bulk /api/roles list (references only), this returns the prompt
  // contents: a deliberate per-role read of the user's own instruction file,
  // path-guarded to the project. Missing file → empty (a not-yet-written brain).
  app.get<{ Params: { roleId: string } }>(
    "/api/roles/:roleId/context",
    async (req) => {
      const roleId = req.params.roleId;
      if (!/^[a-z][a-z0-9-]*$/.test(roleId)) {
        throw new HttpError(400, "Invalid role id.");
      }
      if (!(await configExists(projectRoot))) {
        throw new HttpError(404, "Vibestrate is not initialized here.");
      }
      const { config } = await loadConfig(projectRoot);
      const role = config.roles[roleId];
      if (!role) throw new HttpError(404, `No role "${roleId}".`);
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
        roleId,
        provider: role.provider,
        permissions: role.permissions,
        skills: role.skills,
        promptPath: role.prompt,
        content,
      };
    },
  );

  // Write a role's context (prompt). Path-guarded; creates the file if missing.
  app.put<{ Params: { roleId: string }; Body: unknown }>(
    "/api/roles/:roleId/context",
    async (req) => {
      const roleId = req.params.roleId;
      if (!/^[a-z][a-z0-9-]*$/.test(roleId)) {
        throw new HttpError(400, "Invalid role id.");
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
      const role = config.roles[roleId];
      if (!role) throw new HttpError(404, `No role "${roleId}".`);
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
      return { ok: true, roleId, promptPath: role.prompt };
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
