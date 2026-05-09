import path from "node:path";
import fs from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import { runArtifactsDir } from "../../utils/paths.js";
import { isPathInside } from "../../utils/paths.js";
import { pathExists, readText } from "../../utils/fs.js";
import { assertSafeRelativePath, assertSafeRunId, HttpError } from "../security.js";

export type ArtifactRoutesDeps = {
  projectRoot: string;
};

async function listDir(root: string): Promise<{ path: string; size: number }[]> {
  const out: { path: string; size: number }[] = [];
  async function walk(current: string, rel: string): Promise<void> {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = path.join(current, entry.name);
      const next = rel ? path.posix.join(rel, entry.name) : entry.name;
      if (entry.isDirectory()) {
        await walk(abs, next);
        continue;
      }
      try {
        const stat = await fs.stat(abs);
        out.push({ path: next, size: stat.size });
      } catch {
        // skip
      }
    }
  }
  await walk(root, "");
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

export async function registerArtifactRoutes(
  app: FastifyInstance,
  deps: ArtifactRoutesDeps,
): Promise<void> {
  const { projectRoot } = deps;

  app.get<{ Params: { runId: string } }>(
    "/api/runs/:runId/artifacts",
    async (req) => {
      assertSafeRunId(req.params.runId);
      const dir = runArtifactsDir(projectRoot, req.params.runId);
      if (!(await pathExists(dir))) {
        throw new HttpError(404, "Run artifacts directory not found.");
      }
      const entries = await listDir(dir);
      return { artifacts: entries };
    },
  );

  app.get<{ Params: { runId: string; "*": string } }>(
    "/api/runs/:runId/artifacts/*",
    async (req, reply) => {
      assertSafeRunId(req.params.runId);
      const rel = req.params["*"];
      assertSafeRelativePath(rel);
      const root = runArtifactsDir(projectRoot, req.params.runId);
      const target = path.resolve(root, rel);
      if (!isPathInside(root, target)) {
        throw new HttpError(400, "Path escapes artifacts directory.");
      }
      if (!(await pathExists(target))) {
        throw new HttpError(404, "Artifact not found.");
      }
      const stat = await fs.stat(target);
      if (stat.isDirectory()) {
        const entries = await listDir(target);
        return { directory: rel, artifacts: entries };
      }
      const text = await readText(target);
      reply.header(
        "Content-Type",
        rel.endsWith(".json") ? "application/json; charset=utf-8" : "text/markdown; charset=utf-8",
      );
      return reply.send(text);
    },
  );
}
