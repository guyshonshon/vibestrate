---
title: Role
description: One teammate inside a Crew — its instructions, permissions, skills, the Profile it runs on, and the Seats it can fill.
section: concepts
slug: concepts/role
---

# Role

## Basically

A Role says how one teammate behaves and which Seats it can fill.

## Example

```yaml
crews:
  default:
    roles:
      reviewer:
        label: Reviewer
        fills: [reviewer, challenger]
        profile: opus-deep
        prompt: .vibestrate/roles/reviewer.md
        permissions: read_only
        skills: []
```

## More Detail

A Role is one row inside a [[crew]]. It carries instructions (a prompt file),
a permission profile, attached skills, the **[[profile]]** it runs on, and a
list of **[[seat]]s** it can fill in a [[flow]]. Roles live under
`crews.<crewId>.roles` — there is no top-level `roles` map any more, and a Role
points at a Profile (`profile:`), not directly at a provider.

> **Role vs Profile vs Provider:** a *Role* is the behavior (Reviewer); a
> *Profile* is how strong/expensive it runs (opus-deep); a *Provider* is the
> installed CLI behind the Profile (claude). One Profile can back many Roles;
> one Provider can back many Profiles.

Splitting work into named Roles is what makes the loop inspectable: the planner
only plans, the reviewer only reviews. Because each Role names a Profile, you
can also mix models — a strong reasoning Profile for the planner, a cheap fast
one for the executor, a different vendor for the reviewer so it doesn't share
the executor's blind spots.

## The six built-in roles (default crew)

| Role | Fills seats | What it does |
|---|---|---|
| `planner` | planner | Reads the task and produces a structured plan. |
| `architect` | architect | Expands the plan with module boundaries and interfaces. |
| `executor` | implementer, executor, builder | Edits files in the worktree. |
| `fixer` | fixer | Addresses review findings without rebuilding from scratch. |
| `reviewer` | reviewer, challenger | Critiques the diff; returns APPROVED / CHANGES_REQUESTED / BLOCKED. |
| `verifier` | verifier, arbiter | Final gate before `merge_ready`. |

## How a Role's prompt is assembled

1. The Role's prompt template (e.g. `.vibestrate/roles/planner.md`).
2. The project rules file (`.vibestrate/rules.md`).
3. Any attached skills (configured + per-run).
4. The current task description.
5. The named artifacts from previous Steps (plan, architecture, diff, validation).

## Advanced

- Schema: `src/roles/role-schema.ts` (`crewRoleConfigSchema`).
- The run records the resolved Role per Step (`resolvedRoleId`,
  `resolvedRoleLabel`) in `flow.json`.
- API: `PATCH /api/crews/:crewId/roles/:roleId` edits a Role's
  profile / seats (`fills`) / permissions / label / skills; the role context
  (prompt) is read/written at `/api/crews/:crewId/roles/:roleId/context`.

## Related

- [[crew]] — the roster a Role belongs to.
- [[seat]] — what a Role fills in a Flow.
- [[profile]] — how strong/expensive a Role runs.
- [[provider]] — the CLI behind the Profile.
- [[skill]] — what a Role reads as domain context.
