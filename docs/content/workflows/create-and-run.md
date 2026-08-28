---
title: Create and run a task
description: Go from a thing you need done to a finished change you can merge.
slug: workflows/create-and-run
---

## In simple words

This guide takes you from "I have a thing to do" to a change you can merge. [Mission Control](/docs/cli/dashboard) is the primary surface; the commands below are the automation path, and each section names the screen that does the same thing.

```bash
vibe run "Add retry with backoff to the uploader" --ui
```

<div class="docs-callout tip">

**Tip.** `--ui` opens Mission Control alongside the run. Watching your first few is worth the screen space; once the shape is familiar you will mostly start them and come back.

</div>

## The three decisions

<div class="docs-cards">

**How to frame it**
Say what you want and the constraint that matters. Not which files to edit.

**Whether to pick a flow**
Auto is a good default. Name one when you disagree with what it chose.

**Whether to watch**
A run is fine unattended. Nothing merges without you either way.

</div>

<div class="docs-callout">

**Did you know?** The run tells you afterwards which flow it chose and why, including the words in your task that triggered any upgrade. A task that got a heavier flow than you expected has that reasoning recorded, not left for you to guess at.

</div>

## 1. Frame the task

Write the task description the way you would brief a careful colleague. Name the file, the convention, the constraint.

> **Good.** Add audit logging to the settings save handler at `src/server/routes/settings.ts`. Use the existing `auditLogger` from `src/lib/audit.ts`. Log the user id and the *keys* changed - never the values.

> **Weak.** Improve settings logging.

## 2. Start the run

**New run**, at the bottom of the sidebar, opens the composer. Five sections, and the defaults are the answer to four of them:

- **Task** - the brief you just wrote.
- **Flow** - **Auto** unless you disagree with what it picks.
- **Inputs** - any params the chosen flow declares.
- **Crew** - which roster takes it.
- **Configuration** - **Permission**, **Unattended**, a **Tuning** pair of **Concise** and **Auto-pick flow**, and the **Supervisor** persona.

**Start run** launches it as a detached process, so it outlives the browser tab and you can close the window.

*From a terminal:*

```bash
vibe run "Add audit logging to the settings..."
```

Three flags cover most of what you would otherwise change in **Configuration** - open the dashboard alongside, take a heavier [Flow](/docs/concepts/flow), or use a different model:

```bash
# dashboard alongside the terminal
vibe run "..." --ui

# a heavier flow than the default
vibe run "..." --flow quality-arbitration

# a different model for this run
vibe run "..." --profile <id>
```

`vibe profile list` shows the profile ids your project has. Unlike **Start run**, `vibe run` does the work in the terminal you started it from, so that terminal has to stay alive.

## 3. Watch, or walk away

Open the run from the sidebar and the **Live timeline** tracks the steps as they happen, beside **Live metrics** and **Changed files**. Watching is optional - the run does not need you - but it is the fastest way to learn the shape. See [Inspect a run in flight](/docs/workflows/inspect-progress).

The default flow is eight steps, and Vibestrate works through them on its own:

<div class="docs-flow">
<div><b>plan</b><span>Turns the task into a plan.</span></div>
<div><b>architecture</b><span>Designs the approach from the plan.</span></div>
<div><b>implement</b><span>Writes the change in the safe copy.</span></div>
<div><b>validation</b><span>Runs your own commands against the result.</span></div>
<div><b>review</b><span>A fresh seat reads the diff cold.</span></div>
<div><b>fix</b><span>Addresses what the review asked for.</span></div>
<div><b>revalidation</b><span>Runs your commands again over the fix.</span></div>
<div><b>verify</b><span>A last seat decides whether it is merge-ready.</span></div>
</div>

Review, fix and re-validate repeat until the review passes or the bound is hit - one review plus up to two fix rounds, by default. Those names are the step ids too, so the review's own write-up is at `artifacts/flows/review/output.md` in the run's folder.

When the run finishes, it lands in one of four states:

<div class="docs-outcomes">
<div class="docs-outcome ok"><b>merge_ready</b><span>The diff is ready to ship.</span></div>
<div class="docs-outcome warn"><b>blocked</b><span>The reviewer or verifier flagged something a human should decide.</span></div>
<div class="docs-outcome stop"><b>failed</b><span>An unrecoverable error during a stage.</span></div>
<div class="docs-outcome stop"><b>aborted</b><span>You stopped the run yourself.</span></div>
</div>

## 4. Inspect the result

