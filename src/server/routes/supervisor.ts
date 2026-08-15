// ── Supervisor Control routes ───────────────────────────────────────────────
//
// The durable conversation with the project's supervisor: list threads, read
// one, start one, append the user's own message, and take a turn.
//
// Every route here except the turn is inert storage - no model, no effects - and
// that separation is worth keeping visible. The turn itself holds no logic: it
// validates, opens the stream, and hands off to supervisor/turn-service.ts,
// which is the only place that decides or acts.
//
// Appending a SUPERVISOR message is not exposed: the supervisor's turn is
// written by the server after it answers, never posted by the client, so a
// browser cannot forge words into the supervisor's mouth or fabricate an action
// record in the audit trail.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { SupervisorConversationStore } from "../../supervisor/conversation-store.js";
import { setPaused, readPauseState } from "../../supervisor/autonomy-gate.js";
import { runSupervisorTurn } from "../../supervisor/turn-service.js";
import { loadConfig } from "../../project/config-loader.js";
import { resolveAssistTarget } from "../../core/assist/assist-runner.js";
import { capabilitiesForProvider } from "../../providers/provider-catalog.js";
import { resolveCatalog } from "../../providers/provider-catalog-overlay.js";
import { createSseClient } from "../sse.js";
import { HttpError } from "../security.js";

export type SupervisorRoutesDeps = { projectRoot: string };

const appendBody = z
  .object({
    text: z.string().min(1).max(20_000),
  })
  .strict();

const turnBody = z
  .object({
    text: z.string().min(1).max(20_000),
    /** Effort for this turn only. Shape-checked here, then checked against the
     *  provider's real levels below - the value ends up as a CLI flag, so an
     *  unverified one is refused rather than passed along. */
    effort: z
      .string()
      .regex(/^[a-z][a-z0-9_-]{0,31}$/)
      .nullish(),
    /** Which profile answers THIS turn. Never written to config: the picker
     *  chooses who replies now, it does not change the project's supervisor. */
    profileId: z.string().min(1).max(200).nullish(),
  })
  .strict();

