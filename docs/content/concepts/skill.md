---
title: Skill
description: A markdown file of house rules, attached to the roles that need it, so you write your conventions once.
slug: concepts/skill
---

## In simple words

A **skill** is a markdown file you write once and attach to an agent. Use it for the things that should always be true about your codebase: your conventions, your security rules, the "we do not do X here".

It is the note you would hand a careful new colleague on their first day.

```markdown
# API conventions

- Every endpoint validates its input at the boundary. Reject unknown keys;
  never coerce them.
- Errors return a typed code. Callers branch on the code, never on the message.
- No `console.log` in source. Use the logger in `src/logger.js`.
```

That is a whole skill. It lives under `.vibestrate/skills/`, and you attach it on the **Crew** page: `vibe ui` opens the dashboard on `127.0.0.1:4317`, and every role card there has a **Skills** field.

<div class="docs-callout tip">

**Tip.** A skill is the cheapest fix for "the model keeps doing the thing I told it not to". Try it before a custom [[flow]] or a [policy](/docs/concepts/policies): far less machinery, and it applies to every task.

</div>

## What belongs in one

<div class="docs-cards">

**Conventions**
Naming, error handling, which logger, which test style.

**Things that bit you before**
"This module is load-bearing, do not refactor it casually."

**Domain knowledge**
What a term means in your business, which a model cannot infer.

**Boundaries**
Which layers may talk to which, and what never crosses.

</div>

<div class="docs-callout">

**Did you know?** A skill written as a directory can carry MCP servers, which means attaching one hands a role new *tools* as well as new instructions. A flat `.md` skill never does. That is why skill assignment is gated the same way a prompt edit is: it is the same class of authority, not a lesser one.

</div>


## Going deeper

### Attach one to a role

**Crew** in the sidebar opens the roster, and clicking a crew opens its detail page. Each role card there carries a **Skills** field with a **+ skill…** picker listing everything discovered in this project, and each attached skill sits as a chip with an `x` to detach it. A card writes each change as you make it. The `+` beside **Crew** starts a new crew in the crew editor, which **Edit roles** on the detail page also opens; that editor is the one that holds every role behind a single save.

`vibe shell` puts the same thing on its Skills page (`8`) as a grid: `↑↓` picks the skill, `←→` picks the agent, `↵` or space toggles the pair.

The commands are the automation path:

```bash
vibe skills list
vibe skills show <name>
vibe skills assign <agent> <skill>
vibe skills unassign <agent> <skill>
```

`assign` and `unassign` write one field, a role's `skills` list under `crews.<crewId>.roles` in `project.yml`; `list` and `show` only read. There is no top-level `agents:` key:

```yaml
crews:
  default:
    roles:
      planner:
        skills: [payments, error-handling]
```

### Attach one to a step, or to a single run

Knowledge belonging to a phase rather than a worker goes on the step. The Flow Builder's step inspector has a **Skills (this step)** picker, added to that step's prompt on top of the run's own skills and carried by the flow when you share it.

For one task and no longer, the CLI takes them inline. This flag has no dashboard equivalent today:

```bash
vibe run "Refund a stuck transaction" --skills payments,oncall-runbook
```

### Where they come from, and what is gated

**More > Project** lists every skill discovered under `.vibestrate/skills/` and `.claude/skills/`, with its source beside each name. When that list is empty the page offers a **Fetch skill** box for an http(s) URL, as does the step inspector; `vibe skills fetch <url>` is the same install.

Installing is guarded rather than gated: private hosts refused, the body capped at 256 KB, secret-shaped content redacted, no overwrite unless you ask. Nothing reads a fetched skill until it is assigned.

Assignment is the gated half. From the dashboard it crosses the Action Broker as a `file.write` naming both `project.yml` and the role's own instruction file, so a policy denying file writes refuses it in that policy's own words. Allowed or refused, the decision is recorded in `.vibestrate/runs/roles/actions.ndjson`, the audit bucket for authoring that happens outside any run. `vibe skills assign` and the shell write the same field without that gate, and leave no such record. See [[safety]].

### Skills and project rules

`.vibestrate/rules.md` loads for *every* agent on *every* run. A skill loads only for the agents and runs that ask for it - a smaller circle inside the same one:

<svg viewBox="0 0 560 130" width="100%" style="max-width:560px;height:auto" role="img" aria-label="Project rules are loaded for every agent on every run; a skill is loaded only for the roles that name it, so a skill's audience sits inside the rules' audience.">
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="1" y="1" width="558" height="126" rx="10"/>
    <rect x="16" y="56" width="528" height="56" rx="8"/>
  </g>
  <g fill="currentColor" font-size="12" font-family="ui-monospace,monospace">
    <text x="16" y="26">.vibestrate/rules.md</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="11">
    <text x="16" y="44">every agent, every run</text>
  </g>
  <g fill="currentColor" font-size="12" font-family="ui-monospace,monospace">
    <text x="32" y="82">.vibestrate/skills/payments</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="11">
    <text x="32" y="100">only the roles that name it</text>
  </g>
</svg>

### Common mistakes

- **Everything in one skill.** A 5000-word file is hard for any agent to weigh. Split by surface - auth, payments, errors - and attach only what each agent needs.
- **Writing skills like prompts.** Do not say "you are an expert at...". State the convention. Agents read skills like docs.
- **Ephemeral info.** "Fix the bug in PR #123" belongs in the task description.

### Related

- [Extending: add a skill](/docs/extending/add-skill) - the file layout, the frontmatter, and the directory form that carries an MCP server.
- [Attach skills (getting started)](/docs/getting-started/skills) - the quick path to your first one.
