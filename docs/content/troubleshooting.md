---
title: Troubleshooting
description: Concrete fixes for the issues people actually hit.
slug: troubleshooting
---

## In simple words

Find the symptom, then run the fix. **More** > **Setup** runs the same checks `vibe doctor` does, with one **Fix what's safe** button for whatever in the report can be repaired.

<div class="docs-callout tip">

**Tip.** Read the failure message first. Most name themselves: a failed supervisor turn gives its reason, a cut-short one says it was stopped, and an effort level your provider does not have is refused with that provider's real ladder in the message.

</div>

## Start here

<div class="docs-cards">

**The Setup page**
**More** > **Setup**. Five numbered steps, each pass or fail, above one page-level **Fix what's safe**.

**The run's own status**
`failed` is a crash, `blocked` is a decision. Different fixes.

**The step's output**
A failing step prints why, which is usually the whole answer.

**Replay**
The **Replay** tab on a run, or `vibe replay <run-id>`: every decision and artifact, still in place.

</div>

<div class="docs-callout">

**Did you know?** A run that ends badly keeps its worktree on purpose - nothing is cleaned up on failure. The half-finished work, the logs and the diff are on disk when you come back.

</div>

## Install and setup

## `vibe: command not found` right after installing

Your shell's PATH does not include npm's global bin directory. Find where npm puts global binaries and add that directory to your PATH:

```bash
npm config get prefix
# then add <prefix>/bin to your PATH
# in ~/.zshrc or ~/.bashrc
```

`which vibe` should then return a real path. No dashboard view of this one - `vibe ui` is the same binary, so nothing starts until PATH is fixed.

## `vibe init` says "not a git repository"

Vibestrate needs git for worktree isolation, and this directory is not a repo yet.

**In the dashboard.** The Setup page's step 1, **A repository to work in**, is red, and a **Start here** block above the steps offers **Initialise this project** plus, when the folder is not a repository, **Create a git repository first**.

**In a terminal:**

```bash
git init
git add -A && git commit -m "Initial commit"
vibe init
```

`git rev-parse --is-inside-work-tree` should return `true`.

## `vibe doctor` says "no providers ready"

No coding-agent CLI is on your PATH, or none has a verified preset.

**Where you see it.** Setup page, step 3, **Connect a model**. Its **Providers** button jumps to **Crew** > **Providers**, where every card reads undetected or unconfigured.

Install at least one:

```bash
npm install -g @anthropic-ai/claude-code
npm install -g @openai/codex
npm install -g @google/gemini-cli
python -m pip install aider-install && aider-install
curl -fsSL https://ollama.com/install.sh | sh
```

Run the CLI once afterwards to sign in - `codex login` for Codex, the bare command for the others. Aider instead reads `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` from your environment, and Ollama needs no login but does need a model pulled first.

Then wire it in: **Set up** on the card, then **Test**. Scripted:

```bash
vibe provider detect
vibe provider setup
vibe provider test <id>
```

At least one provider should end at confidence `ready`, or pass its test after setup.

## Providers

## Provider test fails with "command not found"

The provider's CLI is not on the PATH of the shell Vibestrate was started from. **Test** on that card in **Crew** > **Providers** returns the same message.

Add the CLI to your PATH, restart your terminal, then restart `vibe ui` - the server inherits the PATH it was launched with. `which claude` should return a real path.

## The test passes, but real runs fail with "unexpected output"

The preset is producing output Vibestrate cannot read, usually because the provider changed its output format between releases.

**In the dashboard.** **Crew** > **Providers** > **Edit** reopens that card's command, args and input in one editor, with **Test** beside them. The captured output sits under `.vibestrate/runs/<runId>/artifacts/flows/<step-id>/output.md`.

`vibe provider setup` walks the same flags from a terminal. If they are right and the format changed anyway, file an issue with the provider's version (`<cli> --version`) and a sample of the output.

## Runs that won't start or stall

## Runs finish, but nothing was actually checked

`commands.validate` in `project.yml` is empty. The run does not fail - Vibestrate works without validation commands - but the review is much weaker, with nothing factual between the executor and the reviewer.

**In the dashboard.** Setup page, step 4, **Point it at your tests**. **Fix what's safe** fills in the commands it detected; **Edit config** opens the same value on the Config page to pick them yourself.

The same two from a terminal:

```bash
# adds the commands it detected for your project
vibe doctor --fix

# or set them yourself
vibe config set commands.validate \
  '["pnpm typecheck", "pnpm test"]'
```

`vibe config get commands.validate` should then show your array.

