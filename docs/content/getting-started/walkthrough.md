---
title: Full walkthrough
description: This page covers the dashboard, flows, crews, policies, spec-up and the merge path.
slug: getting-started/walkthrough
---

Vibestrate drives the AI coding CLIs already installed on your machine - Claude Code, Codex, Gemini, Aider, Ollama and others - as one pipeline over a single task. A **run** is one pass over that task: it opens a **worktree**, a second checkout of your repository in a separate folder, works there on a branch of its own, and hands the result back to you. Each run gets a docker-style id like `bold-lovelace`, used verbatim as the branch suffix and the worktree folder name.

This page is the tour of the whole product: the dashboard, the flows and crews behind every run, the rules you write yourself, the spec-up intake a greenfield brief triggers, and the merge path that carries a change to main. It assumes you have Vibestrate installed, one coding CLI connected, and `vibe init` run inside a git repository (the setup command: it writes the `.vibestrate/` folder this page keeps referring to). The [quick start](/docs/getting-started/quickstart) does that setup and takes one task through to a merged change, so start there if `vibe --version` prints nothing.

Finish this page and you can pick a flow per task, split a run across two providers so the model judging the diff isn't the model that wrote it, write rules the reviewer enforces, and take a finished run to main yourself.

## What a run actually does

A **flow** is the recipe a run follows: an ordered list of steps. A step names the *kind* of worker it needs and never names a model. That kind is a **seat**, and the **roles** in your **crew** fill the seats. Each role runs on a **profile**: a provider, a model, and how hard that model should think.

Run once at the root of your repository, `vibe init` writes `.vibestrate/` with your config file `project.yml`, a role file per crew member, and a rules file every agent reads.

`vibe run` starts a run. It takes your task as its argument and closes with a summary whose `Branch:` and `Worktree:` lines carry the run's id, the handle every command on this page asks for. `vibe status` lists those ids later.

```bash
vibe run "Add structured logging to the settings save handler"
```

The [quick start](/docs/getting-started/quickstart) walks that first run from install to merge. This page covers the flags and the screens around it.

The `default` flow that `vibe init` writes plans, designs, implements, reviews and verifies, and the reviewer can send the work back to the fixer twice before the flow gives up. Those five verbs cover eight steps. Two of them write files, two run your own commands, and the other four read:

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

`vibe init` hands `code_write` to the roles filling implementer and fixer, and `read_only` to the other four. A read-only role runs with file writes and shell access turned off. Validate and Re-validate name no seat, so no model runs them: your own commands do, inside the run's worktree. Those commands are `commands.validate` in `project.yml`, a list of shell strings that runs one at a time. `vibe init` fills the list in from your package scripts, and `vibe config set commands.validate` rewrites it. A pass or a fail there is evidence for the reviewer to weigh, and only the reviewer can call for a fix.

## The dashboard

```bash
vibe ui
```

That opens the dashboard at 127.0.0.1:4317 and keeps a scheduler running behind it. The scheduler executes the runs you start from the browser. Everything stays on your machine, and nothing outside it can reach the dashboard.

<div class="docs-callout warn">

**The dashboard loads, and a tab sits empty though you have runs.** It reads `.vibestrate/runs/` from the directory `vibe ui` started in, so a server launched outside your project root reads an empty project. Stop it and start it from the root. If the root was already right, hard-reload the page once (Cmd-Shift-R, or Ctrl-Shift-R on Windows) to drop a cached asset bundle.

```bash
cd /path/to/your-project && vibe ui
```

</div>

