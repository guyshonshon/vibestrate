---
title: Policies
description: The project's one rule surface - tiered rules enforced on every run, from soft advice to a hard merge block.
slug: concepts/policies
---

## In simple words

A **policy** is a rule your project enforces on every [[run]]. Something like "use a hyphen, not an em-dash", or "never add `console.log` to source files".

Policies belong to the *project*, not to one [[supervisor]]. The supervisor is the enforcer that carries them into review, so a rule holds whichever supervisor is on duty.

`vibe ui` opens the dashboard on `127.0.0.1:4317`. **Policies** is its own row in the sidebar. Its header counts your advise, block and pending rules beside the engine rules loaded from disk, and a **Guards** tile reads `4/4` while all four hard guards are on. **New policy** opens the one authoring form.

<div class="docs-callout tip">

**Tip.** Start at the `advise` tier, the default. Reach for `block` only when you want a merge stopped outright, because a blocked run needs you to come back to it.

</div>

The page is two columns, and only the left one is yours:

![The Your policies column and the Deterministic engine card. Two rules are tagged advise: one forbidding console.log in source files, one requiring unknown keys to be rejected at the boundary. Below, a card reads no rules in .vibestrate/policies/*.yml.](/media/docs/scoped/policies-your.png)

**Your policies** is what you author, and a fresh project starts with it empty. **Deterministic engine** under it is read-only: what the files in `.vibestrate/policies/` currently contribute. On the right sit three switch groups and a patch checker, led by the four guards that ship on:

![The Hard guards column. Four switches, all on: forbid main-branch writes, forbid secrets access, forbid auto-push, forbid auto-merge. Forbid secrets access is annotated: covers .env and key files.](/media/docs/scoped/policies-hard.png)

<div class="docs-callout">

**Did you know?** An `advise` rule is enforced by a model, and that is on purpose. A regex for "no em-dashes" is exact but brittle; a model generalises to the paraphrases a pattern would miss. `block` is the regex tier, which is why it only ever reads the lines a run added.

</div>

## The tiers

<div class="docs-cards">

**advise** - the default. The rule goes to both sides of the change. A violation written anyway is flagged and rides the normal review and fix loop. It never blocks a merge on its own.

**block** - a regex matched against the lines the run **added**, not a model verdict. On a match the run lands `blocked` with the reason shown, even if the reviewer approved. It scans from the run's fork point, so mid-run commits are caught, and skips secret-like files. A diff it cannot read blocks rather than waves through.

</div>

A block is **owner-only**. The supervisor can *propose* an advise rule from a consult, never a hard block, and a proposal lands *pending* until you confirm it.

<div class="docs-callout warn">

**A broken block matcher stops the project, not the merge.** No matcher, one over 256 characters, or one that is not a valid regular expression is refused when you write it and again every time `project.yml` loads, so the config fails with the reason rather than shipping a gate that looks armed. One that reaches the gate anyway is treated as inert and recorded as a `supervisor.policy_block` event. Dry-run a matcher from **Test** in the form, or with `vibe policies test`.

</div>

## Going deeper

### Writing one

**New policy** opens the one authoring form: a plain-English rule field, a **Draft** button beside it, and an `advise` / `block` picker. An advise rule takes an optional suggested fix, the correction the reviewer names when it flags the diff; a block rule takes a matcher regex and its flags. **Add policy** writes it, live on the next review with no confirm step, since you authored it. Each row underneath shows its tier and either its matcher or its stated fix.

**Test** opens **Test this matcher**, with **Test snippet** against pasted text and **Test against recent runs**; nothing is written and matched lines are redacted. A block row in the list carries the same test on its own flask button. Two shortcuts fill the same form: **Draft** turns your English sentence into a filled-in draft, and **Suggest from recent runs** reads recent diffs for candidates that **Adopt** prefills. A model may propose a tier and a matcher; committing a block stays your press of Add policy.

### A rule the supervisor proposed

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

A rule the supervisor proposes sits at the top of your list tagged `proposed`, with **Confirm** and **Reject** on its row. The tier is fixed for that path: a proposed rule is always `advise` with no matcher, whatever the answer suggested.

### Both sides see an advise rule

A code-writing seat is told the rules bind the code it is about to write, and to comply *in this change*, explicitly not to hunt for pre-existing violations elsewhere - so a policy does not quietly turn into a refactor. A reviewer is told to verify the diff against the same rules and flag every violation with its location and your stated correction.

The wording differs, the selection does not: a rule can never bind a writer without also being checkable by a reviewer, and an unconfirmed rule reaches neither. That matters for what a run costs, because a rule the writer never sees gets violated and then removed by a review, fix and re-review round trip.

A rule with no lens scope goes into every run; a lens-scoped one applies only when the run's active review lenses include one it names. At most **12** rules reach a single turn, and anything past that is counted as dropped in the run's `supervisor.policy_advise` event, so a long list thins out silently unless you read the event.

### Soft rules and hard gates

Policies are the *soft* surface, owner conventions. Two harder things sit beside them on the same page.

The **Deterministic engine** card reads the content rules in `.vibestrate/policies/*.yml`, which gate patch content at apply time; those stay file-based and are not authored from the browser. The **Hard guards** group carries the four switches above, whose job is to declare the project's invariants. Read that declaration narrowly: the snapshot carrying these flags has two readers, the dashboard's project endpoint and the context consult is answered from, so the supervisor and the consult answerer see them and `vibe doctor` reads the config itself. A run's implementer and reviewer seats never do.

Turning one off does not unlock the behaviour it names. Nothing pushes for you either way, nothing merges without an explicit human confirmation - the guided merge and `vibe integrate` refuse outright without it - and the secret-bearing-diff refusal runs regardless. What changes is that the supervisor is no longer told, and the Guards tile drops below `4/4`.

A soft policy can only *add* a check, never relax one. [Safety](/docs/concepts/safety) has the checkpoint all of this feeds.

### Automation

The interactive shell (`vibe`, or `vibe shell`) has no policies screen; its **Config** page shows the resolved policy block read-only. Every action on the page has a `vibe policies` subcommand behind it, for scripting a rule into a setup or a repo template.

```bash
vibe policies add no-em-dash \
  "do not use em-dash characters" \
  --fix "use a hyphen"

vibe policies add no-eyebrow "no eyebrow labels" \
  --block --matcher "SectionEyebrow"

vibe policies test no-eyebrow --recent   # what would it block?
vibe policies list
vibe policies confirm <id>  # adopt a proposal
vibe policies reject <id>   # discard a proposal
vibe policies remove <id>
```

`vibe policies draft "<rule in English>"` and `vibe policies suggest` are the form's two shortcuts, drafts only until you adopt one with `policies add`. `vibe policies config` carries the same switches as the three groups on the page, and `vibe consult` proposes a pending rule the same way the panel does.

A plain `vibe run "<prompt>"` needs zero policies; a project with none runs exactly as before. Earlier versions scoped these rules to a supervisor (`personas.<id>.preferences`); they are now project-level. On an older config, run `vibe policies migrate` once, or it fails to load with a message pointing you here.
