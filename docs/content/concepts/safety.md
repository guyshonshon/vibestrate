---
title: Safety - Action Broker & policies
description: The single boundary every real effect crosses, the append-only evidence log, and the policies that deny or hold effects for approval.
section: concepts
slug: concepts/safety
---

Nothing a run *does* to your machine happens without passing one checkpoint -
and that checkpoint writes down what it decided and what actually happened. Every
side-effecting operation a run performs - spawning a provider, running a
validation command, applying or reverting a patch, writing a config file, opening
a terminal, completing a run - crosses a single Vibestrate-owned boundary called
the **Action Broker** (`src/safety/action-broker.ts`).

For each one, the broker `decide()`s the request against an ordered chain of
evaluators (first `deny` wins, otherwise the first `require_approval`, otherwise
`allow`) and `record()`s the decision plus post-execution evidence as one line in
`.vibestrate/runs/<runId>/actions.ndjson`. Decisions are **fail-closed**:
anything short of an explicit `allow` refuses the effect. **Policies** are how you
supply those evaluators - the rules that block or pause specific actions.

## Two kinds of policy

Policy files live in `.vibestrate/policies/*.yml`. A file may carry two lists:

- **`rules:`** - gate *patch content* at apply time (suggestion / bundle apply):
  match added lines by regex or touched files by glob, and refuse the apply.
- **`actions:`** - gate *broker effect kinds*: match a request and return
  `deny` or `require_approval`.

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

### Action match fields

| Field | Applies to | Meaning |
| --- | --- | --- |
| `providerId` | `provider.spawn` | exact provider id |
| `commandRegex` (+ `commandFlags`) | `command.run` | regex over the command string |
| `pathGlob` | `file.write`, `file.patch` | glob over the written/touched path(s) |
| `status` | `run.complete` | exact terminal verdict (`merge_ready` / `blocked`) |

An action with no `match` applies to **every** request of the listed `on:`
kinds. Effects default to `deny`. Policies can only *refuse or hold* an effect -
they never permit something the built-in safety checks already refused.

## Why it matters

- **One path.** Because construction goes through `createActionBroker`, the same
  policy set reaches every effect site - there is no surface that quietly skips
  the boundary.
- **Evidence, not vibes.** The `actions.ndjson` log is the audit trail the Run
  Assurance artifact and replay read from. Decisions and outcomes are recorded,
  including refused attempts.
