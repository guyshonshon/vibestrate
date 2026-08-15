// Supervisor personas/archetypes + the consult (ask-the-supervisor) call.
import { ApiError, apiError, jsonGet, jsonPost, jsonDelete } from "./http.js";
import type {
  ConsultResult,
  PersonasResponse,
  SupervisorArchetypeView,
} from "../types.js";
import type {
  SupervisorPauseView,
  SupervisorThreadSummary,
  SupervisorThreadView,
  SupervisorTurnEvent,
} from "../types/supervisor.js";

export const supervisorsApi = {
  async listPersonas(): Promise<PersonasResponse> {
    return jsonGet<PersonasResponse>("/api/personas");
  },
  /** The curated supervisor archetype gallery, each flagged `adopted`. */
  async getSupervisorArchetypes(): Promise<{
    archetypes: SupervisorArchetypeView[];
  }> {
    return jsonGet("/api/supervisors/archetypes");
  },
  /** Adopt an archetype by id -> writes a persona into project.yml (server owns
   *  the definition; only the id is sent). Parity with `vibe supervisor adopt`. */
  async adoptArchetype(archetypeId: string): Promise<{ id: string }> {
    return jsonPost("/api/supervisors/adopt", { archetypeId });
  },
  /** Author a project supervisor. The server validates the definition and refuses
   *  reserved ids, built-in shadowing, and silent overwrites. */
  async createPersona(
    id: string,
    persona: Record<string, unknown>,
    overwrite = false,
  ): Promise<{ id: string }> {
    return jsonPost("/api/supervisors/personas", { id, persona, overwrite });
  },
  /** Set the project's default supervisor. Parity with `vibe supervisor default`. */
  async setDefaultPersona(
    personaId: string,
  ): Promise<{ defaultPersona: string }> {
    return jsonPost("/api/supervisors/default", { personaId });
  },
  /** Remove a project (non-built-in, non-active-default) persona. Parity with
   *  `vibe supervisor remove`. */
  async removePersona(id: string): Promise<{ removed: boolean }> {
    return jsonDelete(`/api/supervisors/personas/${encodeURIComponent(id)}`);
  },
  async consult(input: {
    question: string;
    taskId?: string | null;
    runId?: string | null;
    files?: string[];
    profileId?: string | null;
    providerId?: string | null;
    model?: string | null;
    effort?: string | null;
    /** Screen-aware orb: a snapshot of the current screen (redacted server-side). */
    viewContext?: { screen: string; details: string } | null;
  }): Promise<ConsultResult> {
    return jsonPost("/api/consult", input);
  },
};

// ── Supervisor Control: the durable conversation, and the kill switch ───────
// The turn endpoint is the only one that can act; the rest are inert.

export type {
  SupervisorActionRecordView,
  SupervisorAnswerAction,
  SupervisorMessageView,
  SupervisorNavigateTarget,
  SupervisorPauseView,
  SupervisorThreadSummary,
  SupervisorThreadView,
  SupervisorTurnChunk,
  SupervisorTurnChunkKind,
  SupervisorTurnEvent,
} from "../types/supervisor.js";

/**
 * Read one SSE-framed response body.
 *
 * A turn cannot use `EventSource`: that is GET-only, and a 20 000-char message
 * has no business in a URL. So the turn POSTs and streams its own response,
 * which also makes stop the one primitive the whole chain already speaks -
 * `AbortController` -> fetch -> the server's close handler -> SIGTERM to the
 * provider CLI process group.
 *
 * Frames that do not parse are dropped rather than guessed at, and so are
 * event names outside the union. A `:` line is a heartbeat comment.
 */
async function* sseFrames(
  res: Response,
): AsyncGenerator<{ event: string; data: string }> {
  const body = res.body;
  if (!body) throw new ApiError(res.status, "The turn returned no stream.");
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    for (;;) {
      const cut = buffer.indexOf("\n\n");
      if (cut === -1) break;
      const frame = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      let event = "message";
      const data: string[] = [];
      for (const raw of frame.split("\n")) {
        const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
        if (line.startsWith(":")) continue;
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
      }
      if (data.length > 0) yield { event, data: data.join("\n") };
    }
  }
}

/** Event name -> the typed union member, or null for anything unrecognised.
 *  Fail closed: an unknown event is a contract the client does not implement,
 *  and rendering a guess at it is worse than ignoring it. */
function toTurnEvent(event: string, data: string): SupervisorTurnEvent | null {
  let payload: unknown;
  try {
    payload = JSON.parse(data);
  } catch {
    return null;
  }
  const body = payload as Record<string, unknown>;
  switch (event) {
    case "user":
      return body.message ? { type: "user", message: body.message as never } : null;
    case "chunk":
      return body.chunk ? { type: "chunk", chunk: body.chunk as never } : null;
    case "done":
      return body.thread ? { type: "done", thread: body.thread as never } : null;
    case "error":
      return {
        type: "error",
        error: (body.error as never) ?? { message: "The turn failed." },
      };
    default:
      return null;
  }
}

export const supervisorControlApi = {
  async listThreads(runId?: string): Promise<{ threads: SupervisorThreadSummary[] }> {
    const q = runId ? `?runId=${encodeURIComponent(runId)}` : "";
    return jsonGet(`/api/supervisor/threads${q}`);
  },
  async getThread(threadId: string): Promise<{ thread: SupervisorThreadView }> {
    return jsonGet(`/api/supervisor/threads/${encodeURIComponent(threadId)}`);
  },
  /** Opens (or creates) the conversation for a run. */
  async createThread(runId?: string): Promise<{ thread: SupervisorThreadView }> {
    return jsonPost("/api/supervisor/threads", runId ? { runId } : {});
  },
  /**
   * Say something. The supervisor answers, and acts when autonomy allows it.
   *
   * `effort` is a per-turn override applied to the assist target the turn would
   * have used anyway. It writes nothing: no profile, no config, no default.
   *
   * Aborting `signal` kills the model process for whichever leg is in flight.
   * It does NOT retract an action that already executed - a run the executor
   * really started stays started, and the thread keeps its record of it.
   */
  async streamSupervisorTurn(
    threadId: string,
    input: { text: string; effort?: string | null; profileId?: string | null },
    onEvent: (event: SupervisorTurnEvent) => void,
    signal: AbortSignal,
  ): Promise<void> {
    const res = await fetch(
      `/api/supervisor/threads/${encodeURIComponent(threadId)}/turn`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "text/event-stream",
        },
        body: JSON.stringify({
          text: input.text,
          effort: input.effort ?? null,
          profileId: input.profileId ?? null,
        }),
        signal,
      },
    );
    if (!res.ok) throw await apiError(res);
    // No fallback to a buffered response. A turn that answers in one lump has
    // no thinking to show and no leg to stop, so silently accepting one would
    // ship a chat whose stop button is decorative.
    if (!(res.headers.get("content-type") ?? "").includes("text/event-stream")) {
      throw new ApiError(
        res.status,
        "The supervisor turn did not stream. This `vibe ui` server bundle predates streamed turns; restart it after a rebuild.",
      );
    }
    for await (const frame of sseFrames(res)) {
      const event = toTurnEvent(frame.event, frame.data);
      if (event) onEvent(event);
    }
  },
  async getSupervisorPause(): Promise<{ pause: SupervisorPauseView }> {
    return jsonGet("/api/supervisor/pause");
  },
  async setSupervisorPause(
    paused: boolean,
    reason = "",
  ): Promise<{ pause: SupervisorPauseView }> {
    return jsonPost("/api/supervisor/pause", { paused, reason });
  },
};
