---
title: CLI overview
description: The shape of the vibe command, how its subcommands group, and the conventions every command follows.
slug: cli/overview
---

## In simple words

`vibe` is how you work with Vibestrate from a terminal. Anything you can do in the dashboard you can do here, and the other way round.

```bash
vibe init                       # scaffold .vibestrate/
vibe doctor --fix               # find and wire up your CLIs
vibe run "Add a /healthz route" # do the work
vibe status                     # where is it
vibe ui                         # open Mission Control
```

<div class="docs-callout tip">

**Tip.** Parity is deliberate, not incidental. If a guide ever tells you to leave the dashboard and run a command to finish something, that is a gap in the product rather than the intended route.

</div>

## The shape of every command

<div class="docs-cards">

**A noun, then a verb**
`vibe flows list`, `vibe provider test`, `vibe tasks add`.

**Read-only ones say so**
`advise`, `show`, `list`, `status` change nothing.

**Writes are gated**
The same Action Broker the dashboard crosses.

**Automatable**
Exit codes and machine-readable output, for CI.

</div>

<div class="docs-callout">

**Did you know?** The CLI is deliberately outside the policy gate that governs the dashboard's config writes. A gate there could refuse a first-time `vibe init` before a project has any policy to consult, and the caller is you at your own keyboard rather than a page in a browser.

</div>


## Going deeper

### The core loop

The day-to-day cycle, from setting up a project to inspecting a finished run:

```bash
vibe init               # once per project
vibe doctor             # verify env + config
vibe run "Your task"    # start a run
vibe status             # active and recent runs
vibe replay <runId>     # inspect any past run
vibe path <runId>       # the run's git worktree
vibe rename <runId> a friendlier name
```

### Command shape

```text
vibe (no args)       → the interactive shell
vibe <command>       → a top-level command
vibe <area> <verb>   → a verb inside an area
```

Top-level commands are things you do directly to a run or a project. Area groups bundle related sub-actions together, and there are more than a dozen of them beyond the six listed here:

```text
top-level  init      setup     welcome
           run       status    abort
           pause     resume    doctor
           ui        replay    shell
           path      rename    logs
           assurance audit     ledger
           consult

areas      provider  config    skills
           flows     params    approvals
```

This page covers the ones you'll reach for most. The [CLI commands reference](/docs/reference/cli) lists every area.

On a project that has not been initialized yet, a bare `vibe` prints a short greeting and
exits rather than opening an empty shell. Run `vibe init` first.

### Worktrees, and rewinding a run

Every run does its work in its own isolated git worktree, a separate checkout of your repo so runs never step on each other.

`vibe path <runId>` prints that worktree's path and branch plus a copy-able `cd` line. With `--cd` it prints just the path, so you can jump straight in:

```bash
cd "$(vibe path <runId> --cd)"
```

The same "Workspace" panel shows up on the dashboard run detail and in the TUI inspector.

You can also rewind a prior run instead of restarting it. This reuses its plan (and architecture) and resumes from a later stage:

```bash
# reuse the plan + architecture, redo the code
vibe run "<same task>" --resume-from <runId>

# reuse the plan, redo from architecture
vibe run "<same task>" --resume-from <runId> \
  --resume-stage architecting
```

`--resume-stage` defaults to `executing` and takes any stage in the run:

```text
--resume-stage  planning · architecting · executing
                reviewing · fixing · verifying
```

Add `--preview` to print the files a rewind would overwrite or remove, then exit without starting anything.

### Working with providers

A provider is the agent tool Vibestrate calls to do the work, like Claude Code, Codex, Gemini, or Ollama:

```bash
vibe provider detect      # what's installed?
vibe provider setup       # apply presets
vibe provider test [id]   # test one, or the default
vibe provider set <id>    # default for every agent
vibe provider list        # the configured providers
vibe provider remove <id> # remove one
```

`provider remove` refuses while a Role still points at that provider, and names the Roles, so you re-point them first rather than discovering a broken config on the next run.

Everything here is also doable from the dashboard's Crew page, on its **Providers** tab: detect, set up, edit `command`/`args`/`input`, test, set default, and remove.

