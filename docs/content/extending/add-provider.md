---
title: Add a provider
description: Tell Vibestrate how to run a local coding CLI it doesn't already know, or change the flags of one it does.
slug: extending/add-provider
---

A **provider** is how Vibestrate reaches a model - almost always a command-line tool already installed on your machine. The built-in detector knows eleven: Claude Code, Codex CLI, Gemini CLI, OpenCode, Aider, Ollama, Qwen Code, Crush, Goose, Cursor CLI, and Amp. Every provider declares a type, and there are four of them:

<div class="docs-chips"><span>cli</span><span>claude-code</span><span>localhost-proxy</span><span>http-api</span></div>

If you want to use a CLI it doesn't know about, or you want to change the flags it passes to one it does know, you declare your own under `providers:` in `project.yml`. Any local CLI works: if a command takes a prompt and returns a change, Vibestrate can drive it. There is no plugin to write and no SDK to learn - you point at the binary and say how the prompt gets in.

## Declare a custom CLI provider

Add a `providers:` block to `project.yml` and describe how your tool runs. Here `my-model` is the id you're giving this provider, and `my-coding-cli` is the actual command Vibestrate will run:

```yaml
providers:
  my-model:
    type: cli
    command: my-coding-cli
    args: [--prompt-on-stdin, --no-color]
    input: stdin           # stdin | arg
```

That one field is worth a plain explanation. `input` is how the prompt reaches the CLI, and it takes one of exactly two values:

<svg viewBox="0 0 560 110" width="100%" style="max-width:560px;height:auto" role="img" aria-label="The input field takes one of two values. With stdin, the prompt is written to the command's standard input. With arg, it is passed as a command-line argument. Both routes end at the same command.">
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="1" y="1" width="168" height="44" rx="8"/>
    <rect x="1" y="65" width="168" height="44" rx="8"/>
    <rect x="392" y="1" width="167" height="108" rx="8"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.5" stroke-width="1">
    <path d="M171 23 h213"/>
    <path d="M384 19 l4 4 -4 4"/>
    <path d="M171 87 h213"/>
    <path d="M384 83 l4 4 -4 4"/>
  </g>
  <g fill="currentColor" font-size="12" font-family="ui-monospace,monospace" text-anchor="middle">
    <text x="85" y="28">input: stdin</text>
    <text x="85" y="92">input: arg</text>
    <text x="475" y="52">my-coding-cli</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="11" text-anchor="middle">
    <text x="280" y="17">written to its standard input</text>
    <text x="280" y="81">passed as a command-line argument</text>
    <text x="475" y="72">the command you named</text>
  </g>
</svg>

There is no `workingDir` to set either - Vibestrate always runs the CLI in the run worktree, the isolated copy of your repo it works in.

## Assign the provider to a role

A provider on its own doesn't do anything until a [Profile](/docs/concepts/profile) names it and a [Role](/docs/concepts/role) runs on that Profile. There is no top-level `agents:` key - roles live under `crews.<crewId>.roles`:

```yaml
providers:
  my-model:
    type: cli
    command: my-coding-cli
    args: [--prompt-on-stdin, --no-color]
    input: stdin

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

Or skip the config and use it for a single run by pointing at a Profile that names the provider:

```bash
vibe run "..." --profile my-model-default
```

## Verify it works

Check that Vibestrate sees the provider, then send it a test prompt:

```bash
vibe provider list
vibe provider test my-model
```

If the test fails, it's almost always one of these:

- The CLI expects a flag you didn't pass.
- The CLI exits non-zero when there's nothing to do. Some won't even talk without a model selected.
- `input` is wrong. Try the other one (`stdin` vs `arg`).

## Wrap Claude Code with custom flags

If what you want is Claude Code itself, but run with a custom invocation, use the `claude-code` type instead of `cli`:

```yaml
providers:
  claude-experimental:
    type: claude-code
    command: claude
    args: [-p, --model, claude-sonnet-4-6]
```

The `claude-code` type unlocks deeper integration: it can report a session id, track token usage, and resume a session.

## Point at a server instead of a binary

The other two types take an HTTP endpoint rather than a command.
`localhost-proxy` is for a server on your own machine, like Ollama or any
OpenAI-compatible local runtime. `http-api` calls a remote endpoint, and is the
one type that leaves your machine.

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

The schema draws the line for you. A `localhost-proxy` needs a `baseUrl` that
resolves to localhost; an `http-api` needs https, and must not be loopback. A
key written out in full is rejected outright, so it can't reach your git history.
[Provider (concept)](/docs/concepts/provider) has the full set of rules.

## What a provider can and can't do

A provider's job is deliberately narrow.

<div class="docs-cards">

**Can: take a prompt**
Receive a prompt, over stdin or argv.

**Can: change files**
Return text, and for editing providers, edit files in the working directory.

**Can: report usage**
Optionally report token usage and a session id on stdout in a recognized shape.

**Can't: pick its role**
A provider does not decide which agent role it's being used for. The crew config does.

**Can't: touch the worktree**
A provider does not manage the worktree. The orchestrator sets it up and points the CLI at it.

**Can't: apply its own diff**
A provider does not apply its own output as a diff. That's the executor's job, mediated by the path guard.

</div>

## Common mistakes

- **Pointing two providers at the same CLI with different flags but the same id.** Give them two distinct ids, like `claude` and `claude-fast`, so it stays clear which is which.
- **Expecting a per-provider working directory.** There isn't one to set. The orchestrator always runs the CLI in the run's worktree.
- **Putting API keys in `args`.** Don't. Use whatever auth flow the CLI itself supports.

## Going deeper

- [Provider (concept)](/docs/concepts/provider) - what a provider is and where it fits.
- [Provider reference](/docs/reference/providers) - every field and type, in full.
