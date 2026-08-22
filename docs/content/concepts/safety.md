---
title: Safety - Action Broker & policies
description: The dashboard shows you every gate a run passed. Underneath, the Action Broker decides each real effect against your rules and writes down what it decided.
slug: concepts/safety
---

Open any run and the safety model is the first thing on the page. The **Run assurance** panel carries a single verdict and four lanes under it - policy, validation, review, verification - so you can see which gate held and which one stopped the work.

![A blocked run on the Express flow. The Run assurance panel reads blocked, with review showing changes requested and verification showing failed. Below it the reviewer's finding says the new code writes userId to stdout on every rejected save. The panel's controls are View review and Re-run with fixes, and Pause and Abort sit in the run header.](/media/docs/run-blocked.png)

This run got stopped by its own gates. Review came back **changes requested**, verification failed after it, and the verdict is blocked, so nothing reached your branch. **View review** opens the finding in full, and **Re-run with fixes** sends the work back with that finding attached instead of starting over. **Pause** and **Abort** are your two levers while a run is still moving.

The panel is a summary. Each of those lanes is fed by decisions made one at a time, while the run was going, by the **Action Broker**.

## The Action Broker

Nothing a run does to your machine happens without passing one checkpoint. The broker decides each request against your rules, then writes down what it decided and what happened.

Eight kinds of effect cross it, and this is the whole list:

<div class="docs-cards">

**`provider.spawn`** - start an AI provider.

**`command.run`** - run a validation command.

**`file.patch`** - apply or revert a diff.

**`file.write`** - write a flow file, a Role's prompt, `VIBESTRATE.md`, `mcp.json`, a spec-up artifact.

**`terminal.create`** - open a terminal.

**`run.complete`** - finish a run.

**`run.start`** - the supervisor starts a run off a chat message.

**`git.merge`** - the guided merge into your main branch.

</div>

<div class="docs-callout warn">

**Default-allow with a policy veto.** An effect no policy matches is allowed. A policy can only refuse (`deny`) or hold (`require_approval`); none of them can grant.

Decisions are honored fail-closed - anything short of an explicit `allow` refuses the effect at the call site. Every decision, refusals included, is one line in the run's `actions.ndjson`.

</div>

<div class="docs-callout warn">

**Editing your own settings does not cross it.** `vibe init`, the config commands, `POST /api/config/set`, the Policies page, installing a Crew preset, adopting a supervisor persona and editing a Profile all write `project.yml` directly. So **a rule that denies `file.write` is not a lock on your config file.**

Two supervisor effects are ungated as well. In `act` mode, a chat message that creates a task or adds checklist items writes straight to the roadmap. A consult answer that proposes a policy writes a pending entry into `project.yml`. Only `run.start` is gated.

