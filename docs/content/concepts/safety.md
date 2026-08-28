---
title: Safety - Action Broker & policies
description: Every real effect a run has crosses one checkpoint, which decides it against your rules and writes down what it decided.
slug: concepts/safety
---

## In simple words

A [[run]] can spawn processes, run commands and edit files. Every one of those effects crosses **one checkpoint** first, the Action Broker: it decides the effect against your rules, then records the decision and what happened.

`vibe ui` opens the dashboard on `127.0.0.1:4317`, and three screens carry this model. **Policies** in the sidebar holds the rules and the switches. Every run page carries **Run assurance**, the verdict derived from what actually happened, beside the supervisor's decision feed rather than at the bottom, with **Inspect** last on the page for the step-by-step story. Mission control's **Waiting on you** deck collects anything holding for your approval.

<div class="docs-callout tip">

**Tip.** "Require approval" is only accepted where something can genuinely pause: run completion and the post-turn diff gate. On any other effect it would be a hard block wearing a hold's label, so it is refused at config load instead of quietly becoming one.

</div>

When gates stop a run, the run says so plainly:

![The header of a blocked run on the Express flow, reading Run blocked, with its steps listed and the elapsed time and diff beside them.](/media/docs/scoped/blocked.png)

And the assurance panel says *which* gate held:

