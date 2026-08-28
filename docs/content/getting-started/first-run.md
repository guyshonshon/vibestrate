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

<svg viewBox="0 0 500 246" width="100%" style="max-width:720px;height:auto" role="img" font-family="var(--font-sans)" aria-label="The default flow runs plan, architecture, implement and validate in order, then review. Review approved goes straight to verify; changes requested goes to fix, then re-validate, and back to review at most three times.">
  <rect x="0" y="8" width="116" height="44" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="58" y="35" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">Plan</text>
  <rect x="128" y="8" width="116" height="44" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="186" y="35" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">Architecture</text>
  <rect x="256" y="8" width="116" height="44" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="314" y="35" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">Implement</text>
  <rect x="384" y="8" width="116" height="44" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="442" y="35" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">Validate</text>
  <path d="M116 30 L128 30" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="120,25.5 128,30 120,34.5" fill="var(--fg-200)"/>
  <path d="M244 30 L256 30" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="248,25.5 256,30 248,34.5" fill="var(--fg-200)"/>
  <path d="M372 30 L384 30" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="376,25.5 384,30 376,34.5" fill="var(--fg-200)"/>
  <path d="M442 52 L442 68 L58 68 L58 80" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="53.5,72 58,80 62.5,72" fill="var(--fg-200)"/>
  <rect x="0" y="84" width="116" height="44" rx="10" fill="var(--bg-200)" stroke="var(--violet-soft)" stroke-width="1.75"/>
  <text x="58" y="111" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">Review</text>
  <path d="M116 106 L380 106" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="372,101.5 380,106 372,110.5" fill="var(--fg-200)"/>
  <text x="248" y="98" font-size="10.5" fill="var(--fg-300)" font-family="var(--font-mono)" text-anchor="middle">approved</text>
  <rect x="384" y="84" width="116" height="44" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="442" y="111" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">Verify</text>
  <path d="M58 128 L58 152 L124 152" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="116,147.5 124,152 116,156.5" fill="var(--fg-200)"/>
  <text x="134" y="146" font-size="10.5" fill="var(--fg-300)" font-family="var(--font-mono)" text-anchor="start">changes requested</text>
  <rect x="128" y="158" width="116" height="44" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="186" y="185" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">Fix</text>
  <path d="M244 180 L252 180" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="244,175.5 252,180 244,184.5" fill="var(--fg-200)"/>
  <rect x="256" y="158" width="116" height="44" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="314" y="185" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">Re-validate</text>
  <path d="M372 180 L466 180 L466 216 L34 216 L34 132" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="29.5,140 34,132 38.5,140" fill="var(--fg-200)"/>
  <text x="250" y="232" font-size="10.5" fill="var(--fg-300)" font-family="var(--font-mono)" text-anchor="middle">at most 3 passes</text>
</svg>

Those step names are the folder names under the run's artifacts, so the `review` box above is the same `review` in `artifacts/flows/review/output.md`.

## Start it

**Task** is the only section on the compose page you must fill. With a roadmap, **Or pick up from your roadmap** offers cards to start from instead.

Below it, four sections to leave alone the first time: **Flow**, **Inputs** (values the flow declares), **Crew**, and **Configuration**, where **Unattended** stops the run pausing for a human, **Concise** asks agents to keep output short, and **Auto-pick flow** lets the orchestrator choose when nothing is pinned.

**Start run** goes now. **Plan first** runs spec-up instead: a few scoping questions, then the build. A pill above them shows the exact `vibe run …` the page will run, and copies it.

## Watch it

The sidebar lists every live run above the nav, green while it works and amber when it wants you. Click one for its page.

**Run assurance** sits at the top: **Policy**, **Validation**, **Review** and **Verification**, each reported separately. Under it the inspector carries **Tree** (supervisor and agents as a node tree), **Steps**, **Events**, **Artifacts** (the changed files and each step's output), **Validation**, **Terminal** and **Replay**. The **Workspace** panel names the branch and the worktree path, with **Copy cd**.

## From the terminal

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

## Use it, or don't

**Vibestrate never merges anything for you** (see [the safety guarantees](/docs/concepts/safety)). The finished change waits on its own branch, yours to open a pull request from, pull into your branch, take pieces of, or throw away.

**Source > Changes** lays out every line it touched, file by file. Or read it where it sits:

```bash
cd ../.vibestrate-worktrees/zen-bohr
git diff main
```

## Runs that stop short

A run keeps its full record on disk whichever state it ended in, and the run page's **Events** and **Artifacts** tabs read it in the browser.

- **`blocked`** - a reviewer or verifier flagged something you need to decide. `artifacts/flows/review/output.md` holds the objection (or `verify/output.md`), and `events.ndjson` carries the matching `review.decision` or `verification.decision` event.
- **`failed`** - something broke partway. Look at the last event in `events.ndjson` before the failure, and at that step's folder under `artifacts/flows/`.
- **`aborted`** - you stopped it. The worktree stays in place, so half-finished work is still there to read.

[Debug a failed run](/docs/workflows/debug-failed) is the step-by-step playbook.

## Next

[Keep the change →](/docs/getting-started/merging) - the run left a branch in a copy of your repo. This is how you take it.