[The full list is below](#what-does-not-cross-the-boundary).

</div>

## The boundary

<svg viewBox="0 0 560 130" width="100%" style="max-width:560px;height:auto" role="img" aria-label="A run's own effects pass through the Action Broker, which records its decision in actions.ndjson. Editing your own settings writes straight to project.yml with no broker call.">
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="1" y="10" width="150" height="40" rx="8"/>
    <rect x="205" y="10" width="150" height="40" rx="8"/>
    <rect x="409" y="10" width="150" height="40" rx="8"/>
    <rect x="1" y="80" width="150" height="40" rx="8"/>
    <rect x="409" y="80" width="150" height="40" rx="8"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.5" stroke-width="1">
    <path d="M151 30 h50"/><path d="M196 26 l5 4 l-5 4"/>
    <path d="M355 30 h50"/><path d="M400 26 l5 4 l-5 4"/>
    <path d="M151 100 h74"/><path d="M335 100 h70"/><path d="M400 96 l5 4 l-5 4"/>
  </g>
  <g fill="currentColor" font-size="12" text-anchor="middle">
    <text x="76" y="34">a run's own effects</text>
    <text x="280" y="34">Action Broker</text>
    <text x="76" y="104">you, configuring</text>
  </g>
  <g fill="currentColor" font-size="12" font-family="ui-monospace,monospace" text-anchor="middle">
    <text x="484" y="34">actions.ndjson</text>
    <text x="484" y="104">project.yml</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="11" text-anchor="middle">
    <text x="280" y="104">no broker call</text>
  </g>
</svg>

The broker is one doorway with a guard. Each request is decided against an ordered chain of evaluators - the first `deny` wins, otherwise the first `require_approval`, otherwise `allow`.

The decision plus post-execution evidence is appended to `actions.ndjson` in the run's folder under `.vibestrate/runs/`. That file is what the Run assurance panel and replay read from.

With **zero** policies configured, the layer underneath still holds. The built-in patch-safety check (secret-bearing content, forbidden paths) refuses unsafe diffs on its own, the run is confined to its git worktree, and nothing is pushed or merged without you.

Two things do fail closed inside the broker itself:

- A policy-loader error denies seven of the eight kinds rather than waving them through. The one exception is `provider.spawn`, which is refused a layer down, where the provider is launched.
- A policy set that did not fully load refuses to start the run at all (below).

There is **no `network.request` or `mcp.tool` kind**. A provider CLI's own HTTP calls and tool invocations happen inside an opaque subprocess that Vibestrate cannot intercept, so a policy kind for them would advertise a checkpoint that does not exist.

Network confinement is enforced a layer down, at the container boundary - see [egress allowlist](/docs/concepts/sandbox).

### What does not cross the boundary

Not every byte written under `.vibestrate/` crosses it. A policy reaches a write only when some code path raises that write as an action.

**Gated** - the effects of a run, plus the authoring surfaces: flow files, a Role's prompt, a Role's wiring and its skill *assignments*, `VIBESTRATE.md`, `mcp.json`, a spec-up artifact edit, terminal creation, the guided merge.

**Not gated** - you editing your own settings:

- `POST /api/config/set`, the Policies page, installing a Crew preset, changing the default Crew, adopting a supervisor persona, and editing a Profile all write `project.yml` directly.
- `POST /api/skills/fetch` writes `.vibestrate/skills/<name>.md`. Assigning a skill to a Role is gated; *installing* one is not.
- `POST /api/composer/presets` writes your saved composer presets.
- `vibe init` and every config command on the CLI.

**Not gated** - two things the supervisor does:

- With `supervisorControl.autonomy: act`, a chat message that creates a task or appends checklist items writes them to the roadmap with no broker call. There is no action kind for either. They are bounded by shape instead: a title, or a list of strings, both length-capped, onto a task that was already on offer. Starting a run from that same chat message *is* gated, as `run.start`.
- A consult answer can propose a project policy, which writes a pending entry into `project.yml` with no broker call. A pending policy is inert - it changes no review and blocks no merge until you confirm it. See [Policies](/docs/concepts/policies).

The config surfaces are ungated on purpose: a gate there could refuse a first-time setup, before the project has any policy to consult.

## Two kinds of policy

The **Policies** page is where you see and shape the broker's evaluators. Its hero counts your advise, block and pending rules alongside the loaded engine rules, and three sections sit under it: **Your policies** for the rules you author in the UI, **Deterministic engine** for what the policy files currently contribute, and **Check a patch** for testing a diff against them before a run meets it.

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
    description: Block installs during validation.
    on: [command.run]
    match:
      commandRegex: "npm (i|install)|pip install"
      commandFlags: "i"
    effect: deny
    message: Network installs are not allowed.

  - id: hold-merge-for-review
    description: Sign off before merge_ready.
    on: [run.complete]
    match: { status: merge_ready }
    effect: require_approval
    message: Runs need approval before completing.

  - id: no-secret-writes
    description: Refuse writes to dotenv files.
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

`run.start`, `terminal.create` and `git.merge` have no match field. A policy on those kinds carries no `match` and so applies to every one of them.

Write a `pathGlob` with `/` separators on every platform, Windows included.

The path a write is matched against is the native one Vibestrate is about to open, so it is checked in both its native and its `/` spelling. A rule like `**/*.env` bites the same on Windows as it does on macOS and Linux.

**Anchor a `pathGlob` at the root.** The path it matches is absolute and the glob is anchored, so a project-relative pattern like `.vibestrate/project.yml` matches nothing and the rule protects nothing. Start the pattern with `**/` instead, and write `**/.vibestrate/project.yml`.

A glob is tested against every path an action declares, not only the one it opens. Most writes declare one. Some actions are two writes to two files - a Role's prompt and a Role's wiring, say - and both writes declare **both** paths, so one path-scoped rule naming either file covers the pair.

That keeps a rule from refusing the harmless half and landing the dangerous one. It also means such a rule is wider than its glob reads.

An action with no `match` applies to **every** request of the listed `on:` kinds. Effects default to `deny`. Policies can only *refuse or hold* an effect - they never permit something the built-in safety checks already refused.

### `require_approval` only where something can pause

`require_approval` is accepted on **`run.complete`** and **`file.patch`** only. Those are the two effects with a real approval seam: the completion gate and the post-turn diff gate both park the run in `waiting_for_approval` and wait for you.

Every other kind is refused at load with an error naming the offending kinds. A "hold" needs something to hold *on*.

A `require_approval` on `command.run` had nothing to pause, so the command was refused and the step failed - a hard block wearing a hold's label. Use `deny` there and mean it.

One honest edge: `file.patch` holds at the diff gate, but the suggestion/bundle **apply** surfaces have no seam, so a hold there refuses the apply. The action log then records the `require_approval` decision *plus* evidence saying it was refused rather than held, so the trail never implies you were asked.

### A policy set that didn't fully load stops the run

A policy file that fails to parse contributes **no rules**, and a rule id defined twice keeps only the first. So the stricter rule you just added can vanish while the Policies page still looks healthy.

Nothing downstream can catch this. The broker only ever sees the rules that *did* load, and a rule that never loaded leaves no trace in the action log or the assurance verdict.

So a run **refuses to start** while `.vibestrate/policies/` contains a malformed file or a duplicate id, naming the file and the reason:

```text
Refusing to start. The policy set in
.vibestrate/policies/ did not fully load, so rules
you think are active may not be.
  safety.yml: YAML parse error: ...
Fix them (details: `vibe policies doctor`), then
try again.
```

This is strict on purpose - a broken YAML file blocks even a docs-only run - because the alternative is running with protections you believe are on.

The check runs in two places:

- **Run creation refuses early**, so you get a readable error before anything happens.
- **The broker's own policy loader denies every effect** on the same condition. That covers the surfaces which reach a model without creating a run - consult, task enhancement, flow selection, parameter generation - and anything added later.

They all build their broker through one constructor, so the gate holds by construction rather than by remembering to call it.

Fixing it is never blocked by it. The Policies page, the `/api/policies` routes and the policy CLI all read the policy files directly, without a broker. A broken set can't lock you out of the message telling you what to fix.

### Safety behavior toggles

The `policies.*` toggles are switches on the Policies page, grouped by intent:

<div class="docs-cards">

**Hard guards**
Forbid main-branch writes, forbid secrets access (`.env` and key files), forbid auto-push, forbid auto-merge.

**Execution**
Strict apply-only mode, harden read-only seats, interactive terminal (scoped to a run worktree).

**Supervisor posture**
Auto-apply sandbox, auto-apply approval gate.

</div>

**Harden read-only seats** (`policies.hardenReadOnlySeats`, off by default) runs read-only **claude** seats under `--permission-mode plan`, so the CLI itself refuses writes (the agent won't even attempt them) instead of relying on its headless default.

It's claude's counterpart to the OS sandbox. Codex read-only seats get real OS confinement via `execution.isolation` below.

It is off by default because plan mode can add an "awaiting approval" framing to an action-shaped prompt. Turn it on for the stronger, explicit no-write guarantee.

## Permission modes

A run takes a **permission mode** that decides how much rope it gets - enforced by Vibestrate the same way for **every** provider, not a per-model flag. The new-run composer carries it as a **Permission** control with the four modes and an **Unattended** switch beside them, and `policies.defaultPermissionMode` sets the baseline for runs you don't pick one for.

<div class="docs-outcomes"><div class="docs-outcome ok"><b>read-only</b><span>No writes at all. Every seat runs read-only (no write grant); claude additionally gets plan mode when hardened, and a codex run gets OS confinement under the container backend.</span></div><div class="docs-outcome ok"><b>ask</b><span>The agent writes into the worktree, then every resulting change waits for your approval before it's kept - reject and the worktree is rolled back.</span></div><div class="docs-outcome warn"><b>accept-edits</b><span>Changes auto-apply, but the run does not auto-complete - it holds at the completion boundary for your sign-off, then resumes to merge_ready on approval (reject, or an unattended timeout, blocks it).</span></div><div class="docs-outcome warn"><b>auto</b><span>Fully hands-off (the default) - changes apply and the run completes on the evidence, bounded by the gates above and your budget ceilings.</span></div></div>

A gate about a **change** carries the files it is asking about, not just a count. The run page's approval banner lists them with a **Read the diff** link next to **Approve**, **Request changes** and **Reject**. You cannot approve a diff you cannot see.

A note on **ask** combined with `strictApplyOnly`. Ask's "approve each change" runs on the post-turn diff gate, the direct-write path. With `strictApplyOnly` on, changes route through the apply gateway instead, which *refuses* a change pending approval rather than prompting for it, so a run lands blocked instead of pausing. Use one or the other for now.

One honest limit: the modes gate the run-level effects Vibestrate owns - the agent's resulting **diff**, and run **completion**. They do not gate each shell command the agent runs inside an opaque provider, because codex's subprocess can't be intercepted per-command and claude's `tool_use` stream is display-only.

So "ask" means "approve each change", not "approve each command". `read-only` is a real no-write guarantee because Vibestrate never grants write capability; for the strongest wall around a non-codex provider, combine it with the [container backend](/docs/concepts/sandbox).

The mode is the **soft policy**; the container backend is the **hard wall**. They layer: read-only mode + `execution.backend: docker` gives you "no writes" enforced by both the orchestrator and the container.

No permission mode pushes your branch or merges it anywhere - not even `auto`. A run always stops at `merge_ready` and hands you the diff; taking it further is a decision you make, never one Vibestrate makes for you.

## Run assurance

The panel at the top of this page is derived, at the moment a run reaches a terminal state, from the evidence above - the broker log plus the run's review and verification decisions - and written to `assurance.json` alongside the action log. Five verdicts:

<div class="docs-outcomes"><div class="docs-outcome ok"><b>verified</b><span>Every applicable check passed - or nothing needed checking (see below).</span></div><div class="docs-outcome warn"><b>partially_verified</b><span>A check that was expected is missing, failed, or weak (see caps).</span></div><div class="docs-outcome warn"><b>unverified</b><span>The run reached merge_ready with no meaningful evidence.</span></div><div class="docs-outcome stop"><b>blocked</b><span>The run did not reach merge_ready.</span></div><div class="docs-outcome stop"><b>unsafe</b><span>A policy denied an action, or a rollback failed - don't trust the worktree.</span></div></div>

There is **no confidence score** - a verdict is a level capped by what's missing, not a guess at truth.

### Isolation posture

The artifact also records the run's **isolation posture** - how confined the agents were, derived from per-turn provider evidence (not config):

<div class="docs-outcomes"><div class="docs-outcome ok"><b>sandboxed</b><span>A real OS sandbox ran (codex).</span></div><div class="docs-outcome ok"><b>hardened</b><span>claude --permission-mode plan.</span></div><div class="docs-outcome warn"><b>partial</b><span>A sandbox was requested for a turn that ran unconfined.</span></div><div class="docs-outcome stop"><b>none</b><span>The default: worktree + diff gate only.</span></div></div>

It is **informational and never changes the verdict** ("none" is the intended baseline, not a gap), and the panel shows it only when the run was confined.

This is what lets you confirm, after the fact, that an opted-in `execution.isolation` / `hardenReadOnlySeats` run got the confinement you asked for.

### Nothing-to-verify is not a gap

Each lane - validation, review, verification - is reported as one of:

<div class="docs-chips"><span>passed</span><span>failed</span><span>not_applicable</span><span>missing</span><span>not_run</span></div>

A lane is `not_applicable` when there was genuinely nothing to check:

- a docs-only change with no validation commands,
- a flow with no review or verify step,
- an inert-diff review skip (strict prose touching no protected path).

Those land in **`notes`** (informational), not `caps` (real gaps). A run where every lane is passed-or-not-applicable reads `verified` with the honest summary "no checks were required for this change" - **not** the shaming `partially_verified`.

The distinction is preserved in the lane statuses, so "verified, nothing required" is never confused with "review approved and tests passed". `partially_verified` is reserved for a check that *was* expected and is missing, failed, or weak.

### Blocked and unsafe verdicts

A `blocked` or `unsafe` verdict also carries **`blockers`** - the root causes, derived from the run's failed steps and provider give-up events.

The summary leads with the first one ("Cause at 'implement': usage-limit: This model is being rate limited..."), so a dead overnight run tells you *why* at a glance instead of just "did not reach merge_ready".

On a `blocked` run the trivially-implied caps are omitted as noise. Of course `validation_missing`, `review_missing` and `verification_not_run` are all missing - the run never got that far. Caps that carry real information, such as an actual failed validation or a tolerated step failure, stay.

### The full step-by-step story

The **Tree** tab, under **Inspect** on the run page, gives you the flow's steps and, per step, what each turn did: succeeded, got **rate-limited then retried**, **fell back** to another model, paused, or failed-but-tolerated. It carries run-level budget, spend and pause events too.

It's derived from the recorded evidence (events + state + metrics), so it's exact for Vibestrate's own orchestration.

For providers that stream structured output (e.g. claude-code `stream-json`), each step also shows what happened *inside* the turn - the tool calls it made and any sub-agents it spawned. For providers that don't, the inside is marked "opaque". A spawned sub-agent's own internals always stay opaque, because they run inside the tool, not in the parent stream.

If a run used a **best-effort step** (a `continueOnError` reviewer, say) and that step failed but was tolerated, the run can still finish - but that step gave no scrutiny, so coverage is degraded.

The verdict reflects this: a tolerated failure adds a `steps_failed_tolerated` cap and holds the verdict at `partially_verified` rather than `verified`. The count shows as `coverage.toleratedStepFailures`.

## Defense in depth

Only the first of these is always on. The other three are opt-in, and each is honored independently of the others:

- **Post-turn diff gate** - every write-capable turn is snapshotted before it runs. Afterward its diff is checked against secret/path safety and `file.patch` policies. A denied or unsafe diff is rolled back to the snapshot and the run is blocked.

- **Strict apply-only mode** (`policies.strictApplyOnly`) - for the highest assurance, write roles run read-only and instead *propose* a unified diff that Vibestrate applies through the broker gateway. Nothing reaches disk without crossing the gate; a refused patch blocks the run.

- **Provider-native OS sandbox** (`execution.isolation`, **off by default**) - adds OS *prevention* on top of the diff gate's *detection*.

  The gates above bound your machine structurally already (worktree + diff gate + human-reviews-the-diff-before-merge), which is why a sandbox is opt-in, not a tax on every run. Turn it on for an untrusted task or an unattended run.

  With `execution.isolation: sandboxed`, each turn is asked to run under the provider's own OS sandbox, scaled to the seat: a write-capable seat gets writes confined to the worktree, a read-only seat gets read-only.

  **Today this is real only for codex** (`codex exec --sandbox`, Apple Seatbelt / Linux Landlock - a write outside the worktree is refused by the OS). A provider with no OS sandbox flag (e.g. claude) **warns once and runs unsandboxed** rather than pretending. The worktree + diff gate still apply, and the run records only the sandbox that was enforced.

  Set it from the dashboard config editor. For a wall that works the same around **any** provider (not just codex), move the run off your host entirely with the [container backend](/docs/concepts/sandbox) - `execution.backend: docker` runs each turn in a disposable Docker container.

- **Egress allowlist** (`execution.container.egress.mode: allowlist`, **off by default**, container backend only) - the run container moves to a Docker network with no gateway, so its only route out is an allowlisting proxy that refuses any host you didn't name. See [the sandbox page](/docs/concepts/sandbox).

- **Run assurance** - the terminal verdict above summarizes what happened, from the evidence log.

## Budget ceilings (don't lose control)

Beyond the daily **dollar** cap (`budget.spendCapDailyUsd`), Vibestrate has **count/time ceilings** that bind *without* measured cost - the reliable backstop for leaving a run unattended, since token cost is often unmeasured for local CLI providers:

- `budget.maxTurnsPerRun` / `budget.maxWallClockMinPerRun` - per run.
- `budget.maxTurnsPerDay` / `budget.maxWallClockMinPerDay` - across all of today's runs.

Checked before every agent turn. Once one is hit the run **stops (blocked)**, logs a `budget.limit` event, and notifies you. All off by default. The **Spend cap and ceilings** section on the Metrics page holds every one of them, next to the spend they bind.

One ceiling is not optional. `supervisorControl.autonomy: act` lets a chat message start a run, so the config refuses to load in `act` mode unless at least one budget ceiling is set.

Because they're off by default, an unattended run with **no ceiling and no confinement** says so before it starts, and records an `UNBOUNDED_UNATTENDED_RUN` policy warning in the run's event log:

> Unattended run with no budget ceiling and no confinement: nothing will stop it automatically, and only the worktree + diff gate bound what it touches.

It is advice, not a gate. Setting any one ceiling, or turning on `execution.isolation` / `execution.backend: docker`, silences it.

The **dollar** cap (`budget.spendCapDailyUsd`) has a configurable action once it's hit (`budget.capAction`):

<div class="docs-cards">

**`stop`**
Default. The run ends when the cap is hit.

**`downgrade-model`**
Run the rest on the cheaper `budget.fallbackProfile` instead of stopping.

**`reduce-effort`**
Continue at the provider's minimum effort.

</div>

Downgrade/reduce keep the work going more cheaply; the count/time ceilings above are still the ultimate stop.

For **attended** runs you can ask to be consulted at a limit instead of just stopping:

- `budget.onLimit: pause` waits for you to approve continuing (or reject to stop) once a ceiling is hit.
- `resilience.onExhausted: pause` waits when a provider's retries and fallback run out (approve for a fresh round, reject to fail).

Defaults are `stop`/`fail`, which is unattended-safe. The composer's **Unattended** switch forces no-pause regardless of config, so an overnight run can never sit waiting for a human. On the API that is the `unattended` field on `POST /api/runs`.

## Riding out provider hiccups (resilience)

For unattended runs, a momentary provider problem shouldn't kill the work. A recoverable failure - a rate limit (429/quota) or a transient blip (5xx, "server temporarily unavailable", overloaded, timeout) - is **auto-retried with backoff** before the turn's outcome is final. Rate limits honor a `Retry-After` hint; transient errors back off exponentially.

Hard failures (a bad flag, an auth error, empty output) are **not** retried - retrying won't help.

Retries are on by default. Tune them under `resilience` in config (`maxRetries`, delays, and extra detection `patterns` for your provider's exact wording). Context is preserved across a retry, because the same prompt is re-sent, so the model doesn't "lose its place."

If retries run out, a **fallback** kicks in: the turn runs once on another Profile instead. That is handy when one provider is hard-down or rate-limited.

Set `resilience.rateLimit.fallbackProfile` / `resilience.transient.fallbackProfile` to pick the model yourself, or let Vibestrate derive one with `resilience.autoFallback`:

- `crew` (the default) reseats the turn onto a profile **already seated in this run's flow** on a different provider, so no provider outside the run's trust set ever sees its context.
- `any` widens the candidates to every configured profile. Explicit opt-in.
- `off` disables auto-derivation.

The seat keeps its context (the same prompt and artifacts are re-sent) and its permissions (write capability is per-turn, never per-profile). Every outcome - the swap, "no candidate available", or a fallback that itself failed - is recorded as a `provider.fallback` event and shows in the Supervisor feed. Never silent.

A **subscription usage limit** is a per-model quota that resets, often hours out. It is handled separately from a per-minute rate limit, because retrying it for seconds is pointless. Claude Code's "being rate limited... switch over?" prompt is detected as this class.

`resilience.usageLimit.action` controls it:

- `wait` sleeps for the reset window (the parsed hint, capped at `maxWaitMin`) then retries, so an overnight run "runs until the window refills".
- `fallback` switches to another model.
- `stop` (the default) ends honestly, after trying the auto-derived fallback first, since switching providers is instant. "Stop" opts out of waiting hours, not of using a model the run already trusts.

Recorded as `provider.usage_limit`.

A provider failure that does end the run ends **loudly with its cause**. The classified failure and a redacted excerpt of the provider's actual error ("usage-limit: This model is being rate limited...") travel into the step's error, the event log (`provider.retries_exhausted`), the Supervisor feed, and the Run assurance verdict - not a bare "provider exited 1".

## Advanced: CLI and automation

Every surface above has a command behind it, which is what you reach for in a script, a hook or CI. The full reference is in the [CLI overview](/docs/cli/overview).

**Read the verdict and the story.**

```bash
vibe assurance <runId>           # the Run assurance verdict, --json for the artifact
vibe audit <runId> --json        # the same tree the Inspect > Tree tab renders
```

**Inspect, repair and configure policies.**

```bash
vibe policies list               # what's loaded
vibe policies doctor             # the parse/duplicate report; exits non-zero
vibe policies check <patchFile>  # run a diff past the rules, like Check a patch
vibe policies config --strict-apply-only true
vibe policies config --harden-read-only true
vibe config set execution.isolation sandboxed
```

**Launch with a permission mode, bound it, and answer its approvals.**

```bash
vibe run --permission-mode ask --unattended
vibe budget set --max-turns-run 40 --max-time-day 120   # use `off` to clear
vibe approvals show <runId> <approvalId>   # the same file list as the banner
vibe approvals approve <runId> <approvalId>
```

The HTTP API mirrors both: `GET /api/runs/:runId/assurance`, `GET /api/runs/:runId/audit`, `GET /api/policies`, `PATCH /api/budget`, and the `unattended` field on `POST /api/runs`.
