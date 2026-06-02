// ── Applying a profile's model + effort to the actual spawn ──────────────────
//
// Single source of truth for what a provider's model/effort knobs DO. A knob is
// only ever exposed in the UI if it is wired here to a real CLI flag - no
// advisory values. Verified against each CLI's `--help` + official docs:
//   - claude: `--effort <low|medium|high|xhigh|max>`, `--model <id>`
//     (confirmed via `claude --help`).
//   - codex:  `-c model_reasoning_effort=<minimal|low|medium|high|xhigh>`,
//     `--model` (developers.openai.com/codex/config-reference; xhigh is
//     model-dependent).
//   - gemini: `--model <id>` only. Gemini's reasoning is a numeric *thinking
//     budget* (ai.google.dev/gemini-api/docs/thinking), NOT a CLI effort flag -
//     an interactive control is an open feature request (gemini-cli #25122) -
//     so effort stays hidden for the CLI until there's a real flag.
// (`ultracode` is a Vibestrate run-mode, not a claude `--effort` value, so it is
// NOT an effort level here.)

type ArgApply =
  | { kind: "flag"; flag: string } // -> [flag, value]
  | { kind: "config"; flag: string; key: string }; // -> [flag, `${key}=${value}`]

type ProviderApplySpec = {
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

type HttpApplySpec = {
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

/** Real, wired effort levels for an HTTP api family ([] = no effort knob). */
export function httpEffortLevels(api: string): string[] {
  return HTTP_SPECS[api]?.effort?.levels ?? [];
}

/** Model suggestions for an HTTP api family (model itself is always settable). */
export function httpModelSuggestions(api: string): string[] {
  return HTTP_SPECS[api]?.models ?? [];
}

/** Apply a profile's effort onto an HTTP request body in place. No-op unless the
 *  api has a real effort field and the profile set one. */
export function applyHttpEffort(
  api: string,
  body: Record<string, unknown>,
  effort?: string | null,
): void {
  const spec = HTTP_SPECS[api];
  if (spec?.effort && effort) body[spec.effort.field] = effort;
}

/** Model suggestions for a provider (empty = model not wired). */
export function modelSuggestions(providerId: string): string[] {
  const s = SPECS[providerId];
  return s?.model ? s.models : [];
}

/** Whether model selection is actually applied for this provider. */
export function modelIsWired(providerId: string): boolean {
  return !!SPECS[providerId]?.model;
}

/** Real, wired effort levels for a provider ([] = effort not wired -> hidden). */
export function effortLevels(providerId: string): string[] {
  return SPECS[providerId]?.effort?.levels ?? [];
}

/** Extra CLI args applying model + effort for a generic-CLI provider (codex,
 *  gemini, ...). Claude is type `claude-code` and applies in its own provider. */
export function profileSpawnArgs(
  providerId: string,
  knobs: { model?: string | null; effort?: string | null },
): string[] {
  const spec = SPECS[providerId];
  if (!spec) return [];
  const out: string[] = [];
  if (knobs.model && spec.model) out.push(...oneArg(spec.model, knobs.model));
  if (knobs.effort && spec.effort) out.push(...oneArg(spec.effort.apply, knobs.effort));
  return out;
}
