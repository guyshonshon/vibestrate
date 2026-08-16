---
title: Role
description: One worker in your Crew - the instructions it follows, the model it runs on, and the kinds of step it can handle.
slug: concepts/role
---

A **Role** is one worker in your Crew, and it says how that worker behaves and which kinds of step it can take on.

Think of a Role like a job description on a team. The description says what this person does and which tasks they are allowed to pick up. It doesn't name the actual person. A Role works the same way: it points at a **[[profile]]** (which decides the model), and lists the **[[seat]]s** (the kinds of step) it can fill in a [[flow]].

**Permissions are the field that decides whether a Role can change your code.**

<div class="docs-cards">

**`read_only`**
Reads and reasons, but never writes a file. The planner, architect, reviewer and verifier ship this way.

**`code_write`**
May edit files inside the run's [[worktree]]. The executor and fixer ship this way.

</div>

That setting gates Vibestrate's own action broker. For the agent to actually write, the underlying CLI has to allow it too: on a `claude-code` [[provider]], a `code_write` seat's turn gets `--permission-mode acceptEdits` so the headless CLI can apply edits. Read-only seats get no write grant.

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
{
  "schemaVersion": 1,
  "id": "reviewer",
  "prompt": "You review diffs..."
}
```

The `prompt` string is the instruction text, handed to the model verbatim. Everything else about the Role - which Profile it runs on, which Seats it fills, its permissions and skills - stays in `project.yml`, so several Crews can point at the same role file and differ only in the Profile they run it on.

## Role vs Profile vs Provider

These three are easy to mix up:

- A **Role** is the behavior - the Reviewer.
- A **[[profile]]** is how strong or expensive it runs - `claude-balanced`.
- A **[[provider]]** is the tool behind the Profile - `claude`.

They sit next to each other in one chain, which starts back at the Flow:

<svg viewBox="0 0 560 52" width="100%" style="max-width:560px;height:auto" role="img" aria-label="A Flow step names a Seat, your Crew's Role fills that Seat, the Role names a Profile, and the Profile names a Provider. The Role is the middle link.">
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="0.5" y="0.5" width="88" height="45" rx="8"/>
    <rect x="111.5" y="0.5" width="88" height="45" rx="8"/>
    <rect x="333.5" y="0.5" width="116" height="45" rx="8"/>
    <rect x="472.5" y="0.5" width="87" height="45" rx="8"/>
  </g>
  <g fill="currentColor" fill-opacity="0.07" stroke="currentColor" stroke-opacity="0.7" stroke-width="1">
    <rect x="222.5" y="0.5" width="88" height="45" rx="8"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.5" stroke-width="1">
    <path d="M92.5 23 H102.5"/>
    <path d="M203.5 23 H213.5"/>
    <path d="M314.5 23 H324.5"/>
    <path d="M453.5 23 H463.5"/>
  </g>
  <g fill="currentColor" fill-opacity="0.5">
    <polygon points="102.5,19.5 108,23 102.5,26.5"/>
    <polygon points="213.5,19.5 219,23 213.5,26.5"/>
    <polygon points="324.5,19.5 330,23 324.5,26.5"/>
    <polygon points="463.5,19.5 469,23 463.5,26.5"/>
  </g>
  <g fill="currentColor" font-size="12" text-anchor="middle">
    <text x="44.5" y="19">Flow step</text>
    <text x="155.5" y="19">Seat</text>
    <text x="266.5" y="19">Role</text>
    <text x="391.5" y="19">Profile</text>
    <text x="516" y="19">Provider</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="11" font-family="ui-monospace,monospace" text-anchor="middle">
    <text x="44.5" y="35">review</text>
    <text x="155.5" y="35">reviewer</text>
    <text x="266.5" y="35">reviewer</text>
    <text x="391.5" y="35">claude-balanced</text>
    <text x="516" y="35">claude</text>
  </g>
</svg>

One Profile can back many Roles, and one Provider can back many Profiles.

## Why split work into Roles

Naming Roles is what makes the loop inspectable: the planner only plans, the reviewer only reviews. Because each Role names a Profile, you can also mix models - a strong reasoning Profile for the planner, a cheap fast one for the executor, a different vendor for the reviewer so it doesn't share the executor's blind spots.

## The six built-in roles (default crew)

Each one fills the seat its id names, plus any others listed here.

<div class="docs-cards">

**`planner`**
Reads the task and produces a structured plan.

**`architect`**
Expands the plan with module boundaries and interfaces.

**`executor`**
Also fills the `implementer` and `builder` seats. Edits files in the worktree.

**`fixer`**
Addresses review findings without rebuilding from scratch.

**`reviewer`**
Also fills the `challenger` seat. Critiques the diff; returns APPROVED / CHANGES_REQUESTED / BLOCKED.

**`verifier`**
Also fills the `arbiter` seat. Final gate before `merge_ready`.

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

The run records the resolved Role per Step (`resolvedRoleId`, `resolvedRoleLabel`) in `flow.json`.

Three requests write a Role, and every one of them is gated:

<div class="docs-cards">

**`PATCH /api/crews/:crewId/roles/:roleId`**
The Role's wiring in `project.yml` - its profile, seats, permissions, label and skills. Audited as `role-fields`, together with the field names it touched.

**`PUT /api/crews/:crewId/roles/:roleId/context`**
The role file's instruction text. Audited as `role-prompt`.

**`POST /api/skills/:skillId/assign`**
The Role's skills list in `project.yml`, from the Skills page. Audited as `role-skills`, naming the skill and the direction. `/unassign` works the same way.

</div>

The context endpoint works in the instruction *text*: `GET` hands back what is inside the prompt, and `PUT` takes plain `content` and rebuilds the JSON envelope around it, so an edit can't produce a role file that only fails later, on the run that loads it. The file's id comes from the filename the config points at, not from the crew's key for the Role - several crews can share one role file.

Each request crosses the Action Broker as a `file.write` and answers a denying policy with `403` and the policy's message, leaving its file untouched. Gating all three is what makes a denying policy hold across one Save in the Crew editor, which issues them as separate requests: with only the prompt gated, a policy refused the instructions while a `read_only` -> `code_write` flip landed. Skill assignment belongs in the set for the same reason - it writes one of the fields the `PATCH` gates, from a different page. A skill is instruction text replayed into every turn the Role takes and can carry MCP servers, so an assignment hands a Role new instructions and new tools: the same class of authority as a prompt edit, not a lesser one.

**A Role lives in two files, and one `pathGlob` rule covers both.** Every write to a Role presents the same pair of paths - `subject.path`, the file the bytes land in, and `subject.files`, the pair the grant spans - and a `pathGlob` is tested against all of them. So a rule scoped to `**/.vibestrate/roles/**` and a rule scoped to `**/project.yml` each refuse all three. Splitting them would mean a rule that stops the instructions while a `read_only` -> `code_write` flip lands, with the refusal claiming the write was stopped.

Two things follow. Such a rule is **wider than it reads** - one written to freeze a Role's instructions also refuses a label rename, and `require_approval` is not accepted on `file.write`, so there is no softer landing than a refusal. And the pair is resolved from the *validated* config, so a `prompt:` written as a YAML alias or reached through a merge key names the same file a plain string does.

**CLI and terminal shell are deliberately outside this.** `vibe init`, the `vibe config` and `vibe crew` commands and `vibe skills assign` write the same config through the same code with no gate - a gate there could refuse a first-time init before a project has any policy to consult, and those callers are you at your own keyboard rather than a page in a browser.

Related:

- [[crew]] - the roster a Role belongs to.
- [[seat]] - what a Role fills in a Flow.
- [[profile]] - how strong or expensive a Role runs.
- [[provider]] - the CLI behind the Profile.
- [[skill]] - what a Role reads as domain context.
