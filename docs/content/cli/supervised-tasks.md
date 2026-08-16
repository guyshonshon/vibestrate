---
title: vibe tasks (supervised runs)
description: Author and run supervised tasks - a task with ordered steps you define once and sequence later through the Conductor.
slug: cli/supervised-tasks
---

`vibe tasks` manages this project's tasks. A **supervised** task is one you break into
ordered steps first, with `vibe tasks add --supervised` and `vibe tasks checklist add`.
Each step carries a scoped objective, a plain-language done-when check, and optional file
hints. `vibe tasks run` then works through those steps in order, in a single git worktree,
committing after each one. It stops on its own when a step fails review, when the budget
is reached, or when a between-steps supervisor judges the work has gone off-goal. Only a
failing step's own work is discarded; every step that already committed stays on the
branch. Nothing is ever auto-merged, so a finished supervised task lands as one branch
for you to read.

See [supervised tasks](/docs/concepts/supervised-tasks) for the concept.

## The shape of a run

One plan up front, then a small loop per step, then one review over the whole branch.

```text
  plan once
    │
    ▼
  ┌─ step ───────────────────────────────────┐
  │  micro-plan ─▶ implement ─▶ review       │
  │                    ▲           │         │
  │                    └─── fix ◀──┘         │
  └──────────────┬───────────────────────────┘
                 │ commit, then the supervisor decides:
                 │ proceed · enhance · escalate
                 ▼
             next step  ...  then one holistic review
```

This is the built-in `saga` flow, which is what `vibe flows list` calls "Saga". You do
not pass `--flow` for a supervised task; the Conductor selects it.

## Author the steps

A supervised task starts empty. Create it, then add steps one at a time.

```bash
vibe tasks add --supervised "Migrate the settings schema"
```

The output gives you the id every later command needs:

```text
✓ Task added.
  id: task-migrate-the-settings-schema-7c1e
  title: Migrate the settings schema
```

Ids are `task-` plus a slug of the title plus four random characters, so they are stable
and readable but not guessable. Commands take the whole id, not a prefix.

Then add each step. The text can be unquoted; everything after the task id is joined
into the step's display text.

```bash
vibe tasks checklist add task-migrate-the-settings-schema-7c1e \
  "Update the settings model" \
  --objective "Replace the SettingsV1 type with SettingsV2 in src/models/settings.ts" \
  --acceptance "pnpm typecheck passes with no errors in src/models/" \
  --files "src/models/settings.ts,src/types/settings.ts"
```

```text
✓ Added checklist item ci-update-the-settings-model-9b2d.
  Update the settings model
```

`vibe tasks checklist add` takes exactly three options:

```text
  --objective <text>   the scoped brief the executor gets
  --acceptance <text>  the plain-language done-when check
  --files <list>       comma-separated file hints, re-read
                       from the worktree at the step
```

### What a good step looks like

The objective is the whole brief a fresh model gets for that step, so name the file, the
type, and the constraint. The acceptance check is what makes a step verifiable rather
than an opinion.

```text
  weak    objective:  "clean up settings"
          acceptance: "it works"

  strong  objective:  "Replace SettingsV1 with SettingsV2 in
                       src/models/settings.ts. Leave the
                       route handlers to a later step."
          acceptance: "pnpm typecheck passes with no errors
                       in src/models/"
```

A step gets a fresh model context, grounded by a curated packet: the feature goal, the
invariants ledger, compact outcomes of the prior steps, the accumulated diff so far, and
the current bytes of that step's file hints re-read from the worktree. Every section is
secret-redacted before it reaches a provider.

### Editing and reordering

`vibe tasks checklist edit` changes only a step's display text; the objective, acceptance
check and file hints it already has are left untouched. The CLI has no flag for revising
those three fields. Edit them in the step detail view in Mission Control, or remove the
step and add it again.

```bash
vibe tasks checklist edit <taskId> <itemId> <text...>
vibe tasks checklist move <taskId> <itemId> <position>
```

`move` shifts one step at a time.

## Run it

```bash
vibe tasks run task-migrate-the-settings-schema-7c1e
```

`vibe tasks run` runs any task: a supervised one sequences its steps, a plain one runs the
default flow once. `vibe tasks sequence` is the supervised path on its own, and it is the
entry the scheduler and the dashboard use. Only `sequence` accepts `--json`.

Re-running resumes. Steps already marked done are filtered out before the run starts, so
a halted task picks up from the clean tip rather than redoing finished work.

```bash
vibe tasks sequence task-migrate-the-settings-schema-7c1e --json
```

```text
{
  "taskId": "task-migrate-the-settings-schema-7c1e",
  "supervisedState": "halted",
  "supervisedHalt": {
    "reason": "self-heal-exhausted",
    "atStepId": "ci-migrate-the-write-path-4a08",
    "summary": "Review still requested changes after the fix loop."
  },
  "runExitCode": 3
}
```

