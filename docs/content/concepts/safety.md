---
title: Safety - Action Broker & policies
description: How Vibestrate routes every real effect through one checkpoint, writes down what it decided, and lets you deny or hold actions for approval.
section: concepts
slug: concepts/safety
---

Nothing a run *does* to your machine happens without passing one checkpoint, and that checkpoint writes down what it decided and what actually happened.

Think of a single doorway with a guard. Every time a run wants to do something real to your computer - start an AI provider, run a command, change a file, finish the run - it has to pass through that one doorway. The guard checks each request against your rules, decides yes or no, and logs the decision and the outcome. There is no back door.

In Vibestrate that doorway is the **Action Broker**. Every side-effecting operation a run performs - spawning a provider, running a validation command, applying or reverting a patch, writing a config file, opening a terminal, completing a run - crosses it.

<div class="docs-callout warn">

**One guarded doorway, fail-closed.** Every side-effecting operation crosses the single Action Broker. For each request the broker decides against an ordered chain of evaluators (first `deny` wins, otherwise the first `require_approval`, otherwise `allow`) and records the decision plus post-execution evidence as one line in `.vibestrate/runs/<runId>/actions.ndjson`. Decisions are **fail-closed**: anything short of an explicit `allow` refuses the effect. There is no back door.

</div>

**Policies** are how you supply those evaluators - the rules that block or pause specific actions.

## Two kinds of policy

Policy files live in `.vibestrate/policies/*.yml`. A file may carry two lists:

<div class="docs-cards">

**`rules:`**
Gate *patch content* at apply time (suggestion / bundle apply): match added lines by regex or touched files by glob, and refuse the apply.

**`actions:`**
Gate *broker effect kinds*: match a request and return `deny` or `require_approval`.

</div>

```yaml
# .vibestrate/policies/safety.yml
actions:
  - id: no-network-installs
    description: Block package installs during validation.
    on: [command.run]
    match: { commandRegex: "npm (i|install)|pip install", commandFlags: "i" }
    effect: deny
    message: Network installs are not allowed in this run.

  - id: hold-merge-for-review
    description: A human signs off before a run is merge_ready.
    on: [run.complete]
    match: { status: merge_ready }
    effect: require_approval
    message: Runs require human approval before completing.

  - id: no-secret-writes
    description: Refuse writes to dotenv-style files.
    on: [file.write, file.patch]
    match: { pathGlob: "**/*.env" }
    effect: deny
    message: Writing secret files is blocked.
```

In plain words: the first action `deny`s any `npm install` / `pip install` command run during the validation step. The second holds a run at `require_approval` so a human signs off before it becomes `merge_ready`. The third `deny`s any write or patch to a `.env` file.

### Action match fields

| Field | Applies to | Meaning |
| --- | --- | --- |
| `providerId` | `provider.spawn` | exact provider id |
| `commandRegex` (+ `commandFlags`) | `command.run` | regex over the command string |
| `pathGlob` | `file.write`, `file.patch` | glob over the written/touched path(s) |
| `status` | `run.complete` | exact terminal verdict (`merge_ready` / `blocked`) |

An action with no `match` applies to **every** request of the listed `on:` kinds. Effects default to `deny`. Policies can only *refuse or hold* an effect - they never permit something the built-in safety checks already refused.

## Why it matters

<div class="docs-cards">

**One path.**
Because every effect is constructed through the same broker, the same policy set reaches every effect site - there is no surface that quietly skips the boundary.

**Evidence, not vibes.**
The `actions.ndjson` log is the audit trail the Run Assurance artifact and replay read from. Decisions and outcomes are recorded, including refused attempts.

