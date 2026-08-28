---
title: Role
description: One worker in your crew - what it does, what it may touch, and which model it runs on.
slug: concepts/role
---

## In simple words

A **Role** is one worker on your [[crew]]. Think job description, not person: it says what this worker does, which kinds of step it may pick up, and how strong a model it runs on.

Open **Crew** in the dashboard sidebar, pick a crew, and the **Roles** section is a card per worker. Each card is the whole role, editable where it stands: **Seats it takes**, **Profile (runtime)**, a permissions control, **Skills**, and **Instructions**.

<div class="docs-callout tip">

**Tip.** The permissions control on the card is what decides whether this worker can change your code. Planner, architect, reviewer and verifier ship **Read only**. Only the executor and fixer are set to **Can write**, and only inside the run's [[worktree]].

</div>

![A role card for Planner. A Seats it takes row lists ten chips with planner highlighted. A Profile runtime row reads claude balanced, ok medium, with New profile and Read only controls. Below that, empty Skills and a collapsed Instructions section.](/media/docs/scoped/role-card.png)

A role is its [[seat]]s, its [[profile]], its permission, its instructions and its [[skill]]s.

<div class="docs-callout">

**Did you know?** Named roles are what make a run inspectable. The planner only plans and the reviewer only reviews, so when something goes wrong you can see which worker did it. It is also what lets you put a different vendor on review, so the reviewer does not share the writer's blind spots.

</div>

## The six that ship

`vibe init` writes six roles. Each fills the seat its id names, plus any others listed.

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

## Permissions

<div class="docs-cards">

**Read only** (`read_only`)
Reads and reasons, never writes a file.

**Can write** (`code_write`)
May edit files inside the run's worktree.

</div>

That setting gates Vibestrate's own Action Broker. For the agent to actually write, the underlying CLI has to allow it too: on a `claude-code` [[provider]], a `code_write` seat's turn gets `--permission-mode acceptEdits`. Read-only seats get no write grant at all.

## Role, profile, provider

- A **role** is the behaviour. The Reviewer.
- A **[[profile]]** is how strong or expensive it runs. `claude-balanced`.
- A **[[provider]]** is the tool behind that profile. `claude`.

<svg viewBox="0 0 500 118" width="100%" style="max-width:720px;height:auto" role="img" font-family="var(--font-sans)" aria-label="A Flow step names a Seat, your Crew's Role fills that Seat, the Role names a Profile, and the Profile names a Provider. The Role is the middle link.">
  <rect x="0" y="20" width="90" height="46" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="45" y="48" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">Flow step</text>
  <rect x="102" y="20" width="90" height="46" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="147" y="48" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">Seat</text>
  <path d="M90 43 L98 43" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="90,38.5 98,43 90,47.5" fill="var(--fg-200)"/>
  <rect x="204" y="20" width="90" height="46" rx="10" fill="var(--bg-200)" stroke="var(--violet-soft)" stroke-width="1.75"/>
  <text x="249" y="48" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">Role</text>
  <path d="M192 43 L200 43" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="192,38.5 200,43 192,47.5" fill="var(--fg-200)"/>
  <rect x="306" y="20" width="90" height="46" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="351" y="48" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">Profile</text>
  <path d="M294 43 L302 43" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="294,38.5 302,43 294,47.5" fill="var(--fg-200)"/>
  <rect x="408" y="20" width="90" height="46" rx="10" fill="var(--bg-200)" stroke="var(--line-strong)" stroke-width="1.25"/>
  <text x="453" y="48" font-size="14" font-weight="600" fill="var(--fg-100)" text-anchor="middle">Provider</text>
  <path d="M396 43 L404 43" fill="none" stroke="var(--fg-200)" stroke-width="2" stroke-linejoin="round"/>
  <polygon points="396,38.5 404,43 396,47.5" fill="var(--fg-200)"/>
  <text x="0" y="96" font-size="11.5" fill="var(--violet-soft)" font-family="var(--font-mono)" text-anchor="start">review  -&gt;  reviewer  -&gt;  reviewer  -&gt;  claude-balanced  -&gt;  claude-code</text>
</svg>

One profile can back many roles, and one provider can back many profiles. **New profile** on a role card mints one and assigns it in a single step, so a `claude-cheap` gets created exactly where a role needs it.

## What a role carries

| Field | What it is |
|---|---|
| `seats` | The seats it can fill. A flow step matches a role through this list. |
| `profile` | The profile it runs on, and the only route to a model. |
| `prompt` | Path to its JSON role file, which holds the instruction text. |
| `permissions` | The permission profile id: `read_only`, `code_write`, and the rest. |
| `skills` | Skill packs loaded into its prompt. |
| `mcpServers` | MCP servers it declares directly, merged with what its skills contribute. |
| `label` | What the dashboard shows. Defaults to the role id. |

The crew-scoped wiring lives in `project.yml` while the instruction text lives in
the role file, so the same role file can be pointed at by two crews that differ
only in the profile they run it on. The shape is `crewRoleConfigSchema` in
`src/agents/role-schema.ts`.

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
