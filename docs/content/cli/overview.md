---
title: CLI overview
description: The shape of the vibe command, how its subcommands group, and the conventions every command follows.
slug: cli/overview
---

The `vibe` command is how you work with Vibestrate from a terminal. Anything you can do
in the dashboard you can do here, and the other way round. Add `--json` to any command
that offers it for machine-readable output, and `--yes` to a command that would otherwise
stop and ask. A failure comes back as a structured error: a title, an optional detail, and
often a hint pointing at the next thing to try. Run `vibe --help` for the live list of
commands, which is always exactly what your install has.

## The core loop

The day-to-day cycle, from setting up a project to inspecting a finished run:

```bash
vibe init                                  # one-time per project
vibe doctor                                # verify env + config
vibe run "Your task description"           # start a run
vibe status                                # see active and recent runs
vibe replay <runId>                        # inspect any past run
vibe path <runId>                          # where the run's git worktree is (cd into it)
vibe rename <runId> a friendlier name      # give the run a readable display name
```

## Command shape

```text
vibe                       → open the interactive shell (no args)
vibe <command>             → run a top-level command (init, run, status, ...)
vibe <area> <verb>         → run a subcommand under an area (provider list, config set, ...)
```

Top-level commands are things you do directly to a run or a project:

`init`, `setup`, `welcome`, `run`, `status`, `abort`, `pause`, `resume`, `doctor`, `ui`, `replay`, `shell`, `path`, `rename`, `logs`, `assurance`, `audit`, `ledger`, `consult`.

Area groups bundle related sub-actions together - `provider`, `config`, `skills`, `flows`, `params`, `approvals`, and more than a dozen others. This page covers the ones you'll reach for most; the [CLI commands reference](/docs/reference/cli) lists every area.

On a project that has not been initialized yet, a bare `vibe` prints a short greeting and
exits rather than opening an empty shell. Run `vibe init` first.

## Worktrees, and rewinding a run

Every run does its work in its own isolated git worktree, a separate checkout of your repo so runs never step on each other. `vibe path <runId>` prints that worktree's path and branch plus a copy-able `cd` line. `vibe path <runId> --cd` prints just the path, so you can `cd "$(vibe path <runId> --cd)"`. The same "Workspace" panel shows up on the dashboard run detail and in the TUI inspector.

You can also rewind a prior run instead of restarting it. This reuses its plan (and architecture) and resumes from a later stage:

```bash
vibe run "<same task>" --resume-from <runId>                        # reuse plan + architecture, redo implementation
vibe run "<same task>" --resume-from <runId> --resume-stage architecting  # reuse plan, redo from architecture
```

`--resume-stage` takes `planning`, `architecting`, `executing`, `reviewing`, `fixing`, or `verifying`, and defaults to `executing`. Add `--preview` to print the files a rewind would overwrite or remove and then exit without starting anything.

## Working with providers

A provider is the agent tool Vibestrate calls to do the work, like Claude Code, Codex, Gemini, or Ollama:

```bash
vibe provider detect                       # what's installed?
vibe provider setup                        # apply presets
vibe provider test [id]                    # verify the invocation works (no id = the default)
vibe provider set <id>                     # set as the default for every agent
vibe provider list                         # show the configured providers
vibe provider remove <id>                  # remove one
```

`provider remove` refuses while a Role still points at that provider, and names the Roles, so you re-point them first rather than discovering a broken config on the next run.

Everything here is also doable from the dashboard's Crew page, on its **Providers** tab: detect, set up, edit `command`/`args`/`input`, test, set default, and remove. Neither surface is more capable than the other.

## Working with config

These commands view and change your project's settings:

```bash
vibe config view                           # grouped, readable view + where each part is editable
vibe config view --json                    # the structured view as JSON
vibe config show                           # full project.yml as raw YAML
vibe config keys [filter]                  # every settable key, straight from the schema
vibe config get commands.validate          # a single key
vibe config set commands.validate '["pnpm typecheck","pnpm test"]'
vibe config validate                       # check against the Zod schema
```

`config view` is the readable surface. It groups the resolved config (providers, profiles, crew, git, workflow, validation, budget, policies, scheduler, and more) and, for each group, points at where it's editable: a dashboard page (the Crew page's Providers tab / Profiles / Crew / Settings) or the `vibe config set` path. Use `config show` when you want the raw YAML. The same grouped view is the dashboard's **Config** page (under **More**) and the in-shell **Config** page.

`config keys` is the one to reach for before `config set`, because it is derived from the schema and so cannot drift from it. It prints each key with its type, its allowed values, and its default:

```text
$ vibe config keys supervised
supervised.maxSpendUsd         number | null  ·  default null
supervised.maxSteps            number | null  ·  default 20
supervised.supervisor.enabled  boolean  ·  default true
supervised.supervisor.profile  string | null  ·  default null
supervised.supervisor.roleId   string  ·  default "reviewer"
```

