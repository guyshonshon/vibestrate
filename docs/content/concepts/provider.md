---
title: Provider
description: A local coding-agent CLI Vibestrate can drive. Vibestrate supplies the prompt; the provider supplies the model.
section: concepts
slug: concepts/provider
---

A provider is the actual model you're using, wrapped so Vibestrate can talk to
it. Claude Code, Codex, Ollama - Vibestrate doesn't care which, as long as it's
installed locally.

Under the hood, a provider is a configured way to invoke that tool: it takes a
prompt and produces a textual response (and, for editing providers, file edits).
Providers are declared under `providers:` in `project.yml`, either as a `cli`
invocation (command, args, input mode) or as a `claude-code` integration, which
Vibestrate understands more deeply. The orchestrator drives them all through one
uniform interface, and each provider advertises its own capabilities - whether it
can reuse a session, report token usage, or hand back a session id.

> **Provider vs [[profile]] vs [[role]]:** a *Provider* is the installed **CLI**;
> a *Profile* names a Provider plus how strong/expensive to run it; a *Role*
> runs on a Profile. Roles never point at a Provider directly - they go through a
> Profile. One Provider backs many Profiles; one Profile backs many Roles.

## Why it matters

Providers are the boundary between Vibestrate and "the model." Vibestrate itself is provider-agnostic - it builds the prompt, captures the output, and routes the result. Anything model-specific (login, billing, context limits) is the provider's responsibility.

This is what makes the tool *local-first* - where local-first means **sovereignty, not zero-egress**: there is no Vibestrate-operated backend or relay; you run an independent tool you fully control. Most providers are local CLIs that own their own auth and egress. You *may* also point a provider at a model API with your own key (see **Non-CLI providers** below) - that's your sovereign choice and doesn't change the local-first guarantee, because nothing ever flows through a service *we* run.

## Built-in providers

| Id | Status | Notes |
|---|---|---|
| `claude` | Preset-ready | Default args: `-p` with prompt on stdin. Vibestrate configures Claude Code automatically. |
| `codex` | Detected, needs setup | Starter preset uses `codex exec` (prompt on stdin). Run `vibe provider setup`. |
| `ollama` | Detected, needs setup | Starter preset runs `ollama run qwen3.5`. You probably want to edit the model. |
| `opencode` | Detected, needs setup | No verified preset shipped. |
| `aider` | Detected, needs setup | No verified preset shipped. |

The canonical, generated list lives in the [providers reference](/docs/reference/providers).

## "Preset-ready" vs "needs setup"

Coding-agent CLIs disagree on flags - `--prompt` here, `-p` there, `exec` for some, stdin for others. When a vendor's flag set is stable enough that Vibestrate can drive it without surprises, that provider is marked **preset-ready**. Otherwise Vibestrate will detect it but won't guess flags; `vibe provider setup` walks you through the choices.

If a preset is wrong for your installed version (e.g. a flag the CLI removed), you can correct `command`/`args`/`input` directly - either with `vibe provider setup`, by hand-editing `.vibestrate/project.yml`, or in the dashboard's **Providers** page, which has an inline editor with a Save & test loop and a Remove action. The CLI and the dashboard can do exactly the same things.

## Non-CLI providers (HTTP)

Beyond local CLIs, two HTTP-backed provider types let you run a model over the network:

```yaml
providers:
  # Cloud API - your own key, external destination.
  anthropic-api:
    type: http-api
    api: anthropic                 # or: openai
    baseUrl: https://api.anthropic.com
    model: claude-sonnet-4-5
    apiKey: env:ANTHROPIC_API_KEY   # env-ref ONLY - never a literal key

  # Local model server - no key, no egress.
  ollama-local:
    type: localhost-proxy
    api: ollama                     # or: openai (OpenAI-compatible servers)
    baseUrl: http://localhost:11434
    model: qwen3.5
```

Rules the schema enforces:

- **`http-api`** must be **https** and **not** a localhost host; its `apiKey` must be an `env:NAME` reference (a literal key in config is rejected). The key is resolved at call time, never written to YAML, never logged, and redacted from any error. The dashboard marks these providers **external**.
- **`localhost-proxy`** must point at a loopback host (`localhost` / `127.0.0.1` / `[::1]`) - so there is **no egress**. A key is optional.

Both report **real token usage** from the API response (not estimates). They run one request per turn - no session reuse.

