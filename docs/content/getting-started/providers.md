---
title: Set up a provider
description: Tell Vibestrate which AI coding tools you have, then check each one can do the work.
section: getting-started
slug: getting-started/providers
---

A *provider* is the AI tool that actually does the work. It can be a coding assistant already installed on your machine - Claude Code, Codex, Gemini, Aider, Ollama, OpenCode, and others - or a model Vibestrate reaches over the internet. Setting one up is two steps: tell Vibestrate it's there, then confirm it answers.

<div class="docs-chips">
<span>Claude Code</span><span>Codex</span><span>Gemini</span><span>Aider</span><span>Ollama</span><span>OpenCode</span>
</div>

## See what you have

```bash
vibe provider detect
```

This checks each tool Vibestrate knows about and reports where it stands in one of three states:

<div class="docs-outcomes">
<div class="docs-outcome ok"><b>ready</b><span>Vibestrate knows how to drive it and you can use it now.</span></div>
<div class="docs-outcome warn"><b>detected-needs-setup</b><span>The tool is installed, but Vibestrate doesn't yet know the right flags to talk to it. Run vibe provider setup.</span></div>
<div class="docs-outcome stop"><b>missing</b><span>It isn't installed.</span></div>
</div>

## Set it up and test it

```bash
vibe provider setup
```

The wizard walks through each tool it found, fills in the known settings, asks for any extras you want (like which model or system prompt), and lets you test the call. Your answers are saved under `providers.<id>` in `project.yml`, the file that holds your project's settings.

To check a provider really responds, send it a quick prompt and read the reply:

```bash
vibe provider test claude
vibe provider test ollama
```

If it errors out about flags or login, fix that before running a real task.

## Choose which one does the work

Point every step at one provider:

```bash
vibe provider set claude
```

There is no `--provider` flag on `vibe run` - a run picks its providers through [Profiles](/docs/concepts/profile), not by naming a provider directly. Override it for a single run by pointing at a Profile that names the provider you want:

```bash
vibe run "..." --profile codex-default
```

You can also assign a provider per role in `project.yml`, so different steps use different tools. Roles live under `crews.<crewId>.roles`, each pointing at a Profile, and a Profile names the provider:

```yaml
profiles:
  claude-default: { provider: claude }
  codex-default:  { provider: codex }

crews:
  default:
    roles:
      planner:  { seats: [planner],  profile: claude-default, prompt: .vibestrate/roles/planner.md,  permissions: read_only }
      executor: { seats: [executor], profile: codex-default,  prompt: .vibestrate/roles/executor.md, permissions: code_write }
      reviewer: { seats: [reviewer], profile: claude-default, prompt: .vibestrate/roles/reviewer.md, permissions: read_only }
```

To pick by how much horsepower a task needs, give your crew roles different [Profiles](/docs/concepts/profile) - a Profile pins the provider, model, and effort, so a quick role can run on a cheap model and a hard one on your best.

## Models over the internet or on your own machine

Not every provider is an installed tool. Vibestrate can also reach a model directly:

- **`http-api`** - a hosted service like Anthropic or OpenAI. It uses a secure (`https`) connection only, and your API key stays in an environment variable (`env:NAME`), a named slot in your shell. The literal key never lands in `project.yml`, logs, the dashboard, or any saved file.
- **`localhost-proxy`** - a model running on your own machine (Ollama, LM Studio, vLLM). The address must be `localhost`, so nothing leaves your computer and no key is needed.

<div class="docs-callout">

**Your keys live where they always did.** For an installed tool, Vibestrate uses the login that tool already holds (Claude Code, Codex, and the rest keep their own credentials). For an `http-api` provider, the key sits in your shell environment and `project.yml` only stores the `env:NAME` reference. Either way, Vibestrate never copies the secret into its own files.

</div>

```yaml
providers:
  cloud:
    type: http-api
    api: anthropic
    baseUrl: https://api.anthropic.com
    model: claude-sonnet-4-6
    apiKey: env:ANTHROPIC_API_KEY   # env reference only - never a literal key
    maxTokens: 4096
  local:
    type: localhost-proxy
    api: ollama
    baseUrl: http://localhost:11434
    model: qwen3.5
    maxTokens: 4096
```

`vibe provider setup` offers **Cloud API** and **Local model server** choices that prompt for these fields and check them before saving. A bad value is refused, never quietly accepted.

Prefer not to use the terminal? Mission Control's Crew page has a **Providers** tab that does all of this - install hints, setup, testing, and setting a default - from the dashboard.

## Going deeper

- [Providers reference](/docs/reference/providers) - the current list, notes on each one, and the install hint.
- The dashboard's Providers tab also adds providers from scratch (cloud API, local server, custom CLI) and runs a safe connectivity probe that checks a cloud key without spending anything.
