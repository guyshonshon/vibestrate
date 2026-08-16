---
title: Troubleshooting
description: Concrete fixes for the issues people actually hit.
slug: troubleshooting
---

Find the symptom that matches yours below, then run the fix. Read the failure message first - most now name themselves: a failed supervisor turn gives its reason, a cut-short one says it was stopped, and an effort level your provider does not have is refused with that provider's real ladder in the message.

<div class="docs-callout">

**Start with `vibe doctor`.** It checks your install, your providers and your config in one pass, and most fixes below begin from what it reports.

</div>

## Install and setup

### `vibe: command not found` right after installing

You ran `npm install -g vibestrate` and it worked, but `vibe --version` says "command not found." This almost always means your shell's PATH doesn't include npm's global bin directory. Find where npm puts global binaries, then add that directory to your PATH:

```bash
npm config get prefix
# then add <prefix>/bin to your PATH
# in ~/.zshrc or ~/.bashrc
```

To check it took, run `which vibe`. You should get a real path back.

### `vibe init` says "not a git repository"

Init refuses to run with a "not a git repository" error: Vibestrate needs git for worktree isolation, and the current directory hasn't been initialized as a git repo yet. Initialize git, make a first commit, then init:

```bash
git init
git add -A && git commit -m "Initial commit"
vibe init
```

To check it worked, run `git rev-parse --is-inside-work-tree`. It should return `true`.

### `vibe doctor` says "no providers ready"

Doctor lists every provider as `missing` or `detected-needs-setup`: no coding-agent CLI is installed on your PATH, or none has a verified preset. Install at least one:

```bash
npm install -g @anthropic-ai/claude-code
npm install -g @openai/codex
npm install -g @google/gemini-cli
python -m pip install aider-install && aider-install
curl -fsSL https://ollama.com/install.sh | sh
```

Run the CLI once afterwards to sign in - `codex login` for Codex, the bare
command for the others. Aider and Ollama are different: Aider reads
`OPENAI_API_KEY` or `ANTHROPIC_API_KEY` from your environment, and Ollama needs
no login but does need a model pulled first.

Then have Vibestrate find it and set it up:

```bash
vibe provider detect
vibe provider setup
vibe provider test <id>
```

To check it worked, run `vibe provider detect`. At least one provider should show confidence `ready`, or a working `detected-needs-setup` after you run `provider setup`.

## Providers

### Provider test fails with "command not found"

`vibe provider test claude` comes back with "claude: command not found." The provider's CLI isn't on the PATH of the shell Vibestrate was started from. Add the CLI to your PATH. If you installed it through your shell, restart your terminal so the new PATH loads.

