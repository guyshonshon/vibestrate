---
title: Set up a provider
description: Tell Vibestrate which AI coding tools you have, then check each one can do the work.
slug: getting-started/providers
---

A **provider** is what actually runs the model. Vibestrate ships no model of its own, so at least one provider has to be configured before a Task can run. A provider is one of three kinds.

<div class="docs-cards">

**A coding CLI on your machine.** Claude Code, Codex CLI, Gemini CLI, OpenCode, Aider, Ollama, Qwen Code, Crush, Goose, Cursor CLI and Amp are recognised by name. Each handles its own authentication, by its own login or its own API-key variable.

**A model API you hold the key for** (`http-api`). Anthropic or OpenAI wire format, over `https` only. The key is an environment reference like `env:ANTHROPIC_API_KEY`, never a literal in a file.

**A model server on your own machine** (`localhost-proxy`). Ollama, LM Studio, vLLM. Loopback addresses only, so nothing leaves your computer, and no key is needed.

</div>

A Role never names a provider. It points at a [Profile](/docs/concepts/profile), and the Profile names the provider - which is how two roles in one Crew end up on two different providers.

Setting one up is two steps: tell Vibestrate it is there, then confirm it answers.

## See what you have

```bash
vibe provider detect
```

It runs each known tool's `--version` and reports one of three states. Nothing is written.

<div class="docs-outcomes">
<div class="docs-outcome ok"><b>ready</b><span>Installed, and Vibestrate already knows the flags. Five providers land here: claude, codex, gemini, aider, ollama.</span></div>
<div class="docs-outcome warn"><b>detected, needs setup</b><span>Installed, but the flags are not preset. Run vibe provider setup to pick them.</span></div>
<div class="docs-outcome stop"><b>not found</b><span>The command is not on PATH. The output carries the install hint.</span></div>
</div>

Two entries from a real list:

```text
✓ Claude Code - ready
  Command: claude (v2.1.4)
  Default args: -p with prompt on stdin.

○ Aider - not found
  Command tried: aider
  aider is not on PATH.
```

## Set it up and test it

```bash
vibe provider setup
```

The wizard walks through each tool it found, fills in the known settings, asks for any extras you want (like which model or system prompt), and lets you test the call. Your answers are saved under `providers.<id>` in `project.yml`, the file that holds your project's settings.

To check a provider really responds, send it a prompt and read the reply:

```bash
vibe provider test claude
vibe provider test ollama
```

If it errors out about flags or login, fix that before running a real task.

## Choose which one does the work

Point every Profile at one provider, which moves every role with them:

```bash
vibe provider set claude
```

There is no `--provider` flag on `vibe run`. A run picks its providers through [Profiles](/docs/concepts/profile), never by naming a provider directly. `--profile` overrides the Profile for every seated step in that one run:

```bash
vibe run "..." --profile codex-default
```

You can also give each role its own provider, so different steps use different tools. Roles live under `crews.<crewId>.roles`, each pointing at a Profile, and a Profile names the provider:

