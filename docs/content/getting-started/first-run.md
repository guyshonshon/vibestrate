---
title: Your first run
description: Give Vibestrate one small task and watch it go from idea to a finished, ready-to-merge change.
slug: getting-started/first-run
---

One task, start to finish. You describe what you want, Vibestrate does the work in a git worktree beside your project, and it stops with a finished change on its own branch. It never merges and never pushes, so the last step is always yours.

A run ends in one of four states, and the state is the whole answer to "what do I do next":

<div class="docs-outcomes">
<div class="docs-outcome ok"><b>merge_ready</b><span>The change is finished. Read the diff and keep it or drop it.</span></div>
<div class="docs-outcome warn"><b>blocked</b><span>The reviewer or verifier flagged something you should decide.</span></div>
<div class="docs-outcome stop"><b>failed</b><span>Something broke mid-run.</span></div>
<div class="docs-outcome stop"><b>aborted</b><span>You stopped the run yourself with vibe abort.</span></div>
</div>

## Pick a small, well-scoped task

Vibestrate works best on the kind of task you'd hand a careful colleague: clear scope, a part of the code you can point to, and a way to tell when it's done.

<div class="docs-cards">

**Too big** - "Refactor the whole login system." No boundary, no finish line, and the reviewer has nothing to check the result against.

**About right** - "Add structured logging to the settings save handler." One handler, one behavior, and your existing tests say whether it worked.

</div>

## Start the run

```bash
vibe run "Add structured logging to the \
settings save handler"
```

To watch it work as it goes, add `--ui`. The dashboard starts alongside the run, on port 4317 by default.

```bash
vibe run "Add structured logging to the \
settings save handler" --ui
```

## What happens next

<div class="docs-flow">
<div><b>Look</b><span>Reads your project to learn its language, its tools, and how you run your tests.</span></div>
<div><b>Copy</b><span>Creates a git worktree beside your project, under ../.vibestrate-worktrees/, in a folder named after the run.</span></div>
<div><b>Build</b><span>Plans the change, designs the approach, writes it, then runs your validation commands.</span></div>
<div><b>Check</b><span>A reviewer reads the diff cold. If it asks for changes, a fixer makes them and validation runs again.</span></div>
<div><b>Verify</b><span>A separate verifier seat takes a final pass and decides whether the result is merge-ready.</span></div>
</div>

The default flow wires that into eight steps. The review loop runs at most three passes - one review plus up to two fix cycles:

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

Those step names are also the folder names under the run's artifacts, so `review` above is the same `review` in `artifacts/flows/review/output.md`.

## What you'll see

The terminal prints each step as it happens: a header, a short status, and any output. The last thing it prints is the summary.

```text
Final status: merge_ready
  Review decision: APPROVED
  Verification: PASSED
  Artifacts: .vibestrate/runs/zen-bohr/artifacts
  Worktree: /home/you/.vibestrate-worktrees/zen-bohr
  Branch: vibestrate/zen-bohr
```

`zen-bohr` is the run id. Vibestrate gives every run a docker-style `adjective-noun` handle and uses it verbatim as the worktree folder name and the branch suffix - no task slug is appended.

## Look at what it changed

To see every change before you accept anything:

```bash
cd ../.vibestrate-worktrees/zen-bohr
git diff main
```

Or open the **Source** page in the dashboard, on its **Changes** tab, which shows the same changes inline, file by file.

## Use it, or don't

**Vibestrate never merges anything for you** (see [the safety guarantees](/docs/concepts/safety)). The finished change sits on its own branch, ready for you to take or leave.

The branch is yours to:

- Open a pull request (`gh pr create`, or whatever tool you use).
- Pull it into your own branch if it's yours alone.
- Take just the parts you want.
- Throw the whole thing away if it isn't right.

## When it doesn't finish clean

Every run keeps its full record on disk, whichever state it ended in.

- **`blocked`** - the reviewer or verifier flagged something that needs a human decision. Read `artifacts/flows/review/output.md` in the run's folder, or `artifacts/flows/verify/output.md` if verification is what blocked. `events.ndjson` carries the matching `review.decision` or `verification.decision` event with the actual verdict.
- **`failed`** - something broke partway through. Check `events.ndjson` for the last event before the failure, and the step's own output under `artifacts/flows/`, in the folder named for that step.
- **`aborted`** - you stopped it. `vibe abort` marks the run aborted and leaves the worktree in place, so any half-finished work is still there to read.

See [Debug a failed run](/docs/workflows/debug-failed) for the step-by-step playbook.

## Next

[Set up a provider →](/docs/getting-started/providers) - Vibestrate picks a sensible default, but five minutes on how the AI models are wired up is worth it.