<svg viewBox="0 0 560 250" width="100%" style="max-width:560px;height:auto" role="img" aria-label="Mission Control: a left sidebar listing Mission control, Dashboard, Runs, Flows, Crew, Policies, Source, Board, Metrics, Profiles, Codebase and More, then a utility row of Jump to, a notification bell and Settings, then a New run button, beside a scrolling pane holding the Supervisor panel, the New run panel and a Waiting on you section, with the Consult orb floating in the bottom-right corner.">
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="1" y="1" width="558" height="232" rx="10"/>
    <rect x="9" y="9" width="150" height="214" rx="8"/>
    <rect x="167" y="9" width="384" height="214" rx="8"/>
    <rect x="175" y="42" width="368" height="52" rx="6"/>
    <rect x="175" y="102" width="368" height="60" rx="6"/>
    <rect x="175" y="170" width="368" height="44" rx="6"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.5" stroke-width="1">
    <rect x="17" y="200" width="134" height="20" rx="6"/>
    <circle cx="527" cy="200" r="14"/>
    <path d="M99 194.5c1.4-1 1-2.1 1-3.5a2.5 2.5 0 0 1 5 0c0 1.4-.4 2.5 1 3.5z"/>
    <path d="M101.1 195.7a1.4 1.4 0 0 0 2.8 0"/>
  </g>
  <g fill="currentColor" font-size="10" font-family="ui-monospace,monospace">
    <text x="19" y="28">Vibestrate</text>
    <text x="19" y="41">Mission control</text>
    <text x="19" y="54">Dashboard</text>
    <text x="19" y="67">Runs</text>
    <text x="19" y="80">Flows</text>
    <text x="19" y="93">Crew</text>
    <text x="19" y="106">Policies</text>
    <text x="19" y="119">Source</text>
    <text x="19" y="132">Board</text>
    <text x="19" y="145">Metrics</text>
    <text x="19" y="158">Profiles</text>
    <text x="19" y="171">Codebase</text>
    <text x="19" y="184">More</text>
    <text x="19" y="195" font-size="9">Jump to…</text>
    <text x="151" y="195" font-size="8" text-anchor="end">Settings</text>
    <text x="84" y="214" text-anchor="middle">New run</text>
  </g>
  <g fill="currentColor" font-size="11" font-family="ui-monospace,monospace">
    <text x="175" y="32">Mission control</text>
    <text x="185" y="62">Supervisor</text>
    <text x="185" y="122">New run</text>
    <text x="185" y="190">Waiting on you</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="10">
    <text x="527" y="204" text-anchor="middle" font-size="9">orb</text>
    <text x="280" y="246" text-anchor="middle">The Consult orb floats bottom-right on every screen except the full Consult page.</text>
  </g>
</svg>

Mission Control is the screen it opens on. Panels drag and resize once you turn on edit mode, and each browser remembers its own arrangement.

The **Supervisor** panel at the top is the judgment layer over your runs. A supervisor is a persona, `staff-engineer` out of the box, and it picks the flow when you do not name one, pushes a risky task toward heavier review, and records the reasoning on the run page under **Flow & why**. Its judgment adds review and never removes it, and an explicit `--flow` overrules it.

**Consult** is the ask-anything surface: it answers questions about your project from your own config, policies, runs and code. Its orb floats in the bottom-right corner of every screen but the full Consult page, and opens two cards. "Ask about this project" never edits your code. The most it leaves behind is a pending review rule or a proposed edit to `VIBESTRATE.md`, the operating manual the orchestrator reads when it picks a workflow, and a separate file from the `rules.md` every agent reads on every turn. Neither proposal takes effect until you confirm it.

"Work in Vibestrate" can create a task, add a checklist item or start a run. It ships refusing all three, because `supervisorControl.autonomy` starts at `advise`. Turning that up needs a budget ceiling first, since config validation rejects an unbounded `act`: run `vibe budget set --max-turns-run 40`, then `vibe config set supervisorControl.autonomy act`. The panel's "Answers only" / "Answers and acts" switch overrides all of it: a kill switch that pauses the supervisor mid-conversation. More: [Mission Control](/docs/cli/dashboard).

Open a run from there and its page carries every fact the terminal summary printed, with the diff behind it:

