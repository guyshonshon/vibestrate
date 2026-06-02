// ── Provider capability catalog (UI-facing) ─────────────────────────────────
//
// What the Profile editor offers per provider. Derived from the apply layer
// (provider-apply.ts) so a knob is ONLY shown when it is actually wired to a
// real CLI flag - no advisory options. Models/effort come straight from the
// single source; budget is Vibestrate's own coarse knob.

import {
  modelSuggestions,
  modelIsWired,
  effortLevels,
} from "./provider-apply.js";

export type ProviderCapabilities = {
  /** Model suggestions; empty when model selection isn't wired for this provider. */
  models: string[];
  /** Whether model selection actually takes effect (UI hides the field if not). */
  modelEnabled: boolean;
  /** Wired effort levels; empty = no effort control (UI hides the field). */
  powerLevels: string[];
  /** Coarse budget levels (Vibestrate spend-appetite knob). */
  budgetLevels: string[];
};

const BUDGET = ["low", "medium", "high"];

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

export function providerCapabilities(id: string): ProviderCapabilities {
  return {
    models: modelSuggestions(id),
    modelEnabled: modelIsWired(id),
    powerLevels: effortLevels(id),
    budgetLevels: BUDGET,
  };
}

/** Full catalog (every known provider), built from the apply layer. */
export const PROVIDER_CATALOG: Record<string, ProviderCapabilities> =
  Object.fromEntries(KNOWN.map((id) => [id, providerCapabilities(id)]));