## Providers back Profiles, Profiles back Roles

A Provider is a raw tool. A [[profile]] wraps it with model/power/budget, and a
[[role]] in your [[crew]] runs on a Profile:

```yaml
providers:
  claude: { type: cli, command: claude, args: ["-p"], input: stdin }
  codex:  { type: cli, command: codex, args: ["exec"], input: stdin }

profiles:
  claude-sonnet-deep: { provider: claude, model: sonnet, power: deep }
  codex-balanced:      { provider: codex, power: balanced }

crews:
  default:
    roles:
      reviewer: { seats: [reviewer], profile: codex-balanced, prompt: .vibestrate/roles/reviewer.md, permissions: read_only }
```

To run a whole run on a different Profile, or one Step on a stronger one:

```bash
vibe run "..." --profile claude-sonnet-deep            # run-wide
vibe run "..." --flow default --step-profile implement=opus-deep   # one step
```

(Provider commands - `vibe provider list/setup/test` - manage the raw tools
only. Profiles and Crews are edited in `project.yml`, the dashboard, or the API.)

## Capability catalog + your overlay

Vibestrate ships a built-in **capability catalog**: per provider, the real models
and effort levels and *how* each is applied (a CLI flag, a `-c key=value`, or an
HTTP request-body field). The Profile editors only offer knobs that are in this
catalog, so you never set an effort the runtime ignores.

For a provider Vibestrate doesn't ship a spec for - your own CLI, a custom model -
declare its real knobs in `.vibestrate/providers-catalog.yml`. The overlay is
merged over the built-in catalog (your entry wins, per field), and it feeds the
spawn AND every editor (web / shell / CLI) from the same source:

```yaml
# .vibestrate/providers-catalog.yml
cli:
  mycli:                         # a CLI provider with its own flags
    models: [turbo, eco]
    model: { kind: flag, flag: --model }          # -> --model turbo
    effort:
      levels: [eco, turbo]
      apply: { kind: config, flag: --set, key: reasoning }  # -> --set reasoning=turbo
  gemini:
    effort: null                 # explicitly clear a built-in knob
http:
  openai:
    models: [my-finetune]        # add a model suggestion to the openai api family
```

Rules: a knob still only exists where it maps to a real flag/field (no advisory
dials); omit a field to keep the built-in value, set it to `null` to clear it.
See the merged result and where each entry came from with:

```bash
vibe provider catalog          # human view (built-in + overlay, with sources)
vibe provider catalog --json   # machine-readable
```

Same view in the UI (parity): the dashboard **Providers** page has a "Capability
catalog" panel, and the shell **Profiles** page flags when an overlay is active
plus each provider's source.

### Auto-filling from `--help`

You don't have to hand-author every entry. `vibe provider refresh` probes your
configured CLI providers' `--help`, heuristically parses their model/effort
knobs, and writes them into the overlay **for review**:

```bash
vibe provider refresh             # probe all configured CLI providers
vibe provider refresh mycli       # just one
vibe provider refresh --dry-run   # show what it would add, write nothing
vibe provider refresh --force     # also replace built-in / existing overlay entries
```

It's **local only** - it runs each provider's own `--help` (no network, no API
keys) - and **gap-fills**: it never overrides a built-in spec or a hand-authored
overlay entry unless `--force`. Parsing help text is heuristic, so it writes
findings for you to confirm (the catalog view marks them `overlay`). Same action
in the UI: the "Refresh from providers" button on the Providers page, or `r` on
the shell Profiles page. (Probing cloud `/models` endpoints is intentionally not
included - that would mean egress with your key.)

## Common mistakes

- **Setting up the same provider twice.** If Claude Code is your `claude` id, don't create a `claude-pro` and `claude-haiku` row unless the flags differ. Use one provider and switch models inside the provider's own settings.
- **Assuming session reuse where there isn't any.** Only `claude-code` reports its session id back; everything else is fresh-start per call.
- **Putting a literal API key in `project.yml`.** Don't - and for `http-api` providers the schema refuses it. CLI providers authenticate through their own login flow; `http-api` providers take an `env:NAME` reference and read the key from the environment at run time.

## Related

- [Provider reference](/docs/reference/providers) - generated from `KNOWN_PROVIDERS`.
- [Extending: add a provider](/docs/extending/add-provider).
