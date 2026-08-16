---
title: Attach skills
description: A short note you hand an agent so it knows your codebase's rules before it starts.
slug: getting-started/skills
---

A **skill** is a markdown note that gets added to an agent's instructions before it starts work. Write it into `.vibestrate/skills/`, attach it to a role with `vibe skills assign`, and every run that seats that role reads it. It's how you teach an agent something about your project - how login works, the conventions you actually follow - once, instead of retyping it into every task. Think of it as the briefing you'd give a new contractor on their first day.

## Write one

A skill is a markdown file, in either of two shapes:

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

Both of those are the skill `auth-conventions` - the name comes from the file stem or the folder name, unless a `name:` in frontmatter says otherwise. Vibestrate reads two roots: `.vibestrate/skills/`, which travels with your repo so anyone who clones it gets the skill, and `.claude/skills/`, picked up automatically if you already use Claude Code's skills. Only the folder shape can carry a sibling `.mcp.json`; attaching such a skill attaches its MCP servers too.

Inside, write plain prose. Agents read it the way a person would:

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

## Hand it to an agent

See what you have, then attach one to a role:

```bash
vibe skills list
vibe skills show auth-conventions
vibe skills assign planner auth-conventions
vibe skills unassign planner auth-conventions
```

`assign` writes the id into that role's `skills` list in `.vibestrate/project.yml`, at `crews.<crewId>.roles.<roleId>.skills`. You can edit the list by hand instead - it sits alongside the role's other keys, which must all stay present:

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

Or attach skills for a single run. These are merged with whatever each agent already has, never a replacement:

```bash
vibe run "Add 2FA enrollment" \
  --skills auth-conventions,security-review
```

## When a skill is worth it

<div class="docs-cards">

**Write one when**
You keep typing the same context into task after task. The agent keeps making the same wrong guess that you have to correct. There's a rule that isn't written down anywhere else in the project.

**Skip it when**
It belongs in `.vibestrate/rules.md`, the project instructions every agent reads on every turn. It's a one-off, so just say it in the task description. It's about one file, where a comment in that file works better.

</div>

## Going deeper

- [Skill discovery and schema reference](/docs/extending/add-skill) - the full folder layout and any optional metadata.
