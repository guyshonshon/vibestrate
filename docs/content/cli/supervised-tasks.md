---
title: vibe tasks (supervised runs)
description: Author and run supervised tasks - a task with ordered steps you define once and sequence later through the Conductor.
slug: cli/supervised-tasks
---

## In simple words

`vibe tasks` manages this project's tasks. A **supervised** task is one you break into ordered steps first, so each step is reviewed on its own instead of arriving as one large diff.

```bash
vibe tasks add --supervised "Add team billing"
vibe tasks checklist add <task-id> "Create the teams table"
vibe tasks run <task-id>
```

<div class="docs-callout tip">

**Tip.** Reach for this when a single diff would be too big to review honestly. The point is not more automation - it is smaller units of work a human can actually check one at a time.

</div>

## When it beats a plain run

<div class="docs-cards">

**Several changes, one title**
A migration with four stages, a feature with two halves.

**Review has to be per-part**
A schema change and a UI tweak deserve different attention.

**The plan may need to change**
Between steps the supervisor can re-plan against what actually happened.

**You want to stop midway**
Each step is a natural place to walk away.

</div>

<div class="docs-callout">

**Did you know?** Between steps the supervisor returns proceed, re-plan or stop. That middle verdict is what lets a supervised task survive a step turning out differently than planned, rather than marching the rest of the sequence into a stale assumption.

</div>


## Going deeper

### The shape of a run

One plan up front, then a small loop per step, then one review over the whole branch.

<svg viewBox="0 0 560 176" width="100%" style="max-width:560px;height:auto" role="img" aria-label="One plan up front, then a loop for each step - micro-plan, then implement, then review, with a fix loop back to implement - then a commit and the supervisor's decision: proceed, enhance or escalate.">
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="1" y="32" width="86" height="36" rx="8"/>
    <rect x="106" y="8" width="452" height="100" rx="10"/>
    <rect x="118" y="32" width="128" height="36" rx="8"/>
    <rect x="268" y="32" width="128" height="36" rx="8"/>
    <rect x="418" y="32" width="128" height="36" rx="8"/>
    <rect x="106" y="126" width="452" height="40" rx="8"/>
    <path d="M88 50 H98"/>
    <path d="M248 50 H260"/>
    <path d="M398 50 H410"/>
    <path d="M482 68 V86 H332 V74"/>
    <path d="M332 108 V118"/>
  </g>
  <g fill="currentColor" fill-opacity="0.28">
    <path d="M104 50 L97 46.5 L97 53.5 Z"/>
    <path d="M266 50 L259 46.5 L259 53.5 Z"/>
    <path d="M416 50 L409 46.5 L409 53.5 Z"/>
    <path d="M332 68 L328.5 75 L335.5 75 Z"/>
    <path d="M332 124 L328.5 117 L335.5 117 Z"/>
  </g>
  <g fill="currentColor" font-size="12" font-family="ui-monospace,monospace" text-anchor="middle">
    <text x="44" y="55">plan once</text>
    <text x="182" y="55">micro-plan</text>
    <text x="332" y="55">implement</text>
    <text x="482" y="55">review</text>
    <text x="332" y="145">commit, then the supervisor decides</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="11">
    <text x="118" y="26">each step</text>
    <text x="407" y="100" text-anchor="middle">fix</text>
    <text x="332" y="160" text-anchor="middle">proceed · enhance · escalate</text>
  </g>
</svg>

Then the next step, and one holistic review over the whole branch at the end.

This is the built-in `saga` flow, which is what `vibe flows list` calls "Saga". You do
not pass `--flow` for a supervised task; the Conductor selects it.

### Author the steps

A supervised task starts empty. Create it, then add steps one at a time.

```bash
vibe tasks add --supervised "Settings v2"
```

The output gives you the id every later command needs:

```text
✓ Task added.
  id: task-settings-v2-7c1e
  title: Settings v2
```

Ids are `task-` plus a slug of the title plus four random characters, so they are stable
and readable but not guessable. Commands take the whole id, not a prefix.

Then add each step. The text can be unquoted; everything after the task id is joined
into the step's display text.