To check it worked, run `which claude` (or whichever CLI you're using). It should return a real path.

### The test passes, but real runs fail with "unexpected output"

`vibe provider test` reports success, yet actual runs end with "could not parse provider output." Usually the provider's prompt-flag preset is producing output Vibestrate can't read, because the provider changed its output format between releases. Walk through the setup wizard again to confirm the flags:

```bash
vibe provider setup
```

If the flags are right but the output format changed, file an issue with the provider's version (`<cli> --version`) and a sample of the captured output, which you'll find under `.vibestrate/runs/<runId>/artifacts/flows/<step-id>/output.md`.

## Runs that won't start or stall

### Runs finish, but nothing was actually checked

The run's validation section reads "No validation commands configured," and `vibe doctor` warns about it. That means `commands.validate` in `project.yml` is empty. The run does not fail - Vibestrate works without validation commands - but the review is much weaker, because nothing factual sits between the executor and the reviewer. Fill it in:

```bash
# adds the commands it detected for your project
vibe doctor --fix

# or set them yourself
vibe config set commands.validate \
  '["pnpm typecheck", "pnpm test"]'
```

To check it worked, run `vibe config get commands.validate`. It should show your array.

### Run stuck in `waiting_for_approval`

Status sits at `waiting_for_approval` and nothing is happening. A policy gate at this stage requires a human to approve it on purpose (set by `policies.requireApprovalAtStages`). List the pending approvals and decide on one:

```bash
vibe approvals list <runId>
vibe approvals approve <runId> <approvalId>
# or: reject / request-changes --guidance "..."
```

To check it worked, watch the status move back into the stage it was about to enter.

### Run stuck in `paused`

Status reads `paused`, and `vibe resume` doesn't seem to do anything. Either the orchestrator isn't running anymore (the process that owns the run ended), or the resume just hasn't reached the next polling tick yet. If Vibestrate's process is still alive, run `vibe resume <runId>` and give it a few seconds for the next stage-boundary check.

If the process ended, start it again with `vibe run` or `vibe ui`, and the durable state gets picked up automatically.

To check it worked, run `vibe status`. The run should be transitioning out of `paused`.

### Worktree creation fails: "main branch has uncommitted changes"

The run aborts at the start with a `requireCleanMain` violation: your `project.yml` has `git.requireCleanMain: true` and `main` has uncommitted edits. Commit or stash your changes, then re-run:

```bash
git stash push -m "before vibe run"
vibe run "..."
```

Or, if you don't want that policy at all, turn it off:

```bash
vibe config set git.requireCleanMain false
```

To check it worked, look for the worktree under `../.vibestrate-worktrees/`.

## The Supervisor panel

### The answer is a reason instead of an answer

Two different messages, two different situations.

**"I could not answer that:" plus a reason.** The turn reached the provider and failed - no provider installed, a policy refusing the effect, the daily spend cap, or a reply Vibestrate could not parse. The reason is the underlying error with your home directory path stripped out, stored in the thread, so it survives a reload. Fix what the reason names; `vibe doctor` covers the provider and config half of that list.

**"Stopped before I got to an answer."** Nothing broke - the turn was cut short before it produced anything. You get this when you press Stop, and also when the connection to the panel closes, so reloading the page or restarting `vibe ui` mid-answer both do it. Whatever had already been written is kept. Ask again.

### An effort level your provider does not have

Asking the panel for one is refused before the turn starts, and the message lists that provider's real ladder:

| Provider | Effort levels it accepts |
|---|---|
| `claude` | low, medium, high, xhigh, max |
| `codex` | minimal, low, medium, high, xhigh |
| `gemini` | none - its reasoning is a numeric thinking budget rather than a flag |

Pick a level the message names, or run `vibe provider catalog` to see what each provider offers.

Everywhere else an unknown level is passed through and quietly ignored rather than refused. In a run, a Profile whose `power` the provider will not honor does not stop the turn: Vibestrate records a `provider.effort_ignored` event once per provider and level - "Effort ... won't take effect on codex ... - the provider ignores it" - and carries on. `vibe consult --effort` behaves the same way, without the event. If an effort setting seems to make no difference, that is why.

## Notifications and dashboard

### Notifications never arrive

A task finished but you saw nothing. Notifications are delivered to local gateways only (in-app and CLI, no external Slack/webhook gateways) - usually a gateway is disabled, the notification severity is below the gateway's threshold, or notifications are off in settings. Look at your gateways and the feed:

```bash
vibe gateways list
vibe notifications list
```

Confirm the gateway is enabled, then send a test through it:

```bash
vibe notifications test <gatewayId>
```

### A dashboard tab is blank

`vibe ui` opens, but a tab shows no data even though you have runs. Either the browser cached an older asset bundle, or the runs are in a different project root than the one `vibe ui` was started from. Hard-reload the page (Cmd-Shift-R / Ctrl-Shift-R), then confirm `vibe ui` is running from the project root you expect, since the dashboard reads `.vibestrate/runs/` from `cwd`.

## Worktrees left behind

### Worktree didn't get cleaned up after an abort

`vibe abort <runId>` succeeded, but `../.vibestrate-worktrees/<runId>` is still on disk. This is by design: worktrees are preserved across `aborted`, `blocked`, and `failed` so you can inspect or copy out partial work. When you're done with it, remove the worktree and its branch yourself:

```bash
cd your-project
git worktree remove ../.vibestrate-worktrees/<runId>
git branch -D vibestrate/<runId>
```

To check it worked, confirm the directory is gone.

## Next

- [Flow](/docs/concepts/flow) - the steps a run works through, where these statuses come from.
- [Crew](/docs/concepts/crew) - the workers and models behind your providers.
