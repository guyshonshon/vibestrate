---
title: Quick start
description: Open the Vibestrate dashboard, point it at a coding CLI you already have, and take one task from a sentence to a branch you can keep.
slug: getting-started/quickstart
---

## In simple words

Vibestrate drives the AI coding CLIs already on your machine - Claude Code, Codex, Gemini, Aider, Ollama and others - as one pipeline over a single task: plan, build, review, verify, in a throwaway copy of your repository.

```bash
npm install -g vibestrate
cd your-project
vibe ui
```

The dashboard opens on `127.0.0.1:4317`, where every step on this page happens. With no `.vibestrate/` yet you land on a setup screen with one button, **Initialize project**; **More > Setup** in the sidebar carries the rest.

<div class="docs-callout tip">

**Tip.** A CLI you are not signed into gets its login command printed for you to run yourself. Vibestrate never signs you in.

</div>

Every step below names its command too. Nothing on this page needs a terminal after the install, and [the whole thing unattended](#unattended) is four lines.

## What just happened

<div class="docs-cards">

**A copy of your repo**
A git worktree beside your project. Your files never moved.

**A plan, then code**
One model planned it, another wrote it.

**Your tests, as referee**
Not the model's confidence in itself.

**A branch, waiting**
Nothing pushed, nothing merged. Yours to read and take.

</div>

<div class="docs-callout">

**Did you know?** If you pay for two or three coding CLIs and use them one at a time, this is the layer that runs them together. Not another subscription - it spawns the ones you have.

</div>

Three words carry this page. A **task** is the sentence you type. A **run** is one pass over it, with its own id, branch and worktree - a second checkout made with stock `git worktree` - and its prompts, outputs and decisions land under `.vibestrate/runs/`. A **provider** is the CLI (or API) that runs the model. Flows, seats, roles, crews and profiles decide who fills each step; [the big picture](/docs/getting-started/big-picture) defines all five, and you can finish this page without them.

## 1. Install and open the dashboard

### What you need first

Vibestrate needs **Node 24 or newer**, a git repository with at least one commit, and one AI coding CLI installed and signed in. It ships none of them, so set one up at the vendor first:

| CLI | Install | Sign in |
|---|---|---|
| Claude Code | `npm install -g @anthropic-ai/claude-code` | run `claude` once |
| Codex | `npm install -g @openai/codex` | `codex login` |
| Gemini | `npm install -g @google/gemini-cli` | run `gemini` once |
| Aider | `python -m pip install aider-install && aider-install` | set `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` |
| Ollama | [ollama.com/download](https://ollama.com/download) | none, it runs on your machine |

### Install the CLI

```bash
npm install -g vibestrate
vibe --version
```

A plain `npm install vibestrate` adds it as a dependency of the current folder and leaves `vibe` off your PATH.

<div class="docs-callout warn">

**`npm warn EBADENGINE` scrolled past and the install finished anyway.** npm treats the Node floor as a warning, so `vibe --version` may print a number on Node 22. Move up and install again; the [install script](/docs/getting-started/installation) checks the floor first and stops instead.

```bash
nvm install 24 && nvm use 24    # or your own version manager
npm install -g vibestrate
```

</div>

<div class="docs-callout warn">

**`command not found`, and you did pass `-g`.** npm's global bin directory isn't on your PATH. Append it to your shell profile, then open a new shell:

```bash
echo "export PATH=\"$(npm config get prefix)/bin:\$PATH\"" >> ~/.zshrc    # or ~/.bashrc
which vibe
```

</div>

### Open it on your project

Run `vibe ui` from the repository root. It reads the project from the directory it started in, and exits telling you to `git init` if the folder is not a repo.

With no `.vibestrate/` yet the browser shows one screen and one button. **Initialize project** writes the config, a role file per crew member, and the rules file every agent reads, then names the CLIs it detected and offers **Enter Vibestrate** - or **Finish setting up** when it found none, which drops you on Setup. When the folder is not a repository yet, **Initialize git + set up project** does both; it commits only when nothing secret-looking would be swept in, so check `git log` afterwards, because a repository with no commit gives a run no branch to fork from.

That writes `.vibestrate/` and nothing else, your `.gitignore` included - add `.vibestrate/runs/` to it yourself.

This page writes `main` for your trunk. If yours has another name, set `git.mainBranch` on **More > Config** under Git.

`vibe init --yes` is the same thing from a terminal, taking the detected defaults, and `--git-init` is the second button. It also writes `.vibestrate/CODEBASE.md`, a map of your project that the dashboard's button does not produce; `vibe learn` writes it on its own.

## 2. Let Setup walk you through it

**More > Setup** in the sidebar is the rest of this page in one screen, and it is the fastest way to read where you stand.

Four tiles read Status, Failures, Warnings and Checks run. Under them sit six numbered steps, each carrying the checks that answer for it with a tick, a warning or a failure:

<div class="docs-cards">

**1. A repository to work in**
Git is installed and you are inside a repository.

**2. Initialise the project**
`.vibestrate/` exists, the config parses, the project was detected.

**3. Connect a model**
Every configured CLI is on PATH, and every role resolves to one. A **Providers** button opens the screen that fixes it.

**4. Point it at your tests**
Whether any validation commands are set. An **Edit config** button opens Config.

**5. Everything else**
Prompt files, skills, the hard guards, anything else that would bite mid-run.

**6. Start your first run**
A **New run** button, unlocked once the project is initialised and nothing is failing.

</div>

**Fix what's safe** appears in the header whenever something is repairable, and lists what it changed under Last repair. It creates missing `.vibestrate/` folders, restores a bundled role file, adopts a detected provider when none is configured, and fills in validation commands when the list is empty. It never overwrites what you already set.

The same report in a terminal is `vibe doctor`, read-only, exiting 1 on a hard failure. `vibe doctor --fix` is what the button calls.

The two steps that usually need you are 3 and 4, and they are the next two sections.

More: [Installation](/docs/getting-started/installation).

## 3. Connect a model

### See what you already have

**Crew > Providers** counts what is **detected** and what is **configured**. **Popular** holds the five Vibestrate configures itself - claude, codex, gemini, aider, ollama - and **Optional** the six it detects but never wires up until you ask. Cards carry **Install** when the CLI is missing, then **Set up** or **Edit**, **Set default** and **Test**.

`vibe provider detect` runs `--version` against the same eleven and prints `ready`, `detected, needs setup` or `not found` per CLI.

### Point Vibestrate at your CLI

"Ready" describes detection, not your config: init writes exactly one provider block, for the first ready CLI it detected, falling back to `claude` when it detected none. For any other, press **Set up** on its card. The editor takes the command, its args, and whether the prompt arrives on stdin or as the last argument; it previews the exact YAML and saves with **Save** or **Save & test**. **Edit as YAML** opens the whole block for what the form does not model - `env`, claude-code `settings`, `extraArgs`, custom headers.

**Add cloud API**, **Add local server** and **Custom CLI** build one from scratch: an `http-api` provider on Anthropic or OpenAI with your own key, a `localhost-proxy` for Ollama, LM Studio or vLLM, or any other binary.

`vibe provider setup` is the terminal wizard and needs a real terminal. Claude Code, Codex and Ollama get their own line when detected; everything else, gemini and aider included, goes through **Custom CLI command**.

### Prove you are signed in

Detection proves a binary answers `--version`; whether you are signed in is a separate check, and **Test** on the card is it: a no-op prompt that passes only on exit 0 plus the literal token `VIBESTRATE_PROVIDER_OK` in stdout. In the terminal, `vibe provider test claude --yes`, where `--yes` skips the "about to invoke" confirmation.

<div class="docs-callout warn">

**`✗ Provider "codex" is not configured. Available: claude.`** You named a CLI that has no block in `project.yml`, and that list is what init wrote. Set codex up first, then test that id. `vibe provider list` prints the ids you can name.

</div>

### When the test fails

A logged-out CLI exits 3 and names its own login command:

```text
! codex looks like it isn't logged in.
  Run this outside Vibestrate, then re-test:
    codex login
```

Anything else exits 2, usually because the flags are wrong: the CLI ran and came back without the token. A 0 on the `Exit code:` line there is normal, because that line carries the *provider's* own exit code, not Vibestrate's.

More: [Set up a provider](/docs/getting-started/providers).

## 4. Point it at your tests

**Setup** step 4 tells you whether any are configured, and **Fix what's safe** fills them in from your package scripts when the list is empty and a lockfile names your package manager. It never overwrites a list you already have. **Edit config** beside that step opens **More > Config**, where they sit under **Validation commands**.

Those commands are the ground truth in a run: a list of shell strings in `project.yml`, run one at a time inside the run's worktree. They are the one setting the browser shows read-only, because the server never executes a shell command string handed to it over HTTP, so authoring goes through the CLI:

```bash
vibe config set commands.validate "[\"pnpm typecheck\",\"pnpm test\"]"
```

<div class="docs-callout">

**A failing test does not restart the run.** Your commands produce evidence: the results go to the reviewer, and only the reviewer can call for a fix. A run carrying a failed command never reaches the finished state, so it stops and hands you the failure. A diff of only docs and assets skips validation, controlled by `commands.scopeValidationByChange`, on by default.

</div>

## 5. Let it write files

**Crew > Providers** is where this one is settled: open a card, **Edit**, and either the form or **Edit as YAML**. The two project-wide switches beside it, `execution.isolation` and `policies.strictApplyOnly`, are on **More > Config** under Execution and Safety policies.

What you are changing: a `type: cli` provider gets the args in your `project.yml` and nothing else, so that CLI's own default decides whether it edits files. Init records claude as `type: cli`, so a first run on it plans a change, explains it, and writes nothing.

| Provider | What gives it write access |
|---|---|
| claude | `providers.claude.type: claude-code`. Write-capable seats then get `--permission-mode acceptEdits`. |
| codex | `execution.isolation: sandboxed`. Appends `--sandbox workspace-write`, and `--sandbox read-only` to the rest. |
| aider | Already writes - its preset passes `--yes`. |
| gemini | No shipped flag, because the matrix moves between releases. Read `gemini --help` and set it in the args field. A passing **Test** says the CLI still accepts the invocation, not that a write landed. |
| ollama | No file-editing surface at all - its preset is a plain chat turn. |

The codex sandbox is a real one: it edits inside the worktree and gets `Operation not permitted` outside it, under Apple Seatbelt on macOS and Landlock on Linux. You never type it into `args`; the posture appends it.

For ollama, and any CLI whose write flag you would rather not hand over, let Vibestrate do the writing: write roles run read-only and propose a unified diff it applies through its safety gateway.

```bash
vibe config set providers.claude.type claude-code   # or Crew > Providers > Edit as YAML
vibe config set execution.isolation sandboxed
vibe config set policies.strictApplyOnly true
```

## 6. Your first run

<div class="docs-callout">

**Start with the kind of task you would hand a careful colleague.** One behavior in one file, with existing tests that say whether it worked. A run costs five model turns at the low end and nine at the high end, billed on whichever CLIs your crew points at, and takes minutes rather than seconds.

</div>

### Write a brief worth running

Your sentence reaches the planner verbatim, next to your rules file and the codebase map when the project has one. **Initialize project** does not write that map: `vibe learn` produces `.vibestrate/CODEBASE.md`, and `vibe init` runs it at the end. Those two describe the repo; your brief says what you want from it:

<div class="docs-cards">

**"improve the settings page"**
Too vague. Nothing names a behavior to change or a way to tell it worked, so the planner picks both for you.

**"Fix the flaky checkout test"**
Half a brief. Paste the failure you saw and "fix" stops being a guess.

**"Add structured logging to the settings save handler, using the existing logger"**
Scoped. It names the surface, the change, and the thing to reuse.

</div>

### Start it

**New run** sits at the foot of the sidebar on every screen. It takes your brief under **Task**, then **Flow**, **Crew** and **Configuration**. Leave Flow on **Auto** and Vibestrate decides per task. Configuration carries the permission mode - read-only, ask, accept-edits or auto - plus **Unattended**, **Concise** and **Auto-pick flow**. **Start run** launches it, **Plan first** sends the brief through spec-up instead, and a strip at the foot of the page header mirrors the exact command, with a copy button.

```bash
vibe run "Add structured logging to the settings save handler"
```

The terminal prints a `•` line as each step starts, and closes with the run's `Final status:`, `Branch:` and `Worktree:`.

<div class="docs-callout warn">

**The run stops at the start with `Failed to create worktree ...: fatal: invalid reference: main`.** Vibestrate forks the run's branch from `git.mainBranch`, which stays `main` until you set it. Name your trunk on Config, or with `vibe config set git.mainBranch master`, then run again.

</div>

<div class="docs-callout warn">

**`listen EADDRINUSE: address already in use 127.0.0.1:4317`.** Something already holds the dashboard port - often a `vibe ui` you left running, whose pid sits in `.vibestrate/ui.lock`. Move either one to a free port with `--ui-port 4318` or `--port 4318`.

</div>

### Read the result

The run's page carries the outcome: the status card reads **merge ready** when nothing stopped it, **Run assurance** splits that into Policy, Validation, Review and Verification lanes, and **Flow & why** records which flow ran and where the choice came from - your supervisor persona picked it, not a fixed default. More: [Supervisor](/docs/concepts/supervisor).

Every run gets a docker-style id like `bold-lovelace`, used verbatim as the branch suffix and the worktree folder name. Yours is a different pair of words; substitute it below. `vibe status` lists this project's runs and their ids.

A run parked at an approval gate holds until you answer. Mission Control's **Waiting on you** section carries it with Details, Approve and Reject, as does the run page's Approvals tab; in the terminal, `vibe approvals list <runId>` then `vibe approvals approve <runId> <approvalId>`.

For scripting, `vibe run` exits 3 on blocked, failed or aborted and 0 otherwise; 1 means it never started, 2 that the orchestrator threw. A gated run never reaches an exit code at all - only `--unattended` bounds that wait - and `--ui` opts out of the contract entirely.

### Find the worktree

The worktree is a sibling of your repo, under `../.vibestrate-worktrees/`, so your project directory holds the metadata and none of the edited code. The run page's **Workspace** panel holds the path and a **Copy cd** button; **View diff** opens the changed-files list, where picking a file toggles between its diff and the whole file as it now stands. `vibe path bold-lovelace` prints the same path.

## 7. Keep the change

<div class="docs-outcomes">
<div class="docs-outcome ok"><b>merge_ready</b><span>Finished and waiting on your call.</span></div>
<div class="docs-outcome warn"><b>blocked</b><span>Review, verification, validation or a policy stopped it short.</span></div>
<div class="docs-outcome stop"><b>failed</b><span>Something broke mid-run.</span></div>
<div class="docs-outcome stop"><b>aborted</b><span>You stopped it yourself.</span></div>
</div>

### What each outcome means

Three checks and a policy produce that `blocked`: **validation** is your own shell commands, **review** the reviewer's verdict on the diff, **verification** an independent pass over the finished change, and a **policy** a rule you wrote yourself.

Run assurance names the lane that stopped a blocked run, with **View review** and **Re-run with fixes** beside it. A failed run's Events tab carries the provider output around the crash, and an aborted run keeps its worktree. In the terminal those are `vibe assurance`, `vibe logs` and `vibe path`, each taking the run id; reusing the earlier steps is `vibe run "<same task>" --resume-from bold-lovelace --resume-stage fixing`. More: [Debug a failed run](/docs/workflows/debug-failed).

### Commit inside the worktree

A run on the linear flows - `default`, `express`, `panel-review`, `security-review`, `plan-only`, `scaffold`, `quality-arbitration` - leaves its edits **uncommitted** on purpose: the commit message is yours to write, and an uncommitted tree is easy to throw away. So `vibestrate/<runId>` still points at your trunk tip. Read the diff under **View diff**, with the reviewer's findings beside it, then commit - or every merge step below reports a clean merge of nothing:

```bash
cd "$(vibe path bold-lovelace --cd)"
git add -A
git commit -m "Add structured logging to the settings save handler"
cd -    # back to your project
```

That `cd -` matters. Vibestrate works out which project you mean from the git root of wherever you are standing, and inside a worktree that git root is the worktree.

### The merge path

Three branches carry a change home: the run's branch, forked from your trunk when the run starts, a staging branch you name, and your trunk.

**Source > Merge** lists every merge-ready run. **Get merge advice** opens the read-only verdict and its evidence: ahead/behind counts, the checks that ran, whether it applies cleanly. The `integration/branch` field plus **Integrate this run** stages it, leaving your trunk untouched; **Complete merge to main** then appears and confirms before a local git merge. Nothing is ever pushed. **Analyze the diff** is an optional model read, advisory, never moving the recommendation.

`vibe merge` and `vibe diff` do not exist. `vibe integrate` is the same path in four commands, with a token guarding the one that reaches your trunk:

```bash
vibe integrate advise bold-lovelace                            # read-only
vibe integrate apply bold-lovelace --into integration/logging  # you pick that name
git checkout main                                              # finish won't move HEAD for you
vibe integrate finish integration/logging --confirm merge-to-main
```

That token is the literal `merge-to-main` on every project, whatever your trunk is called: it names the command you are consenting to, not your branch. `apply` refuses to target your trunk, and `finish` refuses a partial integration, a branch that moved since you reviewed it, a dirty tree, or a HEAD parked anywhere else.

<div class="docs-callout warn">

**A run that changed seven files reports `0 ahead / 0 behind; 0 file(s)`, and the merge reports success.** You skipped the commit above, so there is nothing on the run's branch to merge. Commit inside the worktree, then ask for the advice again.

</div>

More: [Keep a change](/docs/getting-started/merging).

## Going deeper

### Unattended

Nothing above needs a person watching it. The same path in four lines, for CI or for a machine you have already set up:

```bash
npm install -g vibestrate
cd your-project
vibe init && vibe doctor --fix
vibe run "Add a /healthz endpoint" --ui
```

`vibe run` exits 3 on blocked, failed or aborted and 0 otherwise, so a script can branch on it. Drop `--ui` when scripting: it keeps the process alive for the dashboard and exits 0 whatever happened.

### Everything else

The [full walkthrough](/docs/getting-started/walkthrough) picks up where this page stops: Mission Control and the rest of the dashboard, the fourteen flows that ship and the Flow Hub, crews and cross-model review, the policies you write yourself, spec-up for a greenfield brief, and a longer troubleshooting table.

### Keep going

- [The big picture](/docs/getting-started/big-picture) - the same vocabulary, with the reasoning behind each piece.
- [Your first run](/docs/getting-started/first-run) - the run loop step by step.
- [The interactive shell](/docs/cli/shell) - the same surfaces without leaving the terminal.
- [Safety](/docs/concepts/safety) - the Action Broker, gates, and what a run can and cannot touch.
- [Troubleshooting](/docs/troubleshooting) - every stuck point and its fix, in one list.
