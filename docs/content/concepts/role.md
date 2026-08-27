---
title: Role
description: One worker in your crew - what it does, what it may touch, and which model it runs on.
slug: concepts/role
---

## In simple words

A **Role** is one worker on your [[crew]]. Think job description, not person: it says what this worker does, which kinds of step it may pick up, and how strong a model it runs on.

Open **Crew** in the dashboard sidebar, pick a crew, and the **Roles** section is a card per worker. Each card is the whole role, editable where it stands: **Seats it takes**, **Profile (runtime)**, a permissions control, **Skills**, and **Instructions**.

<div class="docs-callout tip">

**Tip.** The permissions control on the card is what decides whether this worker can change your code. Planner, architect and verifier ship **Read only**, and the reviewer ships `review_exec` - it runs commands but never writes. Only the executor and fixer are set to **Can write**, and only inside the run's [[worktree]].

</div>

![A role card for Planner. A Seats it takes row lists ten chips with planner highlighted. A Profile runtime row reads claude balanced, ok medium, with New profile and Read only controls. Below that, empty Skills and a collapsed Instructions section.](/media/docs/scoped/role-card.png)

A role is its [[seat]]s, its [[profile]], its permission, its instructions and its [[skill]]s.

<div class="docs-callout">

**Did you know?** Named roles are what make a run inspectable. The planner only plans and the reviewer only reviews, so when something goes wrong you can see which worker did it. It is also what lets you put a different vendor on review, so the reviewer does not share the writer's blind spots.

</div>

## The six that ship

`vibe init` writes six roles. Each fills the seat its id names, plus any others listed. A default run seats three of them - planner, executor and reviewer. The `deep` flow is what uses all six.

<div class="docs-cards">

**`planner`**
Reads the task and produces a structured plan.

**`architect`**
Expands the plan with module boundaries and interfaces.

**`executor`**
Also fills `implementer` and `builder`. Edits files in the worktree, and self-reviews its own diff before hand-off.

**`fixer`**
`deep`'s answer to review findings, without rebuilding from scratch. A default run sends findings back to the executor instead.

**`reviewer`**
Also fills `challenger`. Judges the execution against the plan and the project rules; returns APPROVED, CHANGES_REQUESTED or BLOCKED.

**`verifier`**
Also fills `arbiter`. `deep`'s final gate before `merge_ready`.

</div>

## Permissions

<div class="docs-cards">

**Read only** (`read_only`)
Reads and reasons, never writes a file.

**`review_exec`**
Runs commands inside the worktree - the tests, the build - with no edit tools. What the scaffolded reviewer ships with.

**Can write** (`code_write`)
May edit files inside the run's worktree.

</div>

That setting decides what the seat's turn may do. For the agent to actually write, the underlying CLI has to allow it too: on a `claude-code` [[provider]], a `code_write` seat's turn gets `--permission-mode acceptEdits`. A `review_exec` turn gets the same mode plus an explicit command grant, so its checks actually run headless instead of hanging on an approval nobody can answer. `Edit`, `Write` and `NotebookEdit` are cut from its invocation, which removes the obvious way to change files but is not a wall - a shell can still write. What holds the line is that a shell-capable turn is diff-gated exactly like a writing one: its changes are snapshotted, scanned for secrets, put through the broker and can be rolled back. Read-only seats get no write grant at all.

## Role, profile, provider

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

One profile can back many roles, and one provider can back many profiles. **New profile** on a role card mints one and assigns it in a single step, so a `claude-cheap` gets created exactly where a role needs it.

## How its prompt is assembled

Vibestrate stacks these into one prompt before the role runs:

<div class="docs-flow">
<div><b>Role template</b><span>The Role's prompt template, e.g. .vibestrate/roles/planner.json.</span></div>
<div><b>Project rules</b><span>The project rules file, .vibestrate/rules.md.</span></div>
<div><b>Skills</b><span>Any attached skills, configured plus per-run.</span></div>
<div><b>Task</b><span>The current task description.</span></div>
<div><b>Prior artifacts</b><span>The named artifacts from previous Steps: plan, architecture, diff, validation.</span></div>
</div>

The run records the resolved role per step (`resolvedRoleId`, `resolvedRoleLabel`) in `flow.json`.

## Writes are gated

Three dashboard requests write a role, and every one crosses the Action Broker as a `file.write`: `PATCH /api/crews/:crewId/roles/:roleId` for the wiring in `project.yml` (audited `role-fields`), `PUT .../context` for the instruction text (`role-prompt`), and `POST /api/skills/:skillId/assign` for the skills list (`role-skills`).

Gating all three is what makes a denying policy hold across one Save in the crew editor, which issues them as separate requests. With only the prompt gated, a policy refused the instructions while a Read only to Can write flip landed. Skill assignment is in the set for the same reason: a skill is instruction text replayed into every turn and can carry MCP servers, so assigning one hands a role new tools.

**A role lives in two files, and one `pathGlob` rule covers both.** Every write presents the same pair of paths - `subject.path`, where the bytes land, and `subject.files`, the pair the grant spans - and a `pathGlob` is tested against all of them. A rule scoped to `**/.vibestrate/roles/**` and one scoped to `**/project.yml` each refuse all three. Such a rule is **wider than it reads**: one written to freeze a role's instructions also refuses a label rename, and `require_approval` is not accepted on `file.write`, so there is no softer landing than a refusal.

**The CLI is deliberately outside this.** `vibe init`, `vibe config`, `vibe crew` and `vibe skills assign` write the same config through the same code with no gate. A gate there could refuse a first-time init before a project has any policy to consult, and those callers are you at your own keyboard rather than a page in a browser.

## From the terminal

`vibe shell` lists the roles on its `[3] Crew` page, and its `[8] Skills` page attaches a skill to one with the arrow keys. On the command line:

```bash
vibe crew show default              # every role, its profile, its seats
vibe skills assign <role> <skill>   # attach a skill to one role
vibe config show                    # the crews block as loaded
```

A role is a row inside a crew, under that crew's own `roles` map. There is no top-level `roles` map, and the role file it points at is **JSON, not Markdown**, with an `id` matching its filename. [The annotated crew config](/docs/reference/crew-config) shows both, field by field.

Next: [[profile]] is how strong or expensive a role runs.
