---
title: Why a human stays in the loop
description: How Vibestrate checks an AI's work, and why the last call on a change is yours.
slug: getting-started/why-a-human
---

AI can write code you couldn't write yourself: a security fix, or a piece of WebGL you've never touched. The same AI also makes things up, and it tends to agree with whatever you said. Trusting it blind is how bad code ships.

<div class="docs-callout">

**The honest problem.** An AI model is a confident guesser. It'll invent a function that doesn't exist, miss an edge case, or hide a bug instead of fixing it, then tell you it's done, because agreeing is what a chat assistant is built to do. That's a property of the model, and no amount of prompting drills it out.

</div>

Vibestrate is built to catch that. It plans, writes the code, then reviews and verifies in separate steps, each one starting from fresh context. It runs your real tests and validation commands against the result, so "it looks done" isn't enough. And it never gets ahead of you: the work happens in a throwaway copy of your project, and the run stops at `merge_ready` instead of pushing or merging on your behalf - see [the safety guarantees](/docs/concepts/safety). You read the diff, or let the [merge advisor](/docs/getting-started/merging) flag the risks, and you make the call.

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

One part of that isn't switched on for you.

<div class="docs-callout">

**A fresh install reviews its own work.** `vibe init` writes six roles that all point at one Profile on one provider, so the reviewer starts out as the same model as the builder. Re-reading a change with fresh context still catches real mistakes, but a model checking itself can only lower your confidence, never raise it. Every run records which of the two it got: `single-profile` or `cross-model`.

</div>

Two steps make the review independent: add a Profile on a second provider (`vibe profile add codex-review --provider codex`), then point the Reviewer role at it.

## Turn on a second model

The second provider has to exist before a Profile can name it. [Set up a provider](/docs/getting-started/providers) walks through the wizard. The short version:

```bash
# add codex alongside claude
vibe provider setup
vibe profile add codex-review --provider codex
```

In `.vibestrate/project.yml`, the Reviewer's `profile` is the only line that changes:

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

Now the builder and the reviewer are different models, and the assurance report shows it. You get a one-line summary - *Policy passed; review, validation, verification passed* - and the lanes behind it:

```text
$ vibe assurance bold-lovelace
Run assurance bold-lovelace - verified

  policy:       passed
  validation:   passed (3/3 passed)
  review:       approved
  verification: passed
  supervisor:   staff-engineer (cross-model)
```

`cross-model` shows up when at least two distinct models ran during that run. It's a record of what happened, and there's no setting that lets you claim it.

## The payoff

You don't need to know the security rule or the WebGL API yourself. The AI brings that. Vibestrate gives you a way to trust the result without auditing every line. A second model that didn't write the code reviews it against the same plan and the same project instructions, your own tests run against the result, and the evidence comes back with it.

Independence pays off most where a mistake is expensive, so if you change one thing about a fresh install, make it the reviewer.

## Ask instead of reading

To understand a run without reading it cold, ask [Consult](/docs/concepts/consult). It answers from your project's evidence and never writes to your code. A good question is specific and names the run:

```bash
vibe consult --run bold-lovelace \
  "What did the reviewer object to, and did the \
fix step address it?"
```

You get back a short answer, a confidence level, and the part it couldn't check:

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

Read the caveats first. Consult tells you what it couldn't ground in evidence instead of filling the gap with a guess.

## Keep going

- [The supervisor](/docs/concepts/supervisor) - how Vibestrate sets the scrutiny level for a run.
- [Set up a provider](/docs/getting-started/providers) - adding the second provider this page assumes.
- [Keep a change](/docs/getting-started/merging) - what Git is, and how to take a finished run.