<svg viewBox="0 0 560 112" width="100%" style="max-width:560px;height:auto" role="img" aria-label="Two roles in one crew point at two profiles, and each profile names its own provider: the executor role runs on codex, the reviewer role on claude.">
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="1" y="22" width="150" height="36" rx="8"/>
    <rect x="195" y="22" width="170" height="36" rx="8"/>
    <rect x="409" y="22" width="150" height="36" rx="8"/>
    <rect x="1" y="68" width="150" height="36" rx="8"/>
    <rect x="195" y="68" width="170" height="36" rx="8"/>
    <rect x="409" y="68" width="150" height="36" rx="8"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.5" stroke-width="1">
    <path d="M151 40 H185"/>
    <path d="M365 40 H399"/>
    <path d="M151 86 H185"/>
    <path d="M365 86 H399"/>
  </g>
  <g fill="currentColor" fill-opacity="0.5">
    <polygon points="185,36.5 190,40 185,43.5"/>
    <polygon points="399,36.5 404,40 399,43.5"/>
    <polygon points="185,82.5 190,86 185,89.5"/>
    <polygon points="399,82.5 404,86 399,89.5"/>
  </g>
  <g fill="currentColor" text-anchor="middle">
    <text x="76" y="12" font-size="11" fill-opacity="0.5">role</text>
    <text x="280" y="12" font-size="11" fill-opacity="0.5">profile</text>
    <text x="484" y="12" font-size="11" fill-opacity="0.5">provider</text>
    <text x="76" y="45" font-size="12" font-family="ui-monospace,monospace">executor</text>
    <text x="280" y="45" font-size="12" font-family="ui-monospace,monospace">codex-default</text>
    <text x="484" y="45" font-size="12" font-family="ui-monospace,monospace">codex</text>
    <text x="76" y="91" font-size="12" font-family="ui-monospace,monospace">reviewer</text>
    <text x="280" y="91" font-size="12" font-family="ui-monospace,monospace">claude-default</text>
    <text x="484" y="91" font-size="12" font-family="ui-monospace,monospace">claude</text>
  </g>
</svg>

```yaml
profiles:
  claude-default: { provider: claude }
  codex-default:  { provider: codex }

crews:
  default:
    roles:
      executor:
        seats: [implementer, executor, builder]
        profile: codex-default
        prompt: .vibestrate/roles/executor.json
        permissions: code_write
      reviewer:
        seats: [reviewer, challenger]
        profile: claude-default
        prompt: .vibestrate/roles/reviewer.json
        permissions: read_only
```

Keep the seat lists as `vibe init` wrote them. The default flow asks for `implementer`, not `executor`, so a role that drops `implementer` from its seats leaves that seat unfilled and the run stops before it starts.

That split is the point of having two providers: the builder and the reviewer become different models, and the run is recorded as `cross-model` rather than `single-profile`. [Why a human stays in the loop](/docs/getting-started/why-a-human) covers what that changes.

To pick by how much horsepower a step needs, give your roles different [Profiles](/docs/concepts/profile). A Profile pins the provider, model and effort, so a quick role runs on a cheap model and a hard one on your best.

## Models over the internet or on your own machine

Not every provider is an installed tool. Vibestrate can also reach a model directly:

```yaml
providers:
  cloud:
    type: http-api
    api: anthropic
    baseUrl: https://api.anthropic.com
    model: claude-sonnet-4-6
    # an env reference only - never a literal key
    apiKey: env:ANTHROPIC_API_KEY
    maxTokens: 4096
  local:
    type: localhost-proxy
    api: ollama
    baseUrl: http://localhost:11434
    model: qwen3.5
    maxTokens: 4096
```

Each type is checked when the config loads. `http-api` refuses a `baseUrl` that is not `https`, refuses a loopback address (use `localhost-proxy` for that), and refuses a literal key: `apiKey` has to match `env:NAME`. `localhost-proxy` refuses any host that is not `localhost`, `127.0.0.1` or `[::1]`.

<div class="docs-callout">

**Your keys live where they always did.** For an installed tool, Vibestrate uses the login that tool already holds. For an `http-api` provider, the key sits in your shell environment and `project.yml` stores only the `env:NAME` reference. Either way, Vibestrate never copies the secret into its own files.

</div>

`vibe provider setup` offers **Cloud API** and **Local model server** choices that prompt for these fields and check them before saving. A bad value is refused, never quietly accepted.

Prefer not to use the terminal? Mission Control's Crew page has a **Providers** tab that does all of this - install hints, setup, testing, and setting a default - from the dashboard.

## Going deeper

- [Providers reference](/docs/reference/providers) - the current list, notes on each one, and the install hint.
- The dashboard's Providers tab also adds providers from scratch (cloud API, local server, custom CLI) and runs a safe connectivity probe that checks a cloud key without spending anything.
