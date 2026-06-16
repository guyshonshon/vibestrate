---
title: Add a provider
description: Tell Vibestrate how to run a local coding CLI it doesn't already know, or change the flags of one it does.
section: extending
slug: extending/add-provider
---

A **provider** is the local command-line tool that actually runs an AI model on your machine. Vibestrate's built-in detector already knows about these five:

<div class="docs-chips"><span>Claude Code</span><span>Codex</span><span>Aider</span><span>Ollama</span><span>OpenCode</span></div>

If you want to use a CLI it doesn't know about, or you want to change the flags it passes to one it does know, you declare your own under `providers:` in `project.yml`.

<div class="docs-callout">

**Any local CLI works.** If a command takes a prompt and returns a change, Vibestrate can drive it. There is no plugin to write and no SDK to learn. You point at the binary, say how the prompt gets in, and that is the whole contract.

</div>

This guide walks through that, start to finish.

## Declare a custom CLI provider

Add a `providers:` block to `project.yml` and describe how your tool runs. Here `my-model` is the id you're giving this provider, and `my-coding-cli` is the actual command Vibestrate will run:

```yaml
providers:
  my-model:
    type: cli
    command: my-coding-cli
    args: [--prompt-on-stdin, --no-color]
    inputMode: stdin       # stdin | arg | both
    workingDir: .          # optional; default is the run worktree
```

A couple of those fields are worth a plain explanation:

- `inputMode` is how the prompt reaches the CLI. `stdin` pipes it in, `arg` passes it as a command-line argument, and `both` does each.
- `workingDir` is the folder the CLI runs in. You can leave it out. By default Vibestrate runs the CLI in the run worktree, the isolated copy of your repo it works in.

## Assign the provider to an agent

A provider on its own doesn't do anything until something uses it. Point an agent at it by id:

```yaml
agents:
  reviewer:
    provider: my-model
```

Or skip the config and use it for a single run:

```bash
vibe run "..." --provider my-model
```

## Verify it works

Check that Vibestrate sees the provider, then send it a test prompt:

```bash
vibe provider list                 # confirms the provider is registered
vibe provider test my-model        # sends a one-shot prompt
```

If the test fails, it's almost always one of these:

- The CLI expects a flag you didn't pass.
- The CLI exits non-zero when there's nothing to do. Some won't even talk without a model selected.
- `inputMode` is wrong. Try the other one.

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
- **Hardcoding a working directory.** Let the orchestrator set it to the worktree path.
- **Putting API keys in `args`.** Don't. Use whatever auth flow the CLI itself supports.

## Going deeper

- [Provider (concept)](/docs/concepts/provider) - what a provider is and where it fits.
- [Provider reference](/docs/reference/providers) - every field and type, in full.
