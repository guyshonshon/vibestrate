// ── Supervisor Control routes ───────────────────────────────────────────────
//
// The durable conversation with the project's supervisor: list threads, read
// one, start one, and append the user's own message.
//
// Deliberately NO model call and NO action path here yet. Those arrive with the
// intake router, which is the part that can act, and mixing them into the same
// module would blur the line between "this endpoint stores what you typed" and
// "this endpoint can start a run". Keeping the storage surface separate means a
// reader can see at a glance which routes are inert.
//
// Appending a SUPERVISOR message is not exposed: the supervisor's turn is
// written by the server after it answers, never posted by the client, so a
// browser cannot forge words into the supervisor's mouth or fabricate an action
// record in the audit trail.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { SupervisorConversationStore } from "../../supervisor/conversation-store.js";
import { HttpError } from "../security.js";

export type SupervisorRoutesDeps = { projectRoot: string };

const appendBody = z
  .object({
    text: z.string().min(1).max(20_000),
  })
  .strict();

export async function registerSupervisorRoutes(
  app: FastifyInstance,
  deps: SupervisorRoutesDeps,
): Promise<void> {
  const store = new SupervisorConversationStore(deps.projectRoot);

  /** Thread list for the panel's sidebar, newest first. Messages are trimmed
   *  out: the list renders titles and timestamps, and shipping every message of
   *  every thread would grow without bound as conversations accumulate. */
  app.get("/api/supervisor/threads", async () => {
    const threads = await store.list();
    return {
      threads: threads.map((t) => ({
        id: t.id,
        title: t.title,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        messageCount: t.messages.length,
      })),
    };
  });

  app.get<{ Params: { threadId: string } }>(
    "/api/supervisor/threads/:threadId",
    async (req) => {
      const thread = await store.read(req.params.threadId);
      if (!thread) throw new HttpError(404, "No such conversation.");
      return { thread };
    },
  );

  app.post("/api/supervisor/threads", async () => {
    return { thread: await store.create() };
  });

  /** Append the user's message. Returns the whole thread so the client renders
   *  from server state rather than optimistically guessing what was stored. */
  app.post<{ Params: { threadId: string }; Body: unknown }>(
    "/api/supervisor/threads/:threadId/messages",
    async (req) => {
      const parsed = appendBody.safeParse(req.body);
      if (!parsed.success) {
        throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid message.");
      }
      const existing = await store.read(req.params.threadId);
      if (!existing) throw new HttpError(404, "No such conversation.");
      const thread = await store.append(req.params.threadId, {
        role: "user",
        text: parsed.data.text,
      });
      return { thread };
    },
  );
}
