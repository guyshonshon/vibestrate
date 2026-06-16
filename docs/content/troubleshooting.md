---
title: Troubleshooting
description: Concrete fixes for the issues people actually hit.
section: ops
slug: troubleshooting
---

When something goes wrong, find the symptom that matches yours below, then run the fix. Each entry tells you what you'll see, what's usually behind it, the command that fixes it, and how to check it worked.

## Install and setup

### `vibe: command not found` right after installing

You ran `npm install -g vibestrate` and it worked, but `vibe --version` says "command not found." This almost always means your shell's PATH doesn't include npm's global bin directory.

Find where npm puts global binaries, then add that directory to your PATH:

```bash
npm config get prefix
# Add <prefix>/bin to your PATH in ~/.zshrc or ~/.bashrc
```

To check it took, run `which vibe`. You should get a real path back.

### `vibe init` says "not a git repository"

Init refuses to run with a "not a git repository" error. Vibestrate needs git for worktree isolation, and the current directory hasn't been initialized as a git repo yet.

Initialize git, make a first commit, then init:

```bash
git init
git add -A && git commit -m "Initial commit"
vibe init
```

To check it worked, run `git rev-parse --is-inside-work-tree`. It should return `true`.

### `vibe doctor` says "no providers ready"

Doctor lists every provider as `missing` or `detected-needs-setup`. That means no coding-agent CLI is installed on your PATH, or none has a verified preset.

Install at least one coding-agent CLI:

```bash
# Claude Code: see https://docs.anthropic.com/claude/docs/claude-code
# Codex:       npm install -g @openai/codex
# Aider:       pipx install aider-chat
# Ollama:      curl -fsSL https://ollama.com/install.sh | sh
```

Then have Vibestrate find it and set it up:

```bash
vibe provider detect
vibe provider setup
vibe provider test <id>
```

To check it worked, run `vibe provider detect`. At least one provider should show confidence `ready`, or a working `detected-needs-setup` after you run `provider setup`.

## Providers

### Provider test fails with "command not found"

`vibe provider test claude` comes back with "claude: command not found." The provider's CLI isn't on the PATH of the shell Vibestrate was started from.

Add the CLI to your PATH. If you installed it through your shell, restart your terminal so the new PATH loads.

To check it worked, run `which claude` (or whichever CLI you're using). It should return a real path.

### The test passes, but real runs fail with "unexpected output"

`vibe provider test` reports success, yet actual runs end with "could not parse provider output." Usually the provider's prompt-flag preset is producing output Vibestrate can't read, because the provider changed its output format between releases.

Walk through the setup wizard again to confirm the flags:

```bash
vibe provider setup    # walk the wizard again to confirm flags
```

If the flags are right but the output format changed, file an issue with the provider's version (`<cli> --version`) and a sample of the captured output, which you'll find under `.vibestrate/runs/<runId>/outputs/`.

## Runs that won't start or stall

### Run fails right away: "validation command not configured"

The run reaches `validating`, raises "no validation commands configured," and ends in `failed`. That means `commands.validate` in `project.yml` is empty.

Set your validation commands:

```bash
vibe config set commands.validate '["pnpm typecheck"]'
# or
vibe config set commands.validate '["pnpm typecheck", "pnpm test"]'
```

To check it worked, run `vibe config get commands.validate`. It should show your array.

### Run stuck in `waiting_for_approval`

Status sits at `waiting_for_approval` and nothing is happening. A policy gate at this stage requires a human to approve it on purpose (set by `policies.requireApprovalAtStages`).

List the pending approvals and decide on one:

```bash
vibe approvals list <runId>
vibe approvals decide <runId> <approvalId> --approve   # or --reject
```

To check it worked, watch the status move back into the stage it was about to enter.

### Run stuck in `paused`

Status reads `paused`, and `vibe resume` doesn't seem to do anything. Either the orchestrator isn't running anymore (the process that owns the run ended), or the resume just hasn't reached the next polling tick yet.

If Vibestrate's process is still alive, run `vibe resume <runId>` and give it a few seconds for the next stage-boundary check.

If the process ended, start it again with `vibe run` or `vibe ui`, and the durable state gets picked up automatically.

To check it worked, run `vibe status`. The run should be transitioning out of `paused`.

### Worktree creation fails: "main branch has uncommitted changes"

The run aborts at the start with a `requireCleanMain` violation. Your `project.yml` has `git.requireCleanMain: true` and `main` has uncommitted edits.

Commit or stash your changes, then re-run:

```bash
git stash push -m "before vibe run"
vibe run "..."
```

Or, if you don't want that policy at all, turn it off:

```bash
vibe config set git.requireCleanMain false
```

To check it worked, look for the worktree under `../.vibestrate-worktrees/`.

## Notifications and dashboard

### Notifications never arrive

You set up a Slack or webhook gateway, ran a task, and got nothing. Usually the gateway is registered but disabled, the webhook URL is wrong, or the notification severity is below the gateway's threshold.

Look at your gateways and notifications:

```bash
vibe gateways list
vibe notifications list
```

Confirm the gateway is enabled and the webhook URL is reachable, then send a test:

```bash
vibe notifications test <gatewayId>
```

### A dashboard tab is blank

`vibe ui` opens, but a tab shows no data even though you have runs. Either the browser cached an older asset bundle, or the runs are in a different project root than the one `vibe ui` was started from.

Hard-reload the page (Cmd-Shift-R / Ctrl-Shift-R). Then confirm `vibe ui` is running from the project root you expect, since the dashboard reads `.vibestrate/runs/` from `cwd`.

## Worktrees left behind

### Worktree didn't get cleaned up after an abort

`vibe abort <runId>` succeeded, but `../.vibestrate-worktrees/<runId>-<slug>` is still on disk. This is by design: worktrees are preserved across `aborted`, `blocked`, and `failed` so you can inspect or copy out partial work.

When you're done with it, remove the worktree and its branch yourself:

```bash
cd your-project
git worktree remove ../.vibestrate-worktrees/<runId>-<slug>
git branch -D vibestrate/<runId>-<slug>
```

To check it worked, confirm the directory is gone.

## Next

- [Flow](/docs/concepts/flow) - the steps a run works through, where these statuses come from.
- [Crew](/docs/concepts/crew) - the workers and models behind your providers.