**Fail-closed.**
A denied effect stops. A malformed policy *file* is skipped (it can't wedge every run), but a matching `deny` is always honored.

</div>

See what's loaded with `vibe policies list` / `vibe policies doctor`, the `GET /api/policies` endpoint, or the Policies panel in the dashboard.

### Configuring safety behavior

The `policies.*` toggles - strict apply-only, harden read-only seats, interactive terminal, and the `forbid*` guards - are editable from both surfaces (UI⇄CLI parity):

- **CLI:** `vibe policies config` shows them. `vibe policies config --strict-apply-only true` / `--harden-read-only true` (and friends) set them.
- **Dashboard:** the Policies panel's **Advanced - Safety behavior** section has a switch per toggle plus a **live preview** that spells out what a run will do under the current settings before you commit to them.

**Harden read-only seats** (`policies.hardenReadOnlySeats`, off by default) runs read-only **claude** seats under `--permission-mode plan`, so the CLI itself refuses writes (the agent won't even attempt them) instead of relying on its headless default. It's claude's counterpart to the OS sandbox; codex read-only seats get real OS confinement via `execution.isolation` below. Off by default because plan mode can add an "awaiting approval" framing to an action-shaped prompt - turn it on for the stronger, explicit no-write guarantee.

## Run assurance

When a run reaches a terminal state, Vibestrate derives a single honest verdict from the evidence above - the broker log plus the run's review and verification decisions - and writes it to `.vibestrate/runs/<runId>/assurance.json`:

<div class="docs-outcomes"><div class="docs-outcome ok"><b>verified</b><span>Every applicable check passed - or nothing needed checking (see below).</span></div><div class="docs-outcome warn"><b>partially_verified</b><span>A check that was expected is missing, failed, or weak (see caps).</span></div><div class="docs-outcome warn"><b>unverified</b><span>The run reached merge_ready with no meaningful evidence.</span></div><div class="docs-outcome stop"><b>blocked</b><span>The run did not reach merge_ready.</span></div><div class="docs-outcome stop"><b>unsafe</b><span>A policy denied an action, or a rollback failed - don't trust the worktree.</span></div></div>

There is **no confidence score** - a verdict is a level capped by what's missing, not a guess at truth. Read it with `vibe assurance <runId>`, `GET /api/runs/:runId/assurance`, or the badge on the run detail page.

### Isolation posture

The artifact also records the run's **isolation posture** - how confined the agents actually were, derived from per-turn provider evidence (not config):

<div class="docs-outcomes"><div class="docs-outcome ok"><b>sandboxed</b><span>A real OS sandbox ran (codex).</span></div><div class="docs-outcome ok"><b>hardened</b><span>claude --permission-mode plan.</span></div><div class="docs-outcome warn"><b>partial</b><span>A sandbox was requested for a turn that ran unconfined.</span></div><div class="docs-outcome stop"><b>none</b><span>The default: worktree + diff gate only.</span></div></div>

It is **informational and never changes the verdict** ("none" is the intended baseline, not a gap), and it's shown only when the run was actually confined. This is what lets you confirm, after the fact, that an opted-in `execution.isolation` / `hardenReadOnlySeats` run really got the confinement you asked for.

### Nothing-to-verify is not a gap

Each lane (validation, review, verification) is reported as `passed`, `failed`, `not_applicable`, or `missing`/`not_run`. A lane is `not_applicable` when there was genuinely nothing to check - a docs-only change with no validation commands, a flow with no review or verify step, or an inert-diff review skip (strict prose touching no protected path). Those land in **`notes`** (informational), not `caps` (real gaps), and a run where every lane is passed-or-not-applicable reads `verified` with the honest summary "no checks were required for this change" - **not** the shaming `partially_verified`. The distinction is preserved in the lane statuses, so "verified, nothing required" is never confused with "review approved and tests passed". `partially_verified` is reserved for a check that *was* expected and is missing, failed, or weak.

### When a run was blocked or unsafe

A `blocked` or `unsafe` verdict also carries **`blockers`** - the root causes, derived from the run's failed steps and provider give-up events. The summary leads with the first one ("Cause at 'implement': usage-limit: This model is being rate limited..."), so a dead overnight run tells you *why* at a glance instead of just "did not reach merge_ready". On a `blocked` run the trivially-implied caps (`validation_missing`, `review_missing`, `verification_not_run` - of course they're missing, the run never got there) are omitted as noise; caps that carry real information (an actual failed validation, a tolerated step failure) stay.

### The full step-by-step story

For the flow's steps and, per step, what each turn did (succeeded, got **rate-limited then retried**, **fell back** to another model, paused, or failed-but-tolerated), plus run-level budget/spend/pause events, use the **run audit**: the "Run audit · what happened" tree on the run detail page (each step's attempt chain, color-coded), or `vibe audit <runId>` (add `--json`), or `GET /api/runs/:runId/audit`. It's derived from the recorded evidence (events + state + metrics), so it's exact for vibestrate's own orchestration. For providers that stream structured output (e.g. claude-code `stream-json`), each step also shows what happened *inside* the turn - the tool calls it made and any sub-agents it spawned. For providers that don't, the inside is honestly marked "opaque" (a spawned sub-agent's own internals always stay opaque - they run inside the tool, not in the parent stream).

If a run used a **best-effort step** (a `continueOnError` reviewer, say) and that step failed but was tolerated, the run can still finish - but that step gave no scrutiny, so coverage is degraded. The verdict reflects this: a tolerated failure adds a `steps_failed_tolerated` cap and holds the verdict at `partially_verified` rather than `verified`. The count shows as `coverage.toleratedStepFailures`.

## Defense in depth

Three gates sit on the path between an agent and your files, each independently honored:

<div class="docs-flow"><div><b>Post-turn diff gate</b><span>Every write-capable turn is snapshotted before it runs. Afterward its diff is checked against secret/path safety and file.patch policies. A denied or unsafe diff is rolled back to the snapshot and the run is blocked.</span></div><div><b>Strict apply-only mode</b><span>policies.strictApplyOnly: write roles run read-only and propose a unified diff that Vibestrate applies through the broker gateway. Nothing reaches disk without crossing the gate; a refused patch blocks the run.</span></div><div><b>Provider-native OS sandbox</b><span>execution.isolation, off by default: an optional fourth layer adding OS prevention on top of the diff gate's detection.</span></div><div><b>Run assurance</b><span>The terminal verdict above summarizes what actually happened, from the evidence log.</span></div></div>

- **Post-turn diff gate** - every write-capable turn is snapshotted before it runs. Afterward its diff is checked against secret/path safety and `file.patch` policies. A denied or unsafe diff is rolled back to the snapshot and the run is blocked.
- **Strict apply-only mode** (`policies.strictApplyOnly`) - for the highest assurance, write roles run read-only and instead *propose* a unified diff that Vibestrate applies through the broker gateway. Nothing reaches disk without crossing the gate; a refused patch blocks the run.
- **Provider-native OS sandbox** (`execution.isolation`, **off by default**) - an optional fourth layer that adds OS *prevention* on top of the diff gate's *detection*. The gates above bound your machine structurally already (worktree + diff gate + human-reviews-the-diff-before-merge), which is why a sandbox is opt-in, not a tax on every run - turn it on for an untrusted task or an unattended run. With `execution.isolation: sandboxed`, each turn is asked to run under the provider's own OS sandbox, scaled to the seat: a write-capable seat gets writes confined to the worktree, a read-only seat gets read-only. **Today this is real only for codex** (`codex exec --sandbox`, Apple Seatbelt / Linux Landlock - a write outside the worktree is refused by the OS). A provider with no OS sandbox flag (e.g. claude) **warns once and runs unsandboxed** rather than pretending - the worktree + diff gate still apply, and the run records only the sandbox that was actually enforced. Set it with `vibe config set execution.isolation sandboxed` or the dashboard config editor.
- **Run assurance** - the terminal verdict above summarizes what actually happened, from the evidence log.

## Budget ceilings (don't lose control)

Beyond the daily **dollar** cap (`budget.spendCapDailyUsd`), Vibestrate has **count/time ceilings** that bind *without* measured cost - the reliable backstop for leaving a run unattended, since token cost is often unmeasured for local CLI providers:

- `budget.maxTurnsPerRun` / `budget.maxWallClockMinPerRun` - per run.
- `budget.maxTurnsPerDay` / `budget.maxWallClockMinPerDay` - across all of today's runs.

Checked before every agent turn. When one is hit the run **stops (blocked)**, logs a `budget.limit` event, and notifies you. All off by default. Set them with `vibe budget set --max-turns-run 40 --max-time-day 120` (use `off` to clear), `PATCH /api/budget`, or the dashboard's Budget control.

The **dollar** cap (`budget.spendCapDailyUsd`) has a configurable action when it's hit (`budget.capAction`):

<div class="docs-cards">

**`stop`**
Default. The run ends when the cap is hit.

**`downgrade-model`**
Run the rest on the cheaper `budget.fallbackProfile` instead of stopping.

**`reduce-effort`**
Continue at the provider's minimum effort.

</div>

Downgrade/reduce keep the work going more cheaply; the count/time ceilings above are still the ultimate stop.

For **attended** runs you can ask to be consulted at a limit instead of just stopping: `budget.onLimit: pause` waits for you to approve continuing (or reject to stop) when a ceiling is hit, and `resilience.onExhausted: pause` waits when a provider's retries+fallback run out (approve for a fresh round, reject to fail). Defaults are `stop`/`fail` (unattended-safe). Launch a run with **`--unattended`** (`vibe run --unattended`, or `unattended` on `POST /api/runs`) to force no-pause regardless of config - so an overnight run can never sit waiting for a human.

## Riding out provider hiccups (resilience)

For unattended runs, a momentary provider problem shouldn't kill the work. A recoverable failure - a rate limit (429/quota) or a transient blip (5xx, "server temporarily unavailable", overloaded, timeout) - is **auto-retried with backoff** before the turn's outcome is final (rate limits honor a `Retry-After` hint; transient errors back off exponentially). Hard failures (a bad flag, an auth error, empty output) are **not** retried - retrying won't help. On by default; tune it under `resilience` in config (`maxRetries`, delays, and extra detection `patterns` for your provider's exact wording). Context is preserved across a retry (the same prompt is re-sent), so the model doesn't "lose its place."

