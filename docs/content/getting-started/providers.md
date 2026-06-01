---
title: Set up a provider
description: Detect installed coding-agent CLIs, configure flags, and verify each provider can be invoked.
section: getting-started
slug: getting-started/providers
---

A *provider* is any local coding-agent CLI Vibestrate can hand a prompt to. The built-in detector knows about Claude Code, Codex, Aider, Ollama, and OpenCode. You can add more by writing a provider config in `project.yml`.

## See what you have

```bash
vibe provider detect
```

This walks each known provider and reports:

- **ready** — Vibestrate ships a verified preset and can drive the CLI as-is.
- **detected-needs-setup** — the binary is on your PATH but Vibestrate does not ship verified prompt flags for it. Run `vibe provider setup` to fill them in.
- **missing** — the binary is not installed.

## Apply the right preset

```bash
vibe provider setup
```

The wizard walks you through every detected provider, applies the preset if one exists, and lets you test the invocation. For each provider, you'll be asked for any extra arguments (model, system prompt, etc.) and Vibestrate will record them under `providers.<id>` in `project.yml`.

## Verify it actually responds

```bash
vibe provider test claude
vibe provider test ollama
```

The test sends a one-shot prompt and prints the raw output. If your provider doesn't respond — or responds with an error about flags or auth — fix that before running a real task.

## Pick the default

```bash
vibe provider set claude
```

This sets `agents.<role>.provider` for every role to the chosen id. You can also assign providers per role in `project.yml`:

```yaml
agents:
  planner:
    provider: claude
  executor:
    provider: codex
  reviewer:
    provider: claude
```

## Override per run

```bash
vibe run "..." --provider codex
```

This overrides the configured provider for every agent in that single run. Or use effort buckets — `low | medium | high` map to providers via `project.yml#effortMap`:

```yaml
effortMap:
  low: ollama
  medium: codex
  high: claude
```

Then:

```bash
vibe run "..." --effort high
```

## Cloud APIs and local model servers

Not every provider is a CLI. Vibestrate also drives a model over HTTP:

- **`http-api`** — a hosted cloud API (Anthropic or OpenAI). It speaks `https`
  only (never loopback), and the API key is an **env reference** (`env:NAME`) —
  the literal key never enters `project.yml`, logs, the UI, or any artifact.
  The destination is external, so egress goes to the `baseUrl` you name.
- **`localhost-proxy`** — a model server on your own machine (Ollama, LM Studio,
  vLLM). The `baseUrl` must point at `localhost` / `127.0.0.1` / `[::1]`, so
  there's no egress and no key is required.

```yaml
providers:
  cloud:
    type: http-api
    api: anthropic
    baseUrl: https://api.anthropic.com
    model: claude-sonnet-4-6
    apiKey: env:ANTHROPIC_API_KEY   # env reference only — never a literal key
    maxTokens: 4096
  local:
    type: localhost-proxy
    api: ollama
    baseUrl: http://localhost:11434
    model: qwen3.5
    maxTokens: 4096
```

`vibe provider setup` offers **Cloud API** and **Local model server** choices
that prompt for these fields and validate them before writing. These same
guards (https-only, loopback-only, env-ref key) are enforced on every write
path — a violation is refused, never silently coerced.

## Install from the dashboard

Mission Control's **Providers** page is the full management surface — nothing
about a provider requires dropping to a terminal:

- **Install** flow for the popular CLIs (Claude Code, Gemini, Codex, Ollama,
  Aider): the exact install + login commands, then a detection re-check.
  Vibestrate never runs those for you — install and login happen in your own
  terminal, with your credentials.
- **Set up / Edit** opens a type-aware editor for **every** provider type — CLI
  (command/args/input) and the HTTP-backed cloud + local providers above
  (api/baseUrl/model/key/maxTokens, plus optional headers for cloud APIs). It
  previews the exact YAML and offers **Save & test** in one place.
- **Add cloud API** / **Add local server** / **Custom CLI** create a provider
  from scratch — the dashboard can't auto-detect those, so you name and fill them.
- **Test** runs a safe connectivity probe (a cloud-API test only checks the key
  env var is set — no surprise spend), and **Set default** points every agent at it.

## Provider reference

See the [providers reference](/docs/reference/providers) for the current list, each provider's notes, and the install hint.
