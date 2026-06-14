// ── Provider capability catalog (UI-facing) ─────────────────────────────────
//
// What the Profile editor offers per provider. Derived from the apply layer
// (provider-apply.ts) so a knob is ONLY shown when it is actually wired to a
// real CLI flag - no advisory options. Models/effort come straight from the
// single source.

import {
  modelSuggestions,
  modelIsWired,
  effortLevels,
  httpEffortLevels,
  httpModelSuggestions,
  cheapestModel,
  httpCheapestModel,
  BUILTIN_CATALOG,
  type ResolvedCatalog,
} from "./provider-apply.js";
import type { ProviderConfig } from "./provider-schema.js";

export type ProviderCapabilities = {
  /** Model suggestions; empty when model selection isn't wired for this provider. */
  models: string[];
  /** Whether model selection actually takes effect (UI hides the field if not). */
  modelEnabled: boolean;
  /** Wired effort levels; empty = no effort control (UI hides the field). */
  powerLevels: string[];
  /** Curated cheapest model id, or null when none is designated. Drives `cheap`. */
  cheapModel: string | null;
};

const KNOWN = [
  "claude",
  "codex",
  "gemini",
  "opencode",
  "aider",
  "ollama",
  "qwen",
  "crush",
  "goose",
  "cursor",
  "amp",
];

export function providerCapabilities(
  id: string,
  catalog: ResolvedCatalog = BUILTIN_CATALOG,
): ProviderCapabilities {
  return {
    models: modelSuggestions(id, catalog),
    modelEnabled: modelIsWired(id, catalog),
    powerLevels: effortLevels(id, catalog),
    cheapModel: cheapestModel(id, catalog),
  };
}

/** Full catalog (every known provider), built from the apply layer. */
export const PROVIDER_CATALOG: Record<string, ProviderCapabilities> =
  Object.fromEntries(KNOWN.map((id) => [id, providerCapabilities(id)]));

/** Capabilities for an actual configured provider - api-aware. HTTP providers
 *  (any id) resolve their model/effort knobs from the api family; CLI and
 *  claude-code resolve from the well-known provider id. This is what the
 *  Profile editors (web + shell) should use so a user's http-api provider
 *  surfaces real knobs (e.g. OpenAI effort), not an empty set. */
export function capabilitiesForProvider(
  id: string,
  config: ProviderConfig,
  catalog: ResolvedCatalog = BUILTIN_CATALOG,
): ProviderCapabilities {
  if (config.type === "http-api" || config.type === "localhost-proxy") {
    return {
      models: httpModelSuggestions(config.api, catalog),
      modelEnabled: true, // every HTTP api takes a model id
      powerLevels: httpEffortLevels(config.api, catalog),
      cheapModel: httpCheapestModel(config.api, catalog),
    };
  }
  // cli / claude-code: keyed by the well-known provider id.
  return providerCapabilities(
    id === "claude" || config.type === "claude-code" ? "claude" : id,
    catalog,
  );
}