If retries run out, a **fallback** kicks in: the turn runs once on another Profile instead (handy when one provider is hard-down or rate-limited). Set `resilience.rateLimit.fallbackProfile` / `resilience.transient.fallbackProfile` to pick the model yourself - or let Vibestrate derive one: `resilience.autoFallback` (default `crew`) reseats the turn onto a profile **already seated in this run's flow** on a different provider, so no provider outside the run's trust set ever sees its context. `any` widens the candidates to every configured profile (explicit opt-in); `off` disables auto-derivation. The seat keeps its context (the same prompt and artifacts are re-sent) and its permissions (write capability is per-turn, never per-profile). Every outcome - the swap, "no candidate available", or a fallback that itself failed - is recorded as a `provider.fallback` event and shows in the Supervisor feed. Never silent.

A **subscription usage limit** (a per-model quota that resets, often hours out) is handled separately from a per-minute rate limit - retrying it for seconds is pointless (Claude Code's "being rate limited... switch over?" prompt is detected as this class). `resilience.usageLimit.action` controls it: `wait` sleeps for the reset window (the parsed hint, capped at `maxWaitMin`) then retries - so an overnight run "runs until the window refills"; `fallback` switches to another model; `stop` (default) ends honestly - after trying the auto-derived fallback first, since switching providers is instant ("stop" opts out of waiting hours, not of using a model the run already trusts). Recorded as `provider.usage_limit`.

When a provider failure does end the run, it ends **loudly with its cause**: the classified failure and a redacted excerpt of the provider's actual error ("usage-limit: This model is being rate limited...") travel into the step's error, the event log (`provider.retries_exhausted`), the Supervisor feed, and the Run Assurance verdict - not a bare "provider exited 1".
</content>
</invoke>
