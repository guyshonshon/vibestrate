---
title: Configuration & settings
description: Everything you can tune lives in one committed folder at your project root.
slug: concepts/configuration
---

## In simple words

Your project's settings are a screen. `vibe ui` opens the dashboard on `127.0.0.1:4317`, and **More > Config** lists every setting Vibestrate has, grouped, each one editable where it sits.

Three surfaces read the same file, and only one of them writes:

<div class="docs-cards">

**The Config page**
Grouped and editable, one control per setting, validated as you type.

**The shell's Config page**
The same values, read-only, without leaving the terminal.

**`vibe config`**
`show`, `get`, `set`. The scripting path, and the only one that reaches the three shell-command keys.

</div>

Behind that screen is one committed folder at your project root. `vibe init` writes all of it except `flows/`, which appears the first time you write or install a flow:

```
.vibestrate/
  project.yml      providers, profiles, crews, flows, policies, validation commands
  rules.md         guidance loaded into every turn
  roles/           one file per worker's instructions
  skills/          house rules any role can read
  policies/        deterministic rules
  runs/            per-run artifacts, state and metrics
  flows/           your own and installed flows, once you have any
```

It is plain YAML inside your repo.

<div class="docs-callout tip">

**Tip.** The Config page is not a viewer. Its fields come off the same schema `vibe config set` writes through, and an edit in the browser calls the same setter, so the two surfaces cannot drift apart or validate differently.

</div>

<div class="docs-callout">

**Did you know?** Because the whole folder is committed, "it works on my machine" stops being a category of problem. A teammate who clones the repo gets your crews, your flows, your policies and your validation commands, and their runs behave the way yours do.

</div>


## Going deeper

### The Config page

The header names the file being edited and counts what is in it. Below it, two columns of groups: **Project**, **Git**, **Workflow**, **Execution**, **Budget**, **Supervised runs**, **Resilience**, **Session**, **Validation commands**, **Permissions**, **Safety policies**, **Posture**, **Scheduler**, **Editor**, **Commits** and **Merge**. A group is a key's own top-level namespace, so `supervisorControl` has one too, under its raw dotted name rather than a friendly label. Everything with no dot in its name - `providers`, `profiles`, `crews`, `personas`, `defaultCrew`, `defaultFlow`, `defaultPersona`, `flowSizing`, `adaptiveSpecUp` and the rest - lands in **General**.

Each row carries the dotted key, the description the schema itself supplies, and a control picked from the field's type: a switch for a boolean, a dropdown for a fixed set of values, a text box that commits on blur or Enter, a JSON box for an array or object. A `saved` tick confirms the write, and a rejected value rolls back and shows the schema's own message. What reaches the schema is not quite the characters you typed: `true` and `false` arrive as booleans, a numeric string as a number, `null` as an empty string, and text opening with `[`, `{` or `"` is parsed as JSON. That reading happens first and validation still decides; a value that fails it is not bent into one that passes.

Two kinds of row do not edit in place:

- **Records** - `providers`, `profiles`, `crews`, `personas`, `permissions.profiles`, `commands.validationProfiles` and `scheduler.sourceQuotas`. Id-keyed maps with no single value to set, so the row shows a read-only summary instead of a control. Only `permissions.profiles` links out, with **Open Settings**; the other six leave you with the summary.
- **Shell commands** - `commands.validate`, `editor.command`, `editor.args`. A later run spawns whatever these point at, so the server never accepts a shell command string over HTTP. The row stays read-only and names the `vibe config set` that writes it.

### In the terminal shell

`vibe shell` carries a Config page too, opened from the `:` palette as **Go to Config** rather than a number key. It renders the grouped, readable projection `vibe config view` prints, section by section, with arrow keys or `j`/`k` to move. It reads rather than edits.

### The commands

The CLI is the automation path: a setup script, a CI job, or the moment you already know the key you want.