The **Runs** page lists every run. Open one and the status card says where it got to; the **Inspect** section below it has seven tabs - **Tree**, **Steps**, **Events**, **Artifacts**, **Validation**, **Terminal** and **Replay** - and the diff and the files it touched are under **Artifacts**.

To read the change on its own, the **Source** page's **Changes** tab shows the diff inline, file by file.

*From a terminal:*

```bash
vibe status            # every run, oldest first
vibe replay <runId>    # read-only, one run
```

## 5. Merge it yourself

Vibestrate does not push or merge (see [the safety guarantees](/docs/concepts/safety)). The run leaves the diff on its branch in the worktree, and the final call is yours.

The **Source** page's **Merge** tab is where you make it. Pick the run and it fetches the merge advice: a headline, a recommendation chip - **finish-now**, **stage-on-integration-branch** or **resolve-first** - any warning flags, and tiles for how far **ahead** and **behind** `main` the branch is and how many files it touches.

Three buttons act on it:

- **Analyze the diff** - the optional deeper pass, described below. Reads only.
- **Integrate this run** - brings the branch onto an integration branch.
- **Complete merge to main** - the last step, and it asks first.

The advice is read-only and deterministic: same run, same answer, no model in the loop. Nothing is merged and no branch is touched until you press one of the last two.

*From a terminal,* the same advice:

```bash
vibe integrate advise <runId>
```

It prints the headline, the risk flags (does the change touch protected files? did any check actually run?), the branch's position against `main`, which checks passed, and the recommendation with its reason. `--json` emits the full advice for scripts.

When it suggests staging is configurable, suggestion-only and never blocking. Three thresholds decide it; these are the defaults in `project.yml`, editable on **More > Config** or with `vibe config set`:

```yaml
merge:
  advisor:
    suggestIntegrationBranchWhen:
      filesTouched: 25
      protectedPaths: true
      behindMain: 50
```

**Analyze the diff**, or `vibe integrate analyze <runId>`, has a local provider read the run's diff against main and report semantic risk a textual merge check cannot see: concurrency, error handling, missing tests. It is advisory prose, never a merge verdict, and it never changes the deterministic recommendation. Before the provider sees it the diff is byte-capped and redacted, and the result is cached under the run.

The branch is yours to take in one of three directions:

<svg font-family="var(--font-sans)" viewBox="0 0 560 146" width="100%" style="max-width:720px;height:auto" role="img" aria-label="When a run finishes, its branch is yours to take in one of three directions: open a pull request to share or review it, merge it locally with git merge, or abandon it with vibe abort.">
  <g fill="none" stroke="var(--line-strong)" stroke-width="1.25">
    <rect fill="var(--bg-200)" x="1" y="52" width="160" height="42" rx="8"/>
    <rect fill="var(--bg-200)" x="290" y="2" width="269" height="42" rx="8"/>
    <rect fill="var(--bg-200)" x="290" y="52" width="269" height="42" rx="8"/>
    <rect fill="var(--bg-200)" x="290" y="102" width="269" height="42" rx="8"/>
  </g>
  <g fill="none" stroke="var(--fg-200)" stroke-width="2">
    <path d="M161 73 h125"/>
    <path d="M230 23 v100"/>
    <path d="M230 23 h56"/>
    <path d="M230 123 h56"/>
    <path d="M281 19 l5 4 l-5 4"/>
    <path d="M281 69 l5 4 l-5 4"/>
    <path d="M281 119 l5 4 l-5 4"/>
  </g>
  <g fill="var(--fg-100)" font-size="12" font-family="var(--font-mono)" text-anchor="middle">
    <text x="81" y="70">vibestrate/&lt;runId&gt;</text>
    <text x="424" y="20">gh pr create</text>
    <text x="424" y="70">git merge --ff-only</text>
    <text x="424" y="120">vibe abort</text>
  </g>
  <g fill="var(--violet-soft)" font-size="11" text-anchor="middle">
    <text x="81" y="87">the run's branch</text>
    <text x="424" y="37">share it, or get it reviewed</text>
    <text x="424" y="87">merge it locally</text>
    <text x="424" y="137">abandon it</text>
  </g>
</svg>

```bash
cd ../.vibestrate-worktrees/<runId>
gh pr create      # review by a human
git push          # just share the branch

# or merge it locally
git checkout main
git merge --ff-only vibestrate/<runId>

# or abandon it; the worktree is preserved for
# inspection, remove it when you're done
vibe abort <runId>
```

## Related

- [Inspect a run in flight](/docs/workflows/inspect-progress).
- [Pause, resume, abort](/docs/workflows/pause-resume).
- [Debug a failed run](/docs/workflows/debug-failed).
