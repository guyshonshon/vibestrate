---
title: Add a provider
description: Tell Vibestrate how to run a local coding CLI it doesn't already know, or change the flags of one it does.
slug: extending/add-provider
---

## In simple words

A [[provider]] is how Vibestrate reaches a model - almost always a command-line tool already on your machine. The detector knows eleven, so most of the time you add nothing.

Open the dashboard with `vibe ui` (`127.0.0.1:4317`), go to **Crew**, and switch to the **Providers** tab. Every detected CLI is a card: **Install** if it is missing, **Set up** if it is detected but unconfigured, then **Test**, **Set default** and **Edit**. Under **Cloud APIs & local model servers** the same tab has **Add cloud API**, **Add local server** and **Custom CLI**.

You write config by hand when you want the file under version control, or when you are scripting.

<div class="docs-callout tip">

**Tip.** Check **More** > **Setup** before writing any config: its **Connect a model** step says whether a provider is already there. A tool that is one of the eleven built-ins is detected already, and five of them are configured the moment they are found.

</div>

## The four types

<div class="docs-cards">

**`claude-code`**
Claude Code specifically, with the deepest integration.

**`cli`**
Any other coding-agent CLI: a command, its args, how the prompt is fed in.

**`http-api`**
A model API on your own key, https only.

**`localhost-proxy`**
A model server on this machine, loopback only.

</div>

<div class="docs-callout">

**Did you know?** Six of the eleven built-ins are detected but need setting up once, because their flags are not stable enough across versions for Vibestrate to guess. Guessing wrong would produce a run that fails at spawn, so it asks instead.

</div>


## The Providers tab

Three sections: **Popular** (the first-class set, detected and ready to bind), **Optional** (detected, never auto-bound), and **Cloud APIs & local model servers** (anything driven over HTTP rather than a process).

Every card carries the same actions, and setting one up opens a single editor where command, args and input are composed, tested and saved together.

When a test says a provider is not authenticated, the card prints the login command and stops. Vibestrate never logs you in - you run `codex login`, or the bare command, in your own terminal.

`vibe shell` has no providers screen; its Profiles page cycles models and effort for providers already configured.

## Declare a custom CLI provider

The **Custom CLI** button writes this block for you. By hand, add `providers:` to `project.yml`. Here `my-model` is the id you give this provider, `my-coding-cli` the command Vibestrate runs:

```yaml
providers:
  my-model:
    type: cli
    command: my-coding-cli
    args: [--prompt-on-stdin, --no-color]
    input: stdin           # stdin | arg
```

`input` is how the prompt reaches the CLI, and it takes one of exactly two values:

<svg font-family="var(--font-sans)" viewBox="0 0 560 110" width="100%" style="max-width:720px;height:auto" role="img" aria-label="The input field takes one of two values. With stdin, the prompt is written to the command's standard input. With arg, it is passed as a command-line argument. Both routes end at the same command.">
  <g fill="none" stroke="var(--line-strong)" stroke-width="1.25">
    <rect fill="var(--bg-200)" x="1" y="1" width="168" height="44" rx="8"/>
    <rect fill="var(--bg-200)" x="1" y="65" width="168" height="44" rx="8"/>
    <rect fill="var(--bg-200)" x="392" y="1" width="167" height="108" rx="8"/>
  </g>
  <g fill="none" stroke="var(--fg-200)" stroke-width="2">
    <path d="M171 23 h213"/>
    <path d="M384 19 l4 4 -4 4"/>
    <path d="M171 87 h213"/>
    <path d="M384 83 l4 4 -4 4"/>
  </g>
  <g fill="var(--fg-100)" font-size="12" font-family="var(--font-mono)" text-anchor="middle">
    <text x="85" y="28">input: stdin</text>
    <text x="85" y="92">input: arg</text>
    <text x="475" y="52">my-coding-cli</text>
  </g>
  <g fill="var(--violet-soft)" font-size="11" text-anchor="middle">
    <text x="280" y="17">written to its standard input</text>
    <text x="280" y="81">passed as a command-line argument</text>
    <text x="475" y="72">the command you named</text>
  </g>
</svg>

There is no `workingDir` to set. Vibestrate always runs the CLI in the run worktree, the isolated copy of your repo it works in.

## Assign the provider to a role

A provider does nothing until a [Profile](/docs/concepts/profile) names it and a [Role](/docs/concepts/role) runs on that Profile. There is no top-level `agents:` key - roles live under `crews.<crewId>.roles`:

```yaml
profiles:
  my-model-default: { provider: my-model }

crews:
  default:
    roles:
      reviewer:
        seats: [reviewer]
        profile: my-model-default
        prompt: .vibestrate/roles/reviewer.json
        permissions: read_only
```

In the dashboard the **Crews** tab does the second half: open a crew and set `profile` on the role card. For a single run, point at a Profile that names the provider:

```bash
vibe run "..." --profile my-model-default
```

## Verify it works

**Test** on the card sends a safe prompt and reports back. From a terminal that is `vibe provider list`, then `vibe provider test my-model`.

A failing test is almost always one of these:

- The CLI expects a flag you did not pass.
- The CLI exits non-zero when there is nothing to do. Some will not talk without a model selected.
- `input` is wrong. Try the other one.

## Wrap Claude Code with custom flags

For Claude Code under a custom invocation, use the `claude-code` type instead of `cli`:

```yaml
providers:
  claude-experimental:
    type: claude-code
    command: claude
    args: [-p, --model, claude-sonnet-4-6]
```

That type unlocks deeper integration: a reported session id, tracked token usage, and session resume.

## A server instead of a binary

The other two types take an HTTP endpoint rather than a command. `localhost-proxy` is for a server on your own machine, like Ollama or any OpenAI-compatible local runtime; `http-api` calls a remote endpoint, the one type that leaves your machine. **Add local server** and **Add cloud API** write these.

```yaml
providers:
  ollama-local:
    type: localhost-proxy
    api: ollama                # or: openai
    baseUrl: http://localhost:11434
    model: qwen3.5

  anthropic-api:
    type: http-api
    api: anthropic             # or: openai
    baseUrl: https://api.anthropic.com
    model: claude-sonnet-4-6
    # an env reference, never a literal key
    apiKey: env:ANTHROPIC_API_KEY
```

The schema draws the line. A `localhost-proxy` needs a `baseUrl` resolving to localhost; an `http-api` needs https and must not be loopback. A key written out in full is rejected outright, so it cannot reach your git history.

## What a provider can and can't do

A provider's job is deliberately narrow.

<div class="docs-cards">

**Can: take a prompt**
Over stdin or argv.

**Can: change files**
Return text, and for editing providers, edit files in the working directory.

**Can: report usage**
Token usage and a session id on stdout, in a recognized shape.

**Can't: pick its role**
The crew config decides which role it is being used for.

**Can't: touch the worktree**
The orchestrator sets it up and points the CLI at it.

**Can't: apply its own diff**
That is the executor's job, mediated by the path guard.

</div>

## Common mistakes

- **Two providers on the same CLI sharing an id.** Give them distinct ids, like `claude` and `claude-fast`.
- **Putting API keys in `args`.** Use whatever auth flow the CLI itself supports.

## Related

- [Provider (concept)](/docs/concepts/provider) - what a provider is and where it fits.
- [Provider reference](/docs/reference/providers) - every field and type, in full.
