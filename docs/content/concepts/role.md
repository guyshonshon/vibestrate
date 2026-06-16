---
title: Role
description: One worker in your Crew - the instructions it follows, the model it runs on, and the kinds of step it can handle.
section: concepts
slug: concepts/role
---

A **Role** is one worker in your Crew, and it says how that worker behaves and which kinds of step it can take on.

<div class="docs-callout">

**A Role is a job description, not a person.** It says what this worker does and which tasks it can pick up, without naming who fills it. It points at a **[[profile]]** (which decides the model) and lists the **[[seat]]s** (the kinds of step) it can fill in a [[flow]].

</div>

Think of a Role like a job description on a team. The description says what this person does and which tasks they are allowed to pick up. It doesn't name the actual person. A Role works the same way: it points at a **[[profile]]** (which decides the model), and lists the **[[seat]]s** (the kinds of step) it can fill in a [[flow]].

## What a Role carries

A Role is one row inside a [[crew]], under `crews.<crewId>.roles`. There is no top-level `roles` map. Each Role carries:

```yaml
crews:
  default:
    roles:
      reviewer:
        label: Reviewer
        seats: [reviewer, challenger]
        profile: opus-deep
        prompt: .vibestrate/roles/reviewer.md
        permissions: read_only
        skills: []
```

- A `prompt` file with its instructions.
- A `profile` it runs on (it points at a Profile, never directly at a provider).
- A `seats` list of step kinds it can fill.
- A `permissions` profile and any attached `skills`.

## Role vs Profile vs Provider

These three are easy to mix up:

- A **Role** is the behavior - the Reviewer.
- A **[[profile]]** is how strong or expensive it runs - `opus-deep`.
- A **[[provider]]** is the installed CLI behind the Profile - `claude`.

One Profile can back many Roles, and one Provider can back many Profiles.

## Permissions

A Role's `permissions` profile gates Vibestrate's own action broker:

<div class="docs-outcomes">
<div class="docs-outcome ok"><b>read_only</b><span>The Role can read and reason, but never writes files. Reviewers and verifiers use this.</span></div>
<div class="docs-outcome warn"><b>code_write</b><span>The Role may edit files in the worktree. Executors use this.</span></div>
</div>

For the agent to actually write, the underlying CLI must also allow it. On a `claude-code` [[provider]], Vibestrate works this out for you: a `code_write` seat's turn gets `--permission-mode acceptEdits` so the headless CLI can apply edits, while read-only seats (and read-only or strict-apply-only runs) get no write grant. See [[provider]].

## Why split work into Roles

Naming Roles is what makes the loop inspectable: the planner only plans, the reviewer only reviews. Because each Role names a Profile, you can also mix models - a strong reasoning Profile for the planner, a cheap fast one for the executor, a different vendor for the reviewer so it doesn't share the executor's blind spots.

## The six built-in roles (default crew)

<div class="docs-cards">

**`planner`**
Fills the `planner` seat. Reads the task and produces a structured plan.

**`architect`**
Fills the `architect` seat. Expands the plan with module boundaries and interfaces.

**`executor`**
Fills the `implementer`, `executor`, and `builder` seats. Edits files in the worktree.

**`fixer`**
Fills the `fixer` seat. Addresses review findings without rebuilding from scratch.

**`reviewer`**
Fills the `reviewer` and `challenger` seats. Critiques the diff; returns APPROVED / CHANGES_REQUESTED / BLOCKED.

**`verifier`**
Fills the `verifier` and `arbiter` seats. Final gate before `merge_ready`.

</div>

## How a Role's prompt is assembled

Vibestrate stacks these into one prompt before the Role runs:

<div class="docs-flow">
<div><b>Role template</b><span>The Role's prompt template, e.g. .vibestrate/roles/planner.md.</span></div>
<div><b>Project rules</b><span>The project rules file, .vibestrate/rules.md.</span></div>
<div><b>Skills</b><span>Any attached skills, configured plus per-run.</span></div>
<div><b>Task</b><span>The current task description.</span></div>
<div><b>Prior artifacts</b><span>The named artifacts from previous Steps: plan, architecture, diff, validation.</span></div>
</div>

## Going deeper

- The run records the resolved Role per Step (`resolvedRoleId`, `resolvedRoleLabel`) in `flow.json`.
- `PATCH /api/crews/:crewId/roles/:roleId` edits a Role's `profile` / `seats` / `permissions` / `label` / `skills`. The role context (prompt) is read and written at `/api/crews/:crewId/roles/:roleId/context`.
- [[crew]] - the roster a Role belongs to.
- [[seat]] - what a Role fills in a Flow.
- [[profile]] - how strong or expensive a Role runs.
- [[provider]] - the CLI behind the Profile.
- [[skill]] - what a Role reads as domain context.
