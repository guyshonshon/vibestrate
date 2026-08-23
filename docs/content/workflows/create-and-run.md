---
title: Create and run a task
description: Go from a thing you need done to a finished change you can merge.
slug: workflows/create-and-run
---

## In simple words

This guide takes you from "I have a thing to do" to a change you can merge.

```bash
vibe run "Add retry with backoff to the uploader" --ui
```

That is the short version. The rest of this page is what each part of it means and what to do when the answer is not obvious.

<div class="docs-callout tip">

**Tip.** `--ui` opens Mission Control alongside the run. Watching your first few runs is worth the screen space; once the shape is familiar you will mostly start them and come back.

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

**Did you know?** The run tells you afterwards which flow it chose and why, including the words in your task that triggered any upgrade. If a task got a heavier flow than you expected, that reasoning is recorded rather than left for you to guess at.

</div>


## Going deeper

### 1. Frame the task

Write the task description the way you'd brief a careful colleague. Name the file, name the convention, name the constraint. The more exact you are, the better the result.

> **Good.** Add audit logging to the settings save handler at `src/server/routes/settings.ts`. Use the existing `auditLogger` from `src/lib/audit.ts`. Log the user id and the *keys* changed - never the values.

> **Weak.** Improve settings logging.

### 2. Start the run

Kick off the task with one command:

```bash
vibe run "Add audit logging to the settings..."
```

Three flags cover most of what you'll want to change about a run - the dashboard, a heavier [Flow](/docs/concepts/flow), or a different model:

```bash
# dashboard alongside the terminal
vibe run "..." --ui

# a heavier flow than the default
vibe run "..." --flow quality-arbitration

# a different model for this run
vibe run "..." --profile <id>
```

Profile ids are yours, not ours. Run `vibe profile list` to see the ones your project actually has.

### 3. Watch, or walk away

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

You can watch each step in the terminal or the dashboard. `vibe run` does the work in the process you started, so that terminal has to stay alive for the run to keep going. A run launched from the dashboard is a detached process instead, and outlives the browser tab.

When the run finishes, it lands in one of four states:

<div class="docs-outcomes">
<div class="docs-outcome ok"><b>merge_ready</b><span>The diff is ready to ship.</span></div>
<div class="docs-outcome warn"><b>blocked</b><span>The reviewer or verifier flagged something a human should decide.</span></div>
<div class="docs-outcome stop"><b>failed</b><span>An unrecoverable error during a stage.</span></div>
<div class="docs-outcome stop"><b>aborted</b><span>You stopped the run yourself with vibe abort.</span></div>
</div>

### 4. Inspect the result

See every run in the project, then dig into one:

```bash
vibe status            # every run, oldest first
vibe replay <runId>    # read-only, one run
```

Or open the dashboard's **Source** page, on its **Changes** tab, to read the diff inline.

### 5. Merge it yourself

Vibestrate does not push or merge (see [the safety guarantees](/docs/concepts/safety)). The run leaves the diff on its branch in the worktree, and the final call is yours.

Before you decide, you can ask the merge advisor:

```bash
vibe integrate advise <runId>
```

It is read-only and deterministic: same run, same advice, and no model in the loop. For each run it prints a one-line headline, then the risk flags (does the change touch protected files? did any check actually run?), the branch's position against `main`, which checks passed, and finally its recommendation - `finish-now`, `stage-on-integration-branch` or `resolve-first` - with the reason. Nothing is merged, no branch is touched. Add `--json` to emit the full advice for scripts. The same window lives on the dashboard's Source page, on its **Merge** tab.

When the advisor suggests staging is configurable. It is suggestion-only and never blocks. Three thresholds decide it, and these are their defaults in `project.yml`:

```yaml
merge:
  advisor:
    suggestIntegrationBranchWhen:
      filesTouched: 25
      protectedPaths: true
      behindMain: 50
```

Change one with `vibe config set` and its full dotted key. `vibe config keys` prints every key in full.

For a deeper look, run `vibe integrate analyze <runId>` (or click the **Analyze deeper** button on the Source page's Merge tab). This optional read-only pass has a local provider read the run's diff against main and report semantic risk that a textual merge check can't see: concurrency, error handling, missing tests. It is advisory prose, never a merge verdict, and it never changes the deterministic recommendation. Before the provider sees it, the diff is byte-capped and redacted (secret-like files suppressed, secret-shaped tokens removed), and the result is cached under the run.

Then you decide. The branch is yours to take in one of three directions:

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

To get a human review or just share the branch:

```bash
cd ../.vibestrate-worktrees/<runId>
gh pr create      # review by a human
git push          # just share the branch
```

To merge it locally instead:

```bash
git checkout main
git merge --ff-only vibestrate/<runId>
```

Or to abandon it:

```bash
vibe abort <runId>
# the worktree is preserved for inspection;
# remove it when you're done
```

### Related

- [Inspect a run in flight](/docs/workflows/inspect-progress).
- [Pause, resume, abort](/docs/workflows/pause-resume).
- [Debug a failed run](/docs/workflows/debug-failed).
