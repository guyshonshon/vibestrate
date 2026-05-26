---
title: Set up a provider
description: Detect installed coding-agent CLIs, configure flags, and verify each provider can be invoked.
section: getting-started
slug: getting-started/providers
---

A *provider* is any local coding-agent CLI Amaco can hand a prompt to. The built-in detector knows about Claude Code, Codex, Aider, Ollama, and OpenCode. You can add more by writing a provider config in `project.yml`.

## See what you have

```bash
amaco provider detect
```

This walks each known provider and reports:

- **ready** — Amaco ships a verified preset and can drive the CLI as-is.
- **detected-needs-setup** — the binary is on your PATH but Amaco does not ship verified prompt flags for it. Run `amaco provider setup` to fill them in.
- **missing** — the binary is not installed.

## Apply the right preset

```bash
amaco provider setup
```

The wizard walks you through every detected provider, applies the preset if one exists, and lets you test the invocation. For each provider, you'll be asked for any extra arguments (model, system prompt, etc.) and Amaco will record them under `providers.<id>` in `project.yml`.

## Verify it actually responds

```bash
amaco provider test claude
amaco provider test ollama
```

The test sends a one-shot prompt and prints the raw output. If your provider doesn't respond — or responds with an error about flags or auth — fix that before running a real task.

## Pick the default

```bash
amaco provider set claude
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
amaco run "..." --provider codex
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
amaco run "..." --effort high
```

## Install from the dashboard

Mission Control's **Providers** page has an **Install** flow for the five
popular providers (Claude Code, Gemini, Codex, Ollama, Aider). It walks you
through the exact install and login commands, then re-checks detection. Amaco
never runs those commands for you — install and login happen in your own
terminal, on your machine, with your credentials. Once detected, **Apply preset**
wires it into `project.yml` and **Test** runs a safe connectivity probe.

## Provider reference

See the [providers reference](/docs/reference/providers) for the current list, each provider's notes, and the install hint.
