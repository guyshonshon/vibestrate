---
title: Role
description: One worker in your Crew - the instructions it follows, the model it runs on, and the kinds of step it can handle.
slug: concepts/role
---

A **Role** is one worker in your Crew, and it says how that worker behaves and which kinds of step it can take on.

Think of a Role like a job description on a team. The description says what this person does and which tasks they are allowed to pick up. It doesn't name the actual person. A Role works the same way: it points at a **[[profile]]** (which decides the model), and lists the **[[seat]]s** (the kinds of step) it can fill in a [[flow]].

**Permissions are the field that decides whether a Role can change your code.** `read_only` reads and reasons but never writes a file - the planner, architect, reviewer and verifier ship this way. `code_write` may edit files inside the run's [[worktree]] - the executor and fixer ship this way. That setting gates Vibestrate's own action broker. For the agent to actually write, the underlying CLI has to allow it too: on a `claude-code` [[provider]], a `code_write` seat's turn gets `--permission-mode acceptEdits` so the headless CLI can apply edits. Read-only seats get no write grant.

## What a Role carries

A Role is one row inside a [[crew]], under that crew's own `roles` map. There is no top-level `roles` map. Each Role carries:

```yaml
crews:
  default:
    roles:
      reviewer:
        label: Reviewer
        seats: [reviewer, challenger]
        profile: claude-balanced
        prompt: .vibestrate/roles/reviewer.json
        permissions: read_only
        skills: []
```

A role file is **JSON, not Markdown**, and its `id` has to match its filename:

```json
{ "schemaVersion": 1, "id": "reviewer", "prompt": "You review diffs..." }
```

The `prompt` string is the instruction text, handed to the model verbatim. Everything else about the Role - which Profile it runs on, which Seats it fills, its permissions and skills - stays in `project.yml`, so several Crews can point at the same role file and differ only in the Profile they run it on.

## Role vs Profile vs Provider

These three are easy to mix up:

- A **Role** is the behavior - the Reviewer.
- A **[[profile]]** is how strong or expensive it runs - `claude-balanced`.
- A **[[provider]]** is the tool behind the Profile - `claude`.

One Profile can back many Roles, and one Provider can back many Profiles.

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
<div><b>Role template</b><span>The Role's prompt template, e.g. .vibestrate/roles/planner.json.</span></div>
<div><b>Project rules</b><span>The project rules file, .vibestrate/rules.md.</span></div>
<div><b>Skills</b><span>Any attached skills, configured plus per-run.</span></div>
<div><b>Task</b><span>The current task description.</span></div>
<div><b>Prior artifacts</b><span>The named artifacts from previous Steps: plan, architecture, diff, validation.</span></div>
</div>

## Going deeper

- The run records the resolved Role per Step (`resolvedRoleId`, `resolvedRoleLabel`) in `flow.json`.
- `PATCH /api/crews/:crewId/roles/:roleId` edits a Role's `profile` / `seats` / `permissions` / `label` / `skills`. The role context (prompt) is read and written at `/api/crews/:crewId/roles/:roleId/context`. That endpoint works in the instruction *text*: `GET` hands back what's inside `prompt`, and `PUT` takes plain `content` and rebuilds the JSON envelope around it, so an edit can't produce a role file that only fails later, on the run that loads it. The file's `id` comes from the filename the config points at, not from the crew's key for the Role - several crews can share one role file. Both are gated: each crosses the Action Broker as a `file.write` and answers a denying policy with `403` and the policy's message, leaving its file untouched. They are told apart in the audit log by `purpose` - `PUT` records `role-prompt` against the role file, `PATCH` records `role-fields` against `project.yml` plus the field names it touched. Gating both is what makes a denying policy hold across one Save in the Crew editor, which issues the two as separate requests: with only `PUT` gated, a policy refused the instructions while a `read_only` -> `code_write` flip landed.
- `POST /api/skills/:skillId/assign` and `/unassign` are gated the same way, and for the same reason. They write a role's `skills` list in the default crew - one of the fields the `PATCH` above gates - from a different page, so leaving them out would have kept a second door open onto a protected field. They record `role-skills` against `project.yml`, naming the skill and the direction. A skill is instruction text replayed into every turn the Role takes and can carry MCP servers, so an assignment hands a Role new instructions and new tools: the same class of authority as a prompt edit, not a lesser one.
- **A Role lives in two files, and one `pathGlob` rule covers both.** Every write to a Role - the prompt `PUT`, the fields `PATCH`, a skill assignment - presents the same pair of paths (`subject.path`, the file the bytes land in, plus `subject.files`, the pair the grant spans), and a `pathGlob` is tested against all of them. So a rule scoped to `**/.vibestrate/roles/**` and a rule scoped to `**/project.yml` each refuse all three. Splitting them would mean a rule that stops the instructions while a `read_only` -> `code_write` flip lands, with the refusal claiming the write was stopped. Two things follow. Such a rule is **wider than it reads** - one written to freeze a Role's instructions also refuses a label rename, and `require_approval` is not accepted on `file.write`, so there is no softer landing than a refusal. And the pair is resolved from the *validated* config, so a `prompt:` written as a YAML alias or reached through a merge key names the same file a plain string does.
- **CLI and terminal shell are deliberately outside this.** `vibe init`, the `vibe config` / `vibe crew` commands and `vibe skills assign` write the same config through the same code with no gate - a gate there could refuse a first-time init before a project has any policy to consult, and those callers are you at your own keyboard rather than a page in a browser.
- [[crew]] - the roster a Role belongs to.
- [[seat]] - what a Role fills in a Flow.
- [[profile]] - how strong or expensive a Role runs.
- [[provider]] - the CLI behind the Profile.
- [[skill]] - what a Role reads as domain context.