`config set` reads the value you pass rather than storing it verbatim. `true` and `false`
become booleans, a bare number becomes a number, and anything starting with `[`, `{` or
`"` is parsed as JSON and rejected if the JSON is malformed. Everything else is stored as
a plain string. An unknown key is refused up front with a "did you mean" suggestion, so a
typo cannot quietly write an invalid config.

## Learning your codebase

`vibe learn` scans your project (stack, scripts, layout, languages, best-effort HTTP routes, tooling markers) and writes a machine-owned, regenerable map: `.vibestrate/CODEBASE.md` (human/prompt-facing) and `.vibestrate/codebase-map.json` (structured, server/UI-facing). `vibe init` already runs it at the end, and a failure there is a warning rather than a failed init, so most projects have a map from the start.

```bash
vibe learn                                 # regenerate the codebase map
vibe learn show                            # print the current CODEBASE.md
```

It is entirely deterministic - no model call, so it can run on demand without surprising drift. Everything is secret-redacted, size-bounded, and written atomically. A non-git project degrades honestly (a note in the map, not an error). See [Codebase map](/docs/concepts/vibestrate-md) for what grounds on it and why it stays separate from `VIBESTRATE.md`.

## Working with skills

A skill is reusable guidance you attach to an agent:

```bash
vibe skills list                           # what's discoverable
vibe skills show <name>                    # the rendered skill
vibe skills assign <agent> <skill>         # attach a skill to an agent
vibe skills unassign <agent> <skill>       # detach it again
vibe skills fetch <url> --assess           # read-only look at a skill before adopting it
```

`skills fetch` without `--assess` writes the skill into the project; `--overwrite` replaces one of the same name.

## Working with Flows

Commands for a [Flow](/docs/concepts/flow), the list of steps a task works through:

```bash
vibe flows list                           # built-in + project Flows
vibe flows show <id>                      # the resolved definition
vibe flows use [id]                       # set the project default (--clear to unset)
vibe flows suggest "<task>" --risk high   # advisory suggestion only
vibe flows draft "<description>"          # supervisor drafts a Flow for you to review
vibe flows export <id> --out my-flow.yml  # the canonical YAML
vibe flows import my-flow.yml             # adopt one (--overwrite to replace)
vibe run "<task>" --flow <id>             # run with a Flow
vibe run -i "<task>"                       # pick the Flow + Crew interactively, then run
```

### Drafting a Flow or a Crew from a description

Describe what you want in English and the supervisor drafts it. Both drafters are draft-only: they write nothing, and what you get back is a document to read, edit, and adopt yourself.

```bash
vibe flows draft "review-heavy flow for payment work" --crew thorough
vibe flows draft "<description>" --yaml > deep-review.yml   # just the flow YAML, for piping
vibe crew draft "cheap planner, strong reviewer"
vibe crew draft "<description>" --json                      # the whole draft, machine-readable
```

`flows draft` prints the flow's canonical YAML - byte for byte what accepting it would write - plus the seat coverage against a crew (`--crew <id>`, default: your project's), so you see which steps no Role can fill before you commit to it. A gap doesn't reject the draft; you may be about to add that Role. Adopt it with `vibe flows import deep-review.yml`.

`crew draft` gives you both halves of a crew: the `crews.<id>` block, and one JSON [role file](/docs/concepts/role) per Role with its full contents. Save the role files at the paths shown *first* - a crew block whose roles point at files nobody wrote fails the moment a run loads the config - then add the block under `crews:` in `.vibestrate/project.yml` and run `vibe crew use <id>`. The draft also lists the problems no schema can catch: profile or permission ids this project doesn't define, a seat two Roles both claim (a run refuses to start on that), and a role file already on disk that saving the draft would replace.

Both commands end with two lists: **Could not verify**, then **Checked**. That's the agent's self-report of what it confirmed with its own tools - Vibestrate opens no connection of its own to check a draft - so the "Could not verify" list leads on purpose. Both lists print even when empty, so silence there is a claim rather than an omission.

### Publishing a Flow to the Hub

`vibe flows hub publish` pushes a project Flow to the public Flows Hub so others can discover and install it. Every published version is immutable. Re-publishing byte-identical content at the same version is reported as already published rather than as an error; the client re-fetches the stored version and compares its SHA-256 before saying so. Changed content at an existing version is refused - bump the version.

```bash
vibe flows hub publish <flowId> --version 1.0.0 --handle <your-github-login>
vibe flows hub publish <flowId> --version 1.2.0 --handle acme --name deep-refactor  # custom slug
vibe flows hub publish <flowId> --version 1.0.0 --handle acme --yes                 # skip confirm
```

Flags:

- `--version <semver>` - the release version. Required.
- `--handle <login>` - your GitHub login, which must match the account the token belongs to. Required.
- `--name <slug>` - human-friendly slug for the Hub listing; defaults to the Flow's id.
- `--base-url <url>` - point at a different hub, for local testing.
- `--allow-token-to-custom-host` - see the auth note below.
- `--yes` - skip the confirmation prompt.
- `--json` - emit the result as JSON.

