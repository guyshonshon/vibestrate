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

  app.get<{
    Querystring: {
      depth?: string;
      maxEntries?: string;
      includeHidden?: string;
      includeAmaco?: string;
    };
  }>("/api/project/tree", async (req) => {
    const tree = await buildFileTree({
      rootPath: projectRoot,
      rootKind: "project",
      rootLabel: "project",
      depth: parseIntOrDefault(req.query.depth, 4),
      maxEntries: parseIntOrDefault(req.query.maxEntries, 2000),
      includeHidden: req.query.includeHidden === "true",
      includeAmaco: req.query.includeAmaco === "true",
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
      includeAmaco: false,
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