```bash
vibe tasks checklist add task-settings-v2-7c1e \
  "Update the model" \
  --objective "Replace the SettingsV1 type with \
SettingsV2 in src/models/settings.ts" \
  --acceptance "pnpm typecheck passes with no \
errors in src/models/" \
  --files "src/models/settings.ts"
```

```text
✓ Added checklist item ci-update-the-model-9b2d.
  Update the model
```

`vibe tasks checklist add` takes exactly three options:

```text
--objective <text>    the executor's scoped brief
--acceptance <text>   the done-when check, in
                      plain language
--files <list>        comma-separated file hints,
                      re-read from the worktree
                      at the step
```

### What a good step looks like

The objective is the whole brief a fresh model gets for that step, so name the file, the
type, and the constraint. The acceptance check is what makes a step verifiable rather
than an opinion.

```text
weak
  objective:   "clean up settings"
  acceptance:  "it works"

strong
  objective:   "Replace SettingsV1 with SettingsV2
                in src/models/settings.ts. Leave the
                route handlers to a later step."
  acceptance:  "pnpm typecheck passes with no
                errors in src/models/"
```

A step gets a fresh model context, grounded by a curated packet:

- the feature goal,
- the invariants ledger,
- compact outcomes of the prior steps,
- the accumulated diff so far,
- the current bytes of that step's file hints, re-read from the worktree.

Every section is secret-redacted before it reaches a provider.

### Editing and reordering

`vibe tasks checklist edit` changes only a step's display text. The objective,
acceptance check and file hints it already has are left untouched.

The CLI has no flag for revising those three fields. Edit them in the step detail view
in Mission Control, or remove the step and add it again.

```bash
vibe tasks checklist edit <taskId> <itemId> \
  <text...>
vibe tasks checklist move <taskId> <itemId> \
  <position>
```

`move` shifts one step at a time.

### Run it

```bash
vibe tasks run task-settings-v2-7c1e
```

`vibe tasks run` runs any task: a supervised one sequences its steps, a plain one runs the
default flow once. `vibe tasks sequence` is the supervised path on its own, and it is the
entry the scheduler and the dashboard use. Only `sequence` accepts `--json`.

Re-running resumes. Steps already marked done are filtered out before the run starts, so
a halted task picks up from the clean tip rather than redoing finished work.

```bash
vibe tasks sequence task-settings-v2-7c1e --json
```

```text
{
  "taskId": "task-settings-v2-7c1e",
  "supervisedState": "halted",
  "supervisedHalt": {
    "reason": "self-heal-exhausted",
    "atStepId": "ci-migrate-the-write-path-4a08",
    "summary": "Review still asked for changes."
  },
  "runExitCode": 3
}
```

**A halt exits 0.** Stopping with a recorded reason is a real outcome, not a tool
failure, so only a run that threw exits non-zero. In a script, branch on
`supervisedState`, never on the exit code alone.

### When it stops, and what happens to your code

<div class="docs-outcomes">
<div class="docs-outcome stop"><b>a step failed review after its fix loop</b><span>That step's work is discarded and the step goes back to pending. Earlier commits stay.</span></div>
<div class="docs-outcome warn"><b>maxSteps or maxSpendUsd reached</b><span>Checked between steps. Everything committed so far is kept.</span></div>
<div class="docs-outcome warn"><b>the supervisor returned escalate</b><span>The work went off-goal. Everything committed so far is kept.</span></div>
<div class="docs-outcome warn"><b>enhance wants to add a step, or drop one you wrote</b><span>Everything committed so far is kept.</span></div>
</div>

The failed-review case is the only one that throws work away, and it throws away exactly
one step's worth, so the branch always ends at a step boundary you can read.

`maxSpendUsd` is checked **between** steps, not mid-step, so the step that crosses the
line still finishes and still costs what it costs. For an unattended supervised task, set
the project daily spend cap as the mid-step backstop.

### Watch it

```bash
vibe tasks status task-settings-v2-7c1e
```

```text
• task-settings-v2-7c1e Settings v2 (halted)
  Progress: 2/5 steps done
  ✓ 1. Update the model [done] - added V2
  ✓ 2. Migrate the read path [done] - on V2
  • 3. Migrate the write path [pending]

! Halted self-heal-exhausted
  ...

• Invariants (1)
  - Settings types live only in
    src/models/settings.ts
```

