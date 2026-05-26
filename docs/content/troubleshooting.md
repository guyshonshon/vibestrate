---
title: Troubleshooting
description: Concrete fixes for the issues people actually hit.
section: ops
slug: troubleshooting
---

Each entry lists symptoms, likely cause, fix, and how to verify.

---

## Install failed: `amaco: command not found`

**Symptoms:** `npm install -g amaco` succeeded, but `amaco --version` returns "command not found."

**Likely cause:** Your shell's PATH doesn't include npm's global bin directory.

**Fix:**

```bash
npm config get prefix
# Add <prefix>/bin to your PATH in ~/.zshrc or ~/.bashrc
```

**Verify:** `which amaco` returns a real path.

---

## `amaco init` fails: not a git repository

**Symptoms:** Init refuses to run with a "not a git repository" error.

**Likely cause:** Amaco needs git for worktree isolation. The current directory isn't initialized.

**Fix:**

```bash
git init
git add -A && git commit -m "Initial commit"
amaco init
```

**Verify:** `git rev-parse --is-inside-work-tree` returns `true`.

---

## `amaco doctor` reports "no providers ready"

**Symptoms:** Doctor lists all providers as `missing` or `detected-needs-setup`.

**Likely cause:** No coding-agent CLI is installed on PATH, or none has a verified preset.

**Fix:** Install at least one:

```bash
# Claude Code: see https://docs.anthropic.com/claude/docs/claude-code
# Codex:       npm install -g @openai/codex
# Aider:       pipx install aider-chat
# Ollama:      curl -fsSL https://ollama.com/install.sh | sh
```

Then:

```bash
amaco provider detect
amaco provider setup
amaco provider test <id>
```

**Verify:** `amaco provider detect` shows at least one provider with confidence `ready` or a working `detected-needs-setup` after `provider setup`.

---

## Run starts then immediately fails: "validation command not configured"

**Symptoms:** The run reaches `validating`, raises "no validation commands configured", and ends in `failed`.

**Likely cause:** `commands.validate` in `project.yml` is empty.

**Fix:**

```bash
amaco config set commands.validate '["pnpm typecheck"]'
# or
amaco config set commands.validate '["pnpm typecheck", "pnpm test"]'
```

**Verify:** `amaco config get commands.validate` shows your array.

---

## Run stuck in `waiting_for_approval`

**Symptoms:** Status is `waiting_for_approval` and nothing's happening.

**Likely cause:** A policy gate at this stage requires explicit human approval (per `policies.requireApprovalAtStages`).

**Fix:**

```bash
amaco approvals list <runId>
amaco approvals decide <runId> <approvalId> --approve   # or --reject
```

**Verify:** Status transitions back to the stage it was about to enter.

---

## Run stuck in `paused`

**Symptoms:** Status is `paused` and `amaco resume` doesn't seem to do anything.

**Likely cause:** Either the orchestrator isn't running (the process that owns the run ended), or the resume hasn't reached the next polling tick yet.

**Fix:**

If Amaco's process is alive: `amaco resume <runId>` and wait a few seconds for the next stage-boundary check.

If the process ended: start it again (`amaco run` or `amaco ui`) and the durable state will be picked up automatically.

**Verify:** `amaco status` shows the run transitioning out of `paused`.

---

## Provider test fails: "command not found"

**Symptoms:** `amaco provider test claude` returns "claude: command not found."

**Likely cause:** The provider's CLI isn't on the PATH of the shell Amaco was started from.

**Fix:** Add the CLI to your PATH. For shell-installed binaries, restart your terminal so the new PATH is loaded.

**Verify:** `which claude` (or whichever CLI) returns a real path.

---

## Provider test passes but runs fail with "unexpected output"

**Symptoms:** `amaco provider test` returns success, but real runs end with "could not parse provider output."

**Likely cause:** The provider's prompt-flag preset is producing output Amaco can't parse — usually because the provider changed its output format between releases.

**Fix:**

```bash
amaco provider setup    # walk the wizard again to confirm flags
```

If the flags are right but the output format changed, file an issue with the provider's version (`<cli> --version`) and a sample of the captured output (under `.amaco/runs/<runId>/outputs/`).

---

## Worktree creation failed: "main branch has uncommitted changes"

**Symptoms:** Run aborts at start with a `requireCleanMain` violation.

**Likely cause:** Your `project.yml` has `git.requireCleanMain: true` and `main` has uncommitted edits.

**Fix:** Commit or stash, then re-run:

```bash
git stash push -m "before amaco run"
amaco run "..."
```

Or flip the policy if you don't want it:

```bash
amaco config set git.requireCleanMain false
```

**Verify:** Worktree appears under `../.amaco-worktrees/`.

---

## Notifications never arrive

**Symptoms:** Configured a Slack/webhook gateway, ran a task, no notification.

**Likely cause:** The gateway is registered but disabled, the webhook URL is wrong, or the notification severity is below the gateway's threshold.

**Fix:**

```bash
amaco gateways list
amaco notifications list
```

Confirm the gateway is enabled and the webhook URL is reachable. Send a test:

```bash
amaco notifications test <gatewayId>
```

---

## Dashboard tab is blank

**Symptoms:** `amaco ui` opens, but a tab shows no data even though there are runs.

**Likely cause:** The browser cached an older asset bundle, or the runs are in a different project root than the one `amaco ui` was started from.

**Fix:** Hard-reload (Cmd-Shift-R / Ctrl-Shift-R). Confirm `amaco ui` is running from the project root you expect: the dashboard reads `.amaco/runs/` from `cwd`.

---

## Worktree didn't get cleaned up after abort

**Symptoms:** `amaco abort <runId>` succeeded, but `../.amaco-worktrees/<runId>-<slug>` is still on disk.

**Likely cause:** This is by design. Worktrees are preserved across `aborted`, `blocked`, and `failed` so you can inspect or copy out partial work.

**Fix:**

```bash
cd your-project
git worktree remove ../.amaco-worktrees/<runId>-<slug>
git branch -D amaco/<runId>-<slug>
```

**Verify:** The directory is gone.
