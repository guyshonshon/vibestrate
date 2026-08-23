---
title: Policies
description: The project's one rule surface - tiered rules enforced on every run, from soft advice to a hard merge block.
slug: concepts/policies
---

## In simple words

A **policy** is a rule your project enforces on every [[run]]. Something like "use a hyphen, not an em-dash", or "never add `console.log` to source files".

Policies belong to the *project*, not to one [[supervisor]]. The supervisor is the enforcer that carries them into review; it does not own them, so a rule holds whichever supervisor is on duty.

Two columns, and only one of them is yours:

![The Your policies column and the Deterministic engine card. Two rules are tagged advise: one forbidding console.log in source files, one requiring unknown keys to be rejected at the boundary. Below, a card reads no rules in .vibestrate/policies/*.yml.](/media/docs/scoped/policies-your.png)

That is the part you author, and a fresh project starts with it empty. Beside it sit four guards that ship on for everyone:

![The Hard guards column. Four switches, all on: forbid main-branch writes, forbid secrets access, forbid auto-push, forbid auto-merge. Forbid secrets access is annotated: covers .env and key files.](/media/docs/scoped/policies-hard.png)

<div class="docs-callout tip">

**Tip.** Start at the `advise` tier, which is the default. It tells the writer to comply and the reviewer to check, and a violation rides the normal review-and-fix loop. Reach for `block` only when you want a merge stopped outright, because a blocked run needs you to come back to it.

</div>

## The tiers

<div class="docs-cards">

**advise** - the default. The rule goes to both sides of the change: the seat writing the code is told to comply with it, and the reviewer is told to check the diff against it. A violation that gets written anyway is flagged and rides the normal review and fix loop. Right for anything a human judges: a model generalizes to paraphrases a brittle pattern would miss. An advise rule never blocks a merge on its own.

**block** - a regex matched against the lines the run **added**, not a model verdict. On a match the run lands `blocked` with the reason shown, even if the reviewer approved. A rule against em-dashes catches one the run writes and says nothing about one already in the file. It scans from the run's fork point, so mid-run commits are caught, and skips secret files. If the diff cannot be read the run is blocked, not waved through.

</div>

A block is **owner-only**. The supervisor can *propose* an advise rule from a
consult, never a hard block, and a proposal lands *pending* - it does nothing
until you confirm it.

<div class="docs-callout warn">

**A broken block matcher stops the project, not the merge.** No matcher, one over 256 characters, or one that is not a valid regular expression is refused when you write it and again every time `project.yml` loads - the config fails with the reason instead of shipping a gate that looks armed. One that reaches the gate anyway is skipped and recorded as a `supervisor.policy_block` event. Dry-run a matcher from **Test** in the form below, or with `vibe policies test`.

</div>

<div class="docs-callout">

**Did you know?** An `advise` rule is enforced by a model, and that is on purpose. A regex for "no em-dashes" is exact but brittle; a model generalises to the paraphrases a pattern would miss. The `block` tier is the regex one, and it is matched against the lines a run **added**, not against your whole file, so it catches what the run wrote and stays quiet about what was already there.

</div>

## Going deeper

### Writing one

**New policy** opens the one authoring form. You type the rule in plain English
and pick its tier beside it. An advise rule takes an optional suggested fix, the
correction the reviewer names when it flags the diff. A block rule takes the
matcher regex and its flags, and **Test** dry-runs that matcher against a diff
snippet or recent runs first. **Add policy** writes it, live on the next review
with no confirm step, since you authored it. Each row in the list underneath
shows a rule's tier and either its matcher or its stated fix.

Two shortcuts fill the same form: **Draft** turns your English sentence into a
filled-in draft, and **Suggest from recent runs** reads recent diffs for
candidates you can adopt into it. A model can propose a tier and a matcher, and
committing a block stays your press of Add policy.

### A rule the supervisor proposed

A rule the supervisor proposes waits for you:

<svg viewBox="0 0 560 132" width="100%" style="max-width:560px;height:auto" role="img" aria-label="A rule you add yourself goes live on the next review with no confirm step. A rule the supervisor proposes lands pending and only goes live once you confirm it.">
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="1" y="1" width="170" height="36" rx="8"/>
    <rect x="1" y="85" width="170" height="36" rx="8"/>
    <rect x="213" y="85" width="110" height="36" rx="8"/>
    <rect x="409" y="85" width="150" height="36" rx="8"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.5" stroke-width="1">
    <path d="M171 19 h308 v62"/><path d="M474 76 l5 5 l5 -5"/>
    <path d="M171 103 h36"/><path d="M202 98 l5 5 l-5 5"/>
    <path d="M323 103 h80"/><path d="M398 98 l5 5 l-5 5"/>
  </g>
  <g fill="currentColor" font-size="12" text-anchor="middle">
    <text x="86" y="23">you add a rule</text>
    <text x="86" y="107">the supervisor proposes</text>
    <text x="484" y="107">live on next review</text>
  </g>
  <text x="268" y="107" fill="currentColor" font-size="12" font-family="ui-monospace,monospace" text-anchor="middle">pending</text>
  <g fill="currentColor" fill-opacity="0.5" font-size="11" text-anchor="middle">
    <text x="325" y="14">no confirm step</text>
    <text x="363" y="96">you confirm</text>
  </g>
</svg>

Ask the supervisor about a habit and the answer can arrive with a rule attached.
It's written pending, so nothing changes until you say so. The rule sits at the
top of your list tagged `proposed`, with **Confirm** and **Reject** on its row,
and Confirm puts it in force on the next review. The tier is fixed for that path:
a proposed rule is always `advise` with no matcher, whatever the answer
suggested.

### Both sides of the change see an advise rule

The writer and the reviewer, from one selection.

A code-writing seat - the implementer and the fixer, the turns that actually emit
a diff - is told the rules bind the code it is about to write, and to comply with
them *in this change*. It is explicitly told not to go hunting for pre-existing
violations elsewhere, so a policy does not quietly turn into a refactor.

A reviewer is told to verify the diff against the same rules and flag every
violation with its location and your stated correction.

The wording differs, the selection does not. A rule can never bind a writer
without also being checkable by a reviewer, and the trust gate is the same on both
sides: an unconfirmed rule is inert and its text reaches neither.

This matters for what a run costs. A rule the writer is never shown is a rule that
gets violated and then removed by a review, fix and re-review round trip - paying
three model turns to delete something that would not have been written.

A rule with no lens scope goes into every run. A lens-scoped rule is opt-in
targeting: it applies only when the run's active review lenses include one it
names. At most **12** rules reach a single turn; anything past that is counted in
the run's `supervisor.policy_advise` event as dropped, so a long list thins out
silently unless you read the event.

### Soft rules vs the hard security gates

Policies are the *soft* surface - owner conventions. They sit alongside, and are
visibly distinct from, the **hard security gates** that are always on: the
secret-leak refusal, the Action Broker's deny rules, and the deterministic content
rules the **Deterministic engine** card reads from `.vibestrate/policies/*.yml`.
Those content rules stay file-based and are not authored from the browser. A soft
policy can only *add* a check, never relax one. The Guards tile in the header
tells you how many of the four hard guards are live. See
[Safety](/docs/concepts/safety).

### Advanced: CLI and automation

Every action on the page has a `vibe policies` subcommand behind it, for scripting
a rule into a setup or a repo template. See the
[CLI overview](/docs/cli/overview).

```
vibe policies add no-em-dash \
  "do not use em-dash characters" \
  --fix "use a hyphen"

vibe policies add no-eyebrow "no eyebrow labels" \
  --block --matcher "SectionEyebrow"

# what would it block?
vibe policies test no-eyebrow --recent

vibe policies list
vibe policies confirm <id>  # adopt a proposal
vibe policies reject <id>   # discard a proposal
vibe policies remove <id>
```

`vibe policies draft "<rule in English>"` and `vibe policies suggest` are the two
shortcuts from the form. Both are drafts only; you adopt one with `policies add`.

A consult proposes from the terminal too, and the id comes from the statement:

```
$ vibe consult "em-dashes keep slipping past review"

$ vibe policies list
Project policies (owner-authored):
avoid-em-dashes  advise  pending confirm
  avoid em-dashes -> use a hyphen

$ vibe policies confirm avoid-em-dashes
```

### It stays optional

A plain `vibe run "<prompt>"` needs zero policies. Policies are an additive,
opt-in layer - a project with none runs exactly as before.

### Migrating from persona preferences

Earlier versions scoped these rules to a supervisor (`personas.<id>.preferences`).
They are now project-level. If you have an older config, run `vibe policies migrate`
once - it lifts every persona preference into the project surface and removes the
old key. Until you do, the config fails to load with a message pointing you here.
