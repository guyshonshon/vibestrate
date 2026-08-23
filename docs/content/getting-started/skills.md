---
title: Attach skills
description: A markdown note that carries your project's rules into an agent's prompt on every run.
slug: getting-started/skills
---

## In simple words

A **[[skill]]** is a markdown note Vibestrate pastes into an agent's prompt before it starts work.

```markdown
# How login works here

Sessions are signed cookies, not JWTs. `src/auth/session.ts` is the only
module that mints one. Never add a second path.
```

Write it into `.vibestrate/skills/`, attach it to a [[role]], and every run seating that role reads it. You teach an agent something about your project once instead of retyping it into every task.

<div class="docs-callout tip">

**Tip.** The test for whether something belongs in a skill: would you say it to a new contractor on their first day, and would you be annoyed to repeat it on their second? That is a skill. A one-off instruction belongs in the task.

</div>

## What to write one about

<div class="docs-cards">

**How a subsystem really works**
The thing that is not obvious from reading it.

**Conventions you keep restating**
Naming, error handling, which logger.

**Rules with a reason**
"Never do X here, because Y." The reason is what makes it generalise.

**Domain vocabulary**
What a word means in your business.

</div>

<div class="docs-callout">

**Did you know?** A skill can carry MCP servers, so attaching one can hand a role new tools as well as new instructions. That is why assigning a skill is gated exactly like editing a role's prompt: same class of authority, not a lesser one.

</div>


## Going deeper

### Write one

One skill is one markdown file, and it can sit on disk in two shapes:

<svg viewBox="0 0 560 152" width="100%" style="max-width:560px;height:auto" role="img" aria-label="A skill lives under .vibestrate/skills/, as either a flat markdown file or a folder holding SKILL.md, and only the folder shape can carry a sibling .mcp.json. The .claude/skills/ folder is read as well.">
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="1" y="1" width="558" height="126" rx="10"/>
    <rect x="16" y="56" width="300" height="28" rx="8"/>
    <rect x="16" y="92" width="300" height="28" rx="8"/>
  </g>
  <g fill="currentColor" font-size="12" font-family="ui-monospace,monospace">
    <text x="16" y="26">.vibestrate/skills/</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="11">
    <text x="16" y="44">travels with your repo - prefer this one</text>
  </g>
  <g fill="currentColor" font-size="12" font-family="ui-monospace,monospace">
    <text x="30" y="75">auth-conventions.md</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="11">
    <text x="330" y="75">a flat file</text>
  </g>
  <g fill="currentColor" font-size="12" font-family="ui-monospace,monospace">
    <text x="30" y="111">auth-conventions/SKILL.md</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="11">
    <text x="330" y="105">a folder, and the only shape</text>
    <text x="330" y="119">that can carry .mcp.json</text>
  </g>
  <g fill="currentColor" font-size="12" font-family="ui-monospace,monospace">
    <text x="16" y="146">.claude/skills/</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="11">
    <text x="136" y="146">read too, if you already use Claude Code</text>
  </g>
</svg>

Both of those give you a skill named `auth-conventions`. The name comes from the file stem or the folder name, unless a `name:` line in the frontmatter says otherwise. Vibestrate looks in two places: `.vibestrate/skills/`, which travels with your repo so anyone who clones it gets the skill, and `.claude/skills/`, which it reads too if you already keep skills for Claude Code. Only the folder shape can sit next to an `.mcp.json`, the file that points an agent at an outside tool. Attach a skill like that and the agent gets those tools too.

Inside, write plain prose. An agent reads it the way you would:

```markdown
This codebase uses Lucia for sessions.
When touching auth:

- Don't create session middleware inline.
  Use `requireSession` from `src/server/auth.ts`.
- Cookies are HttpOnly and SameSite=lax.
  Don't change those defaults.
- New auth routes go under
  `src/server/routes/auth/`.
```

### Hand it to an agent

See what Vibestrate found, then attach one to a role:

```bash
vibe skills list
vibe skills show auth-conventions
vibe skills assign planner auth-conventions
vibe skills unassign planner auth-conventions
```

`assign` writes the id into that role's `skills` list in `.vibestrate/project.yml`, at `crews.<crewId>.roles.<roleId>.skills`. You can edit that list by hand instead. It sits alongside the role's other keys, and all of those have to stay:

```yaml
crews:
  default:
    roles:
      planner:
        seats: [planner]
        profile: claude-balanced
        prompt: .vibestrate/roles/planner.json
        permissions: read_only
        skills: [auth-conventions, error-handling]
```

Or attach a skill for one run only. Vibestrate merges whatever you pass here with what each agent already has, never replacing it:

```bash
vibe run "Add 2FA enrollment" \
  --skills auth-conventions,security-review
```

### When a skill is worth it

<div class="docs-cards">

**Write one when**
You keep pasting the same context into task after task. The agent keeps making the same wrong guess and you keep correcting it. A rule your team follows isn't written down anywhere else.

**Skip it when**
It belongs in `.vibestrate/rules.md`, the house rules every agent reads on every turn. It's a one-off, so say it in the task description. It's about a single file, where a comment in that file does the job better.

</div>

### Going deeper

- [Skill discovery and schema reference](/docs/extending/add-skill) - the full folder layout and the optional metadata.
