---
title: CLI overview
description: The shape of the vibe command, how subcommands group, and the conventions every command follows.
section: cli
slug: cli/overview
---

The `vibe` command is the primary surface for working with Vibestrate from a terminal. Run `vibe --help` to see the live list; the [CLI reference](/docs/reference/cli) page is generated from the same command tree.

## Shape

```text
vibe                       → open the interactive shell (no args)
vibe <command>             → run a top-level command (init, run, status, ...)
vibe <area> <verb>         → run a subcommand under an area (provider list, config set, ...)
```

Top-level commands are things you do directly to a run or project: `init`, `run`, `status`, `abort`, `pause`, `resume`, `doctor`, `ui`, `replay`, `shell`.

Area groups are for related sub-actions: `provider`, `config`, `skills`, `flows`, `approvals`, `tasks`, `queue`, `notifications`, `gateways`, `editor`, `suggestions`, `bundles`, `validation`, `terminal`, `policies`, `roadmap`, `logs`.

## Conventions

- **`--json`** wherever it's offered emits machine-readable output. Use it for scripting; the human-readable default is for terminals.
- **`--yes`** on commands that would otherwise prompt makes them non-interactive. Safe defaults are used.
- **No subcommand opens the shell.** Running `vibe` with zero arguments opens the interactive Ink-based shell. Use `vibe --help` to see commands instead.
- **Errors are typed.** When something fails, you get a structured error with a title, optional detail, and an optional hint pointing you at the next thing to try.

## The core loop

```bash
vibe init                                 # one-time per project
vibe doctor                                # verify env + config
vibe run "Your task description"          # start a run
vibe status                                # see active and recent runs
vibe replay <runId>                        # inspect any past run
```

Rewind a prior run instead of restarting - reuse its plan (and architecture) and resume from a later stage:

```bash
vibe run "<same task>" --resume-from <runId>                        # reuse plan + architecture, redo implementation
vibe run "<same task>" --resume-from <runId> --resume-stage architecting  # reuse plan, redo from architecture
```

## Working with providers

```bash
vibe provider detect                       # what's installed?
vibe provider setup                        # apply presets
vibe provider test <id>                    # verify the invocation works
vibe provider set <id>                     # set as the default for every agent
vibe provider list                         # show the configured providers
vibe provider remove <id>                  # remove one (refuses if a role uses it)
```

Everything here is also doable in the dashboard's **Providers** page - detect,
set up, edit `command`/`args`/`input`, test, set default, and remove. Neither
surface is more capable than the other.

## Working with config

```bash
vibe config view                           # grouped, readable view + where each part is editable
vibe config view --json                    # the structured view as JSON
vibe config show                           # full project.yml as raw YAML
vibe config get commands.validate          # a single key
vibe config set commands.validate '["pnpm typecheck","pnpm test"]'
vibe config validate                       # check against the Zod schema
```

`config view` is the readable surface: it groups the resolved config (providers,
profiles, crew, git, workflow, validation, budget, policies, scheduler, and
more) and, for each group, points at where it's editable - a dashboard page
(Providers / Profiles / Crew / Settings) or the `vibe config set` path. Use
`config show` when you want the raw YAML. The same grouped view is the
dashboard's **Config** page (under **More**) and the in-shell **Config** page.

The `config set` command accepts JSON for non-scalar values, and a plain string otherwise.

## Working with skills

```bash
vibe skills list                           # what's discoverable
vibe skills show <id>                      # the rendered skill
vibe skills assign <agent> <skill>         # attach a skill to an agent
```

## Working with Flows

```bash
vibe flows list                           # built-in + project Flows
vibe flows show <id>                      # the resolved definition
vibe flows suggest "<task>" --risk high   # advisory suggestion only
vibe run "<task>" --flow <id>             # run with a Flow
vibe run -i "<task>"                       # pick the Flow + Crew interactively, then run
```

### Interactive run setup (`-i`)

`vibe run -i "<task>"` fills in whatever you didn't pass on the command line:
it shows a **horizontal selector** to pick the Flow (when no `--flow`), then the
Crew (when no `--crew` and the project has more than one), then starts the run.
Move with `←` / `→` (or `h` / `l`), `Enter` to choose. Anything you do pass -
`--flow`, `--crew` - is respected and skips that prompt. Passing `-i` together
with `--flow <id>` instead opens that flow's detailed setup (brief, context
policy, per-step Profiles, optional steps). Requires an interactive terminal.

## Working with approvals

```bash
vibe approvals list <runId>                # what's awaiting approval
vibe approvals show <runId> <approvalId>   # the approval context
vibe approvals decide <runId> <approvalId> --approve
vibe approvals decide <runId> <approvalId> --reject
```

## Working with the dashboard

```bash
vibe ui                                    # start Mission Control
vibe ui --no-open                          # don't auto-open the browser
vibe run "<task>" --ui                     # start a run with the dashboard alongside
```

## Reference

Every command, every option, every default - see the [CLI commands reference](/docs/reference/cli), generated from the commander program tree.
