---
title: Create and run a task
description: Go from a thing you need done to a finished change you can merge.
section: workflows
slug: workflows/create-and-run
---

This guide takes you from "I have a thing to do" all the way to a change you can merge, step by step.

## 1. Frame the task

Write the task description the way you'd brief a careful colleague. Name the file, name the convention, name the constraint. The more exact you are, the better the result.

<div class="docs-callout">

**Be exact.** Name the file, the helper, and the rule the change must honor.

</div>

A good brief:

> Add audit logging to the settings save handler at `src/server/routes/settings.ts`. Use the existing `auditLogger` from `src/lib/audit.ts`. Log the user id and the *keys* changed - never the values.

A weak one:

> Improve settings logging.

## 2. Start the run

Kick off the task with one command:

```bash
vibe run "Add audit logging to the settings save handler..."
```

Want the dashboard open alongside the terminal? Add `--ui`:

```bash
vibe run "..." --ui
```

A Flow is the routine of steps Vibestrate works through. If the work warrants the extra rigor, pick a heavier one:

```bash
vibe run "..." --flow quality-arbitration
```

Override the AI provider for just this run:

```bash
vibe run "..." --provider claude
```

## 3. Watch, or walk away

Vibestrate runs through plan → architect → execute → validate → review → fix → verify on its own. You can watch each phase in the terminal or the dashboard, or close the terminal and check back later. The run keeps going as long as Vibestrate's process is alive.

<div class="docs-flow">
<div><b>plan</b><span>Break the task into a real plan.</span></div>
<div><b>architect</b><span>Shape the approach before any code.</span></div>
<div><b>execute</b><span>Write the change in the safe copy.</span></div>
<div><b>validate</b><span>Run your checks against the result.</span></div>
<div><b>review</b><span>A fresh model reads the diff cold.</span></div>
<div><b>fix</b><span>Address what review and validation flagged.</span></div>
<div><b>verify</b><span>A final pass confirms the result holds.</span></div>
</div>

When the run finishes, it lands in one of three states:

<div class="docs-outcomes">
<div class="docs-outcome ok"><b>merge_ready</b><span>The diff is ready to ship.</span></div>
<div class="docs-outcome warn"><b>blocked</b><span>The reviewer or verifier flagged something a human should decide.</span></div>
<div class="docs-outcome stop"><b>failed</b><span>An unrecoverable error during a stage.</span></div>
</div>

## 4. Inspect the result

See what landed, then dig into the details:

```bash
vibe status                  # what landed
vibe replay <runId>          # full read-only inspector
```

Or open the dashboard's **Git** tab to read the diff inline.

## 5. Merge it yourself

Vibestrate does not push and does not merge. The run leaves the diff on its branch in the worktree, and the final call is yours.

Before you decide, you can ask the merge advisor:

```bash
vibe integrate advise <runId>
```

It is read-only and deterministic. It gives you risk flags first (did any check actually run? does the change touch protected files?), then the dry-run conflict report, the branch topology, and a recommendation: finish now, stage on an integration branch, or resolve conflicts first. Nothing is merged, no branch is touched. Add `--json` to emit the full advice for scripts. The same window lives on the dashboard's **Merge** page.

When the advisor suggests staging is configurable. It is suggestion-only and never blocks:

```bash
vibe config set merge.advisor.suggestIntegrationBranchWhen.filesTouched 40
# also: .protectedPaths (true/false), .behindMain <commits>
```

For a deeper look, run `vibe integrate analyze <runId>` (or click the **Analyze deeper** button on the Merge page). This optional read-only pass has a local provider read the run's diff against main and report semantic risk that a textual merge check can't see: concurrency, error handling, missing tests. It is advisory prose, never a merge verdict, and it never changes the deterministic recommendation. Before the provider sees it, the diff is byte-capped and redacted (secret-like files suppressed, secret-shaped tokens removed), and the result is cached under the run.

Then you decide. The branch is yours to take in one of three directions:

<div class="docs-cards">

**Share or review**
Open a PR for a human, or push the branch as is.

**Merge locally**
Fast-forward the change onto main yourself.

**Abandon**
Drop the run and keep the worktree for inspection.

</div>

To get a human review or just share the branch:

```bash
cd ../.vibestrate-worktrees/<runId>-<slug>
gh pr create                  # if you want review by a human
git push                       # if you just want to share the branch
```

To merge it locally instead:

```bash
git checkout main
git merge --ff-only vibestrate/<runId>-<slug>
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
