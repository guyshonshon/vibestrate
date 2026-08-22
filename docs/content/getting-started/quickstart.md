---
title: Quick start
description: Install Vibestrate, point it at a coding CLI you already have, and take one task from a sentence to a branch you can keep.
slug: getting-started/quickstart
---

Vibestrate drives the AI coding CLIs already installed on your machine - Claude Code, Codex, Gemini, Aider, Ollama and others - as one pipeline over a single task. You type one sentence. It opens a throwaway copy of your repository, walks a plan-build-review-verify sequence there, and runs your own tests as the referee. You get a branch in that copy, waiting on your decision. Vibestrate never pushes and never merges.

If you already pay for two or three coding CLIs and use them one at a time, Vibestrate is the layer that runs them together. It removes the logistics of putting several models on one task: pasting the same context into each tool, keeping spare checkouts straight, and carrying one model's plan into the next model's prompt.

The path from an empty machine to a change on your trunk runs through eight stations. You drive the last two by hand.

<svg viewBox="0 0 560 112" width="100%" style="max-width:560px;height:auto" role="img" aria-label="Eight stations left to right: install, init, provider, run, worktree, outcome, integrate, main. Stations four to six sit inside one run, on branch vibestrate slash run id.">
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="5" y="32" width="62" height="30" rx="7"/>
    <rect x="73" y="32" width="62" height="30" rx="7"/>
    <rect x="141" y="32" width="62" height="30" rx="7"/>
    <rect x="215" y="32" width="62" height="30" rx="7"/>
    <rect x="283" y="32" width="62" height="30" rx="7"/>
    <rect x="351" y="32" width="62" height="30" rx="7"/>
    <rect x="425" y="32" width="62" height="30" rx="7"/>
    <rect x="493" y="32" width="62" height="30" rx="7"/>
    <rect x="209" y="22" width="210" height="62" rx="10" stroke-dasharray="4 4"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.5" stroke-width="1">
    <path d="M68 47h1"/><path d="M136 47h1"/><path d="M204 47h1"/><path d="M278 47h1"/>
    <path d="M346 47h1"/><path d="M420 47h1"/><path d="M488 47h1"/>
  </g>
  <g fill="currentColor" fill-opacity="0.5">
    <path d="M69 43l4 4-4 4z"/><path d="M137 43l4 4-4 4z"/><path d="M205 43l4 4-4 4z"/>
    <path d="M279 43l4 4-4 4z"/><path d="M347 43l4 4-4 4z"/><path d="M421 43l4 4-4 4z"/>
    <path d="M489 43l4 4-4 4z"/>
  </g>
  <g fill="currentColor" font-size="10.5" font-family="ui-monospace,monospace" text-anchor="middle">
    <text x="36" y="51">install</text>
    <text x="104" y="51">init</text>
    <text x="172" y="51">provider</text>
    <text x="246" y="51">run</text>
    <text x="314" y="51">worktree</text>
    <text x="382" y="51">outcome</text>
    <text x="456" y="51">integrate</text>
    <text x="524" y="51">main</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="9" font-family="ui-monospace,monospace" text-anchor="middle">
    <text x="36" y="76">one npm</text>
    <text x="104" y="76">.vibestrate</text>
    <text x="172" y="76">test a CLI</text>
    <text x="246" y="76">a sentence</text>
    <text x="314" y="76">a copy</text>
    <text x="382" y="76">merge_ready</text>
    <text x="456" y="76">advise</text>
    <text x="524" y="76">your call</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="10" text-anchor="middle">
    <text x="314" y="98">on branch vibestrate/&lt;runId&gt;</text>
  </g>
</svg>

## The parts

Three words carry this page.

- **Task** - the sentence you type.
- **Run** - one pass over that task, with its own id, its own branch, and its own worktree: a second checkout of your repository in a separate folder, made with stock `git worktree`. The run edits that copy, so the files you have open never move under you, and prompts, outputs and decisions land under `.vibestrate/runs/`.
- **Provider** - the CLI (or API) that runs the model.

Flows, seats, roles, crews and profiles decide who fills each step of a run. You can finish this page without them: [the big picture](/docs/getting-started/big-picture) defines all five, and [Flow](/docs/concepts/flow), [Crew](/docs/concepts/crew), [Seat](/docs/concepts/seat) and [Worktree](/docs/concepts/worktree) go deeper.

