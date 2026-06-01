// ── Provider capability catalog ─────────────────────────────────────────────
//
// Best-effort, curated suggestions for a provider's models and power/effort
// levels, so the Profile editor can offer real options instead of an empty
// text box. These are SUGGESTIONS, not a closed set: the UI presents them via a
// datalist and still accepts any typed value (CLIs add/rename models often, and
// local providers like Ollama expose whatever you've pulled). Same spirit as
// `provider-presets.ts` - known-good defaults, easy to extend, never a hard gate.

export type ProviderCapabilities = {
  /** Suggested model ids. Empty = no curated suggestions (free text). */
  models: string[];
  /** Suggested provider-specific power/effort levels. Empty = the provider
   *  exposes no discrete effort control (the field is just free text). */
  powerLevels: string[];
  /** Suggested coarse budget levels (Vibestrate's own spend-appetite knob). */
  budgetLevels: string[];
};

const BUDGET = ["low", "medium", "high"];

/** Keyed by known provider id. Conservative on purpose - only models/levels we
 *  are reasonably confident about; everything else falls back to free text. */
export const PROVIDER_CATALOG: Record<string, ProviderCapabilities> = {
  claude: { models: ["opus", "sonnet", "haiku"], powerLevels: [], budgetLevels: BUDGET },
  codex: { models: [], powerLevels: ["low", "medium", "high"], budgetLevels: BUDGET },
  gemini: {
    models: ["gemini-2.5-pro", "gemini-2.5-flash"],
    powerLevels: [],
    budgetLevels: BUDGET,
  },
  ollama: { models: [], powerLevels: [], budgetLevels: BUDGET },
  qwen: { models: [], powerLevels: [], budgetLevels: BUDGET },
  opencode: { models: [], powerLevels: [], budgetLevels: BUDGET },
  aider: { models: [], powerLevels: [], budgetLevels: BUDGET },
  crush: { models: [], powerLevels: [], budgetLevels: BUDGET },
  goose: { models: [], powerLevels: [], budgetLevels: BUDGET },
  cursor: { models: [], powerLevels: [], budgetLevels: BUDGET },
  amp: { models: [], powerLevels: [], budgetLevels: BUDGET },
};

/** Capabilities for a provider id, with a safe default for unknown/custom ids. */
export function providerCapabilities(id: string): ProviderCapabilities {
  return (
    PROVIDER_CATALOG[id] ?? { models: [], powerLevels: [], budgetLevels: BUDGET }
  );
}