<svg viewBox="0 0 560 532" width="100%" style="max-width:560px;height:auto" role="img" aria-label="A run page: a breadcrumb with branch, View diff and Re-run with changes buttons, a status card reading merge ready with the flow's eight steps as a rail, a Supervisor panel, a Run assurance panel with Policy, Validation, Review and Verification, a Workspace panel holding the worktree path, then Live timeline, Live metrics, Changed files and Live execution panels, and an Inspect tab row of Tree, Steps, Events, Artifacts, Validation, Terminal and Replay.">
  <g fill="none" stroke="currentColor" stroke-opacity="0.3" stroke-width="1">
    <rect x="228" y="8" width="140" height="18" rx="6"/>
    <rect x="374" y="8" width="62" height="18" rx="6"/>
    <rect x="442" y="8" width="116" height="18" rx="6"/>
    <rect x="490" y="292" width="62" height="18" rx="6"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="1" y="34" width="557" height="104" rx="12"/>
    <rect x="1" y="146" width="557" height="46" rx="12"/>
    <rect x="1" y="200" width="557" height="78" rx="12"/>
    <rect x="1" y="286" width="557" height="56" rx="12"/>
    <rect x="1" y="350" width="364" height="88" rx="12"/>
    <rect x="373" y="350" width="185" height="40" rx="12"/>
    <rect x="373" y="398" width="185" height="40" rx="12"/>
    <rect x="1" y="446" width="557" height="48" rx="12"/>
    <rect x="200" y="502" width="358" height="20" rx="8"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.2" stroke-width="1">
    <rect x="14" y="240" width="130" height="28" rx="8"/>
    <rect x="150" y="240" width="130" height="28" rx="8"/>
    <rect x="286" y="240" width="130" height="28" rx="8"/>
    <rect x="422" y="240" width="130" height="28" rx="8"/>
    <rect x="14" y="325" width="440" height="14" rx="5"/>
  </g>
  <g fill="currentColor" font-size="9.5">
    <text x="8" y="22">Mission / bold-lovelace</text>
  </g>
  <g fill="currentColor" font-size="8.5" font-family="ui-monospace,monospace">
    <text x="234" y="21">vibestrate/bold-lovelace</text>
  </g>
  <g fill="currentColor" font-size="8.5">
    <text x="382" y="21">View diff</text>
    <text x="450" y="21">Re-run with changes</text>
    <text x="498" y="305">Copy cd</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="9" font-family="ui-monospace,monospace">
    <text x="14" y="52">Run</text>
    <text x="14" y="94">Flow</text>
  </g>
  <g fill="currentColor" font-size="14">
    <text x="14" y="73">merge ready</text>
  </g>
  <g fill="currentColor" font-size="9">
    <text x="44" y="94">Default</text>
  </g>
  <g fill="currentColor" font-size="11" font-family="ui-monospace,monospace">
    <text x="250" y="60">claude-balanced</text>
    <text x="362" y="60">4m 12s</text>
    <text x="440" y="60">+128 -14</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="8.5">
    <text x="250" y="74">provider</text>
    <text x="362" y="74">elapsed</text>
    <text x="440" y="74">diff · 7 files</text>
  </g>
  <g fill="currentColor" fill-opacity="0.45">
    <rect x="14" y="102" width="61" height="4" rx="2"/>
    <rect x="81" y="102" width="61" height="4" rx="2"/>
    <rect x="148" y="102" width="61" height="4" rx="2"/>
    <rect x="215" y="102" width="61" height="4" rx="2"/>
    <rect x="282" y="102" width="61" height="4" rx="2"/>
    <rect x="349" y="102" width="61" height="4" rx="2"/>
    <rect x="416" y="102" width="61" height="4" rx="2"/>
    <rect x="483" y="102" width="61" height="4" rx="2"/>
  </g>
  <g fill="currentColor" fill-opacity="0.75" font-size="8.5" font-family="ui-monospace,monospace" text-anchor="middle">
    <text x="45" y="120">Plan</text>
    <text x="112" y="120">Architecture</text>
    <text x="179" y="120">Implement</text>
    <text x="246" y="120">Validate</text>
    <text x="313" y="120">Review</text>
    <text x="380" y="120">Fix</text>
    <text x="447" y="120">Re-validate</text>
    <text x="514" y="120">Verify</text>
  </g>
  <g fill="currentColor" font-size="9.5">
    <text x="14" y="165">Supervisor</text>
    <text x="80" y="165">staff-engineer</text>
    <text x="14" y="218">Run assurance</text>
    <text x="14" y="304">Workspace</text>
    <text x="14" y="368">Live timeline</text>
    <text x="386" y="368">Live metrics</text>
    <text x="386" y="416">Changed files</text>
    <text x="14" y="464">Live execution</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="8.5" font-family="ui-monospace,monospace">
    <text x="14" y="182">Flow &amp; why</text>
  </g>
  <g fill="currentColor" fill-opacity="0.6" font-size="8.5">
    <text x="76" y="182">default · selected · high confidence</text>
  </g>
  <g fill="currentColor" font-size="12">
    <text x="14" y="235">verified</text>
    <text x="8" y="516">Inspect</text>
  </g>
  <g fill="currentColor" fill-opacity="0.55" font-size="8">
    <text x="22" y="252">Policy</text>
    <text x="158" y="252">Validation</text>
    <text x="294" y="252">Review</text>
    <text x="430" y="252">Verification</text>
  </g>
  <g fill="currentColor" font-size="9">
    <text x="22" y="263">passed</text>
    <text x="158" y="263">passed</text>
    <text x="294" y="263">approved</text>
    <text x="430" y="263">passed</text>
  </g>
  <g fill="currentColor" font-size="9" font-family="ui-monospace,monospace">
    <text x="14" y="319">vibestrate/bold-lovelace</text>
  </g>
  <g fill="currentColor" fill-opacity="0.55" font-size="8" font-family="ui-monospace,monospace">
    <text x="20" y="336">/home/you/.vibestrate-worktrees/bold-lovelace</text>
  </g>
  <g fill="currentColor" fill-opacity="0.15">
    <rect x="14" y="378" width="210" height="8" rx="4"/>
    <rect x="14" y="392" width="160" height="8" rx="4"/>
    <rect x="14" y="406" width="230" height="8" rx="4"/>
    <rect x="14" y="420" width="120" height="8" rx="4"/>
    <rect x="386" y="376" width="120" height="8" rx="4"/>
    <rect x="386" y="424" width="140" height="6" rx="3"/>
    <rect x="14" y="474" width="340" height="6" rx="3"/>
    <rect x="14" y="484" width="250" height="6" rx="3"/>
  </g>
  <g fill="currentColor" fill-opacity="0.12">
    <rect x="327" y="505" width="58" height="14" rx="6"/>
  </g>
  <g fill="currentColor" font-size="8.5" text-anchor="middle">
    <text x="218" y="516">Tree</text>
    <text x="257" y="516">Steps</text>
    <text x="302" y="516">Events</text>
    <text x="356" y="516">Artifacts</text>
    <text x="421" y="516">Validation</text>
    <text x="483" y="516">Terminal</text>
    <text x="535" y="516">Replay</text>
  </g>
