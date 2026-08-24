---
title: Mission Control
description: The local dashboard for inspecting runs, approving gates, reading diffs, and steering the orchestrator.
slug: cli/dashboard
---

## In simple words

Mission Control is Vibestrate's web UI. A local process serves it on demand from your own machine.

```bash
vibe ui            # opens http://localhost:4317
```

There is no backend of ours behind it.

<div class="docs-callout warn">

**What it reaches the network for, and nothing else:** the Flow Hub when you search, pull or publish a flow; fetching a skill from a URL; importing a flow from a URL. It never pushes, never merges without a confirmation you send with the request, and never runs a shell command you type.

</div>

<div class="docs-callout tip">

**Tip.** It is served on demand, so it is not a daemon you leave running. Close it and nothing stops - runs continue, and reopening it shows you where they got to.

</div>

## The pages you will use most

<div class="docs-cards">

**Mission control**
Start a run, see what is waiting on you, ask the supervisor.

**Runs**
Everything this project has done, and the detail of any one of them.

**Crew and Flows**
Who does the work, and the recipes they follow.

**Policies**
The rules enforced on every run.

</div>

<div class="docs-callout">

**Did you know?** The dashboard writes config through the same gated writer the CLI uses, so a project policy denying file writes stops the editor too. The UI is not a privileged path around your own rules.

</div>


## Going deeper

### Start it

Open the dashboard with:

```bash
vibe ui
```

The default port is `4317`. Pass `--port` to change it.

It opens your browser by default. `--no-open` keeps it headless.

First visit, a short guided tour points out the six surfaces the rest of the app hangs off: Runs, Flows, Board, Policies, Consult, and New run. Skip it any time, or take it again later from the help overlay (press `?`).

You can also start a run with the dashboard already attached:

```bash
vibe run "Add audit logging" --ui
```

### The pages

Mission Control's left sidebar is the app shell, and the page you open fills the rest of the window:

![Mission Control's layout - a left sidebar listing every page, beside the page you opened, here a run detail with its status hero above the live execution panel.](/media/docs/mission-control.png)

The sidebar lists:

- **Mission control** - the home overview.
- **Runs** - Active, Merge-ready, and Failed run lists, with the scheduler queue (what's queued, what's running, policy, concurrency) folded into the top of the list.
- **Flows** - the resolved list of built-in and project Flows, plus the steps each one defines.
- **Crew** - the workflow **roles** (planner, architect, executor, fixer, reviewer, verifier), plus a **Providers** tab (relocated here from the old standalone Providers page): what's installed, what's configured, and a test for each one. A role is a seat in the workflow; a provider is the CLI it runs on, and one provider can power many roles.
- **Source** - the single git surface, with **Changes** / **Tree** / **Merge** tabs (this is where the old separate Git and Merge pages live now). Changes is an inline diff viewer for the project's working tree and per-run worktrees, file by file. Tree is the commit graph with a merge planner (see [Merge from the git tree](/docs/workflows/git-tree-merge)). Merge lists every merge-ready run with its check lanes and branch drift, and gives deterministic advice (risk flags, a dry-run conflict report, a recommendation) before the explicit integrate and finish actions - still read-only, nothing merges without you.
- **Board** - the task kanban (roadmap -> tasks -> runs), plus a **Ledger** tab: the continuity ledger (`vibe ledger`) of what shipped, what's still open, and the decisions on record. Runs write to it as they reach merge-ready; you can also add an entry yourself from the tab, or with `vibe ledger add`. Hand-added entries are marked as such, so a later run never reads your note as something it did.
- **Metrics** - token, cost, and run-outcome roll-ups across the project.
- **Profiles** - the provider + model + effort presets your roles run on.
- **Codebase** - the read-only project/git file tree, search, and history.

Under **More**: **Setup** - the guided path from an empty folder to a first run. It runs the same checks `vibe doctor` prints, grouped into numbered steps (a repository, the config, a model, your test commands, everything else), repairs what `vibe doctor --fix` would repair behind a **Fix what's safe** button, and ends on the button that starts your first run. Also **Supervisors** - the read-only catalog of supervisor personas (the orchestrator's judgment posture): what each one aims the reviewers at, the flow it favors for risky work, the safety posture it suggests, and which is the project default. Mirrors `vibe supervisor list`. Then **Policies**, **Proposals**, **Project**, **Config**, **Branding canvas**, and **All projects** (the multi-project workspace switcher).

Running `vibe ui` in a folder with no `.vibestrate/` opens an onboarding screen rather than a half-broken dashboard: it scaffolds the project (and creates the git repository first, if you ask it to), then hands off to Setup when no provider was detected.

Approvals and Suggestions no longer have their own pages - they're inspector tabs on each run's detail view (see "Watching a run" below). Notifications live in the bell icon in the sidebar's utility row, not a page.

### Jumping between runs

To open the **run switcher**, a search box over your recent runs, press **Cmd/Ctrl-K** (or `g r`) anywhere.

Filter by task, runId, or status and hit Enter to jump straight to a run. You don't have to go through the "all runs" page.

Every run is also directly linkable at `#/runs/<runId>`.

### Watching a run

Open a run to supervise it live. You get these panels.

- **Status hero** - the task, a phase rail that follows the *actual* steps (the Flow's own steps for a Flow run, not a fixed workflow), and a live "Now ⟨step⟩ · ⟨agent⟩" line.
- **Live execution** - the raw provider CLI output in a real terminal. Agents run **headless** (`claude -p`, etc.), and CLIs in print mode hold their answer until they exit, so this fills in when each step completes rather than token-by-token. Live streaming is on the roadmap via structured output.
- **Changed files** - what the run touched, beside live execution. Click one to open it in the worktree view. New, untracked files count their real lines.
- **Live metrics** - run-level tokens, cost, tool calls, and provider calls that accumulate as steps finish.
- **Steps inspector** - one card per agent step: provider and model, pass or fail, duration, tokens, cost, files touched, and review and verification outcome.
- **Inspect tabs** - Events, Artifacts (with the diff viewer), Validation.
- **Outcome banner** - when a run ends `blocked`, `failed`, or `aborted`, a banner explains *what* stopped it (the spend cap, a rejected approval, a review `BLOCKED` verdict, verification, or the raw error) and offers the right next action: re-run with changes, see the review, or view events.

### What the dashboard does *not* do

A few things stay out of the dashboard on purpose.

- It does not execute arbitrary shell commands you type. The optional terminal panel is off unless you turn it on for the project, and its working directory comes from the run's own recorded worktree, never from the request - a run with no worktree, or one pointing at your project root, is refused.
- It never pushes. There is no push path in the dashboard at all.
- It never merges on its own. The Source page can apply a merge, but only for the exact merge you asked for: the request must carry a literal `merge-to-main` confirmation and is refused without it. Undo is the same shape, with its own `undo-merge` confirmation.
- It does not access your `.env` or any secret-shape file. The path guard refuses those paths no matter where the request comes from.

### Stopping it

Press `Ctrl-C` in the terminal where `vibe ui` is running.

The Fastify process exits cleanly. The runs continue, or pause at the next stage boundary, depending on what they're doing.
