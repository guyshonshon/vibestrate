// Read-only HTTP access to a run's artifacts directory: a recursive listing,
// and a fetch of a single artifact (or a nested listing when the path names a
// directory).
//
// Every path segment here arrives from the URL, so the run id and the wildcard
// remainder are validated, the target is resolved and re-checked with
// isPathInside before anything is opened, and a path resolving outside the
// artifacts root is a 400 rather than a read. The listing walk skips entries
// whose readdir/stat fails instead of failing the whole listing, so one
// unreadable subtree still leaves the rest browsable. Bodies are sent as text,
// typed json or markdown from the file extension.

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
      // Flow snapshots stamp artifact paths relative to the RUN dir
      // ("artifacts/flows/<step>/output.md") while this route resolves
      // relative to the artifacts dir itself - accept both shapes so every
      // stamped path is fetchable (the double-prefix variant 404'd).
      const rel = req.params["*"].replace(/^artifacts\//, "");
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