</svg>

The status card carries the run's outcome. **merge ready** means the run finished with nothing stopping it, so the branch is yours to take: Vibestrate holds there and never merges or pushes on its own.

**Run assurance** splits that outcome into the four lanes behind it. **Policy** records what the Action Broker allowed and refused while the run worked, so it reports on the gate rather than on the rules you authored. **Validation** is your own commands, **Review** is the reviewer seat's verdict on the diff, and **Verification** is the verifier's separate pass over the finished change. A run that never reached merge-ready reads `blocked`. A policy violation is graded harder: the verdict comes back `unsafe`, because a refused action can leave the worktree half-written. Validation, review and verification read `not applicable` when the flow asked nothing of them, so an empty lane never passes as a check. The headline above the lanes grades what did run: `verified`, `partially verified`, `unverified`, `unsafe` or `blocked`. `vibe assurance <runId>` prints the same verdict in the terminal.

**View diff** in the header opens the Artifacts tab on the changed-files list, and picking a file toggles between its diff and the whole file as it now stands in the worktree. **Workspace** holds the worktree path and a `cd` you can copy. Terminal opens a shell inside that worktree, and `policies.allowInteractiveTerminal` starts off.

## Crews, flows and the Flow Hub

Fourteen flows ship. Three of them belong to the spec-up chain covered further down and stay out of the pickers, so eleven show up:

<div class="docs-chips"><span>default</span><span>plan-only</span><span>quality-arbitration</span><span>panel-review</span><span>security-review</span><span>express</span><span>scaffold</span><span>saga</span><span>pickup</span><span>pickup-analysis</span><span>pickup-review</span></div>

The dashboard lists the same eleven under Flows. Each card carries its step count, its seats, and a bar with one segment per step, coloured by what that step does:

