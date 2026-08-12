// Supervisor personas/archetypes + the consult (ask-the-supervisor) call.
import { jsonGet, jsonPost, jsonDelete } from "./http.js";
import type {
  ConsultResult,
  PersonasResponse,
  SupervisorArchetypeView,
} from "../types.js";

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

export type SupervisorActionRecordView = {
  intent: string;
  summary: string;
  targetKind: "task" | "checklist" | "queue" | "run" | "none";
  targetId: string | null;
  ok: boolean;
  error: string | null;
  undone: boolean;
};

export type SupervisorMessageView = {
  id: string;
  role: "user" | "supervisor" | "system";
  text: string;
  createdAt: string;
  action: SupervisorActionRecordView | null;
};

export type SupervisorThreadView = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: SupervisorMessageView[];
};

export type SupervisorThreadSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
};

export type SupervisorPauseView = {
  paused: boolean;
  reason: string;
  updatedAt: string;
};

export const supervisorControlApi = {
  async listThreads(): Promise<{ threads: SupervisorThreadSummary[] }> {
    return jsonGet("/api/supervisor/threads");
  },
  async getThread(threadId: string): Promise<{ thread: SupervisorThreadView }> {
    return jsonGet(`/api/supervisor/threads/${encodeURIComponent(threadId)}`);
  },
  async createThread(): Promise<{ thread: SupervisorThreadView }> {
    return jsonPost("/api/supervisor/threads", {});
  },
  /** Say something. The supervisor answers, and acts when autonomy allows it. */
  async supervisorTurn(
    threadId: string,
    text: string,
  ): Promise<{ thread: SupervisorThreadView }> {
    return jsonPost(`/api/supervisor/threads/${encodeURIComponent(threadId)}/turn`, { text });
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
