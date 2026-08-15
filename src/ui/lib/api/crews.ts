// Crews, presets, and per-role bindings/context.
import { jsonGet, jsonPost, jsonPatch, jsonPut } from "./http.js";
import type {
  CrewDraft,
  CrewView,
} from "../types.js";
import type {
  CrewPresetView,
} from "./types.js";

/** Where the in-editor assistant sends the crew draft it is holding plus one
 *  instruction, and gets back a PROPOSED revision of that same draft (or an
 *  answer with no edit). Declared here with the rest of the crew surface, and
 *  handed to `AssistantPanel`, which owns the request/proposal cycle for both
 *  makers. Nothing behind it writes: the editor applies a revision in memory
 *  and the existing save path stays the only writer. */
export const CREW_REVISE_ENDPOINT = "/api/crews/revise";

export const crewsApi = {
  /** Describe a crew in plain English; the supervisor returns an EDITABLE
   *  draft. Nothing here installs it - no route writes a drafted crew, so the
   *  YAML block the draft carries is what the owner puts under `crews:`. */
  async draftCrew(description: string): Promise<{ draft: CrewDraft }> {
    return jsonPost("/api/crews/draft", { description });
  },
  async getCrews(): Promise<{ crews: CrewView[]; defaultCrew: string | null }> {
    return jsonGet("/api/crews");
  },
  async getCrew(crewId: string): Promise<{ crew: CrewView }> {
    return jsonGet(`/api/crews/${encodeURIComponent(crewId)}`);
  },
  /** Set the project's default ("active") crew - parity with `vibe crew use`. */
  async setDefaultCrew(crewId: string): Promise<{ ok: true; defaultCrew: string }> {
    return jsonPost("/api/crews/default", { crewId });
  },
  /** Crew presets, each with install-state, whether it applies here, and what
   *  it would do (or why it can't). */
  async getCrewPresets(): Promise<{ presets: CrewPresetView[] }> {
    return jsonGet("/api/crews/presets");
  },
  /** Install a preset crew (+ its profile) - parity with `vibe crew presets add`. */
  async installCrewPreset(id: string): Promise<{
    ok: true;
    crewId: string;
    profileId: string;
    ref: string;
    power: string | null;
    model: string | null;
    maxReviewLoops: number | null;
  }> {
    return jsonPost("/api/crews/presets/install", { id });
  },
  async patchCrewRole(
    crewId: string,
    roleId: string,
    patch: {
      profile?: string;
      seats?: string[];
      permissions?: string;
      label?: string;
      skills?: string[];
    },
  ): Promise<{ ok: true; crewId: string; roleId: string }> {
    return jsonPatch(
      `/api/crews/${encodeURIComponent(crewId)}/roles/${encodeURIComponent(roleId)}`,
      patch,
    );
  },
  async getCrewRoleContext(
    crewId: string,
    roleId: string,
  ): Promise<{
    crewId: string;
    roleId: string;
    profile: string;
    seats: string[];
    permissions: string;
    skills: string[];
    promptPath: string;
    content: string;
  }> {
    return jsonGet(
      `/api/crews/${encodeURIComponent(crewId)}/roles/${encodeURIComponent(roleId)}/context`,
    );
  },
  async setCrewRoleContext(
    crewId: string,
    roleId: string,
    content: string,
  ): Promise<{ ok: true; crewId: string; roleId: string; promptPath: string }> {
    return jsonPut(
      `/api/crews/${encodeURIComponent(crewId)}/roles/${encodeURIComponent(roleId)}/context`,
      { content },
    );
  },
};
