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
