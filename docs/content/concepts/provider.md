---
title: Provider
description: A local coding-agent CLI Amaco can drive. Amaco supplies the prompt; the provider supplies the model.
section: concepts
slug: concepts/provider
---

**Professional explanation.** A provider is a configured invocation of a local CLI that takes a prompt and produces a textual response (and, for editing providers, file edits). Providers are declared under `providers:` in `project.yml` as either a `cli` invocation (command, args, input mode) or a `claude-code` integration (which Amaco understands more deeply). The orchestrator runs providers through a uniform interface — capabilities like session reuse, token reporting, or session id reporting are advertised per provider.

**Simple explanation.** A provider is the actual model you're using, wrapped so Amaco can talk to it. Claude Code, Codex, Ollama — Amaco doesn't care which, as long as it's installed locally.

> **Provider vs [agent](/docs/concepts/agent):** a *provider* is the **engine** (a CLI); an *agent* is a **role** that runs on one. The same provider can back several roles, so attaching one engine can light up the whole crew.

## Why it matters

Providers are the boundary between Amaco and "the model." Amaco itself is provider-agnostic — it builds the prompt, captures the output, and routes the result. Anything model-specific (login, billing, context limits) is the provider's responsibility.

This is the design choice that makes the tool *local-first*: Amaco never holds an API key, never opens a connection to a model vendor's API directly. If your provider needs auth, you log into it the way you normally would.

## Built-in providers

| Id | Status | Notes |
|---|---|---|
| `claude` | Preset-ready | Default args: `-p` with prompt on stdin. Amaco configures Claude Code automatically. |
| `codex` | Detected, needs setup | Starter preset uses `codex exec -q`. Run `amaco provider setup`. |
| `ollama` | Detected, needs setup | Starter preset runs `ollama run qwen3.5`. You probably want to edit the model. |
| `opencode` | Detected, needs setup | No verified preset shipped. |
| `aider` | Detected, needs setup | No verified preset shipped. |

The canonical, generated list lives in the [providers reference](/docs/reference/providers).

## "Preset-ready" vs "needs setup"

Coding-agent CLIs disagree on flags — `--prompt` here, `-p` there, `exec` for some, stdin for others. When a vendor's flag set is stable enough that Amaco can drive it without surprises, that provider is marked **preset-ready**. Otherwise Amaco will detect it but won't guess flags; `amaco provider setup` walks you through the choices.

## Per-agent assignment

Agents reference providers by id:

```yaml
agents:
  planner:
    provider: claude
  executor:
    provider: codex
  reviewer:
    provider: claude
```

A single run can override every agent's provider:

```bash
amaco run "..." --provider claude
```

Or you can map effort buckets to providers globally:

```yaml
effortMap:
  low: ollama
  medium: codex
  high: claude
```

```bash
amaco run "..." --effort high   # uses claude for every agent in this run
```

## Common mistakes

- **Setting up the same provider twice.** If Claude Code is your `claude` id, don't create a `claude-pro` and `claude-haiku` row unless the flags differ. Use one provider and switch models inside the provider's own settings.
- **Assuming session reuse where there isn't any.** Only `claude-code` reports its session id back; everything else is fresh-start per call.
- **Putting API keys in `project.yml`.** Don't. Providers authenticate the way their CLI authenticates — through the vendor's own login flow.

## Related

- [Provider reference](/docs/reference/providers) — generated from `KNOWN_PROVIDERS`.
- [Extending: add a provider](/docs/extending/add-provider).
