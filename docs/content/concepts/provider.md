---
title: Provider
description: A local coding-agent CLI Vibestrate can drive. Vibestrate supplies the prompt; the provider supplies the model.
section: concepts
slug: concepts/provider
---

**Professional explanation.** A provider is a configured invocation of a local CLI that takes a prompt and produces a textual response (and, for editing providers, file edits). Providers are declared under `providers:` in `project.yml` as either a `cli` invocation (command, args, input mode) or a `claude-code` integration (which Vibestrate understands more deeply). The orchestrator runs providers through a uniform interface — capabilities like session reuse, token reporting, or session id reporting are advertised per provider.

**Simple explanation.** A provider is the actual model you're using, wrapped so Vibestrate can talk to it. Claude Code, Codex, Ollama — Vibestrate doesn't care which, as long as it's installed locally.

> **Provider vs [[profile]] vs [[role]]:** a *Provider* is the installed **CLI**;
> a *Profile* names a Provider plus how strong/expensive to run it; a *Role*
> runs on a Profile. Roles never point at a Provider directly — they go through a
> Profile. One Provider backs many Profiles; one Profile backs many Roles.

## Why it matters

Providers are the boundary between Vibestrate and "the model." Vibestrate itself is provider-agnostic — it builds the prompt, captures the output, and routes the result. Anything model-specific (login, billing, context limits) is the provider's responsibility.

This is what makes the tool *local-first* — where local-first means **sovereignty, not zero-egress**: there is no Vibestrate-operated backend or relay; you run an independent tool you fully control. Most providers are local CLIs that own their own auth and egress. You *may* also point a provider at a model API with your own key (see **Non-CLI providers** below) — that's your sovereign choice and doesn't change the local-first guarantee, because nothing ever flows through a service *we* run.

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

Coding-agent CLIs disagree on flags — `--prompt` here, `-p` there, `exec` for some, stdin for others. When a vendor's flag set is stable enough that Vibestrate can drive it without surprises, that provider is marked **preset-ready**. Otherwise Vibestrate will detect it but won't guess flags; `vibe provider setup` walks you through the choices.

If a preset is wrong for your installed version (e.g. a flag the CLI removed), you can correct `command`/`args`/`input` directly — either with `vibe provider setup`, by hand-editing `.vibestrate/project.yml`, or in the dashboard's **Providers** page, which has an inline editor with a Save & test loop and a Remove action. The CLI and the dashboard can do exactly the same things.

## Non-CLI providers (HTTP)

Beyond local CLIs, two HTTP-backed provider types let you run a model over the network:

```yaml
providers:
  # Cloud API — your own key, external destination.
  anthropic-api:
    type: http-api
    api: anthropic                 # or: openai
    baseUrl: https://api.anthropic.com
    model: claude-sonnet-4-5
    apiKey: env:ANTHROPIC_API_KEY   # env-ref ONLY — never a literal key

  # Local model server — no key, no egress.
  ollama-local:
    type: localhost-proxy
    api: ollama                     # or: openai (OpenAI-compatible servers)
    baseUrl: http://localhost:11434
    model: qwen3.5
```

Rules the schema enforces:

- **`http-api`** must be **https** and **not** a localhost host; its `apiKey` must be an `env:NAME` reference (a literal key in config is rejected). The key is resolved at call time, never written to YAML, never logged, and redacted from any error. The dashboard marks these providers **external**.
- **`localhost-proxy`** must point at a loopback host (`localhost` / `127.0.0.1` / `[::1]`) — so there is **no egress**. A key is optional.

Both report **real token usage** from the API response (not estimates). They run one request per turn — no session reuse.

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

(Provider commands — `vibe provider list/setup/test` — manage the raw tools
only. Profiles and Crews are edited in `project.yml`, the dashboard, or the API.)

## Common mistakes

- **Setting up the same provider twice.** If Claude Code is your `claude` id, don't create a `claude-pro` and `claude-haiku` row unless the flags differ. Use one provider and switch models inside the provider's own settings.
- **Assuming session reuse where there isn't any.** Only `claude-code` reports its session id back; everything else is fresh-start per call.
- **Putting a literal API key in `project.yml`.** Don't — and for `http-api` providers the schema refuses it. CLI providers authenticate through their own login flow; `http-api` providers take an `env:NAME` reference and read the key from the environment at run time.

## Related

- [Provider reference](/docs/reference/providers) — generated from `KNOWN_PROVIDERS`.
- [Extending: add a provider](/docs/extending/add-provider).
