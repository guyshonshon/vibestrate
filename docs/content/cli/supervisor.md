---
title: vibe supervisor
description: The supervisor's kill switch from a terminal - stop it acting, resume it, check whether it may act - plus the persona commands.
slug: cli/supervisor
---

## In simple words

`vibe supervisor stop` is the kill switch.

```bash
vibe supervisor stop      # it may still answer; it may not act
vibe supervisor status    # may it act right now?
vibe supervisor resume
```

It stops the supervisor **acting**: it will still answer you, but it cannot create a task, add checklist items, or start a run.

<div class="docs-callout tip">

**Tip.** It writes a flag to disk rather than editing your config, so it takes effect at once, survives a restart, and works from a terminal. The moment you most want a stop button is not reliably a moment you have a browser tab open.

</div>

## Stop, versus the permission switch

<div class="docs-cards">

**`vibe supervisor stop`**
A flag on disk. Immediate, survives restarts, reachable from a terminal.

**The Answers only switch**
A per-conversation permission in the dashboard.

**The red square**
Interrupts the turn running right now.

**None of them are the same control**
Which is why all three exist.

</div>

<div class="docs-callout">

**Did you know?** One word covers two things here. `vibe supervisor list`, `archetypes`, `adopt`, `default` and `remove` manage the *persona* - how strict reviews are. `stop`, `resume` and `status` belong to the *conversation*. Same command, two subjects.

</div>


## Going deeper

### Every subcommand

```text
vibe supervisor <subcommand>   (bare: same as list)

list          resolved personas, built-in + project
archetypes    the catalog you can adopt
adopt <id>    copy an archetype into project.yml
default <id>  set this project's default
remove <id>   delete a project persona
stop          stop it acting; it still answers
resume        let it act again
status        whether it may act right now
```

Two flags, and the subcommands that take them:

```text
--json     list, archetypes, status
--reason   stop
```

`list` and `archetypes` read the catalog and work anywhere; everything else needs a Vibestrate project in the current directory.

### Stop and resume

```bash
vibe supervisor stop --reason "reviewing the diff"
vibe supervisor resume
```

`--reason` is optional and free text. It is what the supervisor says back when you ask a stopped one to do something, and `status` prints it. Resuming clears it.

```text
! Supervisor stopped. It will answer, but it
  will not act. (reviewing the diff)
✓ Supervisor resumed. It can act again, within
  your autonomy setting.
```

The CLI prints each of those whole. They are wrapped here to fit the page.

### Whether it may act right now

```bash
vibe supervisor status
vibe supervisor status --json
```

```text
✓ Running - may act, within your autonomy setting.
```

The `--json` form prints the flag as it is stored:

```json
{
  "pause": {
    "paused": true,
    "reason": "",
    "updatedAt": "2026-08-15T12:49:34.169Z"
  }
}
```

"Within your autonomy setting" is doing real work in that sentence. Two independent controls have to agree before the supervisor acts: this flag, and `supervisorControl.autonomy` in your config. `status` reports the flag. A cleared flag with autonomy left on `advise` still means it answers and nothing more. See [Supervisor Control](/docs/concepts/supervisor-control).

<svg viewBox="0 0 560 112" width="100%" style="max-width:560px;height:auto" role="img" aria-label="The supervisor acts only when both controls agree: the pause flag says running, and autonomy in your config is set to act. Then it may create a task, add TODOs, or start a run.">
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="1" y="4" width="210" height="44" rx="8"/>
    <rect x="1" y="60" width="210" height="44" rx="8"/>
    <rect x="330" y="32" width="210" height="44" rx="8"/>
    <path d="M211 26 H250 M211 82 H250 M250 26 V82 M250 54 H323"/>
  </g>
  <g fill="currentColor" fill-opacity="0.28">
    <path d="M330 54 l-7 -4 v8 z"/>
  </g>
  <g fill="currentColor" font-size="12" font-family="ui-monospace,monospace">
    <text x="16" y="24">pause flag: running</text>
    <text x="16" y="80">autonomy: act</text>
    <text x="435" y="52" text-anchor="middle">it may act</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="11">
    <text x="16" y="40">what status reports</text>
    <text x="16" y="96">what your config says</text>
    <text x="286" y="48" text-anchor="middle">and</text>
    <text x="435" y="70" text-anchor="middle">a task, TODOs, a run</text>
  </g>
</svg>

<div class="docs-callout warn">

**The neighbouring commands are about a run, not the supervisor.** `vibe pause`, `vibe resume` and `vibe abort` are top-level and each takes a run id. Stopping the supervisor takes none, because it is about every future action rather than one run.

</div>

The file is `.vibestrate/supervisor/paused.json`, and it is not a secret. If it ever gets into a state you cannot clear, delete it - a missing file reads as running.

### Personas

`list` shows what this project resolves to, built-ins first, with the default marked. Two ship in code, and anything under `personas` in your `project.yml` is listed after them as `[project]`:

```bash
vibe supervisor list
```

```text
Supervisor personas
  → staff-engineer (default) [built-in]
      Correctness, risk, and blast-radius first.
      lenses: correctness, tests, security-risk
  → security [built-in]
      Authorization, secrets, and injection first.
      lenses: authz, secrets, injection
      posture: prefers sandbox-suggested for
        risky tasks
```

Each description prints in full on one line; they are shortened and wrapped above to fit this page.

`archetypes` lists the curated catalog you can adopt, each marked when it is already in your config. Adopting one copies its definition into `project.yml` under `personas`, then you point the default at it:

```bash
vibe supervisor archetypes
vibe supervisor adopt security-hawk
vibe supervisor default security-hawk
```

The catalog ships with six:

```text
security-hawk             performance-skeptic
correctness-purist        frontend-reviewer
data-migration-guardian   ship-fast-pragmatist
```

Only the id travels: the definition is Vibestrate's own, so an id it does not know is refused rather than invented.

`remove` deletes a persona from your config. It refuses three things, each with the reason: a built-in (it lives in code, so there is nothing to remove), the persona that is the current default (re-point the default first), and an id that is not in your config.

Every write goes through the same service the dashboard uses, and the whole config is re-validated before it lands. A change that would leave your config invalid is refused, not written.

Outside a project, the write commands say so rather than guessing at a root:

```text
No Vibestrate project here. Run `vibe init` first.
```
