---
title: CLI overview
description: The shape of the vibe command, how its subcommands group, and the conventions every command follows.
slug: cli/overview
---

## In simple words

[Mission Control](/docs/cli/dashboard) is the primary surface, and the [interactive shell](/docs/cli/shell) is the terminal version of it. `vibe` is the third path: the automation one, for scripts, CI, and the times you already know what you want.

```bash
vibe init                       # scaffold .vibestrate/
vibe doctor --fix               # find and wire up your CLIs
vibe run "Add a /healthz route" # do the work
vibe status                     # where is it
vibe ui                         # open Mission Control
```

<div class="docs-callout tip">

**Tip.** Parity is deliberate. A guide that tells you to leave the dashboard and run a command to finish something is describing a gap in the product, not the intended route.

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

## The core loop

```bash
vibe init               # once per project
vibe doctor             # verify env + config
vibe run "Your task"    # start a run
vibe status             # every run, oldest first
vibe replay <runId>     # inspect any past run
vibe path <runId>       # the run's git worktree
vibe rename <runId> a friendlier name
```

*In the dashboard:* **Setup** under **More** is `vibe init` plus `vibe doctor` as a checklist, **New run** is `vibe run`, the **Runs** page is `vibe status`.

## The full command list

```text
vibe (no args)       → the interactive shell
vibe <command>       → a top-level command
vibe <area> <verb>   → a verb inside an area
```

Top-level commands act on a run or a project; area groups bundle related sub-actions, and there are more than a dozen areas beyond the six below:

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

In a project that has not been initialized, a bare `vibe` prints a short greeting and exits rather than opening an empty shell.

## You only need enough of a run id

Run ids are timestamped and task-derived - `20260614-125024-add-audit-logging` - which is unambiguous and a nuisance to retype. Anywhere a command takes a `<runId>` by hand, a **unique prefix is enough**, the way a short SHA is enough for git:

```bash
vibe path 20260614-1250      # resolves, if only one run starts that way
vibe abort 20260614          # same
```

A prefix that matches more than one run is an error listing the candidates, never a guess at the newest - the alternative is aborting a run you did not mean. A full id always wins outright, so a run whose id is a prefix of a later one stays reachable.

A name you set with `vibe rename` works in the same places, and is tried before a prefix - a name was chosen deliberately, a prefix collision is an accident.

This works on the commands you type an id into by hand: **abort**, **pause**, **resume**, **replay**, **steer**, **path**, **rename**, **logs**, **assurance** and **audit**. The `bundles`, `suggestions` and `spec-up` families take an id you copied from another command's output, where there is nothing to shorten.

## Worktrees, and rewinding a run

Every run works in its own git worktree. `vibe path <runId>` prints its path and branch plus a copyable `cd` line; `--cd` prints the path alone.

```bash
cd "$(vibe path <runId> --cd)"
```

A prior run can be rewound rather than restarted, reusing its artifacts from a later stage:

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

`--preview` prints the files a rewind would overwrite or remove, then exits without starting anything.

*In the dashboard:* the run detail's **Workspace** panel is `vibe path`, and its **Re-run with changes** dialog carries the same stage list under **Start from**.

## Providers

A provider is the local agent CLI Vibestrate drives - Claude Code, Codex, Gemini, Ollama:

```bash
vibe provider detect      # what's installed?
vibe provider setup       # apply presets
vibe provider test [id]   # test one, or the default
vibe provider set <id>    # default for every agent
vibe provider list        # the configured providers
vibe provider remove <id> # remove one
```

`provider remove` refuses while a role still points at that provider, and names the roles.

*In the dashboard:* the **Crew** page's **Providers** tab does all of it - detect, set up, edit `command`/`args`/`input`, test, set default, remove.

## Config

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

`config view` groups the resolved config - providers, profiles, crew, git, workflow, validation, budget, policies, scheduler - and for each group points at where that part is editable.

`config keys` is derived from the schema, so it cannot drift from it; reach for it before `config set`. It prints each key with its type, allowed values and default:

```text
$ vibe config keys supervised
supervised.maxSpendUsd
    number | null  ·  default null
supervised.maxSteps
    number | null  ·  default 20
supervised.supervisor.enabled
    boolean  ·  default true
```