Publish always confirms before it sends, warnings or not. Outside a TTY it refuses instead of hanging, so a CI job needs `--yes`.

**Auth.** Publish requires a GitHub personal access token, read from an environment variable:

```bash
export VIBESTRATE_HUB_TOKEN=ghp_...
```

The token is sent as a Bearer credential to the vibestrate.com hub and nowhere else. That pin has exactly one override: `--allow-token-to-custom-host`, a flag you have to type yourself, which exists so you can test against a local hub. Without it, a `--base-url` pointing anywhere other than the default origin refuses the publish rather than sending the token along. The request also never follows a redirect - an immutable publish endpoint has no reason to 3xx, and following one would carry the token to a host that was never checked. Always pass the token via the env var; never inline it in config files or shell history.

**Pre-publish safety checks.** Before the Flow leaves your machine, the client runs two checks:

1. **Secret refusal.** The Flow's YAML is scanned for token shapes - an OpenAI-style `sk-` key, a GitHub fine-grained PAT, a JWT, a URL with an embedded `user:pass@`, and the shared secret patterns. A match refuses the publish and names the line. This runs before the token is even read, so secret-shaped content never reaches the network. Fix the content, then retry.
2. **Leak warnings.** If the Flow embeds your home directory path, an absolute user path, or an `env:` secret reference, the client prints that as a warning above the confirmation prompt. These are warnings, not refusals - `--yes` skips the prompt and publishes anyway.

**UI parity.** The dashboard Flows page has a Hub section with a publish form that submits to the same endpoint, with the same secret refusal. Two differences: `VIBESTRATE_HUB_TOKEN` has to be in the environment of the `vibe ui` process, because the dashboard cannot ask you for it, and the dashboard has no equivalent of `--allow-token-to-custom-host` - the custom-host escape is CLI-only.

## Durable param memory (`vibe params`)

Fill a Flow's typed `params:` once and every run reuses them. They're stored in `.vibestrate/project-params.json`. This is different from `vibe profile`, which holds the runtime *Role* presets (provider + model + effort). See [Project parameters](/docs/concepts/project-params).

`scaffold` is the built-in Flow that declares params, so it is what these examples use. Secret params and `generate` hints only appear in a Flow you write yourself.

```bash
vibe params set --flow scaffold projectName=Acme framework=astro
vibe params list                            # what's stored
vibe params get scaffold.projectName        # one value
vibe params unset scaffold.projectName      # remove one
vibe params generate --flow <id> <param>    # provider drafts a value
vibe params generate --flow <id> <param> --accept   # keep it unasked
```

At run start, each declared param resolves in a fixed order:

```text
--param on the command line
  → VIBESTRATE_PARAM_<NAME> in the environment
    → the stored project params
      → the flow's own default
        → prompt you (in a terminal) / fail fast (in CI)
```

That last step is why CI never hangs on a missing param: seed it with `vibe params set` or the env var, and anything still missing ends the run with an error instead of waiting for input.

### Interactive run setup (`-i`)

`vibe run -i "<task>"` fills in whatever you didn't pass on the command line. It shows a **horizontal selector** to pick the Flow (when no `--flow`), then the Crew (when no `--crew` and the project has more than one), then starts the run. Move with `←` / `→` (or `h` / `l`), and press `Enter` to choose.

Anything you do pass (`--flow`, `--crew`) is respected and skips that prompt. Passing `-i` together with `--flow <id>` instead opens that flow's detailed setup: brief, context policy, per-step Profiles, and optional steps. This requires an interactive terminal.

## Working with approvals

When a run pauses for your sign-off, these commands review and decide it:

```bash
vibe approvals list <runId>                # what's awaiting approval
vibe approvals show <runId> <approvalId>   # the approval context
vibe approvals approve <runId> <approvalId> --note "looks right"
vibe approvals reject <runId> <approvalId> --note "wrong table"
vibe approvals request-changes <runId> <approvalId> --guidance "what to change"
```

`--note` on approve and reject is optional and is recorded in `approvals.json` alongside the decision.

`request-changes` returns free-form guidance to an agent-requested gate; the run re-runs that stage with your guidance instead of stopping. It needs `--guidance`, and it is refused on a policy gate, which has no agent turn to re-run - approve or reject those. Your guidance is never written to the event log; the orchestrator redacts it before use.

## Working with the dashboard

The dashboard ("Mission Control") is the web UI for watching and steering runs:

```bash
vibe ui                                    # start Mission Control
vibe ui --no-open                          # don't auto-open the browser
vibe ui --port 4400                        # bind a different port (default 4317)
vibe run "<task>" --ui                     # start a run with the dashboard alongside
```

`vibe ui` binds `127.0.0.1` by default. Passing `--host` with anything else exposes the API on your network and requires `VIBESTRATE_API_TOKEN` to be set.

## Reference

For every command, every option, and every default, see the [CLI commands reference](/docs/reference/cli), generated from the commander program tree.
