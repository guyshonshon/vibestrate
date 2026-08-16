---
title: Configuration & settings
description: Where Vibestrate keeps its settings, and how to view and edit each one in the UI or the CLI.
slug: concepts/configuration
---

Almost everything you can tune about Vibestrate lives in one place: the `.vibestrate/` folder at the root of your project, created by `vibe init`.

The heart of it is a single file, `.vibestrate/project.yml` - your providers, profiles, crews, flows, policies, and validation commands all live there. It is plain YAML sitting inside your repo, yours to commit - commit it and your whole team runs the same setup. The rest of the folder is files you write yourself:

<svg viewBox="0 0 560 120" width="100%" style="max-width:560px;height:auto" role="img" aria-label="Inside the .vibestrate folder: project.yml holds the settings, and beside it sit the files you edit directly - rules.md, rules, roles, skills, flows, policies and runs.">
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="1" y="1" width="558" height="116" rx="10"/>
    <rect x="16" y="34" width="190" height="72" rx="8"/>
    <rect x="230" y="34" width="314" height="72" rx="8"/>
  </g>
  <g fill="currentColor" font-size="12" font-family="ui-monospace,monospace">
    <text x="16" y="22">.vibestrate/</text>
  </g>
  <g fill="currentColor" font-size="12" font-family="ui-monospace,monospace" text-anchor="middle">
    <text x="111" y="64">project.yml</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="11" text-anchor="middle">
    <text x="111" y="84">settings live here</text>
  </g>
  <g fill="currentColor" font-size="12" font-family="ui-monospace,monospace" text-anchor="middle">
    <text x="387" y="58">rules.md  rules/  roles/  skills/</text>
    <text x="387" y="78">flows/  policies/  runs/</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="11" text-anchor="middle">
    <text x="387" y="98">files you edit directly</text>
  </g>
</svg>

You rarely need to open it by hand, though. Every setting has a place to view and edit it in both the dashboard and the CLI. That's a deliberate rule, not a coincidence (see [UI and CLI parity](#ui-and-cli-parity) below).

`vibe config keys` lists every settable key with its type, allowed values and default. `vibe config get` reads one, and `vibe config set` writes one.

Configuration never holds secrets. An API key for an HTTP provider is given as an environment reference (`apiKey: env:ANTHROPIC_API_KEY`), resolved at run time and never written back to YAML, logged, or shown in the UI. A literal key in config is refused outright.

## What lives in `project.yml`

The file is split into top-level sections. Each owns one slice of how a run behaves. The table below is the full top-level map, with the concept page that explains each one where one exists:

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
| `codebaseMapRoles` | Which crew roles receive the `vibe learn` codebase map. Defaults to the planner alone. | [VIBESTRATE.md](/docs/concepts/vibestrate-md) |
| `methodologyRoles` | Which crew roles receive the project's methodology guidance. Defaults to the planner alone. | - |
| `ponytail` | Injects the "smallest solution that works" minimalism posture into code-writing agents. | [Ponytail](/docs/concepts/ponytail) |
| `budget` | Daily spend cap, per-run turn and wall-clock limits, and what happens when a run hits one. | - |
| `supervisorControl` | What the supervisor may do from chat: `advise` (answers only) by default, or `act`. | [Supervisor control](/docs/concepts/supervisor-control) |
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

The full, field-by-field schema is generated from the source, so it never drifts. You'll find it in the [`project.yml` reference](/docs/reference/config).

## Things that live next to it (not in `project.yml`)

The rest of `.vibestrate/` holds files you edit directly:

- `rules.md` - your **project instructions**: advisory guidance read on every agent turn. It's advisory, not enforced. The enforced rules are [policies](/docs/concepts/safety).
- `rules/` - optional. Once one page of instructions isn't enough, drop more markdown files here and they compose onto `rules.md`, sorted by filename, each labelled with the file it came from. Name them so the order reads the way you want: `10-style.md`, then `20-testing.md`.

  Instructions are the most expensive text in the product - they go into every agent turn of every run - so the composed ruleset is size-bounded. `vibe doctor` tells you if any of it is being truncated or refused, rather than letting your rules quietly stop arriving.

- `roles/` - one JSON role file per Role (`{schemaVersion, id, prompt}`), yours to edit.
- `skills/` - markdown [skills](/docs/concepts/skill) that load as extra context.
- `flows/` - your project's own [Flow](/docs/concepts/flow) definitions.
- `policies/` - the policy files the safety engine compiles.
- `runs/` - per-run artifacts, state, and metrics. Nothing adds this to your `.gitignore` for you, so add `.vibestrate/runs/` yourself unless you want run history in the repo.

## Viewing and editing your configuration

`vibe config view` prints a readable, grouped summary. Each section shows its live values and a pointer to where you'd change it:

```bash
vibe config view          # grouped, readable
vibe config view --json   # the same, as JSON
vibe config show          # raw project.yml
vibe config keys          # every settable key
vibe config validate      # check the schema

# one value at a time, by dot-path
vibe config get commands.validate
vibe config set workflow.requireHumanMerge true
```

Arrays and objects go in as JSON, so setting the validation commands looks like `vibe config set commands.validate '["pnpm test"]'`.

The dashboard has the same thing as a **Config** page (under More): every section laid out, each one deep-linking to the editor that owns it. The interactive shell has a **Config** page too. All three are fed by one builder, so they never disagree.

## UI and CLI parity

A standing rule in Vibestrate: **anything you can configure, you can configure in both the dashboard and the CLI.** Providers, profiles, crews, flows, policies - each has a real editor on both surfaces.

So when something needs fixing, the answer is never "go hand-edit `project.yml`". That's the fallback, not the fix. If you find a setting that can only be changed by editing YAML, that's a gap worth reporting.

## Secrets stay out

Beyond the `env:` rule for provider keys, Vibestrate never reads your `.env` contents into a prompt, an artifact, or a report. See [Safety](/docs/concepts/safety) for the guarantees around what a run is allowed to touch.

## Going deeper

- [`project.yml` reference](/docs/reference/config) - the generated, full schema.
- [Provider](/docs/concepts/provider), [Profile](/docs/concepts/profile), [Crew](/docs/concepts/crew) - the main things you'll configure.
- [Safety](/docs/concepts/safety) - policies, the enforced half of configuration.
