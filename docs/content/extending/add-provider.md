---
title: Add a provider
description: Tell Vibestrate how to run a local coding CLI it doesn't already know, or change the flags of one it does.
section: extending
slug: extending/add-provider
---

A **provider** is the local command-line tool that actually runs an AI model on your machine. Vibestrate's built-in detector already knows about Claude Code, Codex, Aider, Ollama, and OpenCode. If you want to use a CLI it doesn't know about, or you want to change the flags it passes to one it does know, you declare your own under `providers:` in `project.yml`.

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

A provider's job is deliberately narrow. It can:

- Receive a prompt, over stdin or argv.
- Return text, and for editing providers, edit files in the working directory.
- Optionally report token usage and a session id on stdout in a recognized shape.

A provider does not:

- Decide which agent role it's being used for.
- Manage the worktree.
- Apply its own output as a diff. That's the executor's job, mediated by the path guard.

## Common mistakes

- **Pointing two providers at the same CLI with different flags but the same id.** Give them two distinct ids, like `claude` and `claude-fast`, so it stays clear which is which.
- **Hardcoding a working directory.** Let the orchestrator set it to the worktree path.
- **Putting API keys in `args`.** Don't. Use whatever auth flow the CLI itself supports.

## Going deeper

- [Provider (concept)](/docs/concepts/provider) - what a provider is and where it fits.
- [Provider reference](/docs/reference/providers) - every field and type, in full.
