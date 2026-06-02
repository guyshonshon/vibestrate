// ── Applying a profile's model + effort to the actual spawn ──────────────────
//
// Single source of truth for what a provider's model/effort knobs DO. A knob is
// only ever exposed in the UI if it is wired here to a real CLI flag - no
// advisory values. Verified against each CLI's `--help` + official docs:
//   - claude: `--effort <low|medium|high|xhigh|max>`, `--model <id>`. Verified
//     against claude 2.1.160 `--help`, and confirmed honored in headless `-p`
//     (print) mode - the mode Vibestrate uses (claudeCodePreset = `claude -p`).
//     Note: claude *warns and falls back to default* on an unknown `--effort`
//     value rather than erroring, so it never hard-fails; we keep the surfaced
//     levels constrained to these five so a normal profile always sends a valid
//     one.
//   - codex:  `-c model_reasoning_effort=<minimal|low|medium|high|xhigh>`,
//     `--model` (developers.openai.com/codex/config-reference; xhigh is
//     model-dependent).
//   - gemini: `--model <id>` only. Gemini's reasoning is a numeric *thinking
//     budget* (ai.google.dev/gemini-api/docs/thinking), NOT a CLI effort flag -
//     an interactive control is an open feature request (gemini-cli #25122) -
//     so effort stays hidden for the CLI until there's a real flag.
// (`ultracode` is a Vibestrate run-mode, not a claude `--effort` value, so it is
// NOT an effort level here.)

export type ArgApply =
  | { kind: "flag"; flag: string } // -> [flag, value]
  | { kind: "config"; flag: string; key: string }; // -> [flag, `${key}=${value}`]

export type ProviderApplySpec = {
  /** Curated model suggestions (model is applied via `model` below). */
  models: string[];
  /** How `--model` is passed. null = model selection not wired -> hidden. */
  model: ArgApply | null;
  /** Effort: the real levels + how each is applied. null = no effort -> hidden. */
  effort: { levels: string[]; apply: ArgApply } | null;
};

const FLAG_MODEL: ArgApply = { kind: "flag", flag: "--model" };

const SPECS: Record<string, ProviderApplySpec> = {
  claude: {
    models: ["opus", "sonnet", "haiku"],
    model: FLAG_MODEL,
    effort: {
      levels: ["low", "medium", "high", "xhigh", "max"],
      apply: { kind: "flag", flag: "--effort" },
    },
  },
  codex: {
    models: ["gpt-5.5", "gpt-5.1-codex-max", "gpt-5.1"],
    model: FLAG_MODEL,
    effort: {
      levels: ["minimal", "low", "medium", "high", "xhigh"],
      apply: { kind: "config", flag: "-c", key: "model_reasoning_effort" },
    },
  },
  gemini: {
    models: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite"],
    model: FLAG_MODEL,
    effort: null, // CLI exposes no effort flag (thinking budget is numeric/API)
  },
  // Not wired (no verified flag) -> the UI hides model/effort for these.
  ollama: { models: [], model: null, effort: null },
  qwen: { models: [], model: null, effort: null },
  opencode: { models: [], model: null, effort: null },
  aider: { models: [], model: null, effort: null },
  crush: { models: [], model: null, effort: null },
  goose: { models: [], model: null, effort: null },
  cursor: { models: [], model: null, effort: null },
  amp: { models: [], model: null, effort: null },
};

function oneArg(a: ArgApply, value: string): string[] {
  return a.kind === "flag" ? [a.flag, value] : [a.flag, `${a.key}=${value}`];
}

// ── Resolved catalog (built-in, optionally overlaid by the user) ─────────────
//
// The functions below read from a ResolvedCatalog rather than the module consts
// directly, so a project's `.vibestrate/providers-catalog.yml` overlay (loaded
// by provider-catalog-overlay.ts, merged over BUILTIN_CATALOG) can add or refine
// a provider's models / effort / apply-spec. Every function defaults to
// BUILTIN_CATALOG, so call sites that don't (yet) thread an overlay are
// unchanged. The overlay never relaxes the "real knobs only" rule - it just lets
// a user declare the real knobs of a provider Vibestrate doesn't ship a spec for.
// (BUILTIN_CATALOG itself is defined just after HTTP_SPECS below.)

