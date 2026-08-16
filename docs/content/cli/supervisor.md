---
title: vibe supervisor
description: The supervisor's kill switch from a terminal - stop it acting, resume it, check whether it may act - plus the persona commands.
slug: cli/supervisor
---

`vibe supervisor stop` is the kill switch. It stops the supervisor **acting**: it will still answer you, but it cannot create a task, add checklist items, or start a run. It writes a flag to disk instead of editing your config, so it takes effect at once, survives a restart, and works from a terminal - which matters, because the moment you most want a stop button is not reliably a moment you have a browser tab open.

It stops the **next** action, not one already taken. A run the supervisor started before you typed this keeps going; `vibe abort` is what stops that.

The flag **fails closed**. If Vibestrate cannot read that file - corrupt, half-written, wrong permissions - the supervisor is treated as stopped. A stop that quietly degrades to "go" is not a stop. A missing file is the one exception, and it honestly means running: nothing has ever been stopped here.

The rest of the commands manage [personas](/docs/concepts/supervisor) - which judgment posture the supervisor brings to a run.

## Every subcommand

```text
vibe supervisor                  same as list
vibe supervisor list             resolved personas, built-in + project
vibe supervisor archetypes       the catalog you can adopt
vibe supervisor adopt <id>       copy an archetype into project.yml
vibe supervisor default <id>     set this project's default
vibe supervisor remove <id>      delete a project persona
vibe supervisor stop             stop it acting; it still answers
vibe supervisor resume           let it act again
vibe supervisor status           whether it may act right now
```

`--json` is accepted by `list`, `archetypes` and `status`. `--reason` only by `stop`. `list` and `archetypes` read the catalog and work anywhere; everything else needs a Vibestrate project in the current directory.

## Stop and resume

```bash
vibe supervisor stop --reason "reviewing the last diff"
vibe supervisor resume
```

`--reason` is optional and free text. It is what the supervisor says back when you ask a stopped one to do something, and `status` prints it. Resuming clears it.

```text
! Supervisor stopped. It will answer, but it will not act. (reviewing the last diff)
✓ Supervisor resumed. It can act again, within your autonomy setting.
```

## Whether it may act right now

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

<div class="docs-callout warn">

**The neighbouring commands are about a run, not the supervisor.** Top-level `vibe pause`, `vibe resume` and `vibe abort` each take a run id. `vibe supervisor stop` takes none, because it is about every future action rather than one run.

</div>

The file is `.vibestrate/supervisor/paused.json`, and it is not a secret. If it ever gets into a state you cannot clear, delete it - a missing file reads as running.

## Personas

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
      posture: prefers sandbox-suggested for risky tasks
```

Each description prints in full on one line; they are shortened above to fit this page.

`archetypes` lists the curated catalog you can adopt, each marked when it is already in your config. Adopting one copies its definition into `project.yml` under `personas`, then you point the default at it:

```bash
vibe supervisor archetypes
vibe supervisor adopt security-hawk
vibe supervisor default security-hawk
```

The catalog ships with `security-hawk`, `performance-skeptic`, `correctness-purist`, `frontend-reviewer`, `data-migration-guardian` and `ship-fast-pragmatist`. Only the id travels: the definition is Vibestrate's own, so an id it does not know is refused rather than invented.

`remove` deletes a persona from your config. It refuses three things, each with the reason: a built-in (it lives in code, so there is nothing to remove), the persona that is the current default (re-point the default first), and an id that is not in your config.

Every write goes through the same service the dashboard uses, and the whole config is re-validated before it lands. A change that would leave your config invalid is refused, not written.

Outside a project, the write commands say so rather than guessing at a root:

```text
No Vibestrate project here. Run `vibe init` first.
```
