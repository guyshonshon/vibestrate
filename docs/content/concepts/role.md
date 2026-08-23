---
title: Role
description: One worker in your crew - what it does, what it may touch, and which model it runs on.
slug: concepts/role
---

## In simple words

A **Role** is one worker on your [[crew]]. Think job description, not person: it says what this worker does, which kinds of step it may pick up, and how strong a model it runs on.

Here is one, as the crew page shows it:

![A role card for Planner. A Seats it takes row lists ten chips with planner highlighted. A Profile runtime row reads claude balanced, ok medium, with New profile and Read only controls. Below that, empty Skills and a collapsed Instructions section.](/media/docs/scoped/role-card.png)

Four things, and that is the whole of a role: the [[seat]]s it will take, the [[profile]] it runs on, whether it may write, and its instructions.

<div class="docs-callout tip">

**Tip.** `Read only` in the corner is the setting that decides whether this worker can change your code. Planner, architect, reviewer and verifier ship read-only. Only the executor and fixer can write, and only inside the run's [[worktree]].

</div>

## What each of the six does

`vibe init` writes six. Each fills the seat its id names, plus any others listed.

<div class="docs-cards">

**`planner`**
Reads the task and produces a structured plan.

**`architect`**
Expands the plan with module boundaries and interfaces.

**`executor`**
Also fills `implementer` and `builder`. Edits files in the worktree.

**`fixer`**
Addresses review findings without rebuilding from scratch.

**`reviewer`**
Also fills `challenger`. Critiques the diff; returns APPROVED, CHANGES_REQUESTED or BLOCKED.

**`verifier`**
Also fills `arbiter`. The final gate before `merge_ready`.

</div>

<div class="docs-callout">

**Did you know?** Splitting work into named roles is what makes a run inspectable. The planner only plans and the reviewer only reviews, so when something goes wrong you can see which worker did it. It is also what lets you mix models: a strong one for planning, a cheap one for the mechanical edits, a different vendor for review so it does not share the writer's blind spots.

</div>

## Permissions

<div class="docs-cards">

**`read_only`**
Reads and reasons, never writes a file.

**`code_write`**
May edit files inside the run's worktree.

</div>

That setting gates Vibestrate's own Action Broker. For the agent to actually write, the underlying CLI has to allow it too: on a `claude-code` [[provider]], a `code_write` seat's turn gets `--permission-mode acceptEdits`. Read-only seats get no write grant at all.

## Going deeper

### Role, profile, provider

Easy to mix up, so plainly:

- A **role** is the behaviour. The Reviewer.
- A **[[profile]]** is how strong or expensive it runs. `claude-balanced`.
- A **[[provider]]** is the tool behind that profile. `claude`.

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

One profile can back many roles, and one provider can back many profiles.

### Where a role lives

A role is a row inside a crew, under that crew's own `roles` map. There is no top-level `roles` map.

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

The role file is **JSON, not Markdown**, and its `id` has to match its filename:

```json
{
  "schemaVersion": 1,
  "id": "reviewer",
  "prompt": "You review diffs..."
}
```

The `prompt` string is handed to the model verbatim. Everything else stays in `project.yml`, so several crews can point at the same role file and differ only in the profile they run it on.

### How its prompt is assembled

Vibestrate stacks these into one prompt before the role runs:

<div class="docs-flow">
<div><b>Role template</b><span>The Role's prompt template, e.g. .vibestrate/roles/planner.json.</span></div>
<div><b>Project rules</b><span>The project rules file, .vibestrate/rules.md.</span></div>
<div><b>Skills</b><span>Any attached skills, configured plus per-run.</span></div>
<div><b>Task</b><span>The current task description.</span></div>
<div><b>Prior artifacts</b><span>The named artifacts from previous Steps: plan, architecture, diff, validation.</span></div>
</div>

### Writes are gated

Three requests write a role, and every one of them crosses the Action Broker as a `file.write`:

<div class="docs-cards">

**`PATCH /api/crews/:crewId/roles/:roleId`**
The wiring in `project.yml` - profile, seats, permissions, label, skills. Audited as `role-fields`.

**`PUT /api/crews/:crewId/roles/:roleId/context`**
The instruction text. Audited as `role-prompt`.

**`POST /api/skills/:skillId/assign`**
The skills list, from the Skills page. Audited as `role-skills`.

</div>

Gating all three is what makes a denying policy hold across one Save in the crew editor, which issues them as separate requests. With only the prompt gated, a policy refused the instructions while a `read_only` to `code_write` flip landed. Skill assignment belongs in the set for the same reason: a skill is instruction text replayed into every turn and can carry MCP servers, so assigning one hands a role new instructions and new tools. That is the same class of authority as a prompt edit, not a lesser one.

**A role lives in two files, and one `pathGlob` rule covers both.** Every write presents the same pair of paths - `subject.path`, where the bytes land, and `subject.files`, the pair the grant spans - and a `pathGlob` is tested against all of them. A rule scoped to `**/.vibestrate/roles/**` and one scoped to `**/project.yml` each refuse all three.

Two things follow. Such a rule is **wider than it reads**: one written to freeze a role's instructions also refuses a label rename, and `require_approval` is not accepted on `file.write`, so there is no softer landing than a refusal. And the pair is resolved from the *validated* config, so a `prompt:` written as a YAML alias or reached through a merge key names the same file a plain string does.

**The CLI is deliberately outside this.** `vibe init`, `vibe config`, `vibe crew` and `vibe skills assign` write the same config through the same code with no gate. A gate there could refuse a first-time init before a project has any policy to consult, and those callers are you at your own keyboard rather than a page in a browser.

The run records the resolved role per step (`resolvedRoleId`, `resolvedRoleLabel`) in `flow.json`.

Next: [[profile]] is how strong or expensive a role runs.
