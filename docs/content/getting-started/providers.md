---
title: Set up a provider
description: Tell Vibestrate which AI coding tools you have, then check that each one answers.
slug: getting-started/providers
---

## In simple words

Vibestrate does not ship a model of its own. It hands the work to something you already have, and that something is a **[[provider]]**.

You need at least one before a [[task]] can run.

![Two provider cards. Claude Code, claude v2.1.227, marked recommended and configured, showing 1 profile uses. Codex CLI, codex v0.144.3, also configured, showing 3 profiles use. Each card offers Edit, Set default and Test.](/media/docs/scoped/provider-pair.png)

Detected, versioned, and testable from the page.

<div class="docs-callout tip">

**Tip.** Run `vibe doctor` first. It finds what is installed, says which ones need a one-time setup, and prints the exact login command for anything not authenticated - which you run yourself, in your own terminal.

</div>

## The three kinds

<div class="docs-cards">

**A CLI you already have**
Claude Code, Codex, Gemini, Aider and seven more. Already logged in, already yours.

**A model API on your key**
An https endpoint, for a model with no CLI.

**Something on this machine**
Ollama or similar, over loopback, so nothing leaves the box.

</div>

<div class="docs-callout">

**Did you know?** Vibestrate never logs you in. When a provider is not authenticated it shows you the command to run yourself. That is why your credentials never pass through it: the design gives it no opportunity to hold one.

</div>


## Going deeper

### See what you have

```bash
vibe provider detect
```

That runs each known tool's `--version` and reports one of three states. It writes nothing.

<div class="docs-outcomes">
<div class="docs-outcome ok"><b>ready</b><span>Installed, and Vibestrate already knows the flags to use. Five land here: claude, codex, gemini, aider, ollama.</span></div>
<div class="docs-outcome warn"><b>detected, needs setup</b><span>Installed, but Vibestrate has no preset flags for it. Run vibe provider setup to choose them.</span></div>
<div class="docs-outcome stop"><b>not found</b><span>The command isn't on your PATH. The output tells you how to install it.</span></div>
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

### Set it up and test it

```bash
vibe provider setup
```

The wizard walks you through each tool it found, fills in the settings it already knows, asks about any extras you want (which model, a system prompt), and offers to test the call. It saves your answers under `providers.<id>` in `project.yml`, the file that holds your project's settings.

To confirm a provider answers, send it a prompt and read the reply:

```bash
vibe provider test claude
vibe provider test ollama
```

If it complains about flags or a login, fix that before you start a real task.

### Choose which one does the work

Point every Profile at a single provider, and every role moves with them:

```bash
vibe provider set claude
```

There is no `--provider` flag on `vibe run`. You choose providers through [Profiles](/docs/concepts/profile), never by naming a provider directly. `--profile` swaps the Profile for every seated step in that one run:

```bash
vibe run "..." --profile codex-default
```

You can also give each role its own provider, so different steps run on different tools. Roles live under `crews.<crewId>.roles`, each one pointing at a Profile, and each Profile naming a provider:

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

Keep the seat lists the way `vibe init` wrote them. The default flow asks for `implementer`, not `executor`, so a role that drops `implementer` from its seats leaves that seat empty and the run stops before it starts.

That split is the payoff of two providers. Your builder and reviewer are different models, and Vibestrate records the run as `cross-model` rather than `single-profile`. [Why a human stays in the loop](/docs/getting-started/why-a-human) covers what that changes.

Different [Profiles](/docs/concepts/profile) also let you match a step to the horsepower it needs. A Profile pins the provider, model and effort, so an easy role runs on a cheap model while the hard one gets your best.

### Cloud models, or local ones

Not every provider is a tool you installed. Vibestrate can talk to a model over HTTP instead:

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

Vibestrate checks both types when the config loads. It rejects an `http-api` provider whose `baseUrl` isn't `https`, one that points at a loopback address (use `localhost-proxy` for that), and one whose `apiKey` is anything other than `env:NAME`. For `localhost-proxy` it rejects any host other than `localhost`, `127.0.0.1` or `[::1]`.

<div class="docs-callout">

**Your keys stay where they are.** With an installed tool, Vibestrate leans on the login that tool already holds. With an `http-api` provider, the key sits in your shell environment and `project.yml` keeps only the `env:NAME` reference. Either way, Vibestrate never copies the secret into its own files.

</div>

`vibe provider setup` has **Cloud API** and **Local model server** options that ask for these fields and check them before saving, so a bad value comes back as an error.

If you'd rather stay out of the terminal, Mission Control's Crew page has a **Providers** tab for all of this - install hints, setup, testing, and picking a default.

### Going deeper

- [Providers reference](/docs/reference/providers) - the current list, notes on each one, and the install hint.
- The dashboard's Providers tab can also add a provider from scratch (cloud API, local server, custom CLI) and run a connectivity probe that checks a cloud key without spending anything.

### Next

[The words you will meet →](/docs/getting-started/big-picture) - task, flow, seat, crew, profile and provider, defined once before you run anything.
