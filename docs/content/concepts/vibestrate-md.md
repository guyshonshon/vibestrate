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

It is durable, project-aware guidance, and it is **advisory**: it shapes how work is planned, and it can never override a code-enforced [policy](/docs/concepts/safety).

<div class="docs-callout warn">

**Only one surface reads it today: [[consult]].** Ask "should this use a heavier review?" and the answer is grounded in your manual rather than guesswork. **Runs themselves do not read it.** A rule you need every agent to follow on every turn belongs in `.vibestrate/rules.md` instead.

</div>

<div class="docs-callout tip">

**Tip.** Keep it short and prune it. This file is read as context, so every stale paragraph is noise competing with the parts that still matter. A page that is mostly out of date is worse than no page.

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

**Did you know?** It is committed, so it travels with the repo. A teammate who clones the project gets the same answers you do, which is the difference between project knowledge and something living in one person's head.

</div>


## Going deeper

### What goes in it

Keep it concise and prune it. Suggested sections, written in plain prose:

```md
# VIBESTRATE.md

### Project Model
What this project is, its domains, architecture
boundaries, critical flows.

### Development Commands
Install, test, typecheck, lint, build, run
locally - in order.

### Orchestration Preferences
Preferred flows and crews; when to use heavier
review; when to stay lean.

### Risk Rules
When to propose sandbox mode, approval gates,
isolated execution, extra validation. (e.g.
"propose sandbox mode when a task touches
provider execution or secret/credential paths.")

### Codebase Conventions
### Known Constraints
### Lessons Learned
```

### How it ranks against other guidance

It is distinct from `.vibestrate/rules.md`, and the precedence is explicit:

| Layer | What it is | Enforced? | Read when |
| --- | --- | --- | --- |
| **Policy** (`.vibestrate/policies/`) | Hard, code-enforced gates | Yes - code | Every run |
| **`.vibestrate/rules.md`** | Prompt guidance for roles | No - advisory | Every agent turn |
| **`VIBESTRATE.md`** | Your durable project model | No - advisory | You ask Consult |

The rightmost column is the one people get wrong. A rule that must reach the agents doing the work goes in `rules.md`. `VIBESTRATE.md` is what you want the advisor to know when you ask it something.

### Ask it questions

You don't only write to VIBESTRATE.md. You can also ask about your project and get an answer grounded in it. That advisor is [Consult](/docs/concepts/consult); it answers from the manual and can propose an addition to it, but applying one is your call - via `vibe guide apply <id>` or the dashboard.

### The codebase map: machine-owned, not authored

Next to VIBESTRATE.md sits a different kind of memory: `.vibestrate/CODEBASE.md` and `.vibestrate/codebase-map.json`, regenerated on demand by `vibe learn` (and best-effort by `vibe init`). Where VIBESTRATE.md is *your* intent - project model, conventions, lessons - the codebase map is a deterministic scan: stack, scripts, top-level layout, languages, entry points, best-effort HTTP routes, and tooling markers. Nobody writes it by hand; regenerating it (`vibe learn`) always produces the same map from the same repo state, so there is nothing to keep in sync.

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

The map grounds the planner - injected once per run alongside the project's ledger digest - and Consult, so both reason from the real shape of your project instead of asking you to describe it. Judges (review, verify) stay clean-room and never see it, the same isolation VIBESTRATE.md gets. It refreshes automatically whenever a run reaches a terminal outcome, and marks itself stale in `vibe learn show` when your `HEAD` has moved since it was generated.

```bash
vibe learn        # regenerate the map
vibe learn show   # print CODEBASE.md
```

### Who gets the map

The planner, by default, and only the planner. That is deliberate rather than a limitation: every other role is standing *in* the worktree, holding a plan that already names the files, running an agent CLI that opens them natively. Handing those roles a generated summary costs tokens on every turn and gives them a second, staler account of a repo they can already read.

The planner is the exception because it has to name real files *before* it has read anything.

Widen the audience when the crew cannot explore for itself - a small local model, a sandbox with no file tools - or when the flow has no planner seat at all. `express` and `quality-arbitration` are both in that category, so neither sees a map today whatever else is configured:

```yaml
codebaseMapRoles: [planner, implementer]
```

Names are crew role ids. Each listed role is oriented once per run, so a role taking several turns does not pay for it again.

Related: [[consult]], [[safety]], [[configuration]].