The lifecycle is `idle`, `sequencing`, `paused`, `halted`, or `done`. `--json` emits the
whole object, which is the same shape the dashboard's Conductor view reads.

Invariants are cross-cutting decisions the supervisor recorded. They are re-injected into
every later step's packet, which is what stops conventions from drifting as the outcome
summaries fold.

### Pause and resume

```bash
vibe tasks pause  <taskId>   # at the next boundary
vibe tasks resume <taskId>   # clear the pause
```

Both act on the live run holding the task's run lock, so there is nothing to pause when
no run is sequencing. A `halted` task has no live run either: `resume` tells you so and
points at `vibe tasks sequence` to re-attempt from the clean tip.

### Budget and the supervisor

Both are project config, and `vibe config keys supervised` prints the live schema:

```text
supervised.maxSpendUsd
    number | null  ·  default null
supervised.maxSteps
    number | null  ·  default 20
supervised.supervisor.enabled
    boolean  ·  default true
supervised.supervisor.profile
    string | null  ·  default null
supervised.supervisor.roleId
    string  ·  default "reviewer"
```

(Wrapped here to fit; the CLI prints each key and its type on one line.)

So out of the box a supervised task is capped at 20 steps with no spend ceiling, and the
between-steps supervisor is on, running on the crew's `reviewer` role.

The supervisor is deliberately cheap and deliberately advisory. A turn that fails or
comes back unparseable folds to `proceed`, because the per-item review is what fails
closed on correctness. The one thing the supervisor can do on its own is halt.

Its `enhance` verdict re-grounds the steps that have not run yet against the code as it
now stands: it may refine, reorder, or remove them. It may **not** add a step or drop a
step you wrote. Either of those halts the run for you instead, with the committed work
kept.

### The rest of the checklist commands

Every one of these is prefixed with `vibe tasks checklist`:

```text
list     <taskId>              [--json]
add      <taskId> <text...>    [--objective]
                               [--acceptance]
                               [--files]
check    <taskId> <itemId>     mark done
uncheck  <taskId> <itemId>     back to pending
status   <taskId> <itemId> <status>
             pending | in_progress | done | blocked
edit     <taskId> <itemId> <text...>
             display text only
move     <taskId> <itemId> <position>
remove   <taskId> <itemId>
promote  <taskId> <itemId>
             split it into its own task
```

`vibe tasks list` and `vibe tasks show` cover the tasks themselves and both accept
`--json`. `show` takes a task id and prints each step in order with its status,
objective, acceptance check and file hints.

Not every command takes `--json`. `run`, `pause`, `resume`, and every `checklist`
command except `checklist list` print human-readable output only.

### A note on `vibe tasks enhance`

`vibe tasks enhance` is a different feature that happens to share a word. It takes a task
id and runs a read-only assist that proposes a checklist for it, with `--apply` to append
the proposed items. It has nothing to do with the supervisor's `enhance` verdict during a
run.

### Dashboard parity

Supervised tasks appear as container cards on the **Board** page. The task detail view is
where you author step objectives, acceptance checks and file hints - the same three
fields `vibe tasks checklist add` writes, and the only place any of them can be revised
after the fact.

You can reorder steps there too, by dragging them.

The detail view also carries the live **Conductor** panel, which mirrors `vibe tasks
status`: step progress, the invariants ledger, and the controls. The primary button reads
**Sequence**, or **Re-sequence** when the task is halted, and becomes **Pause** /
**Resume** while a run is live.

**Sequence** queues the task rather than starting it inline. The scheduler picks it up and
spawns the same command the CLI runs, so the dashboard never shells out over HTTP.

The practical difference is timing: the CLI starts the run in your terminal and blocks,
while the dashboard hands it to the scheduler and returns straight away.

### What is coming next

The Conductor is complete, including the autonomous enhance re-ground pass. Still to come
is a *manual* enhance trigger - running the re-ground on demand between runs, with a
dry-run diff to review first.

### Related

- [supervised tasks](/docs/concepts/supervised-tasks) - what a supervised task is and how it differs from a plain task.
- [Task](/docs/concepts/task) - the base task concept.
- [CLI overview](/docs/cli/overview) - the shape of the `vibe` command.