(Wrapped to fit; the CLI prints each key and its type on one line.)

`config set` reads the value rather than storing it verbatim: `true`/`false` become booleans, a bare number a number, anything starting with `[`, `{` or `"` is parsed as JSON and rejected if malformed, and the rest is stored as a string. An unknown key is refused up front with a "did you mean".

*In the dashboard:* the **Config** page under **More** is the same grouped view, editable in place.

## The codebase map

`vibe learn` scans the project - stack, scripts, layout, languages, best-effort HTTP routes, tooling markers - into a machine-owned, regenerable map: `.vibestrate/CODEBASE.md` for humans and prompts, `.vibestrate/codebase-map.json` for the server and the UI.

```bash
vibe learn        # regenerate the codebase map
vibe learn show   # print the current CODEBASE.md
```

`vibe init` runs it at the end, where a failure is a warning rather than a failed init. The scan is deterministic - no model call - and its output is secret-redacted, size-bounded and written atomically. Outside a git repository it degrades honestly: the map records that the layout and route scan was skipped, rather than failing. See [Codebase map](/docs/concepts/vibestrate-md) for what grounds on it.

*In the dashboard:* the **Codebase** page renders that map on its **Map** mode, beside **Files**, **Content** and **Ask**.

## Skills

A skill is reusable guidance you attach to an agent:

```bash
vibe skills list           # what's discoverable
vibe skills show <name>    # the rendered skill
vibe skills assign   <agent> <skill>
vibe skills unassign <agent> <skill>
vibe skills fetch <url> --assess
```

`skills fetch --assess` is a read-only look at a skill before you adopt it. Without `--assess` it writes the skill into the project; `--overwrite` replaces one of the same name.

*In the dashboard:* a role's **Skills** field in the **Crew** editor is where a skill is attached. The shell has a whole **Skills** page, on `8`.

## Flows

Commands for a [Flow](/docs/concepts/flow), the list of steps a task works through:

```bash
vibe flows list               # built-in + project
vibe flows show <id>          # resolved definition
vibe flows use [id]           # set project default
vibe flows export <id> --out my-flow.yml
vibe flows import my-flow.yml
vibe flows suggest "<task>" --risk high
vibe run "<task>" --flow <id>
vibe run -i "<task>"
```

`flows use --clear` unsets the default, and `flows import --overwrite` replaces a Flow of the same name. `flows suggest` is advisory only - it prints a suggestion and changes nothing.

*In the dashboard:* the **Flows** page lists the same set, and the `+` on its sidebar row opens the flow editor, which checks steps, seats and the loop against the flow schema as you type.

## Drafting a Flow or Crew

Describe what you want in English and the supervisor drafts it. Both drafters write nothing: you get a document to read, edit and adopt yourself.

```bash
vibe flows draft "review-heavy flow for payments" \
  --crew thorough
vibe flows draft "<description>" --yaml \
  > deep-review.yml
vibe crew draft "cheap planner, strong reviewer"
vibe crew draft "<description>" --json
```

`flows draft` prints the flow's canonical YAML - byte for byte what accepting it would write - plus its seat coverage against a crew. Coverage is computed locally, no model involved, and a gap does not reject the draft: you may be about to add that Role. Adopt it with `vibe flows import deep-review.yml`.

`crew draft` gives you both halves of a crew: the `crews.<id>` block, and one JSON [role file](/docs/concepts/role) per role. Save the role files at the paths shown *first* - a crew block whose roles point at files nobody wrote fails the moment a run loads the config - then add the block under `crews:` in `.vibestrate/project.yml` and run `vibe crew use <id>`.

Both drafts also list what no schema can catch: profile or permission ids this project does not define, a seat two roles both claim (which a run refuses to start on), and a role file on disk that saving would replace. Both end with **Could not verify** then **Checked**, the agent's self-report of what it confirmed with its own tools, since Vibestrate opens no connection of its own to check a draft. Both lists print even when empty, so silence is a claim rather than an omission.

## Publishing a Flow to the Hub

