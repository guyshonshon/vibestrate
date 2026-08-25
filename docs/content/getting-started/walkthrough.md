---
title: Full walkthrough
description: This page covers the dashboard, flows, crews, policies, spec-up and the merge path.
slug: getting-started/walkthrough
---

## In simple words

A **run** is one pass over one task: it opens a second checkout of your repository in a separate folder, works there on a branch of its own, and hands the result back to you.

![The header of a finished run reading merge ready, with the task, the flow it followed and its eight steps, the elapsed time and the diff.](/media/docs/scoped/run-header.png)

<div class="docs-callout tip">

**Tip.** The [quick start](/docs/getting-started/quickstart) takes one task to a merged change in a few minutes. The dashboard also explains itself: ask the supervisor how to do something and the answer arrives with a **Show me how** button that moves you to the right screen and rings the control it is talking about. See [walkthroughs](/docs/concepts/walkthroughs).

</div>

## What you will be able to do

<div class="docs-cards">

**Pick a flow per task**
Know when the default is wrong and what to use instead.

**Split a run across providers**
So the model judging the diff is not the model that wrote it.

**Write rules the reviewer enforces**
Your conventions, checked on every run.

**Take a change to main yourself**
Read the diff, ask the advisor, merge deliberately.

</div>

<div class="docs-callout">

**Did you know?** Every run gets a docker-style id like `bold-lovelace`, used verbatim as the branch suffix and the worktree folder name. One string identifies the run, its branch and its folder.

</div>

## The dashboard

`vibe ui` opens it on 127.0.0.1:4317 and keeps a scheduler behind it, which executes the runs you start from the browser. Nothing outside your machine can reach it.

![Mission Control: a left sidebar listing Mission control, Dashboard, Runs, Flows, Crew, Policies, Source, Board, Metrics, Profiles, Codebase and More, then a utility row of Jump to, a notification bell and Settings, then a New run button, beside a scrolling pane holding the Supervisor panel, the New run panel and a Waiting on you section, with the Consult orb floating in the bottom-right corner.](/media/docs/mission-control.png)

That left sidebar is the whole app. **Runs** carries Active, Merge-ready and Failed counts, **More** holds Supervisors, Proposals, Setup, Project, Config and All projects, and **New run** is pinned to the foot of every screen.

`vibe shell` is the same surfaces without leaving the terminal: Dashboard, Flow, Crew, Profiles, Runs, Approvals, Suggestions, Skills, Roadmap and Doctor as numbered tabs, with a `:` palette for Config, Consult and Notifs. `vibe` on its own opens it.

<div class="docs-callout warn">

**The dashboard loads, and a tab sits empty though you have runs.** It reads `.vibestrate/runs/` from the directory `vibe ui` started in, so a server launched outside your project root reads an empty project. Stop it and start it from the root. If the root was already right, hard-reload once (Cmd-Shift-R, or Ctrl-Shift-R on Windows) to drop a cached asset bundle.

```bash
cd /path/to/your-project && vibe ui
```

</div>

### Mission Control

Mission Control is the screen it opens on; its panels drag and resize once you turn on edit mode, and each browser remembers its own arrangement.

The **Supervisor** panel is the judgment layer over your runs. A supervisor is a persona, `staff-engineer` out of the box, which picks the flow when you do not name one, pushes a risky task toward heavier review, and records the reasoning under **Flow & why** on the run page. Its judgment adds review and never removes it, and an explicit flow overrules it. A **Waiting on you** section appears below whenever a run is parked at an approval gate, with Details, Approve and Reject on each card.

**Consult**, the orb in the corner, answers from your own config, policies, runs and code. **Ask about this project** never edits anything; the most it leaves behind is a pending review rule or a proposed edit to `VIBESTRATE.md`, neither taking effect until you confirm it. That manual is this project's durable operating guide, read by consult rather than by a run, and a separate file from the `.vibestrate/rules.md` every agent reads on every turn. **Work in Vibestrate** can create a task, add a checklist item or start a run, and ships refusing all three because `supervisorControl.autonomy` starts at `advise`. Turning that up needs a budget ceiling first, since config validation rejects an unbounded `act`, and the Supervisor panel's **Answers only** / **Answers and acts** switch overrides all of it as a kill switch.

