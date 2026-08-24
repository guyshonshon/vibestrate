---
title: Your first run
description: How one run works, from the sentence you type into New run to the branch it leaves behind.
slug: getting-started/first-run
---

## In simple words

**New run**, at the bottom of the sidebar, starts a run. One field takes the task, everything else has a default, and **Start run** begins.

Vibestrate works in a second checkout of your repository, beside your project, so the files you have open never move under you. The run stops with the change on its own branch; nothing merges and nothing pushes, so the last call is yours.

<div class="docs-callout tip">

**Tip.** Pick something small for the first one. You are learning what a run looks like, not testing how much it can do, and a small task reaches a verdict in minutes.

</div>

![The header of a finished run reading merge ready, with the task, the flow it followed, its eight steps, the elapsed time and the diff.](/media/docs/scoped/run-header.png)

## Where a run can end

<div class="docs-cards">

**merge_ready**
Every check passed. The change is waiting for you.

**blocked**
Something refused: a review, a policy, a failed check.

**failed**
A step crashed. Its own output says why.

**aborted**
You stopped it.

</div>

<div class="docs-callout">

**Did you know?** A run you dislike costs nothing to discard. It never touched your branch, so there is no revert - you ignore the folder. That is what makes it safe to try something you are unsure of.

</div>

## Pick a small, well-scoped task

Vibestrate works best on what you'd hand a careful colleague: clear scope, code you can point at, a way to tell when it's done.

<div class="docs-cards">

**Too big** - "Refactor the whole login system." No boundary, no finish line, nothing for the reviewer to judge against.

**About right** - "Add structured logging to the settings save handler." One handler, one behaviour, and your own tests say whether it worked.

</div>

## The steps a run takes

<div class="docs-flow">
<div><b>Look</b><span>Reads your project to learn its language, its tools, and how you run your tests.</span></div>
<div><b>Copy</b><span>Makes a second checkout of your repo beside your project, under ../.vibestrate-worktrees/, in a folder named for the run.</span></div>
<div><b>Build</b><span>Plans the change, designs the approach, writes it, then runs your validation commands.</span></div>
<div><b>Check</b><span>A reviewer checks the diff against the plan and the validation results; if it asks for changes, a fixer makes them and validation runs again.</span></div>
<div><b>Verify</b><span>A separate verifier takes a last pass and decides whether it is ready to merge.</span></div>
</div>

The default flow wires that into eight steps, with the review loop capped at three passes: one review plus up to two fix cycles.

<svg viewBox="0 0 560 100" width="100%" style="max-width:560px;height:auto" role="img" aria-label="The default flow runs plan, architecture, implement, validation, review and verify in order; when review asks for changes it loops through fix and revalidation and back to review.">
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="3" y="6" width="64" height="30" rx="8"/>
    <rect x="86" y="6" width="96" height="30" rx="8"/>
    <rect x="201" y="6" width="80" height="30" rx="8"/>
    <rect x="300" y="6" width="84" height="30" rx="8"/>
    <rect x="403" y="6" width="68" height="30" rx="8"/>
    <rect x="490" y="6" width="68" height="30" rx="8"/>
    <rect x="201" y="62" width="80" height="30" rx="8"/>
    <rect x="300" y="62" width="96" height="30" rx="8"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.5" stroke-width="1">
    <path d="M71 17l4 4-4 4"/>
    <path d="M186 17l4 4-4 4"/>
    <path d="M285 17l4 4-4 4"/>
    <path d="M388 17l4 4-4 4"/>
    <path d="M475 17l4 4-4 4"/>
    <path d="M415 36v12h-174v8"/>
    <path d="M281 77h14"/>
    <path d="M396 77h59v-35"/>
  </g>
  <g fill="currentColor" fill-opacity="0.5">
    <path d="M237 56l4 6 4-6z"/>
    <path d="M295 73l5 4-5 4z"/>
    <path d="M451 42l4-6 4 6z"/>
  </g>
  <g fill="currentColor" font-size="12" font-family="ui-monospace,monospace" text-anchor="middle">
    <text x="35" y="25">plan</text>
    <text x="134" y="25">architecture</text>
    <text x="241" y="25">implement</text>
    <text x="342" y="25">validation</text>
    <text x="437" y="25">review</text>
    <text x="524" y="25">verify</text>
    <text x="241" y="81">fix</text>
    <text x="348" y="81">revalidation</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="11" text-anchor="end">
    <text x="189" y="81">if review asks for changes</text>
  </g>
