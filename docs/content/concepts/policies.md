---
title: Policies
description: The project's one rule surface - tiered rules the active supervisor enforces, from soft advice to a hard merge block.
slug: concepts/policies
---

A **policy** is a rule the project enforces on every run. Policies belong to the
*project*, not to one supervisor - so a rule like "use a hyphen, not an em-dash"
holds no matter which supervisor reviews the work. The active supervisor is the
*enforcer*: it carries them into the review, but it does not own them.

Each policy has a **tier** that decides how it is enforced:

<div class="docs-cards">

**advise** - the default. The supervisor puts the rule in front of the reviewer and a model checks the change against it. A violation is flagged and rides the normal review and fix loop. Right for anything a human judges: a model generalizes to paraphrases a brittle pattern would miss. An advise rule never blocks a merge on its own.

**block** - a regex matched against the lines the run **added**, not a model verdict. On a match the run lands `blocked` with the reason shown, even if the reviewer approved. A rule against em-dashes catches one the run writes and says nothing about one already in the file. It scans from the run's fork point, so mid-run commits are caught, and skips secret files. If the diff cannot be read the run is blocked, not waved through.

</div>

A block is **owner-only**. The supervisor can *propose* an advise rule from a
consult, never a hard block, and a proposal lands *pending* - it does nothing
until you confirm it.

<div class="docs-callout warn">

**A broken block matcher stops the project, not the merge.** No matcher, one over 256 characters, or one that is not a valid regular expression is refused when you write it and again every time `project.yml` loads - the config fails with the reason instead of shipping a gate that looks armed. One that reaches the gate anyway is skipped and recorded as a `supervisor.policy_block` event. Dry-run a matcher with `vibe policies test`.

</div>

## Capture (CLI or UI, your choice)

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

The dashboard **Policies** page does the same: a create form for both tiers
(including a block's matcher), the list of active and pending rules, and
Confirm / Reject / Remove. An owner add is live on the next review - no confirm
step (you authored it, so it is trusted).

`vibe policies draft "<rule in English>"` turns a sentence into an editable draft,
and `vibe policies suggest` reads recent runs' diffs for candidates. Both are drafts
only. Neither writes a policy; you adopt one with `policies add`.

## A rule the supervisor proposed

A rule you write yourself is trusted immediately. A rule the supervisor proposes
waits for you:

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

Ask about a habit and the answer can arrive with a rule attached:

```
$ vibe consult "em-dashes keep slipping past review"
```

The rule is written pending, so nothing changes until you say so. Its id is made
from the statement:

```
$ vibe policies list
Project policies (owner-authored):
avoid-em-dashes  advise  pending confirm
  avoid em-dashes -> use a hyphen

$ vibe policies confirm avoid-em-dashes
```

Once confirmed it is live on the next review. The tier is fixed for that path: a
rule the supervisor proposes is always `advise` with no matcher, whatever the
answer suggested.

## What reaches a review

An advise rule with no lens scope goes into every run's reviewer turn. A
lens-scoped rule is opt-in targeting: it goes in only when the run's active review
lenses include one of the ones it names. At most **12** rules reach a single
reviewer turn; anything past that is counted in the run's `supervisor.policy_advise`
event as dropped, so a long list thins out silently unless you read the event.

## Soft rules vs the hard security gates

Policies are the *soft* surface - owner conventions. They sit alongside, and are
visibly distinct from, the **hard security gates** that are always on: the
secret-leak refusal, the Action Broker's deny rules, and the deterministic content
rules in `.vibestrate/policies/*.yml`. Those are not weakened by a policy and are
not authored from the browser; they stay file-based. A soft policy can only *add* a
check, never relax one. See [Safety](/docs/concepts/safety).

## It stays optional

A plain `vibe run "<prompt>"` needs zero policies. Policies are an additive,
opt-in layer - a project with none runs exactly as before.

## Migrating from persona preferences

Earlier versions scoped these rules to a supervisor (`personas.<id>.preferences`).
They are now project-level. If you have an older config, run `vibe policies migrate`
once - it lifts every persona preference into the project surface and removes the
old key. Until you do, the config fails to load with a message pointing you here.