Neither surface is more capable than the other.

### Working with config

These commands view and change your project's settings:

```bash
vibe config view           # grouped, readable view
vibe config view --json    # that view, as JSON
vibe config show           # project.yml, raw YAML
vibe config keys [filter]  # every settable key
vibe config get commands.validate
vibe config set commands.validate \
  '["pnpm typecheck","pnpm test"]'
vibe config validate       # check the Zod schema
```

`config view` is the readable surface. It groups the resolved config - providers, profiles, crew, git, workflow, validation, budget, policies, scheduler, and more.

For each group it points at where that part is editable: a dashboard page (the Crew page's **Providers** tab, **Profiles**, **Crew**, or **Settings**) or the `vibe config set` path. Use `config show` when you want the raw YAML instead.

The same grouped view is the dashboard's **Config** page (under **More**) and the in-shell **Config** page.

`config keys` is the one to reach for before `config set`, because it is derived from the schema and so cannot drift from it. It prints each key with its type, its allowed values, and its default:

```text
$ vibe config keys supervised
supervised.maxSpendUsd
    number | null  ·  default null
supervised.maxSteps
    number | null  ·  default 20
supervised.supervisor.enabled
    boolean  ·  default true
supervised.supervisor.profile
    string | null  ·  default null
supervised.supervisor.roleId
    string  ·  default "reviewer"
```

(Wrapped here to fit; the CLI prints each key and its type on one line.)

`config set` reads the value you pass rather than storing it verbatim:

- `true` and `false` become booleans.
- A bare number becomes a number.
- Anything starting with `[`, `{` or `"` is parsed as JSON, and rejected if the JSON is
  malformed.
- Everything else is stored as a plain string.

An unknown key is refused up front with a "did you mean" suggestion, so a typo cannot
quietly write an invalid config.

### Learning your codebase

`vibe learn` scans your project - stack, scripts, layout, languages, best-effort HTTP routes, tooling markers - and writes a machine-owned, regenerable map in two files:

- `.vibestrate/CODEBASE.md`, human and prompt facing.
- `.vibestrate/codebase-map.json`, structured, for the server and the UI.

`vibe init` already runs it at the end, and a failure there is a warning rather than a failed init, so most projects have a map from the start.

```bash
vibe learn        # regenerate the codebase map
vibe learn show   # print the current CODEBASE.md
```

The scan is entirely deterministic - no model call, so it can run on demand without surprising drift. Everything is secret-redacted, size-bounded, and written atomically. A non-git project degrades honestly, with a note in the map rather than an error.

See [Codebase map](/docs/concepts/vibestrate-md) for what grounds on it, and why it stays separate from `VIBESTRATE.md`.

### Working with skills

A skill is reusable guidance you attach to an agent:

```bash
vibe skills list           # what's discoverable
vibe skills show <name>    # the rendered skill
vibe skills assign   <agent> <skill>
vibe skills unassign <agent> <skill>
vibe skills fetch <url> --assess
```

`assign` attaches a skill to an agent and `unassign` detaches it again.

`skills fetch --assess` is a read-only look at a skill before you adopt it. Without `--assess` it writes the skill into the project; `--overwrite` replaces one of the same name.

### Working with Flows

Commands for a [Flow](/docs/concepts/flow), the list of steps a task works through:

```bash
vibe flows list               # built-in + project
vibe flows show <id>          # resolved definition
vibe flows use [id]           # set project default
vibe flows export <id> --out my-flow.yml
vibe flows import my-flow.yml
vibe flows suggest "<task>" --risk high
vibe flows draft "<description>"
vibe run "<task>" --flow <id>
vibe run -i "<task>"
```

`flows use --clear` unsets the default. `flows export` writes the canonical YAML, and `flows import --overwrite` replaces a Flow of the same name.

`flows suggest` is advisory only - it prints a suggestion and changes nothing. `vibe run -i` picks the Flow and Crew interactively before it starts.

### Drafting a Flow or a Crew from a description

Describe what you want in English and the supervisor drafts it. Both drafters are draft-only: they write nothing, and what you get back is a document to read, edit, and adopt yourself.

```bash
vibe flows draft "review-heavy flow for payments" \
  --crew thorough
vibe flows draft "<description>" --yaml \
  > deep-review.yml
vibe crew draft "cheap planner, strong reviewer"
vibe crew draft "<description>" --json
```

`--yaml` prints just the flow YAML, for piping. `--json` on `crew draft` gives the whole draft, machine-readable.

`flows draft` prints the flow's canonical YAML - byte for byte what accepting it would write - plus the seat coverage against a crew (`--crew <id>`, default: your project's). So you see which steps no Role can fill before you commit to it.

