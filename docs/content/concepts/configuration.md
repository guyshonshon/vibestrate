---
title: Configuration & settings
description: Where Vibestrate keeps its settings, and how to view and edit each one in the UI or the CLI.
section: concepts
slug: concepts/configuration
---

Almost everything you can tune about Vibestrate lives in one place: the `.vibestrate/` folder at the root of your project, created by `vibe init`.

The heart of it is a single file, `.vibestrate/project.yml` - your providers, profiles, crews, flows, policies, and validation commands all live there.

<div class="docs-callout">

**It is just a file in your project.** Plain YAML, sitting inside your repo, yours to commit. Think of it like the settings folder for an app, except it travels with the code. Commit it and your whole team runs the same setup.

</div>

You rarely need to open it by hand, though. Every setting has a place to view and edit it in both the dashboard and the CLI. That's a deliberate rule, not a coincidence (see [UI and CLI parity](#ui-and-cli-parity) below).

## What lives in `project.yml`

The file is split into a handful of top-level sections. Each owns one slice of how a run behaves:

<div class="docs-cards">

**`providers`**
The local CLIs (and HTTP models) Vibestrate can drive.

**`profiles`**
Reusable presets of a provider + model + effort.

**`crews`**
Your teams of AI workers (and the Roles inside them).

**`commands`**
The typecheck / test / build / lint commands Vibestrate trusts.

**`policies`**
Code-enforced rules that deny or pause specific actions.

**`git`**
Where worktrees live and how run branches are named.

**`workflow`**
Loop limits and other run-shaping knobs.

</div>

The table below is the full top-level map - all 27 sections - with the concept page that explains each one where one exists:

| Section | What it holds | Concept |
|---|---|---|
| `project` | Project name and type, set at `vibe init`. | - |
| `git` | Where worktrees live, run-branch naming/prefix, auto-merge/push toggles, snapshot retention. | [Worktree](/docs/concepts/worktree) |
| `workflow` | Loop limits and other run-shaping knobs (review-loop cap, human-merge requirement). | [Workflow](/docs/concepts/workflow) |
| `execution` | The execution backend a run uses: `local-worktree` or the opt-in Docker sandbox. | [Container isolation](/docs/concepts/sandbox) |
| `providers` | The local CLIs (and HTTP models) Vibestrate can drive. | [Provider](/docs/concepts/provider) |
| `profiles` | Reusable presets of a provider + model + effort. | [Profile](/docs/concepts/profile) |
| `crews` (and the Roles inside them) | Your teams of AI workers and what each one does. | [Crew](/docs/concepts/crew) / [Role](/docs/concepts/role) |
| `defaultCrew` | Crew a run uses when it doesn't pick one. | [Crew](/docs/concepts/crew) |
| `defaultFlow` | Flow a run uses when it doesn't pass `--flow`; `null` = auto-select per task. | [Flow](/docs/concepts/flow) |
| `personas` | Project-defined supervisor personas (judgment postures) on top of the built-in default. | [Supervisor](/docs/concepts/supervisor) |
| `defaultPersona` | The orchestrator's default judgment posture; a built-in id or a key in `personas`. | [Supervisor](/docs/concepts/supervisor) |
| `projectPolicies` | Owner-authored tiered rules (`advise` / `block`) the reviewer and merge gate enforce. | [Policies](/docs/concepts/policies) |
| `flowSizing` | Routes obviously-trivial tasks to a lighter, diff-floored flow. | [Flow](/docs/concepts/flow) |
| `adaptiveSpecUp` | Routes plan-worthy greenfield/system briefs into the read-only Spec-up chain before executing. | [Spec-up](/docs/concepts/spec-up) |
| `ponytail` | Injects the "smallest solution that works" minimalism posture into code-writing agents. | [Ponytail](/docs/concepts/ponytail) |
| `budget` | Daily spend cap and what happens when a run hits it. | - |
| `supervised` | Defaults for supervised tasks: max steps/spend, the between-steps supervisor turn. | [Supervised tasks](/docs/concepts/supervised-tasks) |
| `resilience` | Auto-retry policy (with backoff and optional fallback profile) for recoverable provider failures. | - |
| `session` | Cap on consecutive provider-session reuses before a fresh session opens. | - |
| `commands` | The typecheck / test / build / lint commands Vibestrate trusts as ground truth, and whether docs-only diffs skip them. | [Workflow](/docs/concepts/workflow) |
| `permissions` | Named permission profiles (`read_only`, `code_write`, ...) Roles reference. | [Safety](/docs/concepts/safety) |
| `policies` | Code-enforced, fail-closed safety toggles: auto-merge, auto-push, secrets access, required approval stages. | [Safety](/docs/concepts/safety) |
| `posture` | Opt-in switches that let a run's *suggested* posture (sandbox, approval) actually take effect. | [Safety](/docs/concepts/safety) |
| `scheduler` | Concurrency limits, conflict policy, and queue ordering for the run scheduler. | - |
| `editor` | Optional local editor handoff from the dashboard (disabled by default). | - |
| `commits` | Co-author attribution on commits Vibestrate authors or assists. | - |
| `merge` | Thresholds that flip the merge advisor's recommendation to stage on an integration branch. | [Worktree](/docs/concepts/worktree) |

The full, field-by-field schema is generated from the source, so it never drifts. You'll find it in the [project.yml reference](/docs/reference/config).

## Things that live next to it (not in `project.yml`)

The rest of `.vibestrate/` holds files you edit directly:

- `rules.md` - your **project instructions**: advisory guidance read on every agent turn. It's advisory, not enforced. The enforced rules are [policies](/docs/concepts/safety).
- `roles/` - the prompt templates for each Role, yours to edit.
- `skills/` - markdown [skills](/docs/concepts/skill) that load as extra context.
- `flows/` - your project's own [Flow](/docs/concepts/flow) definitions.
- `policies/` - the policy files the safety engine compiles.
- `runs/` - per-run artifacts, state, and metrics. Best left untracked. Vibestrate gitignores it for you.

## Viewing your configuration

`vibe config view` prints a readable, grouped summary. Each section shows its live values and a pointer to where you'd change it:

```bash
vibe config view          # grouped, human-readable
vibe config view --json   # the same, machine-readable
vibe config show          # the raw project.yml, untouched
```

The dashboard has the same thing as a **Config** page (under More): every section laid out, each one deep-linking to the editor that owns it. The interactive shell has a **Config** page too. All three are fed by one builder, so they never disagree.

## UI and CLI parity

A standing rule in Vibestrate: **anything you can configure, you can configure in both the dashboard and the CLI.** Providers, profiles, crews, flows, policies - each has a real editor on both surfaces.

So when something needs fixing, the answer is never "go hand-edit `project.yml`". That's the fallback, not the fix. If you find a setting that can only be changed by editing YAML, that's a gap worth reporting.

## Secrets stay out

Configuration never holds secrets. API keys for HTTP providers are given as environment references (`apiKey: env:ANTHROPIC_API_KEY`), resolved at run time and never written back to YAML, logged, or shown in the UI. A literal key in config is refused outright.

Vibestrate also never reads your `.env` contents into a prompt, an artifact, or a report. See [Safety](/docs/concepts/safety) for the guarantees around what a run is allowed to touch.

## Going deeper

- [project.yml reference](/docs/reference/config) - the generated, full schema.
- [Provider](/docs/concepts/provider), [Profile](/docs/concepts/profile), [Crew](/docs/concepts/crew) - the main things you'll configure.
- [Safety](/docs/concepts/safety) - policies, the enforced half of configuration.