const createBody = z
  .object({ runId: z.string().min(1).max(200).optional() })
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
  app.get<{ Querystring: { runId?: string } }>(
    "/api/supervisor/threads",
    async (req) => {
      const all = await store.list();
      // Always scoped, in both directions. A run's panel must not show another
      // run's conversation - and WITHOUT a runId this means the project thread,
      // not "everything". Returning all threads here would let the Mission
      // Control panel adopt whichever run was talked to most recently as its
      // own conversation, which is the same lost-referent bug that scoping to a
      // run was meant to fix.
      const threads = req.query.runId
        ? all.filter((t) => t.runId === req.query.runId)
        : all.filter((t) => t.runId === null);
      return {
        threads: threads.map((t) => ({
          id: t.id,
          title: t.title,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
          runId: t.runId,
          messageCount: t.messages.length,
        })),
      };
    },
  );

  app.get<{ Params: { threadId: string } }>(
    "/api/supervisor/threads/:threadId",
    async (req) => {
      const thread = await store.read(req.params.threadId);
      if (!thread) throw new HttpError(404, "No such conversation.");
      return { thread };
    },
  );

  /** Open the conversation for a run, creating it on first use. Without a
   *  runId this makes a project-level thread. */
  app.post<{ Body: unknown }>("/api/supervisor/threads", async (req) => {
    const parsed = createBody.safeParse(req.body ?? {});
    if (!parsed.success) throw new HttpError(400, "Invalid request.");
    const runId = parsed.data.runId ?? null;
    return {
      thread: runId ? await store.forRun(runId) : await store.create(null),
    };
  });

  /** Append the user's message. Returns the whole thread so the client renders
   *  from server state rather than optimistically guessing what was stored. */
  app.post<{ Params: { threadId: string }; Body: unknown }>(
    "/api/supervisor/threads/:threadId/messages",
    async (req) => {
      const parsed = appendBody.safeParse(req.body);
      if (!parsed.success) {
        throw new HttpError(
          400,
          parsed.error.issues[0]?.message ?? "Invalid message.",
        );
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
      pause: await setPaused(
        deps.projectRoot,
        parsed.data.paused,
        parsed.data.reason ?? "",
      ),
    };
  });

  /**
   * A turn, streamed as it happens: the user says something, the supervisor
   * answers and possibly acts. The work itself lives in the turn service; this
   * handler is the socket and the stop button.
   *
   * SSE over POST, not GET. A turn carries the user's message, which is up to
   * 20 000 characters and is theirs, so it cannot go in a query string - and
   * EventSource has no other way to send a body. The framing is identical
   * (`event:` + `data:` per {@link createSseClient}), so a client reads it with
   * a few lines over `fetch(...).body` instead of `new EventSource(...)`.
   *
   * STOP is that fetch being aborted. Nothing else to call: the socket closing
   * aborts the turn's signal, which kills whichever provider CLI is in flight
   * (SIGTERM to its process group) and records a stopped message in the thread.
   * What it cannot retract is an action that already executed - a created task
   * or a started run outlives this request, and is recorded as having happened.
   */
  app.post<{ Params: { threadId: string }; Body: unknown }>(
    "/api/supervisor/threads/:threadId/turn",
    async (req, reply) => {
      // Everything that can refuse the turn happens BEFORE the hijack: a
      // hijacked reply can no longer carry a status code, so a 400 after this
      // point would reach the client as an empty 200 stream.
      const parsed = turnBody.safeParse(req.body);
      if (!parsed.success) {
        throw new HttpError(
          400,
          parsed.error.issues[0]?.message ?? "Invalid message.",
        );
      }
      const threadId = req.params.threadId;
      if (!(await store.read(threadId)))
        throw new HttpError(404, "No such conversation.");

      const loaded = await loadConfig(deps.projectRoot);
      const effort = parsed.data.effort ?? null;
      const profileId = parsed.data.profileId ?? null;
      if (effort) {
        // Refuse an effort the provider does not actually have. `effortLevels`
        // is the same source the effort control reads, and the apply layer
        // would otherwise hand an unknown level straight to the CLI.
        // Against the profile the user picked, not the default - otherwise a
        // valid effort for the chosen provider is refused by the wrong one.
        const target = resolveAssistTarget(loaded, { profileId });
        const providerConfig = loaded.config.providers[target.providerId];
        const catalog = await resolveCatalog(deps.projectRoot).catch(() => undefined);
        const levels = providerConfig
          ? capabilitiesForProvider(target.providerId, providerConfig, catalog).powerLevels
          : [];
        if (!levels.includes(effort)) {
          throw new HttpError(
            400,
            levels.length
              ? `${target.providerId} takes ${levels.join(", ")}, not "${effort}".`
              : `${target.providerId} has no effort levels.`,
          );
        }
      }

      reply.hijack();
      const client = createSseClient(reply);
      const stop = new AbortController();

      // Declared before `cleanup` so a client that disconnects during setup does
      // not hit the temporal dead zone - same reason the other SSE routes do it.
      let heartbeat: NodeJS.Timeout | null = null;
      let done = false;
      const cleanup = () => {
        if (heartbeat) clearInterval(heartbeat);
        client.close();
      };
      // The RESPONSE's close, not the request's: a POST request stream ends as
      // soon as its body is read, so listening there would stop every turn the
      // instant it started.
      reply.raw.on("close", () => {
        if (!done) stop.abort();
        cleanup();
      });
      reply.raw.on("error", () => {
        if (!done) stop.abort();
        cleanup();
      });

      heartbeat = setInterval(() => {
        try {
          reply.raw.write(`: heartbeat\n\n`);
        } catch {
          cleanup();
        }
      }, 15_000);
      heartbeat.unref?.();

      try {
        await runSupervisorTurn({
          projectRoot: deps.projectRoot,
          store,
          threadId,
          message: parsed.data.text,
          loaded,
          effort,
          profileId,
          signal: stop.signal,
          // Each event is sent under its own SSE name AND carries `kind`, so a
          // reader can listen by name or switch on the parsed payload.
          emit: (event) => client.send(event.kind, event),
        });
      } catch (err) {
        // The turn service records its own failures; this only covers one
        // failing before it could, and the stream must not just go quiet.
        client.send("error", {
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        done = true;
        cleanup();
      }
    },
  );
}