`vibe flows hub publish` pushes a project Flow to the public Flows Hub. Published versions are immutable: byte-identical content at the same version reports as already published, changed content at an existing version is refused - bump the version.

```bash
vibe flows hub publish <flowId> \
  --version 1.0.0 --handle <your-github-login>
```

`--version <semver>` and `--handle <login>` are required, and the handle must match the account the token belongs to. `--name <slug>` sets the listing's slug, defaulting to the Flow's id. Publish always confirms, warnings or not; `--yes` skips that, and outside a TTY it refuses rather than hanging, so CI needs the flag. `--json` emits JSON; `--base-url <url>` points at a different hub.

**Auth.** Publish needs a GitHub personal access token, read from `VIBESTRATE_HUB_TOKEN` and nowhere else - never a config file or shell history. It goes as a Bearer credential to the `vibestrate.com` hub only, and the request never follows a redirect. A `--base-url` pointing anywhere else refuses the publish rather than sending the token along, unless you type `--allow-token-to-custom-host` yourself.

**Before it leaves your machine.** The Flow's YAML is scanned for token shapes - an `sk-` key, a GitHub fine-grained PAT, a JWT, a URL with an embedded `user:pass@`. A match names the line and refuses, before the token is even read, so secret-shaped content never reaches the network. A home directory path, absolute user path or `env:` secret reference is a warning above the prompt rather than a refusal, and `--yes` publishes anyway.

*In the dashboard:* the **Flows** page's Hub section publishes to the same endpoint with the same secret refusal. `VIBESTRATE_HUB_TOKEN` has to be in the `vibe ui` process's environment, because the dashboard cannot ask you for it, and the custom-host escape is CLI-only.

## Project parameters

Fill a Flow's typed `params:` once and every run reuses them, stored in `.vibestrate/project-params.json`. This is separate from `vibe profile`, which holds the runtime presets. See [Project parameters](/docs/concepts/project-params).

```bash
vibe params set --flow scaffold \
  projectName=Acme framework=astro
vibe params list              # what's stored
vibe params get   scaffold.projectName
vibe params unset scaffold.projectName
vibe params generate --flow <id> <param>
```

`scaffold` above is the built-in Flow that declares params. Secret params and `generate` hints appear only in a Flow you write yourself.

`params generate` has a provider draft a value; `--accept` keeps that draft without asking. At run start each declared param resolves in a fixed order, and the first source with a value wins:

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

That last step is why CI never hangs: seed a param with `vibe params set` or the env var, and anything still missing ends the run with an error instead of waiting for input.

*In the dashboard:* the **New run** form's **Inputs** section collects the same params, and marks the ones stored project-globally.

## Interactive run setup

`vibe run -i "<task>"` fills in whatever you did not pass: a horizontal selector for the Flow (when no `--flow`), then the Crew (when no `--crew` and the project has more than one), then it starts. Move with **←** / **→** (or **h** / **l**) and press **Enter**; anything you pass skips its prompt.

`-i` together with `--flow <id>` instead opens that flow's detailed setup: brief, context policy, per-step Profiles, and optional steps. Both need an interactive terminal.

## Approvals

When a run pauses for your sign-off:

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

`--note` is optional and is recorded in `approvals.json` alongside the decision.

`request-changes` returns free-form guidance to an agent-requested gate, and the run re-runs that stage with it instead of stopping. A policy gate has no agent turn to re-run, so it is refused there - approve or reject those. Your guidance never reaches the event log; the orchestrator redacts it before use.

*In the dashboard:* every blocked run appears on **Mission control** under **Waiting on you** with **Approve**, **Reject** and **Details**, and the same decision sits in a banner at the top of the run.

## The dashboard, from the terminal

```bash
vibe ui                  # 127.0.0.1:4317
vibe ui --no-open        # don't open the browser
vibe ui --port 4400
vibe run "<task>" --ui   # a run + the dashboard
```

`--host` with anything other than `127.0.0.1` exposes the API on your network and requires `VIBESTRATE_API_TOKEN`. See [Mission Control](/docs/cli/dashboard).

## Reference

For every command, every option and every default, see the [CLI commands reference](/docs/reference/cli), generated from the commander program tree.
