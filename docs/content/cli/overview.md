---
title: CLI overview
description: The shape of the vibe command, how its subcommands group, and the conventions every command follows.
section: cli
slug: cli/overview
---

The `vibe` command is how you work with Vibestrate from a terminal. Run `vibe --help` to see the live list of commands. The [CLI reference](/docs/reference/cli) page is generated from the same command tree, so it never drifts from what your install actually has.

## Shape

There are three ways to call `vibe`:

```text
vibe                       → open the interactive shell (no args)
vibe <command>             → run a top-level command (init, run, status, ...)
vibe <area> <verb>         → run a subcommand under an area (provider list, config set, ...)
```

Top-level commands are things you do directly to a run or a project:

`init`, `run`, `status`, `abort`, `pause`, `resume`, `doctor`, `ui`, `replay`, `shell`.

Area groups bundle related sub-actions together:

`provider`, `config`, `skills`, `flows`, `approvals`, `tasks`, `queue`, `notifications`, `gateways`, `editor`, `suggestions`, `bundles`, `validation`, `terminal`, `policies`, `roadmap`, `logs`.

## Conventions

A few rules hold across every command:

- **`--json`** emits machine-readable output wherever it's offered. Use it for scripting. The human-readable default is for terminals.
- **`--yes`** makes a command that would otherwise prompt run non-interactively, using safe defaults.
- **No subcommand opens the shell.** Running `vibe` with zero arguments opens the interactive shell (built with Ink). To list commands instead, run `vibe --help`.
- **Errors are typed.** When something fails you get a structured error: a title, optional detail, and an optional hint pointing you at the next thing to try.

## The core loop

This is the day-to-day cycle, from setting up a project to inspecting a finished run:

```bash
vibe init                                 # one-time per project
vibe doctor                                # verify env + config
vibe run "Your task description"          # start a run
vibe status                                # see active and recent runs
vibe replay <runId>                        # inspect any past run
vibe path <runId>                          # where the run's git worktree is (cd into it)
vibe rename <runId> a friendlier name      # give the run a readable display name
```

Every run does its work in its own isolated git worktree, a separate checkout of your repo so runs never step on each other. `vibe path <runId>` prints that worktree's path and branch plus a copy-able `cd` line. `vibe path <runId> --cd` prints just the path, so you can `cd "$(vibe path <runId> --cd)"`. The same "Workspace" panel shows up on the dashboard run detail and in the TUI inspector.

You can also rewind a prior run instead of restarting it. This reuses its plan (and architecture) and resumes from a later stage:

```bash
vibe run "<same task>" --resume-from <runId>                        # reuse plan + architecture, redo implementation
vibe run "<same task>" --resume-from <runId> --resume-stage architecting  # reuse plan, redo from architecture
```

## Working with providers

A provider is the agent tool Vibestrate calls to do the work, like Claude Code, Codex, Gemini, or Ollama:

```bash
vibe provider detect                       # what's installed?
vibe provider setup                        # apply presets
vibe provider test <id>                    # verify the invocation works
vibe provider set <id>                     # set as the default for every agent
vibe provider list                         # show the configured providers
vibe provider remove <id>                  # remove one (refuses if a role uses it)
```

Everything here is also doable from the dashboard's **Providers** page: detect, set up, edit `command`/`args`/`input`, test, set default, and remove. Neither surface is more capable than the other.

## Working with config

These commands view and change your project's settings:

```bash
vibe config view                           # grouped, readable view + where each part is editable
vibe config view --json                    # the structured view as JSON
vibe config show                           # full project.yml as raw YAML
vibe config get commands.validate          # a single key
vibe config set commands.validate '["pnpm typecheck","pnpm test"]'
vibe config validate                       # check against the Zod schema
```

`config view` is the readable surface. It groups the resolved config (providers, profiles, crew, git, workflow, validation, budget, policies, scheduler, and more) and, for each group, points at where it's editable: a dashboard page (Providers / Profiles / Crew / Settings) or the `vibe config set` path. Use `config show` when you want the raw YAML. The same grouped view is the dashboard's **Config** page (under **More**) and the in-shell **Config** page.

`config set` accepts JSON for non-scalar values, and a plain string otherwise.

## Working with skills

A skill is reusable guidance you attach to an agent:

```bash
vibe skills list                           # what's discoverable
vibe skills show <id>                      # the rendered skill
vibe skills assign <agent> <skill>         # attach a skill to an agent
```

## Working with Flows

A Flow is the list of steps Vibestrate works through to finish a task:

```bash
vibe flows list                           # built-in + project Flows
vibe flows show <id>                      # the resolved definition
vibe flows suggest "<task>" --risk high   # advisory suggestion only
vibe run "<task>" --flow <id>             # run with a Flow
vibe run -i "<task>"                       # pick the Flow + Crew interactively, then run
```

## Durable param memory (`vibe params`)

Fill a Flow's typed `params:` once and every run reuses them. They're stored in `.vibestrate/project-params.json`. This is different from `vibe profile`, which holds the runtime *Role* presets (provider + model + effort). See [Project parameters](../concepts/project-params.md).

```bash
vibe params set --flow scaffold projectName=Acme framework=astro  # type-checked, per-flow
vibe params set --flow deploy api_key=OPENAI_API_KEY              # secret -> stores env:NAME
vibe params list                                                  # what's stored
vibe params generate --flow scaffold palette                      # provider drafts a value to review
vibe params unset scaffold.projectName                            # remove one
```

For CI, seed values without an interactive step using `vibe params set` or a `VIBESTRATE_PARAM_<NAME>` env var. A missing required param fails fast rather than hanging.

### Interactive run setup (`-i`)

`vibe run -i "<task>"` fills in whatever you didn't pass on the command line. It shows a **horizontal selector** to pick the Flow (when no `--flow`), then the Crew (when no `--crew` and the project has more than one), then starts the run. Move with `←` / `→` (or `h` / `l`), and press `Enter` to choose.

Anything you do pass (`--flow`, `--crew`) is respected and skips that prompt. Passing `-i` together with `--flow <id>` instead opens that flow's detailed setup: brief, context policy, per-step Profiles, and optional steps. This requires an interactive terminal.

## Working with approvals

When a run pauses for your sign-off, these commands review and decide it:

```bash
vibe approvals list <runId>                # what's awaiting approval
vibe approvals show <runId> <approvalId>   # the approval context
vibe approvals decide <runId> <approvalId> --approve
vibe approvals decide <runId> <approvalId> --reject
```

## Working with the dashboard

The dashboard ("Mission Control") is the web UI for watching and steering runs:

```bash
vibe ui                                    # start Mission Control
vibe ui --no-open                          # don't auto-open the browser
vibe run "<task>" --ui                     # start a run with the dashboard alongside
```

## Reference

For every command, every option, and every default, see the [CLI commands reference](/docs/reference/cli), generated from the commander program tree.