```bash
vibe budget set --max-turns-run 40
vibe config set supervisorControl.autonomy act
```

More: [Mission Control](/docs/cli/dashboard).

### Starting a run

**New run** takes your brief under **Task**, then **Flow**, **Crew** and **Configuration**, and a strip at the foot of the page header mirrors the exact `vibe run` command it is about to execute. **Plan first** beside **Start run** sends the brief through spec-up instead. The [quick start](/docs/getting-started/quickstart) walks that page field by field.

**All runs** lists everything the project has recorded, filtered by Active, Merge-ready or Failed from the sidebar, with **Replay** on each row for a read-only walk through a finished one. The **Board** is the task list those runs can be started from.

### Inside one run

Open a run and the page carries its whole state, with the diff behind it:

![A run page: a breadcrumb with branch, View diff and Re-run with changes buttons, a status card reading merge ready with the flow's eight steps as a rail, a Supervisor panel, a Run assurance panel with Policy, Validation, Review and Verification, a Workspace panel holding the worktree path, then Live timeline, Live metrics, Changed files and Live execution panels, and an Inspect tab row of Tree, Steps, Events, Artifacts, Validation, Terminal and Replay.](/media/docs/run-merge-ready.png)

The status card carries the outcome. **merge ready** means nothing stopped the run, so the branch is yours to take: Vibestrate holds there and never merges or pushes on its own.

**Run assurance** splits that outcome into four lanes. **Policy** records what the Action Broker allowed and refused, so it reports on the gate rather than on the rules you authored, and a violation there is graded harder than a failure - the verdict comes back `unsafe`, because a refused action can leave the worktree half-written. **Validation** is your own commands, **Review** is the reviewer seat's verdict on the diff, and **Verification** is the verifier's separate pass; all three read `not applicable` when the flow asked nothing of them, so an empty lane never passes as a check. The headline grades what did run: `verified`, `partially verified`, `unverified`, `unsafe` or `blocked`. **View review**, **Re-run with fixes** and **View validation** sit beside it, and `vibe assurance <runId>` prints the same verdict.

**View diff** opens the Artifacts tab on the changed-files list, where picking a file toggles between its diff and the whole file as it now stands. **Workspace** holds the worktree path and a **Copy cd** button. Terminal opens a shell inside that worktree, and `policies.allowInteractiveTerminal` starts off.

## What a run actually does

A **flow** is the recipe a run follows: an ordered list of steps. A step names the *kind* of worker it needs and never names a model. That kind is a **seat**, and the **roles** in your **crew** fill the seats. Each role runs on a **profile**: a provider, a model, and how hard that model should think.

### The eight steps

The `default` flow plans, designs, implements, reviews and verifies, and the reviewer can send the work back to the fixer twice before the flow gives up:

<svg viewBox="0 0 560 272" width="100%" style="max-width:560px;height:auto" role="img" aria-label="The eight steps of the default flow in order: Plan by the planner seat, Architecture by the architect, Implement by the implementer which can write, Validate with no seat running your commands, Review by the reviewer, Fix by the fixer which can write, Re-validate with no seat, and Verify by the verifier. Re-validate loops back to Review.">
  <g fill="currentColor" fill-opacity="0.5" font-size="9.5" font-family="ui-monospace,monospace">
    <text x="48" y="14">step</text>
    <text x="184" y="14">seat</text>
    <text x="312" y="14">kind</text>
    <text x="406" y="14">write access</text>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <path d="M40 20H558"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.22" stroke-width="1">
    <rect x="40" y="26" width="518" height="24" rx="5"/>
    <rect x="40" y="52" width="518" height="24" rx="5"/>
    <rect x="40" y="78" width="518" height="24" rx="5"/>
    <rect x="40" y="104" width="518" height="24" rx="5"/>
    <rect x="40" y="130" width="518" height="24" rx="5"/>
    <rect x="40" y="156" width="518" height="24" rx="5"/>
    <rect x="40" y="182" width="518" height="24" rx="5"/>
    <rect x="40" y="208" width="518" height="24" rx="5"/>
  </g>
  <g fill="currentColor" font-size="11" font-family="ui-monospace,monospace">
    <text x="48" y="42">Plan</text>
    <text x="48" y="68">Architecture</text>
    <text x="48" y="94">Implement</text>
    <text x="48" y="120">Validate</text>
    <text x="48" y="146">Review</text>
    <text x="48" y="172">Fix</text>
    <text x="48" y="198">Re-validate</text>
    <text x="48" y="224">Verify</text>
    <text x="184" y="42">planner</text>
    <text x="184" y="68">architect</text>
    <text x="184" y="94">implementer</text>
    <text x="184" y="146">reviewer</text>
    <text x="184" y="172">fixer</text>
    <text x="184" y="224">verifier</text>
    <text x="312" y="42">Build</text>
    <text x="312" y="68">Build</text>
    <text x="312" y="94">Build</text>
    <text x="312" y="120">Check</text>
    <text x="312" y="146">Review</text>
    <text x="312" y="172">Revise</text>
    <text x="312" y="198">Check</text>
    <text x="312" y="224">Summarize</text>
    <text x="419" y="42">Read only</text>
    <text x="419" y="68">Read only</text>
    <text x="419" y="94">Can write</text>
    <text x="419" y="120">Your commands</text>
    <text x="419" y="146">Read only</text>
    <text x="419" y="172">Can write</text>
    <text x="419" y="198">Your commands</text>
    <text x="419" y="224">Read only</text>
  </g>
  <g fill="currentColor" fill-opacity="0.45" font-size="11" font-family="ui-monospace,monospace">
    <text x="184" y="120">no seat</text>
    <text x="184" y="198">no seat</text>
  </g>
  <g fill="currentColor" fill-opacity="0.6">
    <rect x="406" y="86" width="7" height="7" rx="1.5"/>
    <rect x="406" y="164" width="7" height="7" rx="1.5"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.5" stroke-width="1">
    <rect x="406" y="34" width="7" height="7" rx="1.5"/>
    <rect x="406" y="60" width="7" height="7" rx="1.5"/>
    <rect x="406" y="138" width="7" height="7" rx="1.5"/>
    <rect x="406" y="216" width="7" height="7" rx="1.5"/>
    <rect x="406" y="112" width="7" height="7" rx="1.5" stroke-dasharray="2 2"/>
    <rect x="406" y="190" width="7" height="7" rx="1.5" stroke-dasharray="2 2"/>
    <path d="M40 194H18V142h16"/>
  </g>
  <g fill="currentColor" fill-opacity="0.5">
    <path d="M34 138l6 4-6 4z"/>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="9.5" text-anchor="middle">
    <text x="280" y="250">Review opens each pass. Approve and the loop exits before Fix, straight to Verify.</text>
    <text x="280" y="264">A changes-requested decision runs Fix and Re-validate, then Review reads it again.</text>
  </g>
</svg>

### Which seats can write files

A fresh project hands `code_write` to the roles filling implementer and fixer, and `read_only` to the other four - file writes and shell access turned off. Validate and Re-validate name no seat, so no model runs them: your own `commands.validate` do, inside the run's worktree. That list is read-only on the Config page because the server never executes a shell command string handed to it over HTTP; `vibe config set commands.validate` writes it. A pass or a fail there is evidence for the reviewer to weigh, and only the reviewer can call for a fix.

## Crews, flows and the Flow Hub

### The flows that ship

Fourteen flows ship. Three belong to the spec-up chain below and stay out of the pickers, so eleven show up:

<div class="docs-chips"><span>default</span><span>plan-only</span><span>quality-arbitration</span><span>panel-review</span><span>security-review</span><span>express</span><span>scaffold</span><span>saga</span><span>pickup</span><span>pickup-analysis</span><span>pickup-review</span></div>

**Flows** lists the same eleven, each card carrying a bar of one segment per step, coloured by what that step does:

![The Flows page: a header reading 11 flows with New flow and Import buttons and a legend of Build, Review, Check and Gate, over two flow cards. Default carries 8 steps, 6 seats and version 1; Express carries 4 steps, 3 seats and version 1.](/media/docs/flows.png)

Four colours group the six kinds a step can carry. **Build** takes the Build and Revise kinds, which produce or change the work; **Review** takes Review and Summarize, which judge it; **Check** runs your commands; and **Gate** is the Approve kind, which parks the run until a person answers. No built-in flow ships a Gate, so that colour turns up only in a flow you write or install.

**New flow** opens the builder, **Import** takes YAML or a URL, and **Draft a flow** further down the page turns a plain-English description into a proposal you decide whether to save. In the terminal those last two are `vibe flows import <file|url>` and `vibe flows draft "<description>"`; `vibe flows list` prints what was discovered, and `vibe run "<task>" --flow security-review` pins one.

### Whether your crew covers a flow

The Crew page's ring shows coverage, and `vibe flows show <id> --crew <id>` prints it per seat: filled, gap or ambiguous. Each seat needs exactly one candidate, or a `--seat-role` pin, and an unfilled or ambiguous seat stops the run before it spawns any model. Out of the box every seat resolves, so this comes up only once you add roles: `Crew "default" has more than one role filling the "reviewer" seat` means two of yours qualify, and `--seat-role reviewer=senior-reviewer` picks one.

Coverage is a name match, and the order the two are written in changes nothing:

<svg viewBox="0 0 560 258" width="100%" style="max-width:560px;height:auto" role="img" aria-label="The default flow's six seats on the left - planner, architect, implementer, reviewer, fixer, verifier - wired by name to the default crew's six roles on the right: Planner, Architect, Backend Implementer, Fixer, Reviewer, Verifier. The reviewer and fixer wires cross, because the match reads names and not order. A seventh row, validate, names no seat and runs your shell commands.">
  <g fill="currentColor" fill-opacity="0.5" font-size="9.5">
    <text x="1" y="18">the default flow names seats</text>
    <text x="280" y="18" text-anchor="middle">matched by seat name</text>
    <text x="558" y="18" text-anchor="end">your crew's roles fill them</text>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="1" y="30" width="150" height="24" rx="6"/>
    <rect x="1" y="60" width="150" height="24" rx="6"/>
    <rect x="1" y="90" width="150" height="24" rx="6"/>
    <rect x="1" y="120" width="150" height="24" rx="6"/>
    <rect x="1" y="150" width="150" height="24" rx="6"/>
    <rect x="1" y="180" width="150" height="24" rx="6"/>
    <rect x="400" y="30" width="158" height="24" rx="6"/>
    <rect x="400" y="60" width="158" height="24" rx="6"/>
    <rect x="400" y="90" width="158" height="24" rx="6"/>
    <rect x="400" y="120" width="158" height="24" rx="6"/>
    <rect x="400" y="150" width="158" height="24" rx="6"/>
    <rect x="400" y="180" width="158" height="24" rx="6"/>
    <rect x="1" y="214" width="150" height="24" rx="6" stroke-dasharray="4 4"/>
    <rect x="400" y="214" width="158" height="24" rx="6" stroke-dasharray="4 4"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.5" stroke-width="1">
    <path d="M151 42H394"/>
    <path d="M151 72H394"/>
    <path d="M151 102H394"/>
    <path d="M151 132C240 132 305 162 394 162"/>
    <path d="M151 162C240 162 305 132 394 132"/>
    <path d="M151 192H394"/>
    <path d="M151 226H394" stroke-dasharray="4 4"/>
  </g>
  <g fill="currentColor" fill-opacity="0.5">
    <path d="M394 38l6 4-6 4z"/>
    <path d="M394 68l6 4-6 4z"/>
    <path d="M394 98l6 4-6 4z"/>
    <path d="M394 128l6 4-6 4z"/>
    <path d="M394 158l6 4-6 4z"/>
    <path d="M394 188l6 4-6 4z"/>
    <path d="M394 222l6 4-6 4z"/>
  </g>
  <g fill="currentColor" font-size="11" font-family="ui-monospace,monospace">
    <text x="11" y="46">planner</text>
    <text x="11" y="76">architect</text>
    <text x="11" y="106">implementer</text>
    <text x="11" y="136">reviewer</text>
    <text x="11" y="166">fixer</text>
    <text x="11" y="196">verifier</text>
    <text x="11" y="230">validate</text>
  </g>
  <g fill="currentColor" fill-opacity="0.45" font-size="9.5" font-family="ui-monospace,monospace" text-anchor="end">
    <text x="141" y="230">no seat</text>
  </g>
  <g fill="currentColor" font-size="11">
    <text x="409" y="46">Planner</text>
    <text x="409" y="76">Architect</text>
    <text x="409" y="106">Backend Implementer</text>
    <text x="409" y="136">Fixer</text>
    <text x="409" y="166">Reviewer</text>
    <text x="409" y="196">Verifier</text>
  </g>
  <g fill="currentColor" fill-opacity="0.6" font-size="11">
    <text x="409" y="230">your shell commands</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="9.5" text-anchor="middle">
    <text x="280" y="254">Across the 14 built-in flows, 7 of 73 steps name no seat.</text>
  </g>
</svg>

### Splitting a run across two models

One role answers for several seats. The default executor role takes `implementer`, `executor` and `builder`, and the reviewer role takes `reviewer` plus `challenger`, so six roles cover all nine seat names the built-in flows ask for.

<div class="docs-callout warn">

**Every run comes back `Review decision: APPROVED`.** A fresh project points all six roles at one profile, so the model checking the work is the model that wrote it, and a model reading its own diff can only lower its own confidence. Cross-model review starts with a second profile on a different provider.

</div>

On **Profiles**, add one on a second provider; on **Crew**, open the crew and move the reviewer and verifier roles onto it. Configure that provider first, or the profile is refused with `Provider "codex" is not configured.`

```bash
vibe profile add second-opinion --provider codex --model gpt-5.5 --power high
vibe config set crews.default.roles.reviewer.profile second-opinion
vibe config set crews.default.roles.verifier.profile second-opinion
vibe crew show default
```

### The Crew page

The ring is one arc per seat. Its count runs to ten: the page adds the seat names your own roles declare on top of the nine the flows ask for. The **Providers** tab beside it is where the local CLIs are detected, set up and tested.

![The Crew page for the Default crew: a header reading Ready, runs by default, with 6 roles, 10 seats and all seats filled; a ring showing 10 of 10 seats filled with a row per role - Planner reading 1, Architect reading 1, Backend Implementer writing 3, Fixer writing 1, Reviewer reading 2, Verifier reading 2; then role cards for Backend Implementer and Reviewer with the seats each takes and the profile it runs on.](/media/docs/crew.png)

`vibe crew presets add <id>` installs a ready-made crew - `fast`, `thorough`, `cheap` or `local`. The Flow Hub is the community catalog of flows other people published; the Flows page browses and installs from it, and `vibe flows hub list` then `vibe flows hub install <handle>@<name>:<version>` do the same from a terminal. Read the YAML before you run it, because a downloaded flow runs commands on your machine.

## Your rules, and planning before building

### Rules the reviewer enforces

Rules you write yourself are **policies**, and they get a top-level sidebar row because this is the one surface where your rules outrank the model's judgment. (`.vibestrate/rules.md` is a separate thing: free-text project context every agent reads.)

**New policy** opens the one authoring form: the rule in plain English, a tier select reading **advise** or **block**, then either a suggested fix or a matcher regex. **Draft** turns the sentence into a drafted rule to edit, **Test** checks a matcher against sample text, and nothing saves until **Add policy**. Below your rules sit the **Deterministic engine** and the **Hard guards**, four switches that ship on and read **4/4** in the header.

An `advise` policy is text appended to reviewer turns, so a model does the judging, and at most twelve reach any one review. A `block` policy is a regular expression run over the lines the diff added, and one match caps merge-readiness even on a run the reviewer approved. More: [Policies](/docs/concepts/policies).

```bash
vibe policies add prefer-async "prefer async/await over .then() chains" --fix "rewrite as async/await"
vibe policies add no-console "no console.log in shipped code" --block --matcher "console\\.log\\("
```

<div class="docs-callout warn">

**`Refusing to start. The policy set in .vibestrate/policies/ did not fully load` before a single step runs.** A rule file in that directory failed to parse, or two of them declare the same rule id. That directory is a separate surface from the `project.yml` policies above, and a set that doesn't fully load stops run creation rather than being skipped. `vibe policies doctor` names the file and the reason.

</div>

### Spec-up, for a greenfield brief

Spec-up fires without you asking. Hand an ordinary run a brief that reads greenfield and Vibestrate swaps it for a read-only intake that writes no code; **Plan first** on the New run page asks for the same thing deliberately.

The intake run's page then carries a **Scope the work** panel: the gaps it found, grouped, with a field per question and a **Suggested** answer you can take as-is. **Suggest all here** drafts the rest of a group. **Submit answers** sends what you have and asks follow-ups only where something is still open, **Proceed to spec** stops the questioning, and **Build the spec** writes the spec, architecture and risks.

From there, **Approve & build** launches the build from the approved spec, and **Generate roadmap** turns the finished run into a proposal whose **Create board cards** puts the work on your **Board**. A run started from a card carries the approved spec with it.

The same chain from a terminal, each command printing the run id the next one needs:

```bash
vibe spec-up questions <intake run id>                       # the gaps, each with a kebab-case id
vibe spec-up answer <intake run id> --answer data-store="Postgres, single tenant"
vibe spec-up answer <intake run id> --proceed                # prints the spec run id
vibe spec-up build <spec-up run id>
```

`data-store` is a placeholder: the model writes its own id per question, and `vibe spec-up questions` prints the real ones to pass back verbatim. The roadmap route is `vibe spec-up approve`, then `vibe spec-up roadmap`, then `vibe roadmap accept <proposalId>`. `--no-select` skips the detour for one run, and `adaptiveSpecUp: off` opts out entirely. More: [Spec-up](/docs/concepts/spec-up).

## The merge path

A change crosses three branches: the run's own, which forks from main when the run starts, a staging branch you name, and main.

<svg viewBox="0 0 560 192" width="100%" style="max-width:560px;height:auto" role="img" aria-label="Three branch lanes. The run branch forks from main, integrate apply merges it into a staging branch you name, and integrate finish merges that into main behind a typed confirmation token. Integrate advise reads the run branch and changes nothing.">
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="250" y="4" width="200" height="18" rx="6" stroke-dasharray="4 4"/>
    <path d="M280 22v12" stroke-dasharray="3 3"/>
    <path d="M64 148C82 148 78 44 96 44"/>
    <rect x="478" y="113" width="14" height="17" rx="3" stroke-opacity="0.6"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.5" stroke-width="1">
    <path d="M96 44H300"/>
    <path d="M332 96H470"/>
    <path d="M300 44C318 44 314 96 332 96"/>
    <path d="M470 96C488 96 484 148 502 148"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.55" stroke-width="1.5">
    <path d="M1 148H558"/>
  </g>
  <g fill="currentColor" fill-opacity="0.5">
    <path d="M276 34l4 6 4-6z"/>
    <path d="M326 92l6 4-6 4z"/>
    <path d="M496 144l6 4-6 4z"/>
    <circle cx="24" cy="148" r="3"/>
    <circle cx="44" cy="148" r="3"/>
    <circle cx="140" cy="44" r="3"/>
    <circle cx="180" cy="44" r="3"/>
    <circle cx="220" cy="44" r="3"/>
    <circle cx="370" cy="96" r="3"/>
    <circle cx="530" cy="148" r="3"/>
  </g>
  <g fill="currentColor" font-size="10" font-family="ui-monospace,monospace">
    <text x="96" y="34">vibestrate/bold-lovelace</text>
    <text x="332" y="86">integration/logging</text>
    <text x="1" y="166">main</text>
  </g>
  <g fill="currentColor" fill-opacity="0.6" font-size="9" font-family="ui-monospace,monospace">
    <text x="258" y="17">vibe integrate advise - read-only</text>
    <text x="296" y="72" text-anchor="end">vibe integrate apply --into</text>
    <text x="466" y="126" text-anchor="end">vibe integrate finish --confirm merge-to-main</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="8.5" font-family="ui-monospace,monospace" text-anchor="middle">
    <text x="485" y="106">token</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="9.5" text-anchor="middle">
    <text x="280" y="184">Nothing reaches main until you type the token out in full.</text>
  </g>
</svg>

**Source > Merge** is that path in the dashboard: it lists every merge-ready run, **Get merge advice** opens the read-only verdict, the `integration/branch` field and **Integrate this run** do the staging merge, and **Complete merge to main** asks you to confirm before running a local git merge. Nothing is ever pushed. **Analyze the diff** adds an optional model read, advisory only. The **Tree** tab draws the commit graph and previews a merge before it happens, with undo one click away.

`vibe integrate advise`, `apply --into` and `finish --confirm merge-to-main` are the same three steps in a terminal. The [quick start](/docs/getting-started/quickstart) walks them, and [Keep a change](/docs/getting-started/merging) is the long version.

### Which runs arrive committed

A run on the linear flows - `default`, `express`, `panel-review`, `security-review`, `plan-only`, `scaffold`, `quality-arbitration` - leaves its edits uncommitted in the worktree, so the commit message stays yours to write. Read the diff and write that commit, or the merge lands a clean nothing:

```bash
cd "$(vibe path bold-lovelace --cd)"
git diff main
git add -A && git commit -m "Add structured logging to the settings save handler"
cd -    # back to your project
```

That `cd -` matters. Vibestrate reads the git root of wherever you stand to work out which project you mean, and inside a worktree that root is the worktree.

The other four - `pickup`, `pickup-analysis`, `pickup-review` and `saga` - walk a board card's checklist and commit each item as it lands, so a run started with `vibe tasks pickup` or `vibe tasks sequence` reaches you already committed.

## When you are stuck

The stuck-point boxes on this page and the [quick start](/docs/getting-started/quickstart) sit beside the step that produces them. These four turn up anywhere:

| Symptom | Cause | Fix |
|---|---|---|
| Run completes, worktree unchanged | A `type: cli` provider gets no write grant | `vibe config set providers.claude.type claude-code`, or `policies.strictApplyOnly true` on the rest |
| `error: unknown command 'merge'` or `'diff'` | Neither command exists | Source > Merge, or `vibe integrate advise <runId>` |
| A greenfield brief ends with an empty diff | Spec-up swapped the run for a read-only intake | The run page's Scope the work panel, or `vibe spec-up questions <runId>` |
| Run files are nowhere in your repo | The worktree is a sibling directory | The run page's Workspace panel, or `vibe path <runId>` |

Ask about any of it through the Consult orb, or `vibe consult "why did bold-lovelace end blocked?"`. Consult also reads Vibestrate's own documentation, and every answer carries a confidence level next to whatever it could not verify. A review rule it proposes lands as a *pending* advise policy, waiting on **Confirm** on the Policies page or `vibe policies confirm <id>`.

## Keep going

- [Quick start](/docs/getting-started/quickstart) - install, connect a model, and take one task to a merged change.
- [The big picture](/docs/getting-started/big-picture) - the same vocabulary, with the reasoning behind each piece.
- [The interactive shell](/docs/cli/shell) - the same surfaces without leaving the terminal.
- [Safety](/docs/concepts/safety) - the Action Broker, gates, and what a run can and cannot touch.
- [Troubleshooting](/docs/troubleshooting) - the long version of the table above.
