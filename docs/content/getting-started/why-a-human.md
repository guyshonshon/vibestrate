---
title: Why a human stays in the loop
description: AI is fast, but it guesses and it agrees with you. Vibestrate proves the work before a person makes the final call.
slug: getting-started/why-a-human
---

AI can write code you could not write yourself - a security fix, a piece of WebGL you have never touched, a database migration. The catch: the same AI also makes things up, and it tends to agree with whatever you said. Trusting it blind is how bad code ships.

<div class="docs-callout">

**The honest problem.** An AI model is a confident guesser. It will invent a function that does not exist, miss an edge case, or hide a bug instead of fixing it, then tell you it is done - because agreeing is what a chat assistant is built to do. None of that is malice. It is what a model is.

</div>

Vibestrate is built to catch that instead of trusting it. A run plans, builds, then reviews and verifies in separate steps that start from fresh context. It runs your real tests and validation commands against the result, so "it looks done" is not enough. And it never gets ahead of you: work happens in a throwaway copy of your project and the run stops at `merge_ready` instead of pushing or merging on your behalf - see [the safety guarantees](/docs/concepts/safety). You read the diff, or let the [merge advisor](/docs/getting-started/merging) flag the risks, and you decide.

<svg viewBox="0 0 560 104" width="100%" style="max-width:560px;height:auto" role="img" aria-label="The run decides everything up to merge ready - planning, writing, validating, reviewing and verifying. Taking the change or dropping it is decided by you.">
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="1" y="28" width="330" height="56" rx="8"/>
    <rect x="393" y="28" width="166" height="56" rx="8"/>
    <path d="M362 22v68" stroke-dasharray="4 4"/>
  </g>
  <g fill="currentColor" font-size="12" font-family="ui-monospace,monospace" text-anchor="middle">
    <text x="362" y="16">merge_ready</text>
    <text x="166" y="52">the run decides</text>
    <text x="476" y="52">you decide</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="11" text-anchor="middle">
    <text x="166" y="72">plan, write, validate, review, verify</text>
    <text x="476" y="72">keep the change, or drop it</text>
  </g>
</svg>

One part of that is not on by default.

<div class="docs-callout">

**A fresh install reviews its own work.** `vibe init` writes six roles that all point at one Profile on one provider, so the reviewer starts out as the same model as the builder. Reading a change with fresh context still catches real mistakes, but a model checking itself can only lower confidence, never raise it. Every run says which one it got: `single-profile` or `cross-model`.

</div>

Two steps make the review genuinely independent: add a Profile on a second provider (`vibe profile add codex-review --provider codex`), then point the Reviewer role at it.

## Turn on a second model

The second provider has to exist before a Profile can name it. [Set up a provider](/docs/getting-started/providers) covers the wizard; the short version is:

```bash
# add codex alongside claude
vibe provider setup
vibe profile add codex-review --provider codex
```

In `.vibestrate/project.yml`, the Reviewer's `profile` is then the only line that changes:

```yaml
crews:
  default:
    roles:
      reviewer:
        label: Reviewer
        seats: [reviewer, challenger]
        # was claude-balanced
        profile: codex-review
        prompt: .vibestrate/roles/reviewer.json
        permissions: read_only
        skills: []
```

Mission Control's Crew page does the same thing without the file: open the Reviewer role and pick the Profile from the dropdown.

Now the builder and the reviewer are different models, and the run says so. It prints a one-line summary - *Policy passed; review, validation, verification passed* - and then the lanes behind it:

```text
$ vibe assurance bold-lovelace
Run assurance bold-lovelace - verified

  policy:       passed
  validation:   passed (3/3 passed)
  review:       approved
  verification: passed
  supervisor:   staff-engineer (cross-model)
```

`cross-model` appears when at least two distinct models actually ran in that run. It is a record of what happened, not a setting you can assert.

## What this buys you

You do not need to know the security rule, the WebGL API, or the migration gotcha yourself. The AI brings that. What Vibestrate gives you is a way to trust the result without auditing every line: the same plan and the same project instructions handed to workers that see the problem differently, proven against your own checks, returned with the evidence and the decision still yours.

The independence is worth the most where a mistake is expensive. If you only change one thing, change the reviewer.

## Ask instead of reading

When you want to understand a run rather than read it cold, [Consult](/docs/concepts/consult) answers from your project's evidence and never writes to your code. A good question is specific and names the run:

```bash
vibe consult --run bold-lovelace \
  "What did the reviewer object to, and did the \
fix step address it?"
```

What comes back is a short answer, a confidence level, and the part it could not check:

```text
Consult  · confidence: medium

The reviewer flagged the settings handler for
swallowing write errors. The fix step added a
typed error return and re-validation passed, so
the objection was addressed in code.

Caveats (not verified):
  • No test covers the error branch, so the fix
    is unproven at runtime.
```

The caveats are the point. Consult states what it could not ground in evidence rather than filling the gap.

## Keep going

- [The supervisor](/docs/concepts/supervisor) - how Vibestrate decides how hard to scrutinize a run.
- [Set up a provider](/docs/getting-started/providers) - adding the second provider this page assumes.
- [Keep a change](/docs/getting-started/merging) - what Git is, and how to take a finished run.
