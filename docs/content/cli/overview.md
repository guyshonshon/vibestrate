---
title: CLI overview
description: The shape of the vibestrate command, how subcommands group, and the conventions every command follows.
section: cli
slug: cli/overview
---

The `vibestrate` command is the primary surface for working with Vibestrate from a terminal. Run `vibestrate --help` to see the live list; the [CLI reference](/docs/reference/cli) page is generated from the same command tree.

## Shape

```text
vibestrate                 → open the interactive shell (no args)
vibestrate <command>       → run a top-level command (init, run, status, ...)
vibestrate <area> <verb>   → run a subcommand under an area (provider list, config set, ...)
```

Top-level commands are things you do directly to a run or project: `init`, `run`, `status`, `abort`, `pause`, `resume`, `doctor`, `ui`, `replay`, `shell`.

Area groups are for related sub-actions: `provider`, `config`, `skills`, `flows`, `approvals`, `tasks`, `queue`, `notifications`, `gateways`, `editor`, `suggestions`, `bundles`, `validation`, `terminal`, `policies`, `roadmap`, `logs`.

## Conventions

- **`--json`** wherever it's offered emits machine-readable output. Use it for scripting; the human-readable default is for terminals.
- **`--yes`** on commands that would otherwise prompt makes them non-interactive. Safe defaults are used.
- **No subcommand opens the shell.** Running `vibestrate` with zero arguments opens the interactive Ink-based shell. Use `vibestrate --help` to see commands instead.
- **Errors are typed.** When something fails, you get a structured error with a title, optional detail, and an optional hint pointing you at the next thing to try.

## The core loop

```bash
vibestrate init                                 # one-time per project
vibestrate doctor                                # verify env + config
vibestrate run "Your task description"          # start a run
vibestrate status                                # see active and recent runs
vibestrate replay <runId>                        # inspect any past run
```

Rewind a prior run instead of restarting — reuse its plan (and architecture) and resume from a later stage:

```bash
vibestrate run "<same task>" --resume-from <runId>                        # reuse plan + architecture, redo implementation
vibestrate run "<same task>" --resume-from <runId> --resume-stage architecting  # reuse plan, redo from architecture
```

## Working with providers

```bash
vibestrate provider detect                       # what's installed?
vibestrate provider setup                        # apply presets
vibestrate provider test <id>                    # verify the invocation works
vibestrate provider set <id>                     # set as the default for every agent
vibestrate provider list                         # show the configured providers
```

## Working with config

```bash
vibestrate config show                           # full project.yml as YAML
vibestrate config get commands.validate          # a single key
vibestrate config set commands.validate '["pnpm typecheck","pnpm test"]'
vibestrate config validate                       # check against the Zod schema
```

The `config set` command accepts JSON for non-scalar values, and a plain string otherwise.

## Working with skills

```bash
vibestrate skills list                           # what's discoverable
vibestrate skills show <id>                      # the rendered skill
vibestrate skills assign <agent> <skill>         # attach a skill to an agent
```

## Working with Flows

```bash
vibestrate flows list                           # built-in + project Flows
vibestrate flows show <id>                      # the resolved definition
vibestrate flows suggest "<task>" --risk high   # advisory suggestion only
vibestrate run "<task>" --flow <id>             # run with a Flow
```

## Working with approvals

```bash
vibestrate approvals list <runId>                # what's awaiting approval
vibestrate approvals show <runId> <approvalId>   # the approval context
vibestrate approvals decide <runId> <approvalId> --approve
vibestrate approvals decide <runId> <approvalId> --reject
```

## Working with the dashboard

```bash
vibestrate ui                                    # start Mission Control
vibestrate ui --no-open                          # don't auto-open the browser
vibestrate run "<task>" --ui                     # start a run with the dashboard alongside
```

## Reference

Every command, every option, every default — see the [CLI commands reference](/docs/reference/cli), generated from the commander program tree.