## Run stuck in `waiting_for_approval`

A policy gate at this stage requires a human on purpose (`policies.requireApprovalAtStages`).

**Where you see it.** The run's card in the sidebar turns amber rather than green - the "needs you" state. Opening the run gives you the approval, its reason and the decision controls.

From a terminal:

```bash
vibe approvals list <runId>
vibe approvals approve <runId> <approvalId>
# or: reject, or request-changes --guidance "..."
```

The status then moves into the stage it was about to enter.

## Run stuck in `paused`

Either the orchestrator is no longer running - the process that owns the run ended - or the resume has not reached the next polling tick. An amber card with nothing moving behind it is the usual tell.

If the process is alive, use the resume control on the run's page or `vibe resume <runId>`, and allow a few seconds for the next stage-boundary check. If it ended, `vibe run` or `vibe ui` picks the durable state up automatically.

## Worktree creation fails: "main branch has uncommitted changes"

Your `project.yml` has `git.requireCleanMain: true` and `main` has uncommitted edits. The **Source** page shows the same dirty tree.

Commit or stash, then re-run:

```bash
git stash push -m "before vibe run"
vibe run "..."
```

Or turn the policy off, on the Config page or with `vibe config set git.requireCleanMain false`. The worktree then appears under `../.vibestrate-worktrees/`.

## The Supervisor panel

## The answer is a reason instead of an answer

Two different messages, two different situations.

**"I could not answer that:" plus a reason.** The turn reached the provider and failed - no provider installed, a policy refusing the effect, the daily spend cap, or a reply Vibestrate could not parse. The reason is the underlying error with your home directory path stripped out, stored in the thread so it survives a reload. Fix what it names; the Setup page and `vibe doctor` cover the provider and config half of that list.

**"Stopped before I got to an answer."** Nothing broke - the turn was cut short before it produced anything. You get this when you press Stop, and when the connection to the panel closes, so reloading the page or restarting `vibe ui` mid-answer both do it. Whatever had already been written is kept.

## An effort level your provider does not have

Asking the panel for one is refused before the turn starts, with that provider's real ladder in the message:

| Provider | Effort levels it accepts |
|---|---|
| `claude` | low, medium, high, xhigh, max |
| `codex` | minimal, low, medium, high, xhigh |
| `gemini` | none - its reasoning is a numeric thinking budget rather than a flag |

Pick a level the message names, or run `vibe provider catalog`. The **Profiles** page keeps its **Effort** field for every provider and says "This provider exposes no effort control." when there is no ladder to offer.

Everywhere else an unknown level is passed through and ignored rather than refused. In a run, a Profile whose `power` the provider will not honor does not stop the turn: Vibestrate records a `provider.effort_ignored` event once per provider and level and carries on. It reads:

```text
Effort "xhigh" won't take effect on gemini
(gemini exposes no effort control) - the provider ignores it.
```

(Wrapped here to fit; the event carries it on one line, and names the valid levels instead when the provider has a ladder.) `vibe consult --effort` behaves the same way, without the event. If an effort setting seems to make no difference, that is why.

## Notifications and dashboard

## Notifications never arrive

Notifications go to local gateways only: the in-app feed, the CLI, the browser's own system notifications. There are no Slack or webhook gateways. Usually a channel is switched off, the severity is below the gateway's threshold, or notifications are off entirely.

**In the dashboard.** The gear at the bottom of the sidebar opens **Settings**, whose notifications panel carries **Notifications enabled**, **In-app**, **CLI** and **Browser (system)** toggles plus one per event. The bell beside it is the feed.

From a terminal:

```bash
vibe gateways list
vibe notifications list
vibe notifications test <gatewayId>
```

## A dashboard tab is blank

Either the browser cached an older asset bundle, or the runs live in a different project root than the one `vibe ui` was started from.

Hard-reload (Cmd-Shift-R / Ctrl-Shift-R), then confirm which project is being served - the switcher at the top of the sidebar names it, and the dashboard reads `.vibestrate/runs/` from its working directory.

## Worktrees left behind

## Worktree didn't get cleaned up after an abort

By design: worktrees are preserved across `aborted`, `blocked` and `failed` so you can inspect or copy out partial work, and the **Source** page still lists the branch. Remove it when you are done:

```bash
cd your-project
git worktree remove ../.vibestrate-worktrees/<runId>
git branch -D vibestrate/<runId>
```

## Next

- [Flow](/docs/concepts/flow) - the steps a run works through, where these statuses come from.
- [Crew](/docs/concepts/crew) - the workers and models behind your providers.
