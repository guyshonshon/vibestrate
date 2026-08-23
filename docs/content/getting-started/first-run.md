---
title: Your first run
description: How one run works, from the sentence you type to the branch it leaves behind.
slug: getting-started/first-run
---

## In simple words

You hand Vibestrate one task and it takes that task start to finish. It works in a second checkout of your repository, in a folder beside your project, so the files you have open never move under you.

The run stops with the change on its own branch. Vibestrate never merges and never pushes, so the last call is yours.

![The header of a finished run reading merge ready, with the task, the flow it followed, its eight steps, the elapsed time and the diff.](/media/docs/scoped/run-header.png)

<div class="docs-callout tip">

**Tip.** Pick something small for the first one. You are learning what the run looks like, not testing how much it can do, and a small task gets you to a verdict in a couple of minutes.

</div>

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

**Did you know?** A run you dislike costs you nothing to discard. It never touched your branch, so there is no revert - you just ignore the folder. That is what makes it safe to try something you are unsure about.

</div>

## Pick a small, well-scoped task

Vibestrate works best on the kind of task you'd hand a careful colleague: clear scope, a piece of code you can point at, and a way to tell when it's done.

<div class="docs-cards">

**Too big** - "Refactor the whole login system." No boundary, no finish line, and the reviewer has nothing to judge the result against.

**About right** - "Add structured logging to the settings save handler." One handler, one behaviour, and your own tests say whether it worked.

</div>

## Start the run

```bash
vibe run "Add structured logging to the \
settings save handler"
```

Add `--ui` to watch it work as it goes. The dashboard starts alongside the run, on port 4317 by default.

```bash
vibe run "Add structured logging to the \
settings save handler" --ui
```

## The steps a run takes

<div class="docs-flow">
<div><b>Look</b><span>Reads your project to learn its language, its tools, and how you run your tests.</span></div>
<div><b>Copy</b><span>Makes a second checkout of your repo beside your project, under ../.vibestrate-worktrees/, in a folder named after the run.</span></div>
<div><b>Build</b><span>Plans the change, designs the approach, writes it, then runs your validation commands.</span></div>
<div><b>Check</b><span>A reviewer checks the diff against the plan and the validation results. If it asks for changes, a fixer makes them and validation runs again.</span></div>
<div><b>Verify</b><span>A separate verifier takes a last pass and decides whether the result is ready to merge.</span></div>
</div>

The default flow wires that into eight steps. The review loop runs at most three passes: one review plus up to two fix cycles.

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

Those step names are also the folder names under the run's artifacts, so the `review` box above is the same `review` in `artifacts/flows/review/output.md`.

## Going deeper

### In the terminal

Each step prints a line as it starts, so you can see where it's got to. The last thing you get is the summary.

```text
Final status: merge_ready
  Review decision: APPROVED
  Verification: PASSED
  Artifacts: .vibestrate/runs/zen-bohr/artifacts
  Worktree: /home/you/.vibestrate-worktrees/zen-bohr
  Branch: vibestrate/zen-bohr
```

`zen-bohr` is the run id. Vibestrate hands every run a docker-style `adjective-noun` handle and uses it verbatim as the worktree folder name and the branch suffix - no task slug is appended.

### Look at what it changed

To read every change before you accept anything:

```bash
cd ../.vibestrate-worktrees/zen-bohr
git diff main
```

Or open the **Source** page in the dashboard and pick its **Changes** tab, which lays out the same changes inline, file by file.

### Use it, or don't

**Vibestrate never merges anything for you** (see [the safety guarantees](/docs/concepts/safety)). The finished change waits on its own branch for you to take or leave.

The branch is yours to:

- Open a pull request (`gh pr create`, or whatever tool you use).
- Pull it into your own branch if it's yours alone.
- Take the parts you want.
- Throw the whole thing away if it isn't right.

### Runs that stop short

A run keeps its full record on disk no matter which state it ended in.

- **`blocked`** - the reviewer or verifier flagged something you need to decide. Read `artifacts/flows/review/output.md` in the run's folder, or `artifacts/flows/verify/output.md` if verification is what blocked it. `events.ndjson` carries the matching `review.decision` or `verification.decision` event with the verdict itself.
- **`failed`** - something broke partway through. Look in `events.ndjson` for the last event before the failure, and at the step's own output under `artifacts/flows/`, in the folder named for that step.
- **`aborted`** - you stopped it. `vibe abort` marks the run aborted and leaves the worktree in place, so any half-finished work is still there to read.

See [Debug a failed run](/docs/workflows/debug-failed) for the step-by-step playbook.

### Next

[Set up a provider →](/docs/getting-started/providers) - Vibestrate picks a sensible default, but five minutes on how the models are wired up pays off.
