import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { loadCodebaseMap, writeCodebaseMap } from "../../project/codebase-map.js";

export type CodebaseMapRoutesDeps = { projectRoot: string };

// No fields accepted - regeneration always runs against the live project root,
// never caller-supplied paths or options. `.strict()` turns any stray key
// into a 400 instead of silently ignoring it.
const refreshBody = z.object({}).strict();

/**
 * Codebase map routes - read the cached `.vibestrate/codebase-map.json` and
 * (on explicit request) regenerate it.
 *
 * The POST calls ONLY `writeCodebaseMap` - the same deterministic extractor
 * `vibe learn` uses. No shell, no side effects beyond the two files it
 * already writes.
 */
export async function registerCodebaseMapRoutes(
  app: FastifyInstance,
  deps: CodebaseMapRoutesDeps,
): Promise<void> {
  const { projectRoot } = deps;

  app.get("/api/codebase-map", async () => {
    return loadCodebaseMap(projectRoot);
  });

  app.post("/api/codebase-map/refresh", async (req, reply) => {
    const parsed = refreshBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.issues.map((i) => i.message).join("; ") };
    }
    const { map } = await writeCodebaseMap(projectRoot, new Date().toISOString());
    return { present: true, stale: false, map };
  });
}
