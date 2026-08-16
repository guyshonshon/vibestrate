---
title: Create and run a task
description: Go from a thing you need done to a finished change you can merge.
slug: workflows/create-and-run
---

This guide takes you from "I have a thing to do" all the way to a change you can merge, step by step.

One command starts the run. Vibestrate plans, writes, validates, reviews and verifies the change on its own, in a copy of your project, then stops and hands you the diff. It never pushes and never merges - the last call is yours.

A run finishes in one of four terminal states: `merge_ready`, `blocked`, `failed` or `aborted`.

## 1. Frame the task

Write the task description the way you'd brief a careful colleague. Name the file, name the convention, name the constraint. The more exact you are, the better the result.

> **Good.** Add audit logging to the settings save handler at `src/server/routes/settings.ts`. Use the existing `auditLogger` from `src/lib/audit.ts`. Log the user id and the *keys* changed - never the values.

> **Weak.** Improve settings logging.

## 2. Start the run

Kick off the task with one command:

```bash
vibe run "Add audit logging to the settings save handler..."
```

Three flags cover most of what you'll want to change about a run - the dashboard, a heavier [Flow](/docs/concepts/flow), or a different model:

```bash
vibe run "..." --ui                        # dashboard alongside the terminal
vibe run "..." --flow quality-arbitration  # a heavier flow than the default
vibe run "..." --profile <id>              # a different model for this run
```

Profile ids are yours, not ours. Run `vibe profile list` to see the ones your project actually has.

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

You can watch each step in the terminal or the dashboard. `vibe run` does the work in the process you started, so that terminal has to stay alive for the run to keep going. A run launched from the dashboard is a detached process instead, and outlives the browser tab.

When the run finishes, it lands in one of four states:

<div class="docs-outcomes">
<div class="docs-outcome ok"><b>merge_ready</b><span>The diff is ready to ship.</span></div>
<div class="docs-outcome warn"><b>blocked</b><span>The reviewer or verifier flagged something a human should decide.</span></div>
<div class="docs-outcome stop"><b>failed</b><span>An unrecoverable error during a stage.</span></div>
<div class="docs-outcome stop"><b>aborted</b><span>You stopped the run yourself with vibe abort.</span></div>
</div>

## 4. Inspect the result

See every run in the project, then dig into one:

```bash
vibe status                  # every run here, oldest first
vibe replay <runId>          # read-only inspector for one run
```

Or open the dashboard's **Source** page, on its **Changes** tab, to read the diff inline.

## 5. Merge it yourself

Vibestrate does not push or merge (see [the safety guarantees](/docs/concepts/safety)). The run leaves the diff on its branch in the worktree, and the final call is yours.

Before you decide, you can ask the merge advisor:

```bash
vibe integrate advise <runId>
```

It is read-only and deterministic: same run, same advice, and no model in the loop. For each run it prints a one-line headline, then the risk flags (does the change touch protected files? did any check actually run?), the branch's position against `main`, which checks passed, and finally its recommendation - `finish-now`, `stage-on-integration-branch` or `resolve-first` - with the reason. Nothing is merged, no branch is touched. Add `--json` to emit the full advice for scripts. The same window lives on the dashboard's Source page, on its **Merge** tab.

When the advisor suggests staging is configurable. It is suggestion-only and never blocks:

```bash
vibe config set merge.advisor.suggestIntegrationBranchWhen.filesTouched 40
# defaults: filesTouched 25, protectedPaths true, behindMain 50
```

For a deeper look, run `vibe integrate analyze <runId>` (or click the **Analyze deeper** button on the Source page's Merge tab). This optional read-only pass has a local provider read the run's diff against main and report semantic risk that a textual merge check can't see: concurrency, error handling, missing tests. It is advisory prose, never a merge verdict, and it never changes the deterministic recommendation. Before the provider sees it, the diff is byte-capped and redacted (secret-like files suppressed, secret-shaped tokens removed), and the result is cached under the run.

Then you decide. The branch is yours to take in one of three directions: share or review it, merge it locally, or abandon it.

To get a human review or just share the branch:

```bash
cd ../.vibestrate-worktrees/<runId>
gh pr create                  # if you want review by a human
git push                       # if you just want to share the branch
```

To merge it locally instead:

```bash
git checkout main
git merge --ff-only vibestrate/<runId>
```

Or to abandon it:

```bash
vibe abort <runId>
# worktree is preserved for inspection; remove when you're done
```

## Related

- [Inspect a run in flight](/docs/workflows/inspect-progress).
- [Pause, resume, abort](/docs/workflows/pause-resume).
- [Debug a failed run](/docs/workflows/debug-failed).