</svg>

Those step names are the folder names under the run's artifacts, so the `review` box above is the same `review` in `artifacts/flows/review/output.md`.

## Going deeper

### Start it

**Task** is the only section on the compose page you must fill. With a roadmap, **Or pick up from your roadmap** offers cards to start from instead.

Below it, four sections to leave alone the first time: **Flow**, **Inputs** (values the flow declares), **Crew**, and **Configuration**, where **Unattended** stops the run pausing for a human, **Concise** asks agents to keep output short, and **Auto-pick flow** lets the orchestrator choose when nothing is pinned.

**Start run** goes now. **Plan first** runs spec-up instead: a few scoping questions, then the build. A pill above them shows the exact `vibe run …` the page will run, and copies it.

### Watch it

The sidebar lists every live run above the nav, green while it works and amber when it wants you. Click one for its page.

**Run assurance** sits at the top: **Policy**, **Validation**, **Review** and **Verification**, each reported separately. Under it the inspector carries **Tree** (supervisor and agents as a node tree), **Steps**, **Events**, **Artifacts** (the changed files and each step's output), **Validation**, **Terminal** and **Replay**. The **Workspace** panel names the branch and the worktree path, with **Copy cd**.

### From the terminal

`vibe` opens the interactive shell; press `5` for Runs. Arrow keys select a run, `tab` cycles the inspector sections, `/` filters the events tail, and `p`, `r` and `a` pause, resume and abort.

The direct route, for a script:

```bash
vibe run "Add structured logging to the \
settings save handler"
```

Add `--ui` and the dashboard starts alongside the run. Each step prints a line as it starts; the summary lands at the end:

```text
Final status: merge_ready
  Review decision: APPROVED
  Verification: PASSED
  Artifacts: .vibestrate/runs/zen-bohr/artifacts
  Worktree: /home/you/.vibestrate-worktrees/zen-bohr
  Branch: vibestrate/zen-bohr
```

`zen-bohr` is the run id: every run gets a docker-style `adjective-noun` handle, used verbatim as the worktree folder name and the branch suffix. `vibe status <runId>` and `vibe replay <runId>` read it back later.

### Use it, or don't

**Vibestrate never merges anything for you** (see [the safety guarantees](/docs/concepts/safety)). The finished change waits on its own branch, yours to open a pull request from, pull into your branch, take pieces of, or throw away.

**Source > Changes** lays out every line it touched, file by file. Or read it where it sits:

```bash
cd ../.vibestrate-worktrees/zen-bohr
git diff main
```

### Runs that stop short

A run keeps its full record on disk whichever state it ended in, and the run page's **Events** and **Artifacts** tabs read it in the browser.

- **`blocked`** - a reviewer or verifier flagged something you need to decide. `artifacts/flows/review/output.md` holds the objection (or `verify/output.md`), and `events.ndjson` carries the matching `review.decision` or `verification.decision` event.
- **`failed`** - something broke partway. Look at the last event in `events.ndjson` before the failure, and at that step's folder under `artifacts/flows/`.
- **`aborted`** - you stopped it. The worktree stays in place, so half-finished work is still there to read.

[Debug a failed run](/docs/workflows/debug-failed) is the step-by-step playbook.

### Next

[Keep the change →](/docs/getting-started/merging) - the run left a branch in a copy of your repo. This is how you take it.