**A halt exits 0.** Stopping with a recorded reason is a real outcome, not a tool
failure, so only a run that threw exits non-zero. In a script, branch on
`supervisedState`, never on the exit code alone.

## When it stops, and what happens to your code

```text
  a step failed review after its fix loop
      -> that step's work is discarded, the step goes
         back to pending, earlier commits stay
  maxSteps or maxSpendUsd reached (between steps)
      -> everything committed so far is kept
  the supervisor returned escalate (work went off-goal)
      -> everything committed so far is kept
  enhance wants to add a step, or drop one you wrote
      -> everything committed so far is kept
```

The failed-review case is the only one that throws work away, and it throws away exactly
one step's worth, so the branch always ends at a step boundary you can read.

`maxSpendUsd` is checked **between** steps, not mid-step, so the step that crosses the
line still finishes and still costs what it costs. For an unattended supervised task, set
the project daily spend cap as the mid-step backstop.

## Watch it

```bash
vibe tasks status task-migrate-the-settings-schema-7c1e
```

```text
• task-migrate-the-settings-schema-7c1e Migrate the settings schema (halted)
  Progress: 2/5 steps done
  ✓ 1. Update the settings model [done] - added SettingsV2, kept V1 as an alias
  ✓ 2. Migrate the read path [done] - routes now read through SettingsV2
  • 3. Migrate the write path [pending]

! Halted self-heal-exhausted
  ...

• Invariants (1)
  - Settings types live in src/models/settings.ts; nothing else defines them
```

The lifecycle is `idle`, `sequencing`, `paused`, `halted`, or `done`. `--json` emits the
whole object, which is the same shape the dashboard's Conductor view reads.

Invariants are cross-cutting decisions the supervisor recorded. They are re-injected into
every later step's packet, which is what stops conventions from drifting as the outcome
summaries fold.

### Pause and resume

```bash
vibe tasks pause  <taskId>   # halt at the next step boundary
vibe tasks resume <taskId>   # clear the pause
```

Both act on the live run holding the task's run lock, so there is nothing to pause when
no run is sequencing. A `halted` task has no live run either: `resume` tells you so and
points at `vibe tasks sequence` to re-attempt from the clean tip.

## Budget and the supervisor

Both are project config, and `vibe config keys supervised` prints the live schema:

```text
supervised.maxSpendUsd         number | null  ·  default null
supervised.maxSteps            number | null  ·  default 20
supervised.supervisor.enabled  boolean  ·  default true
supervised.supervisor.profile  string | null  ·  default null
supervised.supervisor.roleId   string  ·  default "reviewer"
```

So out of the box a supervised task is capped at 20 steps with no spend ceiling, and the
between-steps supervisor is on, running on the crew's `reviewer` role.

The supervisor is deliberately cheap and deliberately advisory. A turn that fails or
comes back unparseable folds to `proceed`, because the per-item review is what fails
closed on correctness. The one thing the supervisor can do on its own is halt.

Its `enhance` verdict re-grounds the steps that have not run yet against the code as it
now stands: it may refine, reorder, or remove them. It may **not** add a step or drop a
step you wrote. Either of those halts the run for you instead, with the committed work
kept.

## The rest of the checklist commands

Every one of these is prefixed with `vibe tasks checklist`:

```text
list     <taskId>                     [--json]
add      <taskId> <text...>           [--objective]
                                      [--acceptance] [--files]
check    <taskId> <itemId>            mark done
uncheck  <taskId> <itemId>            back to pending
status   <taskId> <itemId> <status>   pending | in_progress |
                                      done | blocked
edit     <taskId> <itemId> <text...>  display text only
move     <taskId> <itemId> <position>
remove   <taskId> <itemId>
promote  <taskId> <itemId>            split it into its own task
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

## Dashboard parity

Supervised tasks appear as container cards on the **Board** page. The task detail view is
where you author step objectives, acceptance checks and file hints - the same three
fields `vibe tasks checklist add` writes, and the only place any of them can be revised
after the fact. Reordering is available by drag there.

The detail view also carries the live **Conductor** panel, which mirrors `vibe tasks
status`: step progress, the invariants ledger, and the controls. The primary button reads
**Sequence**, or **Re-sequence** when the task is halted, and becomes **Pause** /
**Resume** while a run is live.

**Sequence** queues the task rather than starting it inline. The scheduler picks it up and
spawns the same command the CLI runs, so the dashboard never shells out over HTTP. The
practical difference is timing: the CLI starts the run in your terminal and blocks, while
the dashboard hands it to the scheduler and returns straight away.

## What is coming next

The Conductor is complete, including the autonomous enhance re-ground pass. Still to come
is a *manual* enhance trigger - running the re-ground on demand between runs, with a
dry-run diff to review first.

## Related

- [supervised tasks](/docs/concepts/supervised-tasks) - what a supervised task is and how it differs from a plain task.
- [Task](/docs/concepts/task) - the base task concept.
- [CLI overview](/docs/cli/overview) - the shape of the `vibe` command.
