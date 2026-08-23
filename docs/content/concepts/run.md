---
title: Run
description: One attempt at a task, driven through a flow by a crew, in its own copy of your repo.
slug: concepts/run
---

## In simple words

You have a [[task]] (what you want done), a [[flow]] (the recipe), and a [[crew]] (who does it). A **Run** is what happens when you put those three together and press go.

One run is one attempt. It gets its own copy of your repository to work in, walks the flow's steps in order, and stops at a verdict. Your actual branch is untouched the whole time.

Everything a run is fits in its own header:

![The header of a finished run. A green panel on the left reads Run, merge ready. Beside it the task, then Flow Default with its eight steps listed in order - Plan, Architecture, Implement, Validate, Review, Fix, Re-validate, Verify - and a row reading default provider, 5m 27s elapsed, and a diff of plus 24 minus 1 across 2 files.](/media/docs/scoped/run-header.png)

The task at the top, the flow it is following, the steps it will walk, and what it has cost so far.

<div class="docs-callout tip">

**Tip.** A run is cheap to throw away. It never touched your branch, so abandoning one costs you the tokens it spent and nothing else. That is what makes it safe to just try something.

</div>

## How a run ends

A run always lands in one of four places, and only the first is mergeable.

<div class="docs-outcomes">
<div class="docs-outcome ok">

**merge_ready**
Every step passed. The change is waiting for you to take it.

</div>
<div class="docs-outcome warn">

**blocked**
Something refused. A policy, a review, or a failed check.

</div>
<div class="docs-outcome bad">

**failed**
A step crashed. The failing step's own output says why.

</div>
<div class="docs-outcome stop">

**aborted**
You stopped it.

</div>
</div>

Between `created` and one of those four, a run moves through the states its flow needs: planning, architecting, executing, validating, reviewing, fixing, verifying, and pausing at `waiting_for_approval` whenever a gate asks for you.

## Reading the verdict

`merge_ready` is not a single opinion. It is four independent checks, and the run shows you each one rather than collapsing them into a thumbs up:

![The Run assurance panel reading verified, with the summary policy passed, review, validation, verification passed. Below it four tiles: Policy passed, Validation passed 2 of 2, Review approved, Verification passed.](/media/docs/scoped/run-assurance.png)

<div class="docs-callout">

**Did you know?** The reviewer that approves a diff never inherits the session of the model that wrote it. It starts a fresh process and reads the change cold, the way a colleague would. A model reviewing its own transcript mostly agrees with itself.

</div>

## When you would look at one

<div class="docs-cards">

**It finished and you want the change**
Read the diff, then merge. The verdict tells you which checks actually ran.

**It stopped early**
`blocked` and `failed` mean different things. Blocked is a decision, failed is a crash.

**It is still going**
Watch the steps tick over live, or leave it and come back.

**It went wrong last week**
Runs are replayable. The decisions, tokens and outputs were all recorded.

</div>

## Going deeper

### The three verdicts a step can carry

Review answers `APPROVED`, `CHANGES_REQUESTED` or `BLOCKED`. Verification answers `PASSED`, `FAILED` or `NEEDS_HUMAN`. A `CHANGES_REQUESTED` does not end the run; it sends the work to the fix step and back round for re-validation, which is why the default flow lists Fix and Re-validate after Review.

`NEEDS_HUMAN` is the honest answer when the evidence does not support either a pass or a fail. It stops rather than guessing.

### Isolation

Every run gets its own git [[worktree]], a real checkout on its own branch sharing your repository's object database. Agents edit there. Nothing is pushed and nothing is merged without you, and the run records the worktree path so you can open it yourself:

![The Workspace panel of a run, naming the branch and showing the run's isolated git worktree path, with a Copy cd button.](/media/docs/scoped/run-workspace.png)

### What is recorded

Tokens, spend and duration per step, every decision the supervisor made, the diff, and the validator output. It is written locally as the run happens, which is what makes a finished run something you can re-read rather than something you have to remember.

Next: [[worktree]] covers the copy of your repo a run works in.