![The supervisor's decision feed on a blocked run. A note reads: confirm userId is an opaque identifier and not an email or token, since this change starts writing it to stdout on every rejected save. Below it three judgments read review CHANGES_REQUESTED, review aimed through 3 lenses across correctness, tests and security-risk, and selected express at high confidence. The top edge of the Run assurance panel below reads blocked, with View review and Re-run with fixes.](/media/docs/scoped/run-blocked.png)

Review came back **changes requested**, verification failed after it, and nothing reached your branch. **Re-run with fixes** sends the work back with that finding attached instead of starting over.

<div class="docs-callout">

**Did you know?** A policy file that fails to load stops the run from being created at all, naming the file and the reason. Running with protections you believe are on is worse than not starting, so a malformed policy is a refusal rather than a warning you might miss.

</div>

## What bounds a run with no policies

Not the broker. Four things underneath it:

<div class="docs-cards">

**A dedicated worktree per run**
Agents edit a separate copy of your project. See [[worktree]].

**A post-turn diff gate**
It checks every write-capable turn's diff and rolls the turn back when it is unsafe.

**Secret shapes are refused**
A patch adding something shaped like a leaked token, or touching a secret-like path, is rejected before any bytes reach the worktree.

**Nothing merges without you**
No push, no merge, ever, without a human. Two of the four hard guards declare it.

</div>

<div class="docs-callout warn">

**The broker is default-allow with a policy veto, not default-deny.** An effect no policy matches proceeds. Policies can refuse or hold, never grant - it is where you impose limits and where they are recorded, not a whitelist you have to satisfy to get work done.

</div>

## The Action Broker

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

Each request runs an ordered chain of evaluators: the first `deny` wins, otherwise the first `require_approval`, otherwise `allow`. The decision plus post-execution evidence appends to `actions.ndjson` in the run's folder under `.vibestrate/runs/`, which Run assurance and replay read.

Decisions are honoured fail-closed: anything short of an explicit `allow` refuses the effect at the call site. Two things fail closed inside the broker. A policy set that **loaded but is broken** - a malformed file, a duplicate id, an unreadable directory - denies seven of the eight kinds; the exception, `provider.spawn`, is refused a layer down where the provider launches. A policy loader that **throws** (an fs error, not anything you wrote) denies the four write and outcome kinds and abstains on the rest, so a transient error cannot stop every run from starting.

There is **no `network.request` or `mcp.tool` kind**. A provider CLI's own HTTP calls and tool invocations happen inside an opaque subprocess Vibestrate cannot intercept, so a policy kind for them would advertise a checkpoint that does not exist. Network confinement is enforced a layer down, at the container boundary: see [egress allowlist](/docs/concepts/sandbox).

## What does not cross the boundary

Not every byte written under `.vibestrate/` crosses it. A policy reaches a write only when some code path raises that write as an action.

**Gated** - the effects of a run, plus the authoring surfaces: flow files, a Role's prompt, a Role's wiring and its skill *assignments*, `VIBESTRATE.md`, `mcp.json`, a spec-up artifact edit, terminal creation, the guided merge.

**Not gated** - you editing your own settings. `POST /api/config/set`, the Policies page, installing a Crew preset, changing the default Crew, adopting a supervisor persona, editing a Profile, saving a composer preset, `vibe init` and every config command all write directly. `POST /api/skills/fetch` writes `.vibestrate/skills/<name>.md`, so assigning a skill to a Role is gated while *installing* one is not. **A rule that denies `file.write` is not a lock on your config file.** By design: a gate there could refuse a first-time setup, before the project has any policy to consult.

**Not gated** - two things the supervisor does. With `supervisorControl.autonomy: act`, a chat message that creates a task or appends checklist items writes to the roadmap with no broker call; there is no action kind for either, and they are bounded by shape instead, a title or a list of strings, both length-capped, onto a task already on offer. A consult answer that proposes a project policy writes a pending entry into `project.yml`, inert until you confirm it. Starting a run from that same chat message *is* gated, as `run.start`.

## Writing a policy file

The **Policies** page header counts your advise, block and pending rules beside the loaded engine rules. **Your policies** and the read-only **Deterministic engine** sit on the left; **Hard guards**, **Execution** and **Supervisor posture** switches and a **Check a patch** box sit on the right.

Policy files live in `.vibestrate/policies/*.yml`. A file may carry two lists: `rules:` gates *patch content* at apply time, matching added lines by regex or touched files by glob; `actions:` gates *broker effect kinds*, matching a request and returning `deny` or `require_approval`.

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

| Field | Applies to | Meaning |
| --- | --- | --- |
| `providerId` | `provider.spawn` | exact provider id |
| `commandRegex` (+ `commandFlags`) | `command.run` | regex over the command string |
| `pathGlob` | `file.write`, `file.patch` | glob over the written/touched path(s) |
| `status` | `run.complete` | exact terminal verdict (`merge_ready` / `blocked`) |

`run.start`, `terminal.create` and `git.merge` have no match field. An action with no `match` applies to **every** request of its listed `on:` kinds.

Two things about `pathGlob`. **Anchor it at the root**: the path it matches is absolute, so a project-relative pattern like `.vibestrate/project.yml` matches nothing and protects nothing - write `**/.vibestrate/project.yml`. And it is tested against every path an action declares, not only the one it opens, so a rule naming either half of a two-file write (a Role's prompt and its wiring, say) covers the pair. Use `/` separators on every platform; the path is checked in both its native and its `/` spelling.

`require_approval` is accepted on **`run.complete`** and **`file.patch`** only; every other kind is refused at load with an error naming the offending kinds. One honest edge: `file.patch` holds at the diff gate, but the suggestion and bundle **apply** surfaces have no seam, so a hold there refuses the apply and the log records the decision *plus* evidence saying it was refused rather than held.

A policy file that fails to parse contributes **no rules**, and a duplicate rule id keeps only the first, so a stricter rule can vanish while the page still looks healthy. Nothing downstream catches that: the broker only ever sees the rules that *did* load. So a run **refuses to start** while `.vibestrate/policies/` holds a malformed file or a duplicate id, and the broker's loader denies effects on the same condition, covering the surfaces that reach a model without creating a run. Fixing it is never blocked by it: the Policies page, the `/api/policies` routes and the policy CLI all read the files directly.

## Permission modes

A run takes a **permission mode** that decides how much rope it gets, enforced by Vibestrate the same way for **every** provider rather than as a per-model flag. **New run** carries it as a **Permission** control with the four modes and an **Unattended** switch beside them; `policies.defaultPermissionMode` sets the baseline.

<div class="docs-outcomes"><div class="docs-outcome ok"><b>read-only</b><span>No writes at all. Every seat runs read-only (no write grant); claude additionally gets plan mode when hardened, and a codex run gets OS confinement when isolation is on.</span></div><div class="docs-outcome ok"><b>ask</b><span>The agent writes into the worktree, then every resulting change waits for your approval before it's kept - reject and the worktree is rolled back.</span></div><div class="docs-outcome warn"><b>accept-edits</b><span>Changes auto-apply, but the run does not auto-complete - it holds at the completion boundary for your sign-off, then resumes to merge_ready on approval (reject, or an unattended timeout, blocks it).</span></div><div class="docs-outcome warn"><b>auto</b><span>Fully hands-off (the default) - changes apply and the run completes on the evidence, bounded by the gates above and your budget ceilings.</span></div></div>

A gate about a **change** carries the files it is asking about, not only a count: the run page's approval banner lists them with a **Read the diff** link next to **Approve**, **Request changes** and **Reject**. You cannot approve a diff you cannot see.

The modes gate the run-level effects Vibestrate owns: the agent's resulting **diff**, and run **completion**. They do not gate each shell command inside an opaque provider, because codex's subprocess cannot be intercepted per command and claude's `tool_use` stream is display-only. So "ask" means "approve each change", not "approve each command". `read-only` is a real no-write guarantee because Vibestrate never grants write capability; for the strongest wall around a non-codex provider, layer that soft policy with the hard one, the [container backend](/docs/concepts/sandbox).

Avoid combining `ask` with `strictApplyOnly`. Ask holds at the post-turn diff gate, the direct-write path; strict apply-only routes changes through the apply gateway, which *refuses* a change pending approval rather than prompting, so the run lands blocked instead of pausing.

No permission mode pushes or merges your branch, not even `auto`: a run always stops at `merge_ready` and hands you the diff.

## Run assurance

The panel at the top of this page is derived, when a run reaches a terminal state, from the broker log plus the run's review and verification decisions, and written to `assurance.json` beside the action log. Five verdicts:

<div class="docs-outcomes"><div class="docs-outcome ok"><b>verified</b><span>Every applicable check passed - or nothing needed checking.</span></div><div class="docs-outcome warn"><b>partially_verified</b><span>A check that was expected is missing, failed, or weak.</span></div><div class="docs-outcome warn"><b>unverified</b><span>The run reached merge_ready with no meaningful evidence.</span></div><div class="docs-outcome stop"><b>blocked</b><span>The run did not reach merge_ready.</span></div><div class="docs-outcome stop"><b>unsafe</b><span>A policy denied an action, or a rollback failed - don't trust the worktree.</span></div></div>

There is **no confidence score**. A verdict is a level capped by what is missing, not a guess at truth.

Each lane reports in its own vocabulary. Validation is `passed`, `failed`, `environment` (the commands could not run at all), `missing` or `not_applicable`. Review is `approved`, `changes_requested`, `missing`, `skipped_inert_diff` or `not_applicable`. Verification is `passed`, `failed`, `not_run` or `not_applicable`.

`not_applicable` is the one that matters: there was genuinely nothing to check - a docs-only change with no validation commands, a flow with no review or verify step, an inert-diff review skip. Those land in **`notes`**, not in `caps`, so a run where every lane is passed-or-not-applicable reads `verified` with the summary "no checks were required for this change" rather than the shaming `partially_verified`. That level is reserved for a check that *was* expected and is missing, failed, or weak - including a tolerated failure, where a best-effort step gave no scrutiny.

The artifact also records the run's **isolation posture**, derived from per-turn provider evidence rather than config: `sandboxed` (a real OS sandbox ran, today only codex), `hardened` (claude under `--permission-mode plan`), `partial` (a sandbox was requested for a turn that ran unconfined), or `none` (worktree and diff gate only). It never changes the verdict, and the panel shows it only when the run was confined, which is how you confirm after the fact that an opted-in run got the confinement you asked for.

A `blocked` or `unsafe` verdict also carries **`blockers`**, the root causes derived from failed steps and provider give-up events. The summary leads with the first one ("Cause at 'implement': usage-limit: This model is being rate limited..."), so a dead overnight run tells you why at a glance.

The **Tree** tab, first under **Inspect** on the run page, gives the flow's steps and, per step, what each turn did: succeeded, retried after a rate limit, fell back to another model, paused, or failed-but-tolerated. Run-level budget, spend and pause events are there too, all derived from recorded evidence rather than narrated. For providers that stream structured output the step also shows what happened *inside* the turn; for the rest, the inside is marked "opaque".

## Is the review talking about real files?

A reviewer that cites `src/uploader.ts:42` when there is no such file has not read the change - it has produced something that reads like a finding. That is the one hallucination that can be checked exactly, so every run checks it: each finding's cited path is resolved against the worktree the review actually read, and any that do not resolve are recorded as `review.findings.ungrounded` in the run's events with the paths named.

It is **advisory and never a gate**. A reviewer may legitimately name a file the change *should* create, so an unresolved citation points you at that finding rather than dismissing it. A run is never blocked or failed by this check, and a failure inside the check itself cannot affect the run.

<div class="docs-callout tip">

**Why not a smarter check.** Retrieval scoring would answer "is this finding relevant" fuzzily, where the filesystem answers "does this file exist" exactly. The precise question is the one worth asking, and it needs no index, no embeddings and nothing that leaves your machine.

</div>

## Defense in depth

Four layers, and only the first is always on. The other three are opt-in, each honoured independently.

- **Post-turn diff gate** - every write-capable turn is snapshotted before it runs. Afterward its diff is checked against secret and path safety and `file.patch` policies. A denied or unsafe diff is rolled back to the snapshot and the run is blocked.

- **Strict apply-only mode** (`policies.strictApplyOnly`, off) - write roles run read-only and *propose* a unified diff that Vibestrate applies through the broker gateway. Nothing reaches disk without crossing the gate; a refused patch blocks the run.

- **Provider-native OS sandbox** (`execution.isolation`, off) - adds OS *prevention* on top of the diff gate's *detection*. With `sandboxed`, each turn is asked to run under the provider's own OS sandbox, scaled to the seat. **Today this is real only for codex** (`codex exec --sandbox`, Apple Seatbelt or Linux Landlock). A provider with no OS sandbox flag warns once and runs unsandboxed rather than pretending, and the run records only the sandbox that was enforced.

- **Egress allowlist** (`execution.container.egress.mode: allowlist`, off, container backend only) - the run container moves to a Docker network with no gateway, so its only route out is a proxy that refuses any host you did not name. See [the sandbox page](/docs/concepts/sandbox).

Run assurance is not a layer; it is the record of which layers actually ran.

The **Execution** group on the Policies page carries strict apply-only, the interactive terminal, and **Harden read-only seats** (`policies.hardenReadOnlySeats`, off), which runs read-only **claude** seats under `--permission-mode plan` so the CLI itself refuses writes. It is claude's counterpart to the OS sandbox, off because plan mode can add an "awaiting approval" framing to an action-shaped prompt.

## Budget ceilings and provider hiccups

Token cost is often unmeasured for local CLI providers, so beyond the daily **dollar** cap (`budget.spendCapDailyUsd`) there are **count and time ceilings** that bind without it: `budget.maxTurnsPerRun` and `budget.maxWallClockMinPerRun` per run, `budget.maxTurnsPerDay` and `budget.maxWallClockMinPerDay` across today. They are checked before every agent turn; once one is hit the run **stops (blocked)**, logs a `budget.limit` event and notifies you. All five ship off. **Spend cap and ceilings** on the **Metrics** page holds all of them, next to the spend they bind.

One is not optional: `supervisorControl.autonomy: act` lets a chat message start a run, so the config refuses to load in `act` mode unless at least one of the five is set.

Because they ship off, an unattended run with **no ceiling and no confinement** says so before it starts and records an `UNBOUNDED_UNATTENDED_RUN` warning in the event log. It is advice, not a gate; any one ceiling, or `execution.isolation` or `execution.backend: docker`, silences it.

The dollar cap has a configurable action once hit (`budget.capAction`): `stop` (default), `downgrade-model` onto the cheaper `budget.fallbackProfile`, or `reduce-effort`. The count and time ceilings remain the ultimate stop. For **attended** runs, `budget.onLimit: pause` waits for you to approve continuing and `resilience.onExhausted: pause` waits when a provider's retries and fallback run out; both default to the unattended-safe `stop` and `fail`, and the composer's **Unattended** switch forces no-pause regardless of config.

A recoverable provider failure - a rate limit, or a transient blip like a 5xx, an overload or a timeout - is **auto-retried with backoff**. Hard failures like a bad flag, an auth error or empty output are not. If retries run out, a **fallback** runs the turn once on another Profile, picked by `resilience.autoFallback`: `crew` (the default) reseats onto a profile **already seated in this run's flow** on a different provider, so no provider outside the run's trust set ever sees its context; `any` widens it to every configured profile; `off` disables it. The seat keeps its context and its permissions, and every outcome, "no candidate available" included, is a `provider.fallback` event.

A provider that hangs is the other way an unattended run fails to end. Nothing capped a turn's length by default - `profile.timeoutMs` is unset unless you set it - so a wedged CLI could hold a run open forever, which is exactly what `--unattended` promises won't happen. An **inactivity watchdog** now bounds it, and it watches for *silence*, not elapsed time: a model that streams for an hour is working, so a turn that keeps producing output is never interrupted, however long it takes. A turn that produces nothing at all for `resilience.stallTimeoutMs` has its whole process group killed and fails as the class `stall` - which retries under `transient`, then honors `onExhausted` like any other recoverable failure. It defaults to **20 minutes on unattended runs and off on attended ones** (a human is watching those and can stop the run); `0` turns it off everywhere and an explicit number applies to both. The window is generous on purpose: a streaming provider goes quiet for the length of one opaque tool call, so waiting a little longer on a dead run beats killing a live one. It is armed only where silence actually means something - a `claude-code` turn running under `--output-format stream-json`, its default. Set `profile.timeoutMs` to bound a `type: cli` provider, which may legitimately buffer everything until it exits.

<svg viewBox="0 0 560 210" width="100%" style="max-width:560px;height:auto" role="img" aria-label="A failed turn is checked first for a typed stall code, then classified from its stderr text. Stall, rate-limit and transient retry with backoff; usage-limit waits for its reset window; both then try a fallback profile. Hard skips all of it.">
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="0.5" y="30.5" width="150" height="34" rx="8"/>
    <rect x="0.5" y="130.5" width="150" height="34" rx="8"/>
    <rect x="200.5" y="8.5" width="120" height="26" rx="8"/>
    <rect x="200.5" y="42.5" width="120" height="26" rx="8"/>
    <rect x="200.5" y="76.5" width="120" height="26" rx="8"/>
    <rect x="200.5" y="110.5" width="120" height="26" rx="8"/>
    <rect x="200.5" y="152.5" width="120" height="26" rx="8"/>
    <rect x="400.5" y="30.5" width="160" height="34" rx="8"/>
    <rect x="400.5" y="76.5" width="160" height="34" rx="8"/>
    <rect x="400.5" y="130.5" width="160" height="34" rx="8"/>
  </g>
  <g fill="currentColor" fill-opacity="0.07" stroke="currentColor" stroke-opacity="0.7" stroke-width="1">
    <rect x="0.5" y="80.5" width="150" height="34" rx="8"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.5" stroke-width="1">
    <path d="M75 64 L75 80"/>
    <path d="M75 114 L75 130"/>
    <path d="M154 97 L176 97 L176 21 L196 21"/>
    <path d="M154 147 L180 147 L180 55 L196 55"/>
    <path d="M180 89 L196 89"/>
    <path d="M180 123 L196 123"/>
    <path d="M180 165 L196 165"/>
    <path d="M324 21 L362 21 L362 47 L396 47"/>
    <path d="M324 89 L362 89 L362 47"/>
    <path d="M324 123 L380 123 L380 93 L396 93"/>
    <path d="M480 64 L480 72"/>
    <path d="M480 110 L480 126"/>
    <path d="M324 165 L380 165 L380 147 L396 147"/>
  </g>
  <g fill="currentColor" fill-opacity="0.5">
    <polygon points="71.5,74 75,80 78.5,74"/>
    <polygon points="71.5,124 75,130 78.5,124"/>
    <polygon points="190,17.5 196,21 190,24.5"/>
    <polygon points="190,51.5 196,55 190,58.5"/>
    <polygon points="190,85.5 196,89 190,92.5"/>
    <polygon points="190,119.5 196,123 190,126.5"/>
    <polygon points="190,161.5 196,165 190,168.5"/>
    <polygon points="390,43.5 396,47 390,50.5"/>
    <polygon points="356,43.5 362,47 356,50.5"/>
    <polygon points="390,89.5 396,93 390,96.5"/>
    <polygon points="476.5,66 480,72 483.5,66"/>
    <polygon points="476.5,120 480,126 483.5,120"/>
    <polygon points="390,143.5 396,147 390,150.5"/>
  </g>
  <g fill="currentColor" font-size="12" text-anchor="middle">
    <text x="75" y="51">turn failed</text>
    <text x="75" y="101">typed stall code?</text>
    <text x="75" y="151">match stderr text</text>
    <text x="260" y="25">stall</text>
    <text x="260" y="59">rate-limit</text>
    <text x="260" y="93">transient</text>
    <text x="260" y="127">usage-limit</text>
    <text x="260" y="169">hard</text>
    <text x="480" y="51">retry with backoff</text>
    <text x="480" y="97">wait for the window</text>
    <text x="480" y="151">fallback, then fail</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="10.5" font-family="ui-monospace,monospace">
    <text x="0" y="186" text-anchor="start">the stall code is read structurally, not matched as text: as text it would</text>
    <text x="0" y="202" text-anchor="start">classify hard and skip the retries, the fallback and onExhausted together</text>
  </g>
</svg>

How a failed turn is resolved. The class decides which rung it enters at, and only `hard` skips the ladder entirely.

A **subscription usage limit** is a per-model quota that resets hours out, handled separately from a per-minute rate limit. `resilience.usageLimit.action` is `wait` (sleep for the parsed window, capped at `maxWaitMin`), `fallback`, or `stop` (the default, after trying the auto-derived fallback first). A provider failure that does end the run ends loudly with its cause: the classified failure and a redacted excerpt of the provider's real error travel into the step's error, the event log, the Supervisor feed and the assurance verdict, never a bare "provider exited 1".

## Automation

The interactive shell (`vibe`, or `vibe shell`) carries the **Approvals** page for gates waiting on you and a read-only **Config** view of the policy block. Everything else here is CLI, for a script, a hook or CI. Full reference: [CLI overview](/docs/cli/overview).

```bash
vibe assurance <runId>           # the Run assurance verdict, --json for the artifact
vibe audit <runId> --json        # the same tree the Inspect Tree tab renders

vibe policies list               # what's loaded
vibe policies doctor             # the parse/duplicate report; exits non-zero
vibe policies check <patchFile>  # run a diff past the rules, like Check a patch
vibe policies config --strict-apply-only true
vibe policies config --harden-read-only true
vibe config set execution.isolation sandboxed

vibe run --permission-mode ask --unattended
vibe budget set --max-turns-run 40 --max-time-day 120   # use `off` to clear
vibe approvals show <runId> <approvalId>   # the same file list as the banner
vibe approvals approve <runId> <approvalId>
```

The HTTP API mirrors both: `GET /api/runs/:runId/assurance`, `GET /api/runs/:runId/audit`, `GET /api/policies`, `PATCH /api/budget`, and the `unattended` field on `POST /api/runs`.
