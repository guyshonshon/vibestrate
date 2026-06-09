---
title: Configuration & settings
description: Where Vibestrate keeps its settings, what you can configure, and how to view and edit each part - in the UI or the CLI, never by hand-editing as the fix.
section: concepts
slug: concepts/configuration
---

# Configuration & settings

Almost everything you can tune about Vibestrate lives in one place: the
`.vibestrate/` folder at the root of your project, created by `vibe init`. The
heart of it is a single file, `.vibestrate/project.yml` - your providers,
profiles, crews, flows, policies, and validation commands all live there. It's
plain YAML, it's yours, and you can commit it so your whole team runs the same
setup.

You rarely need to open it by hand, though. Every setting has a place to view and
edit it in both the dashboard and the CLI - that's a deliberate rule, not a
coincidence (see [UI and CLI parity](#ui-and-cli-parity) below).

## What lives in `project.yml`

| Section | What it holds | Concept |
|---|---|---|
| `providers` | The local CLIs (and HTTP models) Vibestrate can drive. | [Provider](/docs/concepts/provider) |
| `profiles` | Reusable presets of a provider + model + effort. | [Profile](/docs/concepts/profile) |
| `crews` (and the Roles inside them) | Your teams of AI workers and what each one does. | [Crew](/docs/concepts/crew) / [Role](/docs/concepts/role) |
| `defaultCrew` / `defaultFlow` | Which crew and flow a run uses when you don't pick one. | [Flow](/docs/concepts/flow) |
| `commands.validate` | The typecheck / test / build / lint commands Vibestrate trusts as ground truth. | [Workflow](/docs/concepts/workflow) |
| `commands.scopeValidationByChange` | When true (default), a run whose entire diff is only docs/text/asset files skips the `validate` commands (no point running the test suite for a `.md` edit). Any code/config/unknown file makes it validate as usual. Set false to always validate. | [Workflow](/docs/concepts/workflow) |
| `policies` | Code-enforced rules that deny or pause specific actions. | [Safety](/docs/concepts/safety) |
| `git` | Where worktrees live and how run branches are named. | [Worktree](/docs/concepts/worktree) |
| `workflow` | Loop limits and other run-shaping knobs. | [Workflow](/docs/concepts/workflow) |

The full, field-by-field schema - generated from the source so it never drifts -
is in the [project.yml reference](/docs/reference/config).

## Things that live next to it (not in `project.yml`)

The rest of `.vibestrate/` holds files you edit directly:

- `rules.md` - your **project instructions**: advisory guidance read on every
  agent turn. (Advisory, not enforced - the enforced rules are
  [policies](/docs/concepts/safety).)
- `agents/` (or `roles/`) - the prompt templates for each Role, yours to edit.
- `skills/` - markdown [skills](/docs/concepts/skill) that load as extra context.
- `flows/` - your project's own [Flow](/docs/concepts/flow) definitions.
- `policies/` - the policy files the safety engine compiles.
- `runs/` - per-run artifacts, state, and metrics. Best left untracked;
  Vibestrate gitignores it for you.

## Viewing your configuration

`vibe config view` prints a readable, grouped summary - each section with its
live values and a pointer to where you'd change it:

```bash
vibe config view          # grouped, human-readable
vibe config view --json   # the same, machine-readable
vibe config show          # the raw project.yml, untouched
```

The dashboard has the same thing as a **Config** page (under More): every section
laid out, each one deep-linking to the editor that owns it. The interactive shell
has a **Config** page too. All three are fed by one builder, so they never
disagree.

## UI and CLI parity

A standing rule in Vibestrate: **anything you can configure, you can configure in
both the dashboard and the CLI.** Providers, profiles, crews, flows, policies -
each has a real editor on both surfaces. So when something needs fixing, the
answer is never "go hand-edit `project.yml`" - that's the fallback, not the fix.
If you find a setting that can only be changed by editing YAML, that's a gap worth
reporting.

## Secrets stay out

Configuration never holds secrets. API keys for HTTP providers are given as
environment references (`apiKey: env:ANTHROPIC_API_KEY`), resolved at run time and
never written back to YAML, logged, or shown in the UI - a literal key in config
is refused outright. Vibestrate also never reads your `.env` contents into a
prompt, an artifact, or a report. See [Safety](/docs/concepts/safety) for the
guarantees around what a run is allowed to touch.

## Related

- [project.yml reference](/docs/reference/config) - the generated, full schema.
- [Provider](/docs/concepts/provider), [Profile](/docs/concepts/profile),
  [Crew](/docs/concepts/crew) - the main things you'll configure.
- [Safety](/docs/concepts/safety) - policies, the enforced half of configuration.