<svg viewBox="0 0 560 240" width="100%" style="max-width:560px;height:auto" role="img" aria-label="The Flows page: a header reading 11 flows with New flow and Import buttons and a legend of Build, Review, Check and Gate, over two flow cards. Default carries 8 steps, 6 seats and version 1; Express carries 4 steps, 3 seats and version 1.">
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="1" y="1" width="557" height="100" rx="12"/>
    <rect x="1" y="110" width="274" height="118" rx="12"/>
    <rect x="284" y="110" width="274" height="118" rx="12"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.3" stroke-width="1">
    <rect x="14" y="14" width="190" height="66" rx="10"/>
    <rect x="418" y="14" width="64" height="18" rx="6"/>
    <rect x="496" y="14" width="56" height="18" rx="6"/>
    <rect x="14" y="204" width="44" height="14" rx="5"/>
    <rect x="297" y="204" width="44" height="14" rx="5"/>
    <path d="M64 123v12M64 123h9l-2.5 3.5L73 130H64" stroke-opacity="0.6"/>
  </g>
  <g fill="currentColor" font-size="18">
    <text x="24" y="44">11</text>
  </g>
  <g fill="currentColor" fill-opacity="0.6" font-size="9">
    <text x="24" y="58">Flows</text>
    <text x="218" y="56">A flow is the steps a run follows, and who runs each one.</text>
  </g>
  <g fill="currentColor" fill-opacity="0.45" font-size="7.5">
    <text x="24" y="71">"default" runs unless a run picks another.</text>
  </g>
  <g fill="currentColor" font-size="15">
    <text x="218" y="40">Flows</text>
  </g>
  <g fill="currentColor" font-size="8.5">
    <text x="426" y="27">New flow</text>
    <text x="504" y="27">Import</text>
    <text x="230" y="92">Build</text>
    <text x="274" y="92">Review</text>
    <text x="322" y="92">Check</text>
    <text x="364" y="92">Gate</text>
  </g>
  <g fill="currentColor" font-size="11">
    <text x="218" y="76">11</text>
    <text x="280" y="76">0</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="8.5">
    <text x="234" y="76">flows</text>
    <text x="290" y="76">project-owned</text>
  </g>
  <g fill="currentColor">
    <circle cx="222" cy="89" r="3" fill-opacity="0.65"/>
    <circle cx="266" cy="89" r="3" fill-opacity="0.45"/>
    <circle cx="314" cy="89" r="3" fill-opacity="0.85"/>
    <circle cx="356" cy="89" r="3" fill-opacity="0.25"/>
  </g>
  <g fill="currentColor" font-size="11">
    <text x="14" y="132">Default</text>
    <text x="297" y="132">Express</text>
  </g>
  <g fill="currentColor" fill-opacity="0.55" font-size="8.5">
    <text x="14" y="150">The standard plan → architect → implement →</text>
    <text x="14" y="162">validate → review workflow.</text>
    <text x="297" y="150">One implementer turn for small, low-risk tasks.</text>
    <text x="297" y="162">Validation is scoped to the actual change.</text>
  </g>
  <g fill="currentColor">
    <rect x="14" y="172" width="29" height="8" rx="4" fill-opacity="0.65"/>
    <rect x="45" y="172" width="29" height="8" rx="4" fill-opacity="0.65"/>
    <rect x="76" y="172" width="29" height="8" rx="4" fill-opacity="0.65"/>
    <rect x="107" y="172" width="29" height="8" rx="4" fill-opacity="0.85"/>
    <rect x="138" y="172" width="29" height="8" rx="4" fill-opacity="0.45"/>
    <rect x="169" y="172" width="29" height="8" rx="4" fill-opacity="0.65"/>
    <rect x="200" y="172" width="29" height="8" rx="4" fill-opacity="0.85"/>
    <rect x="231" y="172" width="29" height="8" rx="4" fill-opacity="0.45"/>
    <rect x="297" y="172" width="60" height="8" rx="4" fill-opacity="0.65"/>
    <rect x="359" y="172" width="60" height="8" rx="4" fill-opacity="0.85"/>
    <rect x="421" y="172" width="60" height="8" rx="4" fill-opacity="0.45"/>
    <rect x="483" y="172" width="60" height="8" rx="4" fill-opacity="0.45"/>
    <circle cx="248" cy="211" r="1.5" fill-opacity="0.5"/>
    <circle cx="254" cy="211" r="1.5" fill-opacity="0.5"/>
    <circle cx="260" cy="211" r="1.5" fill-opacity="0.5"/>
    <circle cx="531" cy="211" r="1.5" fill-opacity="0.5"/>
    <circle cx="537" cy="211" r="1.5" fill-opacity="0.5"/>
    <circle cx="543" cy="211" r="1.5" fill-opacity="0.5"/>
  </g>
  <g fill="currentColor" font-size="10">
    <text x="14" y="196">8</text>
    <text x="58" y="196">6</text>
    <text x="104" y="196">v1</text>
    <text x="297" y="196">4</text>
    <text x="341" y="196">3</text>
    <text x="387" y="196">v1</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="8">
    <text x="24" y="196">steps</text>
    <text x="68" y="196">seats</text>
    <text x="120" y="196">version</text>
    <text x="307" y="196">steps</text>
    <text x="351" y="196">seats</text>
    <text x="403" y="196">version</text>
  </g>
  <g fill="currentColor" font-size="8">
    <text x="22" y="214">Open</text>
    <text x="305" y="214">Open</text>
  </g>
</svg>

Four colours group the six kinds a step can carry. **Build** takes the Build and Revise kinds, which produce or change the work. **Review** takes Review and Summarize, which judge it. **Check** runs your commands, pass or fail. **Gate** is the Approve kind, which parks the run until a person answers; no built-in flow ships one, so that colour turns up only in a flow you write or install. The `default` flow above is six Build and Review steps around two Checks.

```bash
vibe flows list
vibe flows show default --crew default
vibe run "Harden the token refresh path" --flow security-review
```

`flows show --crew` prints coverage per seat: filled, gap or ambiguous. Each seat needs exactly one candidate, or a `--seat-role` pin, and an unfilled or ambiguous seat stops the run before it spawns any model. Straight out of `vibe init`, every seat resolves, so this comes up only once you add roles: `Crew "default" has more than one role filling the "reviewer" seat` means two of yours qualify, and `vibe run "<task>" --seat-role reviewer=senior-reviewer` picks one.

Coverage is a name match. The flow asks for a seat, your crew answers with the role whose `seats` list carries that name, and the order the two are written in changes nothing:

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

One role answers for several seats. `vibe init` gives its executor role the `implementer`, `executor` and `builder` seats, and its reviewer role `reviewer` plus `challenger`, so six roles cover all nine seat names the built-in flows ask for.

<div class="docs-callout warn">

**Every run comes back `Review decision: APPROVED`.** `vibe init` points all six roles at one profile, so the model checking the work is the model that wrote it, and a model reading its own diff can only lower its own confidence. Cross-model review starts when you add a second profile on a different provider and point the `reviewer` and `verifier` roles at it, as below.

