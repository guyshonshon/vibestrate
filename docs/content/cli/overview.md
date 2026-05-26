---
title: CLI overview
description: The shape of the amaco command, how subcommands group, and the conventions every command follows.
section: cli
slug: cli/overview
---

The `amaco` command is the primary surface for working with Amaco from a terminal. Run `amaco --help` to see the live list; the [CLI reference](../reference/cli) page is generated from the same command tree.

## Shape

```text
amaco                 → open the interactive shell (no args)
amaco <command>       → run a top-level command (init, run, status, ...)
amaco <area> <verb>   → run a subcommand under an area (provider list, config set, ...)
```

Top-level commands are things you do directly to a run or project: `init`, `run`, `status`, `abort`, `pause`, `resume`, `doctor`, `ui`, `replay`, `shell`.

Area groups are for related sub-actions: `provider`, `config`, `skills`, `guides`, `approvals`, `tasks`, `queue`, `notifications`, `gateways`, `editor`, `suggestions`, `bundles`, `validation`, `terminal`, `policies`, `roadmap`, `logs`.

## Conventions

- **`--json`** wherever it's offered emits machine-readable output. Use it for scripting; the human-readable default is for terminals.
- **`--yes`** on commands that would otherwise prompt makes them non-interactive. Safe defaults are used.
- **No subcommand opens the shell.** Running `amaco` with zero arguments opens the interactive Ink-based shell. Use `amaco --help` to see commands instead.
- **Errors are typed.** When something fails, you get a structured error with a title, optional detail, and an optional hint pointing you at the next thing to try.

## The core loop

```bash
amaco init                                 # one-time per project
amaco doctor                                # verify env + config
amaco run "Your task description"          # start a run
amaco status                                # see active and recent runs
amaco replay <runId>                        # inspect any past run
```

## Working with providers

```bash
amaco provider detect                       # what's installed?
amaco provider setup                        # apply presets
amaco provider test <id>                    # verify the invocation works
amaco provider set <id>                     # set as the default for every agent
amaco provider list                         # show the configured providers
```

## Working with config

```bash
amaco config show                           # full project.yml as YAML
amaco config get commands.validate          # a single key
amaco config set commands.validate '["pnpm typecheck","pnpm test"]'
amaco config validate                       # check against the Zod schema
```

The `config set` command accepts JSON for non-scalar values, and a plain string otherwise.

## Working with skills

```bash
amaco skills list                           # what's discoverable
amaco skills show <id>                      # the rendered skill
amaco skills assign <agent> <skill>         # attach a skill to an agent
```

## Working with Guides

```bash
amaco guides list                           # built-in + project Guides
amaco guides show <id>                      # the resolved definition
amaco guides suggest "<task>" --risk high   # advisory suggestion only
amaco run "<task>" --guide <id>             # run with a Guide
```

## Working with approvals

```bash
amaco approvals list <runId>                # what's awaiting approval
amaco approvals show <runId> <approvalId>   # the approval context
amaco approvals decide <runId> <approvalId> --approve
amaco approvals decide <runId> <approvalId> --reject
```

## Working with the dashboard

```bash
amaco ui                                    # start Mission Control
amaco ui --no-open                          # don't auto-open the browser
amaco run "<task>" --ui                     # start a run with the dashboard alongside
```

## Reference

Every command, every option, every default — see the [CLI commands reference](../reference/cli), generated from the commander program tree.
