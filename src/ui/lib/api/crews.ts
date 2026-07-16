// Crews, presets, and per-role bindings/context.
import { jsonGet, jsonPost, jsonPatch, jsonPut } from "./http.js";
import type {
  CrewView,
} from "../types.js";
import type {
  CrewPresetView,
} from "./types.js";

export const crewsApi = {
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
