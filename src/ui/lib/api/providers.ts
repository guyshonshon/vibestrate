// Provider setup/testing + profiles and the model catalog.
import { jsonGet, jsonPost, jsonPatch, jsonDelete } from "./http.js";
import type { EditorProviderConfig } from "../provider-yaml.js";
import type {
  ProfileView,
  ProviderCatalogResponse,
  CatalogRefreshResult,
} from "../types.js";
import type {
  ProvidersOverview,
  ProviderRow,
} from "./types.js";

export const providersApi = {
  async getProviderConfig(providerId: string): Promise<{
    providerId: string;
    configured: boolean;
    config: EditorProviderConfig;
    profilesUsing: string[];
  }> {
    return jsonGet(
      `/api/providers/${encodeURIComponent(providerId)}/config`,
    );
  },
  async setupProvider(
    providerId: string,
    opts: {
      setAsDefault?: boolean;
      // A type-less config is treated as CLI by the server (legacy shape). The
      // raw-YAML editor sends an arbitrary object (env, claude-code settings,
      // extraArgs, ...) which the server validates against the full schema.
      config?:
        | EditorProviderConfig
        | { command: string; args?: string[]; input?: "stdin" | "arg" }
        | Record<string, unknown>;
    } = {},
  ): Promise<{ ok: true; providerId: string; configured: true }> {
    return jsonPost(
      `/api/providers/${encodeURIComponent(providerId)}/setup`,
      opts,
    );
  },
  async setDefaultProvider(
    providerId: string,
  ): Promise<{ ok: true; providerId: string; profilesUpdated: string[] }> {
    return jsonPost(
      `/api/providers/${encodeURIComponent(providerId)}/default`,
    );
  },
  async removeProvider(
    providerId: string,
  ): Promise<{ ok: true; providerId: string }> {
    return jsonDelete(`/api/providers/${encodeURIComponent(providerId)}`);
  },
  async testProvider(providerId: string): Promise<{
    ok: boolean;
    providerId: string;
    command: string;
    args: string[];
    durationMs: number;
    exitCode: number;
    stdout: string;
    stderr: string;
    matchedMagic: boolean;
    hint?: string;
    needsLogin: boolean;
    loginCommand?: string | null;
  }> {
    return jsonPost(
      `/api/providers/${encodeURIComponent(providerId)}/test`,
    );
  },
  async listProviders(): Promise<{
    providers: ProviderRow[];
  }> {
    return jsonGet("/api/providers");
  },
  async getProvidersOverview(): Promise<ProvidersOverview> {
    return jsonGet("/api/providers/overview");
  },
  // ─── profiles ─────────────────────────────────────────────────────────
  async getProfiles(): Promise<{ profiles: ProfileView[] }> {
    return jsonGet("/api/profiles");
  },
  async getProviderCatalog(): Promise<ProviderCatalogResponse> {
    return jsonGet("/api/providers/catalog");
  },
  async refreshProviderCatalog(
    body: { providerId?: string; force?: boolean; dryRun?: boolean } = {},
  ): Promise<CatalogRefreshResult> {
    return jsonPost("/api/providers/catalog/refresh", body);
  },
  async patchProfile(
    profileId: string,
    patch: {
      provider?: string;
      label?: string;
      model?: string | null;
      power?: string | null;
      maxTokens?: number | null;
      timeoutMs?: number | null;
    },
  ): Promise<{ ok: true; profileId: string }> {
    return jsonPatch(`/api/profiles/${encodeURIComponent(profileId)}`, patch);
  },
  async createProfile(input: {
    id: string;
    provider: string;
    label?: string;
    model?: string;
    power?: string;
    maxTokens?: number;
    timeoutMs?: number;
  }): Promise<{ ok: true; profileId: string }> {
    return jsonPost("/api/profiles", input);
  },
  async duplicateProfile(
    profileId: string,
    input: { newId: string; label?: string },
  ): Promise<{ ok: true; profileId: string }> {
    return jsonPost(
      `/api/profiles/${encodeURIComponent(profileId)}/duplicate`,
      input,
    );
  },
  async deleteProfile(
    profileId: string,
    opts: { force?: boolean } = {},
  ): Promise<{ ok: true; profileId: string }> {
    const q = opts.force ? "?force=1" : "";
    return jsonDelete(`/api/profiles/${encodeURIComponent(profileId)}${q}`);
  },
};
