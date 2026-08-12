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
import { proposeIntent } from "../../supervisor/intake-router.js";
import { executeProposal } from "../../supervisor/action-executor.js";
import { readPauseState, setPaused } from "../../supervisor/autonomy-gate.js";
import { RoadmapService } from "../../roadmap/roadmap-service.js";
import { loadConfig } from "../../project/config-loader.js";
import { runConsult } from "../../consult/consult.js";
import { startDetachedRun } from "../../core/detached-run.js";
import { HttpError } from "../security.js";

export type SupervisorRoutesDeps = { projectRoot: string };

const appendBody = z
  .object({
    text: z.string().min(1).max(20_000),
  })
  .strict();

const pauseBody = z
  .object({
    paused: z.boolean(),
    reason: z.string().max(500).optional(),
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

  /** The kill switch. No model anywhere near this path. */
  app.get("/api/supervisor/pause", async () => {
    return { pause: await readPauseState(deps.projectRoot) };
  });

  app.post<{ Body: unknown }>("/api/supervisor/pause", async (req) => {
    const parsed = pauseBody.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, "Invalid pause request.");
    return {
      pause: await setPaused(deps.projectRoot, parsed.data.paused, parsed.data.reason ?? ""),
    };
  });

  /**
   * A turn: the user says something, the supervisor answers and possibly acts.
   *
   * Two model calls, deliberately kept apart. The ROUTER decides what the
   * message meant and sees nothing but that message plus a code-built list of
   * task ids. The ANSWERER (consult) has the full project context and can only
   * produce prose. Rich context and the authority to act never meet.
   */
  app.post<{ Params: { threadId: string }; Body: unknown }>(
    "/api/supervisor/threads/:threadId/turn",
    async (req) => {
      const parsed = appendBody.safeParse(req.body);
      if (!parsed.success) {
        throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid message.");
      }
      const threadId = req.params.threadId;
      if (!(await store.read(threadId))) throw new HttpError(404, "No such conversation.");

      const message = parsed.data.text;
      await store.append(threadId, { role: "user", text: message });

      const { config } = await loadConfig(deps.projectRoot);
      const roadmap = new RoadmapService(deps.projectRoot);
      // The allowlist, built by a task query rather than by any model. The
      // router may only choose from these, and the executor re-checks.
      const tasks = await roadmap.listTasks();
      const targets = tasks
        .filter((t) => t.status !== "done" && t.status !== "cancelled")
        .slice(0, 40)
        .map((t) => ({ id: t.id, title: t.title }));

      const proposal = await proposeIntent({
        projectRoot: deps.projectRoot,
        message,
        targets,
      });

      const outcome = await executeProposal({
        projectRoot: deps.projectRoot,
        config,
        userMessage: message,
        proposal,
        allowedTargetIds: targets.map((t) => t.id),
        startRun: async ({ taskId, task }) => {
          await startDetachedRun({
            spec: { projectRoot: deps.projectRoot, task, taskId },
            spawnedBy: "supervisor",
          });
          return taskId;
        },
      });

      // Prose comes from the read-only answerer, which is allowed full context
      // precisely because it cannot route anything.
      let prose = outcome.reply;
      if (!outcome.action || outcome.action.ok === false) {
        const consulted = await runConsult({
          projectRoot: deps.projectRoot,
          question: message,
        }).catch(() => null);
        const answer = consulted?.answer.answer ?? "";
        prose = [outcome.reply, answer].filter(Boolean).join("\n\n");
      }

      const thread = await store.append(threadId, {
        role: "supervisor",
        text: prose || "I had nothing to add.",
        action: outcome.action,
      });
      return { thread };
    },
  );
}