A gap doesn't reject the draft; you may be about to add that Role. Adopt it with `vibe flows import deep-review.yml`.

`crew draft` gives you both halves of a crew: the `crews.<id>` block, and one JSON [role file](/docs/concepts/role) per Role with its full contents.

Save the role files at the paths shown *first* - a crew block whose roles point at files nobody wrote fails the moment a run loads the config. Then add the block under `crews:` in `.vibestrate/project.yml` and run `vibe crew use <id>`.

The draft also lists the problems no schema can catch:

- Profile or permission ids this project doesn't define.
- A seat two Roles both claim, which a run refuses to start on.
- A role file already on disk that saving the draft would replace.

Both commands end with two lists: **Could not verify**, then **Checked**. That's the agent's self-report of what it confirmed with its own tools - Vibestrate opens no connection of its own to check a draft - so the "Could not verify" list leads on purpose.

Both lists print even when empty, so silence there is a claim rather than an omission.

### Publishing a Flow to the Hub

`vibe flows hub publish` pushes a project Flow to the public Flows Hub so others can discover and install it. Every published version is immutable.

Re-publishing byte-identical content at the same version is reported as already published rather than as an error. The client re-fetches the stored version and compares its SHA-256 before saying so. Changed content at an existing version is refused - bump the version.

```bash
vibe flows hub publish <flowId> \
  --version 1.0.0 --handle <your-github-login>

# a custom slug for the Hub listing
vibe flows hub publish <flowId> \
  --version 1.2.0 --handle acme \
  --name deep-refactor

# skip the confirmation prompt
vibe flows hub publish <flowId> \
  --version 1.0.0 --handle acme --yes
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

The token is sent as a Bearer credential to the `vibestrate.com` hub and nowhere else. That pin has exactly one override: `--allow-token-to-custom-host`, a flag you have to type yourself, which exists so you can test against a local hub.

Without that flag, a `--base-url` pointing anywhere other than the default origin refuses the publish rather than sending the token along.

The request also never follows a redirect. An immutable publish endpoint has no reason to 3xx, and following one would carry the token to a host that was never checked.

<div class="docs-callout warn">

**Always pass the token via the env var.** Never inline it in config files or shell history.

</div>

**Pre-publish safety checks.** Before the Flow leaves your machine, the client runs two checks:

1. **Secret refusal.** The Flow's YAML is scanned for token shapes - an OpenAI-style `sk-` key, a GitHub fine-grained PAT, a JWT, a URL with an embedded `user:pass@`, and the shared secret patterns.

   A match refuses the publish and names the line. This runs before the token is even read, so secret-shaped content never reaches the network. Fix the content, then retry.

2. **Leak warnings.** If the Flow embeds your home directory path, an absolute user path, or an `env:` secret reference, the client prints that as a warning above the confirmation prompt.

   These are warnings, not refusals. `--yes` skips the prompt and publishes anyway.

**UI parity.** The dashboard Flows page has a Hub section with a publish form that submits to the same endpoint, with the same secret refusal. Two differences:

- `VIBESTRATE_HUB_TOKEN` has to be in the environment of the `vibe ui` process, because
  the dashboard cannot ask you for it.
- The dashboard has no equivalent of `--allow-token-to-custom-host`. The custom-host
  escape is CLI-only.

### Durable param memory (`vibe params`)

Fill a Flow's typed `params:` once and every run reuses them. They're stored in `.vibestrate/project-params.json`.

This is different from `vibe profile`, which holds the runtime *Role* presets (provider + model + effort). See [Project parameters](/docs/concepts/project-params).

`scaffold` is the built-in Flow that declares params, so it is what these examples use. Secret params and `generate` hints only appear in a Flow you write yourself.

```bash
vibe params set --flow scaffold \
  projectName=Acme framework=astro
