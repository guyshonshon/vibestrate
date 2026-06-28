---
title: Policies
description: The project's one rule surface - tiered rules the active supervisor enforces, from soft advice to a hard merge block.
section: concepts
slug: concepts/policies
---

A **policy** is a rule the project enforces on every run. Policies belong to the
*project*, not to one supervisor - so a rule like "use a hyphen, not an em-dash"
holds no matter which supervisor reviews the work. The active supervisor is the
*enforcer*: it carries the project's policies into the review. It does not own them.

Each policy has a **tier** that decides how it is enforced:

- **advise** - the supervisor injects the rule into the reviewer, and a model
  checks the change against it. A violation is flagged and rides the normal review
  and fix loop, the same way a correctness note does. This is the default, and the
  right tier for anything a human judges ("no eyebrow labels", "don't
  over-engineer this") - a model generalizes to paraphrases a brittle pattern
  would miss. An advise rule never blocks a merge on its own.
- **block** - a deterministic matcher (a regex) over the run's changed lines. If it
  matches, the run lands `blocked` with the reason shown, **even if the reviewer
  approved**. A block is not a model verdict - it is a regex, so it can't
  false-positive-storm your merges or override the correctness review. It scans from
  the run's fork point (so changes a flow commits mid-run are caught), skips secret
  files, and fails closed if it can't read the diff.

A block is **owner-only**. The supervisor can *propose* an advise rule from a
consult ("stop using em-dashes"); it can never author a hard block. A proposed rule
lands *pending* and does nothing until you confirm it.

## Capture (CLI or UI, your choice)

```
vibe policies add no-em-dash "do not use em-dash characters" --fix "use a hyphen"
vibe policies add no-eyebrow "no eyebrow labels" --block --matcher "SectionEyebrow"
vibe policies list
vibe policies confirm <id>     # confirm a supervisor-proposed rule
vibe policies reject <id>      # reject a pending proposal
vibe policies remove <id>
```

The dashboard **Policies** page does the same: a create form for both tiers
(including a block's matcher), the list of active and pending rules, and
Confirm / Reject / Remove. An owner add is live on the next review - no confirm
step (you authored it, so it is trusted).

## Soft rules vs the hard security gates

Policies are the *soft* surface - owner conventions. They sit alongside, and are
visibly distinct from, the **hard security gates** that are always on and always
fail closed: the secret-leak refusal, the Action Broker's deny rules, and the
deterministic content rules in `.vibestrate/policies/*.yml`. Those are not weakened
by a policy and are not authored from the browser; they stay file-based. A soft
policy can only *add* a check, never relax one.

## It stays optional

A plain `vibe run "<prompt>"` needs zero policies. Policies are an additive,
opt-in layer - a project with none runs exactly as before. The design note is
[`docs/design/policy-consolidation.md`](https://github.com/) (in-repo).

## Migrating from persona preferences

Earlier versions scoped these rules to a supervisor (`personas.<id>.preferences`).
They are now project-level. If you have an older config, run `vibe policies migrate`
once - it lifts every persona preference into the project surface and removes the
old key. Until you do, the config fails to load with a message pointing you here.
