# Provider apply layer (effort/model, one declarative source)

Status: shipped. The *why* behind `src/providers/provider-apply.ts` and the
api-aware capability resolution. Companion to the Profile concept doc
(`docs/content/concepts/profile.md`) and `docs/TODO.md` ("Effort/model must
actually take effect at the provider", Phase A2/B).

---

## 1. The problem

A Profile's `model` and `power` (effort) must do two things that have to agree:

1. **Apply** - change what is actually spawned (CLI flag) or sent (HTTP body).
2. **Surface** - the editors (web, shell, CLI) must offer exactly the levels a
   provider really supports, and hide the knob where it has none.

If application and surfacing drift, you get advisory dials: a UI lets you pick an
effort the runtime ignores. The invariant for this repo is the opposite - **no
advisory knobs; a knob exists only where it is wired to a real flag/field.**

## 2. Decision - one declarative spec, two consumers

`provider-apply.ts` is the single source. It declares, per provider, *how* model
and effort are applied:

- **CLI providers** (keyed by well-known id): `ArgApply` of kind `flag`
  (`--effort high`) or `config` (codex `-c model_reasoning_effort=high`).
  `profileSpawnArgs()` turns the spec into argv; `effortLevels()` /
  `modelSuggestions()` read the same spec for the editors.
- **HTTP-API providers** (keyed by `api` family - openai/anthropic/ollama):
  effort maps to a **request-body field**. OpenAI -> `reasoning_effort`
  (`minimal/low/medium/high`). `applyHttpEffort()` mutates the body;
  `httpEffortLevels()` reads the same spec for the editors.

Two consumers (the spawn/body mutation and the capability catalog) read one
table, so they cannot disagree.

## 3. Why effort is per-api for HTTP, per-id for CLI

A CLI provider's behavior is tied to its binary (`codex` accepts
`model_reasoning_effort`; `gemini` does not), so the well-known id is the right
key. An HTTP provider's behavior is tied to the wire protocol it speaks, not its
config-map id - a user can name an OpenAI-compatible provider anything. So
capabilities resolve from `config.api`, which is why `capabilitiesForProvider(id,
config)` (in `provider-catalog.ts`) branches: HTTP/localhost -> by `api`,
otherwise -> by id. The catalog endpoint merges the project's real providers over
the static known list so a user's `myopenai` provider surfaces OpenAI's effort
under its own id.

## 4. What is deliberately NOT wired

Per the "only real knobs" rule, reasoning expressed as a numeric token budget is
**not** an effort level and gets no effort knob:

- Gemini CLI - thinking budget is numeric/API, no `--effort` flag.
- Anthropic Messages API - extended thinking is `thinking.budget_tokens`, not a
  level. (If we later expose a budget control, it is a *separate* numeric knob,
  not folded into the effort ladder.)

`env`-applied knobs are part of the `ArgApply` design space but intentionally not
added until a real provider needs one - adding an untested code path for a knob
nobody applies would itself be an advisory dial.

## 5. Tests pinning the invariant

- `provider-apply.test.ts` - CLI flag/config emission + http effort levels and
  `applyHttpEffort` (openai only, only when set).
- `http-api-provider.test.ts` - a profile's effort reaches the real request body
  for OpenAI (`reasoning_effort: high`) and is absent for Anthropic.
- `provider-catalog.test.ts` - `capabilitiesForProvider` is api-aware.
- `server-catalog.test.ts` - the catalog endpoint surfaces a configured http-api
  provider's knobs under its own id.
