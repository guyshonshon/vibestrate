import type { FastifyInstance } from "fastify";
import {
  addNote,
  listNotes,
  noteScopeSchema,
  resolveNote,
} from "../../notes/notes-service.js";
import { assertSafeRunId, HttpError } from "../security.js";
import { z } from "zod";

const addNoteBody = z.object({
  scope: noteScopeSchema,
  target: z.string().min(1),
  message: z.string().min(1),
});

export type NotesRoutesDeps = {
  projectRoot: string;
};

export async function registerNotesRoutes(
  app: FastifyInstance,
  deps: NotesRoutesDeps,
): Promise<void> {
  const { projectRoot } = deps;

  app.get<{
    Params: { runId: string };
    Querystring: { includeResolved?: string };
  }>("/api/runs/:runId/notes", async (req) => {
    assertSafeRunId(req.params.runId);
    const includeResolved = req.query.includeResolved === "true";
    const notes = await listNotes(projectRoot, req.params.runId, {
      includeResolved,
    });
    return { notes };
  });

  app.post<{
    Params: { runId: string };
    Body: unknown;
  }>("/api/runs/:runId/notes", async (req) => {
    assertSafeRunId(req.params.runId);
    const parsed = addNoteBody.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(
        400,
        parsed.error.issues
          .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
          .join("; "),
      );
    }
    const note = await addNote(projectRoot, req.params.runId, parsed.data);
    return { note };
  });

  app.post<{ Params: { runId: string; noteId: string } }>(
    "/api/runs/:runId/notes/:noteId/resolve",
    async (req) => {
      assertSafeRunId(req.params.runId);
      const note = await resolveNote(
        projectRoot,
        req.params.runId,
        req.params.noteId,
      );
      if (!note) throw new HttpError(404, "Note not found.");
      return { note };
    },
  );
}