vibe params list              # what's stored
vibe params get   scaffold.projectName
vibe params unset scaffold.projectName
vibe params generate --flow <id> <param>
vibe params generate --flow <id> <param> --accept
```

`params generate` has a provider draft a value for you. Add `--accept` to keep that draft without being asked.

At run start, each declared param resolves in a fixed order, and the first source that has a value wins:

<svg viewBox="0 0 560 224" width="100%" style="max-width:560px;height:auto" role="img" aria-label="The five places a parameter value can come from, checked in this order: the --param flag on the command line, then the VIBESTRATE_PARAM environment variable, then the stored project params, then the flow's own default, and last of all it asks you or fails fast in CI.">
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="34" y="4" width="520" height="38" rx="8"/>
    <rect x="34" y="48" width="520" height="38" rx="8"/>
    <rect x="34" y="92" width="520" height="38" rx="8"/>
    <rect x="34" y="136" width="520" height="38" rx="8"/>
    <rect x="34" y="180" width="520" height="38" rx="8"/>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="11" text-anchor="middle">
    <text x="17" y="28">1</text>
    <text x="17" y="72">2</text>
    <text x="17" y="116">3</text>
    <text x="17" y="160">4</text>
    <text x="17" y="204">5</text>
  </g>
  <g fill="currentColor" font-size="12" font-family="ui-monospace,monospace">
    <text x="52" y="28">--param   on the command line</text>
    <text x="52" y="72">VIBESTRATE_PARAM_&lt;NAME&gt;   in the environment</text>
  </g>
  <g fill="currentColor" font-size="12">
    <text x="52" y="116">the stored project params</text>
    <text x="52" y="160">the flow's own default</text>
    <text x="52" y="204">it asks you, or fails fast in CI</text>
  </g>
</svg>

That last step is why CI never hangs on a missing param: seed it with `vibe params set` or the env var, and anything still missing ends the run with an error instead of waiting for input.

### Interactive run setup (`-i`)

`vibe run -i "<task>"` fills in whatever you didn't pass on the command line. It shows a **horizontal selector** to pick the Flow (when no `--flow`), then the Crew (when no `--crew` and the project has more than one), then starts the run.

Move with **←** / **→** (or **h** / **l**), and press **Enter** to choose.

Anything you do pass (`--flow`, `--crew`) is respected and skips that prompt. Passing `-i` together with `--flow <id>` instead opens that flow's detailed setup: brief, context policy, per-step Profiles, and optional steps. This requires an interactive terminal.

### Working with approvals

When a run pauses for your sign-off, these commands review and decide it:

```bash
vibe approvals list <runId>
vibe approvals show <runId> <approvalId>
vibe approvals approve <runId> <approvalId> \
  --note "looks right"
vibe approvals reject <runId> <approvalId> \
  --note "wrong table"
vibe approvals request-changes <runId> \
  <approvalId> --guidance "what to change"
```

`approvals list` shows what is awaiting you, and `approvals show` prints one approval's context.

`--note` on approve and reject is optional and is recorded in `approvals.json` alongside the decision.

`request-changes` returns free-form guidance to an agent-requested gate. The run re-runs that stage with your guidance instead of stopping.

It needs `--guidance`, and it is refused on a policy gate, which has no agent turn to re-run - approve or reject those. Your guidance is never written to the event log; the orchestrator redacts it before use.

### Working with the dashboard

The dashboard ("Mission Control") is the web UI for watching and steering runs:

```bash
vibe ui                  # start Mission Control
vibe ui --no-open        # don't open the browser
vibe ui --port 4400      # default port is 4317
vibe run "<task>" --ui   # a run + the dashboard
```

`vibe ui` binds `127.0.0.1` by default. Passing `--host` with anything else exposes the API on your network and requires `VIBESTRATE_API_TOKEN` to be set.

### Reference

For every command, every option, and every default, see the [CLI commands reference](/docs/reference/cli), generated from the commander program tree.
