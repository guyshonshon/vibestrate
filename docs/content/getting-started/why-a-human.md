---
title: Why a human stays in the loop
description: How Vibestrate checks an AI's work, and why the last call on a change is yours.
slug: getting-started/why-a-human
---

## In simple words

AI can write code you could not write yourself. The same AI also makes things up, and it tends to agree with whatever you just said. Trusting it blind is how bad code ships.

So a run is built to disagree with itself. A different model reads the diff than wrote it, your tests decide whether it works, and nothing merges without you.

<div class="docs-callout tip">

**Tip.** The single highest-value change you can make is pointing the reviewer at a second vendor. A model reviewing its own transcript mostly agrees with itself; one that reads the diff cold does not.

</div>

![The Run assurance panel reading verified, with five tiles underneath: Policy passed, Validation passed 2 of 2, Review approved, Verification passed, and the supervisor that judged it, staff-engineer.](/media/docs/scoped/run-assurance.png)

**Run assurance**, at the top of every run page. Four independent checks, each reported separately rather than collapsed into one thumbs-up.

## What actually catches a bad change

<div class="docs-cards">

**A reviewer that did not write it**
Fresh process, no inherited session. It reads the diff the way a colleague would.

**Your own test suite**
Not the model's confidence. Validation is the tie-breaker when opinions differ.

**Policies you wrote**
The rules that matter in your codebase, checked on every run.

**You, at the end**
Nothing pushes and nothing merges without a human. Not a switch you could find and turn off: no code path in Vibestrate runs `git push`, and a merge to main is refused unless the request carries your confirmation.

</div>

<div class="docs-callout">

**Did you know?** When only one model ran, the run labels its own review `single-profile` rather than quietly presenting it as independent. The product tells you when its check was a self-check.

</div>

## Turn on a second model

Two steps, both on the **Crew** page.

1. **Providers** tab: **Set up** a second CLI, then **Test** it.
2. **Crews** tab: on the Reviewer's card, change **Profile (runtime)** to a Profile on that provider. Nothing else moves.

The builder and the reviewer are now different models, and the next run's **Run assurance** panel says so. From the terminal, the same two steps and the same report:

```bash
vibe provider setup
vibe profile add codex-review --provider codex
vibe assurance bold-lovelace
```

```text
Run assurance bold-lovelace - verified

  policy:       passed
  validation:   passed (3/3 passed)
  review:       approved
  verification: passed
  supervisor:   staff-engineer (cross-model)
```

`cross-model` appears when at least two distinct models ran. It is a record of what happened, not a setting you can claim.

The role's `profile` line is the only one that changes in `.vibestrate/project.yml`:

```yaml
crews:
  default:
    roles:
      reviewer:
        seats: [reviewer, challenger]
        # was claude-balanced
        profile: codex-review
        permissions: read_only
```

## The payoff

You don't need to know the security rule or the WebGL API yourself; the AI brings that. What Vibestrate adds is a way to trust the result without auditing every line: a second model that didn't write the code reviews it against the same plan and project instructions, your own tests run against the result, and the evidence comes back with it.

Independence pays off most where a mistake is expensive.

## Ask instead of reading

The consult orb sits in the bottom-right corner of every dashboard page except the Consult page itself, which is the same surface at full size. It answers from your project's evidence and never writes to your code. A good question is specific and names the run:

> What did the reviewer object to, and did the fix step address it?

You get back a short answer, a confidence level, and the part it couldn't check. In the terminal that reads:

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

Read the caveats first: Consult says what it couldn't ground in evidence instead of filling the gap with a guess. The same question from a script:

```bash
vibe consult --run bold-lovelace \
  "What did the reviewer object to?"
```

## Keep going

- [The supervisor](/docs/concepts/supervisor) - how Vibestrate sets the scrutiny level for a run.
- [Consult](/docs/concepts/consult) - what it can see, and what it refuses to do.

## Next

[Teach it your conventions →](/docs/getting-started/skills) - the rules you keep repeating, written down once and attached to a role.