export type ResolvedCatalog = {
  /** CLI / claude-code apply specs, keyed by provider id. */
  cli: Record<string, ProviderApplySpec>;
  /** HTTP-API apply specs, keyed by api family (openai/anthropic/ollama). */
  http: Record<string, HttpApplySpec>;
};

// ── HTTP-API providers: model/effort live in the request BODY, not argv ──────
//
// Same rule as the CLI side - a knob is exposed only when it maps to a real,
// doc-verified request field. Keyed by the provider's `api` family (the schema
// allows anthropic|openai for http-api and openai|ollama for localhost-proxy):
//   - openai: `reasoning_effort` (minimal|low|medium|high) on chat/completions
//     for reasoning models (platform.openai.com/docs api-reference; minimal is
//     gpt-5-class). Applied only when the profile sets effort.
//   - anthropic: extended thinking is a numeric `budget_tokens`, NOT an effort
//     level (docs.anthropic.com extended-thinking) - so no effort knob here.
//   - ollama: no effort field.
// (Model is free-text for every API - you always pass a model id - so model is
//  always "wired"; the lists below are just suggestions.)

export type HttpApplySpec = {
  /** Curated model suggestions (model is always settable as free text). */
  models: string[];
  /** Effort: real levels + the request-body field they set. null = no effort. */
  effort: { levels: string[]; field: string } | null;
};

const HTTP_SPECS: Record<string, HttpApplySpec> = {
  openai: {
    models: ["gpt-5.5", "gpt-5.1", "o4-mini"],
    effort: {
      levels: ["minimal", "low", "medium", "high"],
      field: "reasoning_effort",
    },
  },
  anthropic: {
    models: ["claude-opus-4-1", "claude-sonnet-4-5", "claude-haiku-4-5"],
    effort: null, // thinking is a numeric budget_tokens, not an effort level
  },
  ollama: { models: [], effort: null },
};

/** The built-in catalog (no overlay). The default for every function below. */
export const BUILTIN_CATALOG: ResolvedCatalog = { cli: SPECS, http: HTTP_SPECS };

/** Real, wired effort levels for an HTTP api family ([] = no effort knob). */
export function httpEffortLevels(
  api: string,
  catalog: ResolvedCatalog = BUILTIN_CATALOG,
): string[] {
  return catalog.http[api]?.effort?.levels ?? [];
}

/** Model suggestions for an HTTP api family (model itself is always settable). */
export function httpModelSuggestions(
  api: string,
  catalog: ResolvedCatalog = BUILTIN_CATALOG,
): string[] {
  return catalog.http[api]?.models ?? [];
}

/** Apply a profile's effort onto an HTTP request body in place. No-op unless the
 *  api has a real effort field and the profile set one. */
export function applyHttpEffort(
  api: string,
  body: Record<string, unknown>,
  effort?: string | null,
  catalog: ResolvedCatalog = BUILTIN_CATALOG,
): void {
  const spec = catalog.http[api];
  if (spec?.effort && effort) body[spec.effort.field] = effort;
}

/** Model suggestions for a provider (empty = model not wired). */
export function modelSuggestions(
  providerId: string,
  catalog: ResolvedCatalog = BUILTIN_CATALOG,
): string[] {
  const s = catalog.cli[providerId];
  return s?.model ? s.models : [];
}

/** Whether model selection is actually applied for this provider. */
export function modelIsWired(
  providerId: string,
  catalog: ResolvedCatalog = BUILTIN_CATALOG,
): boolean {
  return !!catalog.cli[providerId]?.model;
}

/** Real, wired effort levels for a provider ([] = effort not wired -> hidden). */
export function effortLevels(
  providerId: string,
  catalog: ResolvedCatalog = BUILTIN_CATALOG,
): string[] {
  return catalog.cli[providerId]?.effort?.levels ?? [];
}

/** Extra CLI args applying model + effort for a generic-CLI provider (codex,
 *  gemini, ...). Claude is type `claude-code` and applies in its own provider. */
export function profileSpawnArgs(
  providerId: string,
  knobs: { model?: string | null; effort?: string | null },
  catalog: ResolvedCatalog = BUILTIN_CATALOG,
): string[] {
  const spec = catalog.cli[providerId];
  if (!spec) return [];
  const out: string[] = [];
  if (knobs.model && spec.model) out.push(...oneArg(spec.model, knobs.model));
  if (knobs.effort && spec.effort) out.push(...oneArg(spec.effort.apply, knobs.effort));
  return out;
}