</div>

Configure that second provider first (`vibe provider setup`), or `profile add` refuses with `Provider "codex" is not configured.`

```bash
vibe profile add second-opinion --provider codex --model gpt-5.5 --power high
vibe config set crews.default.roles.reviewer.profile second-opinion
vibe config set crews.default.roles.verifier.profile second-opinion
vibe crew show default
```

`crew show` prints each role beside the profile it now runs on - check that `reviewer` and `verifier` moved.

The Crew page carries the same roster. The ring is one arc per seat, and the rows beside it name the role holding each arc and whether that role reads or writes. Its count runs to ten, because the page adds the seat names your own roles declare on top of the nine the flows ask for:

<svg viewBox="0 0 560 410" width="100%" style="max-width:560px;height:auto" role="img" aria-label="The Crew page for the Default crew: a header reading Ready, runs by default, with 6 roles, 10 seats and all seats filled; a ring showing 10 of 10 seats filled with a row per role - Planner reading 1, Architect reading 1, Backend Implementer writing 3, Fixer writing 1, Reviewer reading 2, Verifier reading 2; then role cards for Backend Implementer and Reviewer with the seats each takes and the profile it runs on.">
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="1" y="1" width="557" height="100" rx="12"/>
    <rect x="1" y="110" width="400" height="140" rx="12"/>
    <rect x="1" y="282" width="274" height="118" rx="12"/>
    <rect x="284" y="282" width="274" height="118" rx="12"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.3" stroke-width="1">
    <rect x="14" y="14" width="240" height="66" rx="10"/>
    <rect x="410" y="14" width="66" height="18" rx="6"/>
    <rect x="482" y="14" width="70" height="18" rx="6"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.25" stroke-width="1">
    <rect x="12" y="340" width="62" height="14" rx="5"/>
    <rect x="80" y="340" width="52" height="14" rx="5"/>
    <rect x="138" y="340" width="48" height="14" rx="5"/>
    <rect x="295" y="340" width="52" height="14" rx="5"/>
    <rect x="353" y="340" width="60" height="14" rx="5"/>
    <rect x="12" y="372" width="180" height="14" rx="5"/>
    <rect x="295" y="372" width="180" height="14" rx="5"/>
  </g>
  <g fill="currentColor" font-size="18">
    <text x="24" y="44">Ready</text>
  </g>
  <g fill="currentColor" fill-opacity="0.6" font-size="9">
    <text x="24" y="58">Runs by default</text>
  </g>
  <g fill="currentColor" fill-opacity="0.45" font-size="7.5">
    <text x="24" y="71">Every seat a flow can ask for has a role behind it.</text>
  </g>
  <g fill="currentColor" font-size="15">
    <text x="268" y="40">Default</text>
  </g>
  <g fill="currentColor" fill-opacity="0.6" font-size="8">
    <text x="268" y="56">Each role runs on a profile and fills one of the flow's seats.</text>
  </g>
  <g fill="currentColor" font-size="8.5">
    <text x="418" y="27">All crews</text>
    <text x="490" y="27">Edit roles</text>
  </g>
  <g fill="currentColor" font-size="11">
    <text x="268" y="76">6</text>
    <text x="312" y="76">10</text>
    <text x="360" y="76">all</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="8">
    <text x="278" y="76">roles</text>
    <text x="326" y="76">seats</text>
    <text x="380" y="76">seats filled</text>
    <text x="268" y="92">Picked for every run unless a run names another crew.</text>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.5" stroke-width="14" stroke-dasharray="20 3.25">
    <circle cx="75" cy="180" r="37" transform="rotate(-90 75 180)"/>
  </g>
  <g fill="currentColor" font-size="14" text-anchor="middle">
    <text x="75" y="178">10/10</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="8" text-anchor="middle">
    <text x="75" y="192">seats filled</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5">
    <circle cx="140" cy="135" r="3"/>
    <circle cx="140" cy="151" r="3"/>
    <circle cx="140" cy="167" r="3"/>
    <circle cx="140" cy="183" r="3"/>
    <circle cx="140" cy="199" r="3"/>
    <circle cx="140" cy="215" r="3"/>
  </g>
  <g fill="currentColor" font-size="9">
    <text x="150" y="138">Planner</text>
    <text x="150" y="154">Architect</text>
    <text x="150" y="170">Backend Implementer</text>
    <text x="150" y="186">Fixer</text>
    <text x="150" y="202">Reviewer</text>
    <text x="150" y="218">Verifier</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="8.5" text-anchor="end">
    <text x="370" y="138">Reading</text>
    <text x="370" y="154">Reading</text>
    <text x="370" y="170">Writing</text>
    <text x="370" y="186">Writing</text>
    <text x="370" y="202">Reading</text>
    <text x="370" y="218">Reading</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="8.5" font-family="ui-monospace,monospace" text-anchor="end">
    <text x="390" y="138">1</text>
    <text x="390" y="154">1</text>
    <text x="390" y="170">3</text>
    <text x="390" y="186">1</text>
    <text x="390" y="202">2</text>
    <text x="390" y="218">2</text>
  </g>
  <g fill="currentColor" font-size="11">
    <text x="1" y="272">Roles</text>
  </g>
  <g fill="currentColor" fill-opacity="0.12">
    <rect x="12" y="292" width="22" height="22" rx="6"/>
    <rect x="295" y="292" width="22" height="22" rx="6"/>
  </g>
  <g fill="currentColor" font-size="10" font-family="ui-monospace,monospace" text-anchor="middle">
    <text x="23" y="307">BA</text>
    <text x="306" y="307">RE</text>
  </g>
  <g fill="currentColor" font-size="10.5">
    <text x="42" y="303">Backend Implementer</text>
    <text x="325" y="303">Reviewer</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="8.5" font-family="ui-monospace,monospace">
    <text x="42" y="315">executor</text>
  </g>
  <g fill="currentColor" font-size="8.5" text-anchor="end">
    <text x="264" y="303">Can write</text>
    <text x="547" y="303">Read only</text>
  </g>
  <g fill="currentColor" fill-opacity="0.6" font-size="8.5">
    <text x="12" y="334">Seats it takes</text>
    <text x="295" y="334">Seats it takes</text>
    <text x="12" y="368">Profile (runtime)</text>
    <text x="295" y="368">Profile (runtime)</text>
  </g>
  <g fill="currentColor" font-size="8" font-family="ui-monospace,monospace" text-anchor="middle">
    <text x="43" y="350">implementer</text>
    <text x="106" y="350">executor</text>
    <text x="162" y="350">builder</text>
    <text x="321" y="350">reviewer</text>
    <text x="383" y="350">challenger</text>
  </g>
  <g fill="currentColor" font-size="8" font-family="ui-monospace,monospace">
    <text x="18" y="382">claude-balanced</text>
    <text x="301" y="382">second-opinion</text>
  </g>
