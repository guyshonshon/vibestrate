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

Rewind a prior run instead of restarting — reuse its plan (and architecture) and resume from a later stage:

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

Everything here is also doable in the dashboard's **Providers** page — detect,
set up, edit `command`/`args`/`input`, test, set default, and remove. Neither
surface is more capable than the other.

## Working with config

```bash
vibe config show                           # full project.yml as YAML
vibe config get commands.validate          # a single key
vibe config set commands.validate '["pnpm typecheck","pnpm test"]'
vibe config validate                       # check against the Zod schema
```

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
```

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

Every command, every option, every default — see the [CLI commands reference](/docs/reference/cli), generated from the commander program tree.