- **Fail-closed.** A denied effect stops; a malformed policy *file* is skipped
  (it can't wedge every run), but a matching `deny` is always honored.

Inspect what's loaded with `vibe policies list` / `vibe policies doctor`, the
`GET /api/policies` endpoint, or the Policies panel in the dashboard.

### Configuring safety behavior

The `policies.*` toggles - strict apply-only, interactive terminal, and the
`forbid*` guards - are editable from both surfaces (UI⇄CLI parity):

- **CLI:** `vibe policies config` shows them; `vibe policies config
  --strict-apply-only true` (and friends) set them.
- **Dashboard:** the Policies panel's **Advanced - Safety behavior** section has
  a switch per toggle plus a **live preview** that spells out what a run will do
  under the current settings before you commit to them.

## Run assurance

When a run reaches a terminal state, Vibestrate derives a single honest verdict
from the evidence above - the broker log plus the run's review and verification
decisions - and writes it to `.vibestrate/runs/<runId>/assurance.json`:

| Verdict | Meaning |
| --- | --- |
| `verified` | Policy passed, review approved, validation and verification all passed. |
| `partially_verified` | Some evidence passed, but checks are missing (see `caps`). |
| `unverified` | The run reached merge_ready with no meaningful evidence. |
| `blocked` | The run did not reach merge_ready. |
| `unsafe` | A policy denied an action, or a rollback failed - don't trust the worktree. |

There is **no confidence score** - a verdict is a level capped by what's missing,
not a guess at truth. Read it with `vibe assurance <runId>`,
`GET /api/runs/:runId/assurance`, or the badge on the run detail page.

If a run used a **best-effort step** (a `continueOnError` reviewer, say) and that
step failed but was tolerated, the run can still finish - but that step gave no
scrutiny, so coverage is degraded. The verdict reflects this: a tolerated failure
adds a `steps_failed_tolerated` cap and holds the verdict at `partially_verified`
rather than `verified`. The count shows as `coverage.toleratedStepFailures`.

## Defense in depth

Three gates sit on the path between an agent and your files, each independently
honored:

- **Post-turn diff gate** - every write-capable turn is snapshotted before it
  runs; afterward its diff is checked against secret/path safety and `file.patch`
  policies. A denied or unsafe diff is rolled back to the snapshot and the run is
  blocked.
- **Strict apply-only mode** (`policies.strictApplyOnly`) - for the highest
  assurance, write roles run read-only and instead *propose* a unified diff that
  Vibestrate applies through the broker gateway. Nothing reaches disk without
  crossing the gate; a refused patch blocks the run.
- **Run assurance** - the terminal verdict above summarizes what actually
  happened, from the evidence log.

## Budget ceilings (don't lose control)

Beyond the daily **dollar** cap (`budget.spendCapDailyUsd`), Vibestrate has
**count/time ceilings** that bind *without* measured cost - the reliable backstop
for leaving a run unattended, since token cost is often unmeasured for local CLI
providers:

- `budget.maxTurnsPerRun` / `budget.maxWallClockMinPerRun` - per run.
- `budget.maxTurnsPerDay` / `budget.maxWallClockMinPerDay` - across all of today's runs.

Checked before every agent turn; when one is hit the run **stops (blocked)**, logs
a `budget.limit` event, and notifies you. All off by default. Set them with
`vibe budget set --max-turns-run 40 --max-time-day 120` (use `off` to clear),
`PATCH /api/budget`, or the dashboard's Budget control.

The **dollar** cap (`budget.spendCapDailyUsd`) has a configurable action when it's
hit (`budget.capAction`): `stop` (default), `downgrade-model` (run the rest on
the cheaper `budget.fallbackProfile` instead of stopping), or `reduce-effort`
(continue at the provider's minimum effort). Downgrade/reduce keep the work going
more cheaply; the count/time ceilings above are still the ultimate stop.

For **attended** runs you can ask to be consulted at a limit instead of just
stopping: `budget.onLimit: pause` waits for you to approve continuing (or reject
to stop) when a ceiling is hit, and `resilience.onExhausted: pause` waits when a
provider's retries+fallback run out (approve for a fresh round, reject to fail).
Defaults are `stop`/`fail` (unattended-safe). Launch a run with **`--unattended`**
(`vibe run --unattended`, or `unattended` on `POST /api/runs`) to force no-pause
regardless of config - so an overnight run can never sit waiting for a human.

## Riding out provider hiccups (resilience)

For unattended runs, a momentary provider problem shouldn't kill the work. A
recoverable failure - a rate limit (429/quota) or a transient blip (5xx, "server
temporarily unavailable", overloaded, timeout) - is **auto-retried with backoff**
before the turn's outcome is final (rate limits honor a `Retry-After` hint;
transient errors back off exponentially). Hard failures (a bad flag, an auth
error, empty output) are **not** retried - retrying won't help. On by default;
tune it under `resilience` in config (`maxRetries`, delays, and extra detection
`patterns` for your provider's exact wording). Context is preserved across a retry
(the same prompt is re-sent), so the model doesn't "lose its place."

If retries run out, an optional **fallback** kicks in: set
`resilience.rateLimit.fallbackProfile` / `resilience.transient.fallbackProfile`
to another Profile and Vibestrate runs the turn once on that model instead (handy
when one provider is hard-down). The swap is recorded as a `provider.fallback`
event - never silent.