</svg>

`vibe crew presets add <id>` installs a ready-made crew - `fast`, `thorough`, `cheap` or `local` - and `vibe crew presets list` shows which of them are already in your `project.yml`. The Flow Hub is the community catalog of flows other people published: `vibe flows hub list` searches it on vibestrate.com and `vibe flows hub install <handle>@<name>:<version>` writes one into `.vibestrate/flows/`. Read the YAML before you run it, because a downloaded flow runs commands on your machine.

## Your rules, and planning before building

Rules you write yourself are **policies**, and they live in `project.yml`. (`.vibestrate/rules.md`, which `vibe init` also wrote, is a separate thing: free-text project context every agent reads.) A policy comes in two strengths:

```bash
vibe policies add prefer-async "prefer async/await over .then() chains" --fix "rewrite as async/await"
vibe policies add no-console "no console.log in shipped code" --block --matcher "console\\.log\\("
```

The first is an `advise` policy: text Vibestrate appends to reviewer turns, so a model does the judging. At most twelve advise policies reach any one review. The second is a `block` policy: a regular expression Vibestrate runs over the lines the diff added, and one match caps merge-readiness even on a run the reviewer approved. More: [Policies](/docs/concepts/policies).

<div class="docs-callout warn">

**`Refusing to start. The policy set in .vibestrate/policies/ did not fully load` before a single step runs.** A rule file in that directory failed to parse, or two of them declare the same rule id. The directory is a separate surface from the `project.yml` policies above, and a policy set that doesn't fully load stops run creation rather than being skipped. A surface that reaches a provider without that preflight refuses on the same condition with `Refusing to run a model.` Doctor names the file and the reason:

```bash
vibe policies doctor
```

</div>

Spec-up fires without you asking for it. Hand an ordinary `vibe run` a brief that reads greenfield and Vibestrate swaps the run for a read-only intake that writes no code:

```bash
vibe run "build a task tracker with auth and a dashboard"
```

```text
Flow: Default (default)  ·  spec-up (plan-worthy brief; read-only spec-up chain)
  → Under-specified brief - spec-up first (read-only intake -> spec); "default" then builds from the approved spec.
```

That intake run's id rides in its summary's `Branch:` line, and `vibe status` lists it. You drive the rest by hand, and each command prints the run id the next one needs, so you carry a fresh id into every step:

```bash
# lists the gaps, each with its own kebab-case question id
vibe spec-up questions <intake run id>

# answer as many as you can. This alone keeps questioning, it does not build.
vibe spec-up answer <intake run id> --answer data-store="Postgres, single tenant"

# stop questioning and build the spec. This is the one that prints the spec run id.
vibe spec-up answer <intake run id> --proceed

# build takes the id that `--proceed` just printed, not the original
vibe spec-up build <spec-up run id>
```