## Install and verify

Vibestrate needs **Node 24 or newer**, a git repository with at least one commit, and at least one AI coding CLI installed and signed in. It ships none of them, so set one up at the vendor first:

| CLI | Install | Sign in |
|---|---|---|
| Claude Code | `npm install -g @anthropic-ai/claude-code` | run `claude` once |
| Codex | `npm install -g @openai/codex` | `codex login` |
| Gemini | `npm install -g @google/gemini-cli` | run `gemini` once |
| Aider | `python -m pip install aider-install && aider-install` | set `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` |
| Ollama | [ollama.com/download](https://ollama.com/download) | none, it runs on your machine |

```bash
npm install -g vibestrate
vibe --version
```

```text
0.2.1
```

A plain `npm install vibestrate` adds it as a dependency of the folder you are standing in, which leaves `vibe` off your PATH.

<div class="docs-callout warn">

**The install finished, and `npm warn EBADENGINE` scrolled past on the way.** npm treats the Node floor as a warning and installs anyway, and `vibe --version` may still print a number on Node 22. The only signal is this block, several screens up in the install output:

```text
npm warn EBADENGINE Unsupported engine {
npm warn EBADENGINE   package: 'vibestrate@0.2.1',
npm warn EBADENGINE   required: { node: '>=24' },
npm warn EBADENGINE   current: { node: 'v22.22.2', npm: '10.9.7' }
npm warn EBADENGINE }
```

Check the version yourself, move up to 24, and install again:

```bash
node --version
nvm install 24 && nvm use 24    # or your own version manager
npm install -g vibestrate
```

The [install script](/docs/getting-started/installation) checks the floor before it touches npm and stops with `Node >= 24 is required (found v22.22.2).` instead of warning.

</div>

<div class="docs-callout warn">

**`vibe --version` prints `command not found`, and you did pass `-g`.** npm's global bin directory isn't on your PATH. Print the prefix, append its `bin` folder to your shell profile, then open a new shell and check again:

```bash
npm config get prefix
echo "export PATH=\"$(npm config get prefix)/bin:\$PATH\"" >> ~/.zshrc    # or ~/.bashrc
which vibe
```

</div>

Run this from the root of a git repo. `--yes` takes the detected defaults instead of asking. Drop it to answer the questions yourself, and add `--git-init` if the folder is not a repo yet.

```bash
vibe init --yes
```

```text
✓ Vibestrate initialized.

Project:
  Name: acme-api
  Type: Node.js
  Package manager: pnpm

Provider:
  ✓ Claude Code detected: claude (v2.1.227)
  Default agents will use: claude -p

Validation:
  • pnpm typecheck
  • pnpm test
  Detected from your package.json scripts. Adjust later with `vibe config set commands.validate "[...]"`.

Files:
  ✓ .vibestrate/project.yml
  ✓ .vibestrate/rules.md
  ✓ .vibestrate/skills/README.md
  ✓ .vibestrate/policies/README.md
  ✓ .vibestrate/roles/planner.json
  ✓ .vibestrate/roles/architect.json
  ✓ .vibestrate/roles/executor.json
  ✓ .vibestrate/roles/fixer.json
  ✓ .vibestrate/roles/reviewer.json
  ✓ .vibestrate/roles/verifier.json

✓ Learned the codebase -> .vibestrate/CODEBASE.md

Next:
  → vibe doctor
  → vibe run "your task"
```

In a repo that already exists, `vibe init` writes `.vibestrate/` and changes nothing else, your `.gitignore` included - add `.vibestrate/runs/` to it yourself. `--git-init` is the exception: it also writes a starter `.gitignore` when you have none, and makes the initial commit unless something secret-looking would be swept in. Check `git log` afterwards, because a repo with no commit yet gives a run no branch to fork from.

This page writes `main` for your trunk branch. If yours goes by another name, set it now and substitute that name everywhere below:

```bash
vibe config set git.mainBranch master
```

Then check the setup:

```bash
vibe doctor
```

Doctor is read-only. It prints a line per check with the detail or the fix indented under it, and exits 1 on a hard failure, 0 on a warning.

```text
Vibestrate Doctor v0.2.1

✓ git is available
✓ Inside a git repository
  /home/you/acme-api
✓ .vibestrate/project.yml is present
✓ Project config is valid
✓ Project detected: acme-api (Node.js, pnpm)
✓ Provider "claude" is available (claude)
✓ All roles resolve to valid providers
✓ All agents have prompt files
✓ 2 validation command(s) configured
✓ Auto-push is disabled
...
```

More: [Installation](/docs/getting-started/installation).

## Connect a model, then test it

```bash
vibe provider detect
```

That runs `--version` against eleven known CLIs. Vibestrate ships a preset for all eleven and applies it on its own for five - claude, codex, gemini, aider and ollama - which is what "ready" means. The other six - opencode, qwen, crush, goose, cursor and amp - are detected and stay opt-in until you add them through `vibe provider setup` -> Custom CLI command.

```text
Detected local coding CLIs:

✓ Claude Code - ready
  Command: claude (v2.1.227)

! OpenCode - detected, needs setup
  Command: opencode (v0.4.2)

○ Gemini CLI - not found
  Command tried: gemini
```

"Ready" describes detection, not your config: `vibe init --yes` writes a `claude` block whatever it detected, so on anything other than Claude Code run `vibe provider setup` once to point it at the binary you have. It asks one question, needs a real terminal, and writes on the spot:

```text
Provider setup

? Which local coding CLI should Vibestrate use for its agents?
  Claude Code (detected: claude v2.1.227)
❯ Codex CLI - starter preset (detected: codex v0.13.2)
  Cloud API (http-api) - Anthropic / OpenAI with your own key
  Local model server (localhost-proxy) - Ollama / LM Studio / vLLM
  Custom CLI command

✓ Codex CLI is now configured for all default agents with the starter preset.
  → Verify the invocation: vibe provider test codex

→ Next: vibe doctor
```

That writes a `codex` block into `.vibestrate/project.yml` - `codex exec`, prompt on stdin - and points every default agent at it.

Only Claude Code, Codex and Ollama get their own line in that list, and each appears only when detection found it. Everything else, gemini and aider included, goes through **Custom CLI command**: give the id, the command, its args, and whether the prompt arrives on stdin or as the last argument.

Detection proves a binary answers `--version`. Whether you are signed in is a separate check:

```bash
vibe provider test claude --yes
```

`test` only runs against a provider already in your `project.yml`, and straight out of `vibe init` that is `claude` alone. `vibe provider list` prints the ids you can name here. `--yes` skips the "about to invoke" confirmation. The test sends a tiny no-op prompt and passes only on exit 0 plus the literal token `VIBESTRATE_PROVIDER_OK` in stdout.

```text
About to invoke: claude -p (input via stdin)
Vibestrate will send a tiny no-op prompt and look for the magic token in stdout. This may consume a small amount of usage from your CLI provider.
✓ claude responded with the magic token (VIBESTRATE_PROVIDER_OK). Took 497ms.
```

<div class="docs-callout warn">

**`✗ Provider "codex" is not configured. Available: claude.`** You named the CLI you have, and `vibe init` wrote a `claude` block whatever it detected. Add yours with the wizard above, then test that id:

```bash
vibe provider setup
vibe provider test codex --yes
```

</div>

A logged-out CLI exits 3 and names its own login command:

```text
! codex looks like it isn't logged in.
  Run this outside Vibestrate, then re-test:
    codex login
...
```

Anything else exits 2. The usual cause is wrong flags - the CLI ran and came back without the token. A 0 on the `Exit code:` line below is normal, because that line carries the *provider's* own exit code, not Vibestrate's.

```text
✗ Provider test failed.
  Exit code: 0
  Duration: 318ms
  The CLI ran but did not echo "VIBESTRATE_PROVIDER_OK". Your provider may need a
  different prompt-flag setup. Run `vibe provider setup` to adjust args/input mode.
```

More: [Set up a provider](/docs/getting-started/providers).

## Tell it how to run your tests

Your own commands are the ground truth in a run. They live in `.vibestrate/project.yml` as a list of shell strings and run one at a time inside the run's worktree.

```yaml
commands:
  validate:
    - pnpm typecheck
    - pnpm test
```

`vibe init` fills this in when a lockfile names your package manager and `package.json` carries lint, typecheck or test scripts. Let doctor propose the commands:

```bash
vibe doctor --fix
```

It prints what it changed, then reruns the whole read-only report underneath:

```text
Vibestrate Doctor - Fixes Applied

✓ Added validation commands: `pnpm typecheck`, `pnpm test`

Vibestrate Doctor v0.2.1

✓ git is available
...
```

<div class="docs-callout warn">

**`! No safe fixes were applicable.`, with test scripts sitting in `package.json`.** Doctor only proposes commands when a lockfile names your package manager. Without one, write the list yourself, substituting your own commands:

```bash
vibe config set commands.validate "[\"pnpm typecheck\",\"pnpm test\"]"
```

</div>

<div class="docs-callout">

**A failing test does not restart the run.** Your commands produce evidence: the results go to the reviewer, and only the reviewer can call for a fix. A run carrying a failed command never reaches the finished state, so it stops and hands you the failure. A diff made only of docs and assets skips validation, which `commands.scopeValidationByChange` controls and which is on by default.

</div>

## One fix before your first run

A `type: cli` provider gets the args in your `project.yml` and nothing else, so that CLI's own default decides whether it edits files.

**Claude Code only.** `vibe init` records it as `type: cli`, so `claude -p` runs without the flag that lets it write and your first run plans a change, explains it, and writes nothing. Switch the type and a write-capable seat gets `--permission-mode acceptEdits`:

```bash
vibe config set providers.claude.type claude-code
```

**Codex, gemini, aider and ollama** have no equivalent type. Aider's preset already passes `--yes`. Codex has a real one, `--sandbox workspace-write`: it edits inside the worktree and gets `Operation not permitted` outside it, under Apple Seatbelt on macOS and Landlock on Linux. You never type it into `args`. Turn the posture on and Vibestrate appends it to every write-capable seat, and `--sandbox read-only` to the rest:

```bash
vibe config set execution.isolation sandboxed
```

Vibestrate ships no write flag for gemini: its preset is a bare `gemini` with no args, because the gemini flag matrix moves between releases. Gemini gets no line of its own in the wizard either, so create the provider first through `vibe provider setup` -> **Custom CLI command**, answering `gemini` for both the id and the command. Then read `gemini --help` on the version you installed and set the flag it names:

```bash
vibe config set providers.gemini.args "[\"--your-write-flag\"]"
vibe provider test gemini --yes
```

That test tells you the CLI still accepts the invocation, not that a write landed. Ollama has no write flag at all: its preset runs `ollama run qwen3.5`, a plain chat turn with no file-editing surface.

For ollama, and for any CLI whose write flag you would rather not hand over, let Vibestrate do the writing instead. Write roles then run read-only and propose a unified diff that Vibestrate applies through its safety gateway.

```bash
vibe config set policies.strictApplyOnly true
```

## Your first run

<div class="docs-callout">

**Start with the kind of task you would hand a careful colleague.** One behavior in one file, with existing tests that say whether it worked. A run costs five model turns at the low end and nine at the high end, billed on whichever CLIs your crew points at, and it takes minutes rather than seconds.

</div>

The `default` flow plans, designs, implements, reviews and verifies, and the reviewer can send the work back to the fixer twice before the flow gives up. Those five verbs cover eight steps, and the [full walkthrough](/docs/getting-started/walkthrough) lays them out one row at a time.

Your sentence reaches the planner verbatim, next to your rules file and the codebase map `vibe init` generated. Those two describe the repo. Your brief is the only part that says what you want out of it:

<div class="docs-cards">

**"improve the settings page"**
Too vague. Nothing here names a behavior to change or a way to tell it worked, so the planner picks both for you.

**"Fix the flaky checkout test"**
Half a brief. It names the target and leaves "fix" open. Paste the failure you saw and it stops being a guess.

**"Add structured logging to the settings save handler, using the existing logger"**
Scoped. It names the surface, the change, and the thing to reuse.

</div>

<div class="docs-callout">

**Watch the first one.** Add `--ui` and the dashboard opens on port 4317 beside the running steps. That flag also holds the process open once the run ends, so the result is still on screen when you go looking for it.

</div>

```bash
vibe run "Add structured logging to the settings save handler"
```

The terminal prints a `•` line as each step starts, and the summary below closes the run.

```text
Supervisor: staff-engineer
Flow: Default (default)  ·  selected · high confidence
  One handler with tests already covering it - plan, build, review and verify all earn their place.
  crew: default
...
Final status: merge_ready
  Review decision: APPROVED
  Verification: PASSED
  Artifacts: .vibestrate/runs/bold-lovelace/artifacts
  Worktree: /home/you/.vibestrate-worktrees/bold-lovelace
  Branch: vibestrate/bold-lovelace
```

<div class="docs-callout warn">

**The run stops at the start with `Failed to create worktree ...: fatal: invalid reference: main`.** Vibestrate forks the run's branch from `git.mainBranch`, which stays `main` until you set it. Name your trunk, then run again:

```bash
vibe config set git.mainBranch master
```

</div>

Three of those lines came from defaults. `Supervisor: staff-engineer` is the scrutiny setting: how hard the reviewers look before they call the work done. It is not the Supervisor panel in the dashboard, which is a conversation with your project. `Default` is the flow's name and `default` its id, and `crew: default` is the roster of roles that filled its seats. More: [Supervisor](/docs/concepts/supervisor).

`Final status: merge_ready` is the ending you want. The run finished, the change survived every check, and it is waiting on you. The next section covers the other three endings.

`bold-lovelace` is the run id, a docker-style handle used verbatim as the branch suffix and the worktree folder name. Yours will be a different pair of words, so read it off the summary and substitute it everywhere this page says `bold-lovelace`. `vibe status` lists this project's runs and their ids if you close the terminal.

`vibe run` exits 3 when the run ends blocked, failed or aborted, and 0 otherwise, so a script can branch on the exit code. Exit 1 means the run never started, and exit 2 means the orchestrator threw. A run that stops at an approval gate never reaches an exit code at all: the process waits there until you answer, and only `--unattended` bounds that wait, expiring it to `blocked` and exit 3. `--ui` opts out of the whole contract: the process stays alive for the dashboard and exits 0 when you stop it, so script on a run without `--ui`.

<div class="docs-callout warn">

**The steps stopped scrolling after `• Pausing for human approval (project policy requires approval at reviewing)...`.** The run is parked at a gate and holds the terminal until you answer. The hint under that line carries `<runId>` as a placeholder, so substitute your own, and read the request before you decide - `approve` wants the id that `list` prints:

```bash
vibe approvals list bold-lovelace
vibe approvals show bold-lovelace <approvalId>
vibe approvals approve bold-lovelace <approvalId> --note "looks right"
```

</div>

<div class="docs-callout warn">

**`! Could not start supervisor: Error: listen EADDRINUSE: address already in use 127.0.0.1:4317`.** Something already holds the dashboard port - often a `vibe ui` you left running, whose pid and port sit in `.vibestrate/ui.lock`. The run carries on without the dashboard and says so: `→ Continuing without UI. The run will still execute normally.` A bare `vibe ui` exits 1 on the same collision. Move either one to a free port:

```bash
vibe run "your task" --ui --ui-port 4318
vibe ui --port 4318
```

</div>

The worktree is a sibling of your repo, under `../.vibestrate-worktrees/`, so your project directory holds the metadata and none of the edited code:

```bash
vibe path bold-lovelace
```

```text
Workspace bold-lovelace
  worktree: /home/you/.vibestrate-worktrees/bold-lovelace
  branch:   vibestrate/bold-lovelace

  cd /home/you/.vibestrate-worktrees/bold-lovelace
```

## Run outcomes, and how to keep one

<div class="docs-outcomes">
<div class="docs-outcome ok"><b>merge_ready</b><span>Finished and waiting on your call.</span></div>
<div class="docs-outcome warn"><b>blocked</b><span>Review, verification, validation or a policy stopped it short.</span></div>
<div class="docs-outcome stop"><b>failed</b><span>Something broke mid-run.</span></div>
<div class="docs-outcome stop"><b>aborted</b><span>You stopped it with vibe abort.</span></div>
</div>

Three checks and a policy can produce that `blocked`, and the merge advice further down calls the checks by these names. **Validation** is your own shell commands. **Review** is the reviewer's verdict on the diff. **Verification** is an independent pass over the finished change. A **policy** is a rule you wrote yourself, and the [full walkthrough](/docs/getting-started/walkthrough) covers writing them.

The three endings that aren't `merge_ready` each have a way out:

- **blocked** - `vibe assurance bold-lovelace` names the check that stopped it. Fix that, then `vibe run "<same task>" --resume-from bold-lovelace --resume-stage fixing` forks a run reusing the earlier steps.
- **failed** - `vibe logs bold-lovelace` prints the provider output around the crash.
- **aborted** - the worktree survives, so `vibe path bold-lovelace` still reads the partial work.

More: [Debug a failed run](/docs/workflows/debug-failed).

A run on the linear flows - `default`, `express`, `panel-review`, `security-review`, `plan-only`, `scaffold`, `quality-arbitration` - leaves its edits **uncommitted** in the worktree on purpose: the commit message is yours to write, and an uncommitted tree is easy to throw away. That means `vibestrate/<runId>` still points at your trunk tip.

Read the diff before anything else. `cd "$(vibe path bold-lovelace --cd)"` drops you into the worktree, and `git diff main` there prints every line a model wrote - substitute your trunk name if it isn't `main`. The dashboard shows the same change under **View diff**, with the reviewer's findings beside it. Every step below assumes you read it.

Then commit, or every merge step below reports a clean merge of nothing:

```bash
cd "$(vibe path bold-lovelace --cd)"
git add -A
git commit -m "Add structured logging to the settings save handler"
cd -    # back to your project
```

That `cd -` matters. Vibestrate works out which project you mean from the git root of wherever you are standing, and inside a worktree that git root is the worktree. Run every step below from your project.

Three branches carry a change home. The run's branch forks from your trunk the moment the run starts, a staging branch you name takes the merge, and your trunk takes the last hop behind a token you type out.

`vibe merge` and `vibe diff` do not exist. `vibe integrate` is the whole merge path, in four steps, with a confirmation token guarding the one that reaches your trunk:

```bash
# 1. Read-only: what would merging this branch do?
vibe integrate advise bold-lovelace

# 2. Merge the run's branch into a staging branch. You pick that name;
#    integration/logging is only an example.
vibe integrate apply bold-lovelace --into integration/logging

# 3. finish will not move your HEAD for you, so stand on your trunk yourself.
#    Substitute your trunk name on this line if it isn't main.
git checkout main

# 4. Merge the staging branch into your trunk.
vibe integrate finish integration/logging --confirm merge-to-main
```

The `--confirm` token is the literal string `merge-to-main` on every project, whatever your trunk is called. It names the command you are consenting to, not your branch, so do not substitute it. Get it wrong and `finish` refuses with `--confirm must be exactly "merge-to-main".` after the staging merge has already happened.

`advise` prints its verdict and the evidence behind it. `real check passed: yes` means at least one of validation, review and verification produced a pass, rather than all three coming back not applicable.

```text
Merge advice (1 run)
Read-only: nothing was merged, no branch was touched.

Add structured logging to the settings save handler (bold-lovelace)
  Safe to merge: checks passed and the change applies cleanly onto main.
  branch vibestrate/bold-lovelace: 1 ahead / 0 behind; 7 file(s)
  checks: validation passed · review approved · verification passed · real check passed: yes
  finish-now - small, clean change - the existing apply + finish path lands it
  shape: fast-forward
  advisor persona: staff-engineer
```

<div class="docs-callout warn">

**A run that changed seven files reports `0 ahead / 0 behind; 0 file(s)`, and `integrate apply` says it merged.** You skipped the commit above, so `vibestrate/<runId>` still points at your trunk tip and there is nothing on it to merge. Commit inside the worktree, then ask `advise` again:

```bash
vibe integrate advise bold-lovelace
```

</div>

`finish` touches your trunk and prints one line:

```text
✓ Merged integration/logging into main @ 0a1b2c3d4e.
Local only - nothing was pushed.
```

`apply` refuses to target your trunk. `finish` refuses a partial integration, a branch that moved since you reviewed it, a dirty project tree, or a HEAD parked somewhere other than your trunk. More: [Keep a change](/docs/getting-started/merging).

## Everything else

The [full walkthrough](/docs/getting-started/walkthrough) picks up where this page stops: the dashboard and Mission Control, the fourteen flows that ship and the Flow Hub, crews and cross-model review, the policies you write yourself, spec-up for a greenfield brief, and a longer troubleshooting table.

## Keep going

- [The big picture](/docs/getting-started/big-picture) - the same vocabulary, with the reasoning behind each piece.
- [Your first run](/docs/getting-started/first-run) - the run loop step by step.
- [Safety](/docs/concepts/safety) - the Action Broker, gates, and what a run can and cannot touch.
- [Troubleshooting](/docs/troubleshooting) - every stuck point and its fix, in one list.
