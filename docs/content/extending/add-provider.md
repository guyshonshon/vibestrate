---
title: Add a provider
description: Configure a local CLI Amaco doesn't ship support for, or override the flags of one it does.
section: extending
slug: extending/add-provider
---

Amaco's built-in detector knows about Claude Code, Codex, Aider, Ollama, and OpenCode. To use a CLI it doesn't know about — or to override the flags of one it does — declare it under `providers:` in `project.yml`.

## A custom CLI provider

```yaml
providers:
  my-model:
    type: cli
    command: my-coding-cli
    args: [--prompt-on-stdin, --no-color]
    inputMode: stdin       # stdin | arg | both
    workingDir: .          # optional; default is the run worktree
```

Then assign it to an agent:

```yaml
agents:
  reviewer:
    provider: my-model
```

Or for a one-off run:

```bash
amaco run "..." --provider my-model
```

## Verify it

```bash
amaco provider list                 # confirms the provider is registered
amaco provider test my-model        # sends a one-shot prompt
```

If the test fails, the most common causes are:

- The CLI expects a flag you didn't pass.
- The CLI exits non-zero when there's nothing to do (some won't even talk without a model selected).
- `inputMode` is wrong — try the other one.

## A `claude-code` provider

If you're wrapping Claude Code with a custom invocation:

```yaml
providers:
  claude-experimental:
    type: claude-code
    command: claude
    args: [-p, --model, claude-sonnet-4-6]
```

The `claude-code` type unlocks deeper integration — session id reporting, token usage, session resume.

## What providers can and can't do

A provider's job is narrow:

- Receive a prompt (stdin or argv).
- Return text (and, for editing providers, edit files in the working directory).
- Optionally report token usage and a session id on stdout in a recognized shape.

Providers don't:

- Decide which agent role they're being used for.
- Manage the worktree.
- Apply their output as a diff — that's the executor's job, mediated by the path guard.

## Common mistakes

- **Pointing two providers at the same CLI with different flags but the same id.** Two distinct ids — `claude` and `claude-fast` — keep things clear.
- **Hardcoding a working directory.** Let the orchestrator set it to the worktree path.
- **Putting API keys in `args`.** Don't. Use whatever auth flow the CLI itself supports.

## Related

- [Provider (concept)](/docs/concepts/provider).
- [Provider reference](/docs/reference/providers).
