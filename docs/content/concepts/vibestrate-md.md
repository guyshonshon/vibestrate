---
title: VIBESTRATE.md
description: A committed manual at your project root, so you never re-explain your project.
slug: concepts/vibestrate-md
---

## In simple words

`VIBESTRATE.md` is a committed file at your project root saying what this project is and how you like it run: its domains, its commands, the conventions you keep having to repeat.

```markdown
# VIBESTRATE.md

## Project Model
A billing service. Money flows through `src/ledger/` and nothing else writes to it.

## Development Commands
pnpm install · pnpm typecheck · pnpm test · pnpm build

## Risk Rules
Propose sandbox mode when a task touches provider execution or credential paths.
```

You read it back through **[[consult]]** - the orb in the corner of every dashboard page. Ask "should this use a heavier review?" and the answer is grounded in your manual rather than guesswork.

<div class="docs-callout warn">

**Consult is the only surface that reads it. Runs do not.** A rule every agent must follow on every turn belongs in `.vibestrate/rules.md` instead. Either way the manual is advisory: it shapes how work is planned, and can never override a code-enforced [policy](/docs/concepts/safety).

</div>

<div class="docs-callout tip">

**Tip.** Prune it. The file is read as context, so every stale paragraph competes with the parts that still matter, and a page mostly out of date is worse than no page.

</div>

## What it is good for

<div class="docs-cards">

**Explaining the project once**
The domains, the boundaries, what this codebase is actually for.

**Your commands, in order**
Install, test, typecheck, lint, build.

**When to be careful**
Which kinds of change deserve a heavier review.

**Lessons learned**
The constraints someone new would trip over.

</div>

<div class="docs-callout">

**Did you know?** It is committed, so it travels with the repo. A teammate who clones the project gets the same answers you do, which is the difference between project knowledge and something in one person's head.

</div>


## Going deeper

### Ask it something

`vibe ui`, then the orb, or the Consult page directly. Its **This project** side answers from your manual, your config and your recent runs; **Work in Vibestrate** answers about the product itself.

An answer can carry a proposed addition to the manual, and nothing is written until you press **Apply to VIBESTRATE.md**. Rejecting one keeps it on record rather than deleting it.

`vibe shell` has the same Consult tab, with `a` to apply a proposal, `x` to reject and `r` to refresh. On the CLI:

```bash
vibe consult "should this use a heavier review?"
vibe guide show                # print the manual
vibe guide init                # scaffold a starter one
vibe guide proposals           # open proposals
vibe guide apply <id>          # append a proposal's text
```

### What goes in it

Headings that earn their place, written in plain prose. Project Model, Development Commands and Risk Rules, as in the sample at the top, plus any of:

```md
### Orchestration Preferences
Preferred flows and crews; when to go heavier.

### Codebase Conventions
### Known Constraints
### Lessons Learned
```

### How it ranks against other guidance

| Layer | What it is | Enforced? | Read when |
| --- | --- | --- | --- |
| **Policy** (`.vibestrate/policies/`) | Hard, code-enforced gates | Yes - code | Every run |
| **`.vibestrate/rules.md`** | Prompt guidance for roles | No - advisory | Every agent turn |
| **`VIBESTRATE.md`** | Your durable project model | No - advisory | You ask Consult |

### The codebase map: machine-owned, not authored

Next to the manual sits a different kind of memory: `.vibestrate/CODEBASE.md` and `.vibestrate/codebase-map.json`. Where VIBESTRATE.md is *your* intent, the map is a deterministic scan - stack, scripts, layout, languages, entry points, best-effort HTTP routes, tooling markers. Nobody writes it by hand, and the same repo state always produces the same map, so there is nothing to keep in sync.

<svg viewBox="0 0 560 136" width="100%" style="max-width:560px;height:auto" role="img" aria-label="Two memories with different authors and different readers: you write VIBESTRATE.md and Consult reads it, while vibe learn regenerates the codebase map, which Consult and the planner both read.">
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="1" y="1" width="260" height="48" rx="8"/>
    <rect x="310" y="1" width="249" height="48" rx="8"/>
    <rect x="1" y="79" width="260" height="48" rx="8"/>
    <rect x="310" y="79" width="249" height="48" rx="8"/>
    <path d="M261 25H310M261 103H310"/>
  </g>
  <g fill="currentColor" fill-opacity="0.28" stroke="none">
    <path d="M304 21 310 25 304 29Z"/>
    <path d="M304 99 310 103 304 107Z"/>
  </g>
  <g fill="currentColor" font-size="12" font-family="ui-monospace,monospace" text-anchor="middle">
    <text x="131" y="26">VIBESTRATE.md</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="11" text-anchor="middle">
    <text x="131" y="42">you write it, and commit it</text>
  </g>
  <g fill="currentColor" font-size="12" text-anchor="middle">
    <text x="434" y="30">Consult reads it</text>
  </g>
  <g fill="currentColor" font-size="12" font-family="ui-monospace,monospace" text-anchor="middle">
    <text x="131" y="104">.vibestrate/CODEBASE.md</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="11" text-anchor="middle">
    <text x="131" y="120">vibe learn regenerates it</text>
  </g>
  <g fill="currentColor" font-size="12" text-anchor="middle">
    <text x="434" y="108">Consult and the planner</text>
  </g>
</svg>

It has a screen of its own: **Codebase**, then the **Map** chip above the file tree. Project type, package manager, tracked-file and route counts, then **Commands**, **Layout**, **Entry points** and **HTTP routes (best effort)**. **Generate map** on a project without one, **Refresh map** after that, and a stale marker once your `HEAD` has moved past the version on disk.

It also refreshes itself whenever a run reaches a terminal outcome. `vibe learn` regenerates it from a terminal; `vibe learn show` prints `CODEBASE.md` with the same staleness note.

### Who gets the map

The planner, by default, and only the planner. That is deliberate: every other role stands *in* the worktree, holding a plan that already names the files, running an agent CLI that opens them natively. A generated summary costs those roles tokens every turn and gives them a second, staler account of a repo they can already read. The planner has to name real files *before* it has read anything, which is why it is the exception.

Widen the audience when the crew cannot explore for itself - a small local model, a sandbox with no file tools - or when the flow has no planner seat at all. `express`, `scaffold` and `quality-arbitration` are all in that category, so none of them sees a map whatever else is configured:

```yaml
codebaseMapRoles: [planner, implementer]
```

Names are crew role ids, and each listed role is oriented once per run, so a role taking several turns does not pay again.

### Related

[[consult]], [[safety]], [[configuration]].