```bash
vibe config view          # grouped, readable
vibe config view --json   # the same, as JSON
vibe config show          # raw project.yml
vibe config keys          # every settable key
vibe config validate      # check the schema

vibe config get commands.validate
vibe config set workflow.requireHumanMerge true
```

Arrays and objects go in as JSON, so the validation commands look like `vibe config set commands.validate '["pnpm test"]'`.

The three shell-command keys above are read-only in the browser on purpose. A handful of others are out of the Config page's reach for less deliberate reasons: `scheduler.sourceQuotas` has no editor anywhere in the dashboard, `commands.validationProfiles` offers a rename control and nothing else, and the record rows link out only for `permissions.profiles`. For those, `vibe config set` is the path.

### What lives in `project.yml`

The file is split into top-level sections. The Config page groups them for you; this is which concept explains each one.

| Section | Concept |
|---|---|
| `git`, `merge` | [Worktree](/docs/concepts/worktree) |
| `workflow`, `commands` | [Workflow](/docs/concepts/workflow) |
| `execution` | [Container isolation](/docs/concepts/sandbox) |
| `providers`, `profiles` | [Provider](/docs/concepts/provider), [Profile](/docs/concepts/profile) |
| `crews`, `defaultCrew` | [Crew](/docs/concepts/crew), [Role](/docs/concepts/role) |
| `defaultFlow`, `flowSizing` | [Flow](/docs/concepts/flow) |
| `personas`, `defaultPersona`, `supervisorControl` | [Supervisor](/docs/concepts/supervisor), [Supervisor control](/docs/concepts/supervisor-control) |
| `projectPolicies` | [Policies](/docs/concepts/policies) |
| `permissions`, `policies`, `posture` | [Safety](/docs/concepts/safety) |
| `adaptiveSpecUp` | [Spec-up](/docs/concepts/spec-up) |
| `codebaseMapRoles` | [VIBESTRATE.md](/docs/concepts/vibestrate-md) |
| `ponytail` | [Ponytail](/docs/concepts/ponytail) |
| `supervised` | [Supervised tasks](/docs/concepts/supervised-tasks) |

`project`, `methodologyRoles`, `budget`, `resilience`, `session`, `scheduler`, `editor` and `commits` have no concept page. They are described field by field, from the source, in the [`project.yml` reference](/docs/reference/config).

### What sits outside `project.yml`

The rest of `.vibestrate/` holds files you edit directly: `roles/` (one JSON role file each), `skills/` ([skills](/docs/concepts/skill) that load as extra context), `flows/` (your own [flow](/docs/concepts/flow) definitions), and `policies/` (what the safety engine compiles).

`rules.md` is your **project instructions**: advisory guidance read on every agent turn. The enforced rules are [policies](/docs/concepts/safety). Once one page is not enough, add markdown files under `rules/` and they compose onto it, sorted by filename and each labelled with its source. Name them for the order you want: `10-style.md`, then `20-testing.md`. Instructions enter every agent turn of every run, so the composed ruleset is size-bounded, and `vibe doctor` reports anything truncated or refused rather than letting your rules quietly stop arriving.

`runs/` holds per-run artifacts, state and metrics. Nothing adds it to your `.gitignore` for you, so add `.vibestrate/runs/` yourself unless you want run history in the repo.

### Secrets stay out

Beyond the `env:` rule for provider keys, Vibestrate never reads your `.env` contents into a prompt, an artifact, or a report. See [Safety](/docs/concepts/safety) for the guarantees around what a run may touch.

### Related

- [`project.yml` reference](/docs/reference/config) - the generated, field-by-field schema.
- [Crew configuration, annotated](/docs/reference/crew-config) - the `providers` / `profiles` / `crews` block, commented line by line.
- [Provider](/docs/concepts/provider), [Profile](/docs/concepts/profile), [Crew](/docs/concepts/crew) - the things you configure most.
- [Safety](/docs/concepts/safety) - policies, the enforced half of configuration.
