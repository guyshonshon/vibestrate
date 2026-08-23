---
title: Why a human stays in the loop
description: How Vibestrate checks an AI's work, and why the last call on a change is yours.
slug: getting-started/why-a-human
---

## In simple words

AI can write code you could not write yourself. The same AI also makes things up, and it tends to agree with whatever you just said. Trusting it blind is how bad code ships.

So a run is built to disagree with itself. A different model reads the diff than wrote it, your tests decide whether it works, and nothing merges without you.

![The Run assurance panel reading verified, with four tiles underneath: Policy passed, Validation passed 2 of 2, Review approved, Verification passed.](/media/docs/scoped/run-assurance.png)

Four independent checks, each reported separately. A verdict that collapsed them into one thumbs-up would tell you less.

<div class="docs-callout tip">

**Tip.** The single highest-value change you can make is pointing the reviewer at a second vendor. A model reviewing its own transcript mostly agrees with itself; one that reads the diff cold does not.

</div>

## What actually catches a bad change

<div class="docs-cards">

**A reviewer that did not write it**
Fresh process, no inherited session. It reads the diff the way a colleague would.

**Your own test suite**
Not the model's confidence. Validation is the tie-breaker when opinions differ.

**Policies you wrote**
The rules that matter in your codebase, checked on every run.

**You, at the end**
Nothing pushes and nothing merges without a human. That one is not configurable.

</div>

<div class="docs-callout">

**Did you know?** When only one model ran, the run labels its own review `single-profile` rather than quietly presenting it as independent. The product tells you when its check was a self-check.

</div>

## Going deeper

### Turn on a second model

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

### The payoff

You don't need to know the security rule or the WebGL API yourself. The AI brings that. Vibestrate gives you a way to trust the result without auditing every line. A second model that didn't write the code reviews it against the same plan and the same project instructions, your own tests run against the result, and the evidence comes back with it.

Independence pays off most where a mistake is expensive, so if you change one thing about a fresh install, make it the reviewer.

### Ask instead of reading

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

### Keep going

- [The supervisor](/docs/concepts/supervisor) - how Vibestrate sets the scrutiny level for a run.
- [Set up a provider](/docs/getting-started/providers) - adding the second provider this page assumes.
- [Keep a change](/docs/getting-started/merging) - what Git is, and how to take a finished run.
