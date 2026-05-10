import type { FastifyInstance } from "fastify";
import {
  annotateExistence,
  parseCodeReferences,
} from "../../core/code-reference-service.js";
import { runStatePath } from "../../utils/paths.js";
import { pathExists } from "../../utils/fs.js";
import { readJson } from "../../utils/json.js";
import { runStateSchema } from "../../core/state-machine.js";
import { HttpError, assertSafeRunId } from "../security.js";

export type CodeRefRoutesDeps = { projectRoot: string };

export async function registerCodeReferenceRoutes(
  app: FastifyInstance,
  deps: CodeRefRoutesDeps,
): Promise<void> {
  const { projectRoot } = deps;

  app.post<{ Body: { text?: string; runId?: string } }>(
    "/api/code-references",
    async (req) => {
      const text = (req.body?.text ?? "").toString();
      if (text.length > 200_000) {
        throw new HttpError(413, "Text too large for reference parsing.");
      }
      const runId = req.body?.runId ?? null;
      let worktreePath: string | null = null;
      if (runId) {
        assertSafeRunId(runId);
        const file = runStatePath(projectRoot, runId);
        if (await pathExists(file)) {
          const raw = await readJson<unknown>(file);
          const parsed = runStateSchema.safeParse(raw);
          if (parsed.success) worktreePath = parsed.data.worktreePath ?? null;
        }
      }
      const refs = parseCodeReferences({ text, runId });
      const annotated = await annotateExistence(refs, {
        projectRoot,
        worktreePath,
      });
      return { references: annotated };
    },
  );
}
