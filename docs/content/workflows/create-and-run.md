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

```bash
vibe run "Add audit logging to the settings..."
```

Three flags cover most of what you will want to change - the dashboard, a heavier [Flow](/docs/concepts/flow), or a different model:

```bash
# dashboard alongside the terminal
vibe run "..." --ui

# a heavier flow than the default
vibe run "..." --flow quality-arbitration

# a different model for this run
vibe run "..." --profile <id>
```

`vibe profile list` shows the profile ids your project has.

*In the dashboard:* the **New run** button at the bottom of the sidebar opens the composer, in five sections. **Task** is the brief, **Flow** defaults to **Auto**, **Inputs** collects any params the selected flow declares, **Crew** picks the roster, and **Configuration** holds **Permission**, **Unattended**, a **Tuning** pair of **Concise** and **Auto-pick flow**, and the **Supervisor** persona. **Start run** launches it, as a detached process that outlives the browser tab; `vibe run` does the work in the terminal you started, so that terminal has to stay alive.

## 3. Watch, or walk away

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
<div class="docs-outcome stop"><b>aborted</b><span>You stopped the run yourself with vibe abort.</span></div>
</div>

*In the dashboard:* the run detail page follows the same eight steps on its **Live timeline**, beside **Live metrics** and **Changed files**. See [Inspect a run in flight](/docs/workflows/inspect-progress).

## 4. Inspect the result

```bash
vibe status            # every run, oldest first
vibe replay <runId>    # read-only, one run
```

*In the dashboard:* the **Runs** page is the same list, and the **Source** page's **Changes** tab reads the diff inline, file by file.

## 5. Merge it yourself

Vibestrate does not push or merge (see [the safety guarantees](/docs/concepts/safety)). The run leaves the diff on its branch in the worktree, and the final call is yours.

Before you decide, ask the merge advisor:

```bash
vibe integrate advise <runId>
```

It is read-only and deterministic: same run, same advice, no model in the loop. Per run it prints a headline, the risk flags (does the change touch protected files? did any check actually run?), the branch's position against `main`, which checks passed, and a recommendation - `finish-now`, `stage-on-integration-branch` or `resolve-first` - with the reason. Nothing is merged, no branch is touched. `--json` emits the full advice for scripts.

When it suggests staging is configurable, suggestion-only and never blocking. Three thresholds decide it; these are the defaults in `project.yml`:

```yaml
merge:
  advisor:
    suggestIntegrationBranchWhen:
      filesTouched: 25
      protectedPaths: true
      behindMain: 50
```

Change one with `vibe config set` and its full dotted key; `vibe config keys` prints every key in full.

`vibe integrate analyze <runId>` has a local provider read the run's diff against main and report semantic risk a textual merge check cannot see: concurrency, error handling, missing tests. It is advisory prose, never a merge verdict, and it never changes the deterministic recommendation. Before the provider sees it the diff is byte-capped and redacted, and the result is cached under the run.

*In the dashboard:* the **Source** page's **Merge** tab is the same window, with **Analyze the diff** for the optional deeper pass, then **Integrate this run** and **Complete merge to main**.

The branch is yours to take in one of three directions:

<svg viewBox="0 0 560 146" width="100%" style="max-width:560px;height:auto" role="img" aria-label="When a run finishes, its branch is yours to take in one of three directions: open a pull request to share or review it, merge it locally with git merge, or abandon it with vibe abort.">
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="1" y="52" width="160" height="42" rx="8"/>
    <rect x="290" y="2" width="269" height="42" rx="8"/>
    <rect x="290" y="52" width="269" height="42" rx="8"/>
    <rect x="290" y="102" width="269" height="42" rx="8"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.5" stroke-width="1">
    <path d="M161 73 h125"/>
    <path d="M230 23 v100"/>
    <path d="M230 23 h56"/>
    <path d="M230 123 h56"/>
    <path d="M281 19 l5 4 l-5 4"/>
    <path d="M281 69 l5 4 l-5 4"/>
    <path d="M281 119 l5 4 l-5 4"/>
  </g>
  <g fill="currentColor" font-size="12" font-family="ui-monospace,monospace" text-anchor="middle">
    <text x="81" y="70">vibestrate/&lt;runId&gt;</text>
    <text x="424" y="20">gh pr create</text>
    <text x="424" y="70">git merge --ff-only</text>
    <text x="424" y="120">vibe abort</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="11" text-anchor="middle">
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
