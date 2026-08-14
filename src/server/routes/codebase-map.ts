import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { loadCodebaseMap } from "../../project/codebase-map.js";
import { writeProjectScan } from "../../project/project-scan.js";

export type CodebaseMapRoutesDeps = { projectRoot: string };

// No fields accepted - regeneration always runs against the live project root,
// never caller-supplied paths or options. `.strict()` turns any stray key
// into a 400 instead of silently ignoring it.
const refreshBody = z.object({}).strict();

/**
 * Codebase map routes - read the cached `.vibestrate/codebase-map.json` and
 * (on explicit request) regenerate it.
 *
 * The POST calls `writeProjectScan` - the exact path `vibe learn` takes, so the
 * dashboard and the CLI cannot drift into producing different artifacts. It is
 * deterministic (no model calls) and its only side effects are the files it
 * already writes: the map pair, plus the TODO harvest.
 *
 * Refreshing the map WITHOUT the harvest would leave the dashboard unable to
 * populate its own TODO surface - the empty state's "Learn the codebase" button
 * would not fix the empty state.
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
    const { map } = await writeProjectScan(projectRoot, new Date().toISOString());
    return { present: true, stale: false, map };
  });
}