`data-store` there is a placeholder: the model writes its own kebab-case id per question, and `vibe spec-up questions` prints the real ones. Pass those back verbatim. `vibe spec-up simplify <intake run id> data-store` restates a question you cannot parse.

`build` is the route that carries the approved spec into the build. The other route takes three commands: `vibe spec-up approve <specUpRunId>` launches a roadmap run, `vibe spec-up roadmap <runId>` turns the finished run into a proposal, and `vibe roadmap accept <proposalId>` puts the cards on your board, the task list in the dashboard sidebar. A run started from a card carries the approved spec too, attached the same way `build` attaches it. Pass `--no-select` to skip the detour for one run, or set `adaptiveSpecUp: off` in `project.yml` to opt out entirely. More: [Spec-up](/docs/concepts/spec-up).

## The merge path

`vibe merge` and `vibe diff` do not exist. `vibe integrate` is the whole merge path, and it carries a change across three branches: the run's own branch, which forks from main the moment the run starts, a staging branch you name, and main itself, behind a confirmation token you type out.

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

A run on the linear flows - `default`, `express`, `panel-review`, `security-review`, `plan-only`, `scaffold`, `quality-arbitration` - leaves its edits uncommitted in the worktree, so the commit message stays yours to write. Read the diff, then write that commit, or every step below merges a clean nothing. The other four - `pickup`, `pickup-analysis`, `pickup-review` and `saga` - walk a board card's checklist and commit each item as it lands, so a run you started with `vibe tasks pickup` or `vibe tasks sequence` reaches you committed.

```bash
cd "$(vibe path bold-lovelace --cd)"
git diff main
git add -A
git commit -m "Add structured logging to the settings save handler"
cd -    # back to your project
```

That `cd -` matters. Vibestrate reads the git root of wherever you stand to work out which project you mean, and inside a worktree that root is the worktree. Run the four steps from your project:

```bash
# 1. Read-only: what would merging this branch do?
vibe integrate advise bold-lovelace

# 2. Merge the run's branch into a staging branch. You pick that name;
#    integration/logging is only an example.
vibe integrate apply bold-lovelace --into integration/logging

# 3. finish will not move your HEAD for you, so stand on main yourself.
git checkout main

# 4. Merge the staging branch into main. The token is required, verbatim.
vibe integrate finish integration/logging --confirm merge-to-main
```

`advise` mutates nothing and prints a recommendation with the evidence under it: the branch's ahead/behind counts, the checks that ran, and whether the merge applies cleanly onto main. `apply` refuses to target main. `finish` refuses a partial integration, a dirty tree, a conflict, a branch that moved since you read it, or a HEAD parked anywhere but main, and it merges without pushing. More: [Keep a change](/docs/getting-started/merging).

## When you are stuck

The stuck-point boxes on this page and on the [quick start](/docs/getting-started/quickstart) sit next to the step that produces them. These four turn up anywhere:

| Symptom | Cause | Fix |
|---|---|---|
| Run completes, worktree is unchanged | A `type: cli` provider gets no write grant from Vibestrate, and `vibe init` writes claude as `type: cli` | On claude, `vibe config set providers.claude.type claude-code`; on the rest, `vibe config set policies.strictApplyOnly true` |
| `error: unknown command 'merge'` (or `'diff'`) | Neither command exists | `vibe integrate advise <runId>`, or `cd "$(vibe path <runId> --cd)" && git diff main` |
| A greenfield brief finishes with an empty diff | Adaptive spec-up swapped the run to a read-only intake | `vibe spec-up questions <runId>` |
| Run files are nowhere in your repo | The worktree is a sibling directory, not a subfolder | `cd "$(vibe path <runId> --cd)"` |

Ask about any of it, without a model editing a line of your code:

```bash
vibe consult "why did bold-lovelace end blocked?"
```

Beyond the sources listed above, consult reads Vibestrate's own documentation, and every answer carries a confidence level next to whatever it could not verify. The CLI form adds `--file <path>`, the opt-in that hands it one source file to read. Through the dashboard orb it answers in screens rather than commands. A review rule it proposes lands in `project.yml` as a *pending* advise policy, and `vibe policies confirm <id>` turns it on.

## Keep going

- [Quick start](/docs/getting-started/quickstart) - install, connect a model, and take one task to a merged change.
- [The big picture](/docs/getting-started/big-picture) - the same vocabulary, with the reasoning behind each piece.
- [Safety](/docs/concepts/safety) - the Action Broker, gates, and what a run can and cannot touch.
- [Troubleshooting](/docs/troubleshooting) - the long version of the table above.
