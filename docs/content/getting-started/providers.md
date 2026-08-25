---
title: Set up a provider
description: Point Vibestrate at the AI coding tools you already have, from the Crew page's Providers tab.
slug: getting-started/providers
---

## In simple words

Vibestrate ships no model of its own. It hands the work to a **[[provider]]** you already have, and you need at least one before a [[task]] can run.

Open **Crew** in the sidebar, then the **Providers** tab. Every provider is a card - detected or not, configured or not - with **Set up**, **Set default** and **Test** on it.

<div class="docs-callout tip">

**Tip.** **More > Setup** gets you here in context: its third step, **Connect a model**, reports what is installed and what is missing, with a **Providers** button to this tab.

</div>

![Two provider cards. Claude Code, claude v2.1.227, marked recommended and configured, showing 1 profile uses. Codex CLI, codex v0.144.3, also configured, showing 3 profiles use. Each card offers Edit, Set default and Test.](/media/docs/scoped/provider-pair.png)

Detected, versioned, and testable from the page.

## The three kinds

<div class="docs-cards">

**A CLI you already have**
Claude Code, Codex, Gemini, Aider and seven more, already logged in.

**A model API on your key**
An https endpoint, for a model with no CLI.

**Something on this machine**
Ollama or similar, over loopback, so nothing leaves the box.

</div>

<div class="docs-callout">

**Did you know?** Vibestrate never logs you in. When a provider is not authenticated it shows you the command to run in your own terminal. The design gives it no opportunity to hold a credential.

</div>


## The Providers tab

Two tiles count what is **detected** and what is **configured**. The cards below are grouped:

- **Popular** - the five Vibestrate configures on its own: claude, codex, gemini, aider, ollama. It holds a verified invocation for each, so init and `doctor --fix` can write one of these blocks without asking for a command. Init writes one provider block, not five.
- **Optional** - detected, never auto-bound: opencode, qwen, crush, goose, cursor, amp. **Set up** wires one into this project.
- **Cloud APIs & local model servers** - **Add cloud API**, **Add local server** and **Custom CLI**, for anything that isn't a preset.

**Install** shows on a popular provider you don't have yet. **Set up** opens the editor for command, args and input, and reads **Edit** once the provider is configured. **Set default** points every default agent at it. **Test** sends a tiny no-op prompt and reads the reply; when the answer is "not logged in" the card prints the login command.

## Give the reviewer a different model

A [[role]] never names a provider. It names a [Profile](/docs/concepts/profile), and the Profile names the provider:

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

On the **Crews** tab, each role card has a **Profile (runtime)** dropdown. Point the Reviewer at a Profile on a second provider and Vibestrate records the run as `cross-model` rather than `single-profile`; [why you stay in the loop](/docs/getting-started/why-a-human) covers what that buys you.

A Profile also pins the model and the effort level, so an easy role runs on something cheap while the hard one gets your best.

## Cloud models, or local ones

**Add cloud API** and **Add local server** ask for these fields and validate before saving. The same shapes in `project.yml`:

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

Both types are checked when the config loads. An `http-api` provider is rejected if `baseUrl` isn't `https`, if it points at a loopback address (use `localhost-proxy` for that), or if `apiKey` is anything other than `env:NAME`. A `localhost-proxy` is rejected for any host other than `localhost`, `127.0.0.1` or `[::1]`.

**Test** on a cloud card costs nothing: an `http-api` provider is never called, the probe only reports whether the key's env var is set. A `localhost-proxy` does get a real prompt, because a server on your own machine is free.

<div class="docs-callout">

**Your keys stay where they are.** An installed tool keeps the login it already holds. An `http-api` provider's key sits in your shell environment, and `project.yml` keeps only the `env:NAME` reference.

</div>

## From the terminal

For a script, or a second machine set up the same way:

```bash
vibe provider detect        # what's installed, and how confident
vibe provider setup         # the same wizard, with Cloud API and
                            # Local model server among its options
vibe provider set claude    # make it the default for every agent
vibe provider test claude   # safe smoke test; prints the login command
```

`vibe provider detect` runs each known tool's `--version` and writes nothing. Three entries, one per state:

```text
✓ Claude Code - ready
  Command: claude (v2.1.4)
  Default args: -p with prompt on stdin.

! OpenCode - detected, needs setup
  Command: opencode (v0.4.2)

○ Aider - not found
  Command tried: aider
  aider is not on PATH.
```

`ready` is a popular provider, wired up without you. `detected, needs setup` is on PATH but stays opt-in until you press **Set up**, which opens the editor filled from its preset. `not found` covers a command that is not on PATH and one that failed its `--version`; the note under it says which.

There is no `--provider` flag on `vibe run`. Providers are chosen through Profiles, so `--profile` swaps one for a single run:

```bash
vibe run "..." --profile codex-default
```

Keep the seat lists the way `vibe init` wrote them: the default flow asks for `implementer`, not `executor`, so a role that drops `implementer` leaves that seat empty and the run stops before it starts.

## Related

- [Providers reference](/docs/reference/providers) - the current list, notes on each one, and the install hint.
- [Profile](/docs/concepts/profile) - the provider, model and effort a role runs at.

## Next

[The words you will meet →](/docs/getting-started/big-picture) - task, flow, seat, crew, profile and provider, defined once before you run anything.
