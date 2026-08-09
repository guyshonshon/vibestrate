// Read-only HTTP access to a run's artifacts directory: a recursive listing,
// and a fetch of a single artifact (or a nested listing when the path names a
// directory).
//
// Both routes go through ArtifactStore's guarded read rather than resolving
// and opening here. A run writes into its own artifacts dir, so the caller is
// not the only untrusted party - the directory's own contents are too, and
// proving a path string stays inside the root says nothing about where the
// bytes behind it live. The store owns that proof; this file owns turning its
// typed refusals into statuses. An unmapped throw would surface as a 500 and
// record an issue, so a probe loop against a symlink would append to the
// issues stream once per request.

import type { FastifyInstance } from "fastify";
import { ArtifactReadError, ArtifactStore } from "../../core/stores/artifact-store.js";
import { assertSafeRelativePath, assertSafeRunId, HttpError } from "../security.js";

export type ArtifactRoutesDeps = {
  projectRoot: string;
};

/**
 * A missing artifact is a 404; every other refusal is the caller's fault and
 * is a 400. The message is the store's, which names the mechanism without
 * naming a path - an absolute path in an error body is its own small leak.
 */
function toHttpError(error: unknown): unknown {
  if (!(error instanceof ArtifactReadError)) return error;
  return new HttpError(error.code === "not-found" ? 404 : 400, error.message);
}

export async function registerArtifactRoutes(
  app: FastifyInstance,
  deps: ArtifactRoutesDeps,
): Promise<void> {
  const { projectRoot } = deps;

  app.get<{ Params: { runId: string } }>("/api/runs/:runId/artifacts", async (req) => {
    assertSafeRunId(req.params.runId);
    const store = new ArtifactStore(projectRoot, req.params.runId);
    try {
      return { artifacts: await store.listGuarded() };
    } catch (error) {
      throw toHttpError(error);
    }
  });

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
      const store = new ArtifactStore(projectRoot, req.params.runId);
      let result;
      try {
        result = await store.readGuarded(rel);
      } catch (error) {
        throw toHttpError(error);
      }
      if (result.kind === "directory") {
        return { directory: rel, artifacts: result.entries };
      }
      reply.header(
        "Content-Type",
        rel.endsWith(".json") ? "application/json; charset=utf-8" : "text/markdown; charset=utf-8",
      );
      return reply.send(result.text);
    },
  );
}
