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

Write it into `.vibestrate/skills/`, then attach it on the **Crew** page: every role card has a skills row with **Attach a skill**. Every run seating that role reads it, so you teach an agent something once instead of retyping it into every task.

<div class="docs-callout tip">

**Tip.** The test for whether something belongs in a skill: would you say it to a new contractor on their first day, and be annoyed to repeat it on their second? A one-off instruction belongs in the task instead.

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

**Did you know?** A skill can carry MCP servers, so attaching one can hand a role new tools as well as new instructions. That is why assigning a skill is gated exactly like editing a role's prompt: the same class of authority.

</div>


## Write one

One skill is one markdown file, and it can sit on disk in two shapes:

<svg font-family="var(--font-sans)" viewBox="0 0 560 152" width="100%" style="max-width:720px;height:auto" role="img" aria-label="A skill lives under .vibestrate/skills/, as either a flat markdown file or a folder holding SKILL.md, and only the folder shape can carry a sibling .mcp.json. The .claude/skills/ folder is read as well.">
  <g fill="none" stroke="var(--line-strong)" stroke-width="1.25">
    <rect fill="var(--bg-200)" x="1" y="1" width="558" height="126" rx="10"/>
    <rect fill="var(--bg-200)" x="16" y="56" width="300" height="28" rx="8"/>
    <rect fill="var(--bg-200)" x="16" y="92" width="300" height="28" rx="8"/>
  </g>
  <g fill="var(--fg-100)" font-size="12" font-family="var(--font-mono)">
    <text x="16" y="26">.vibestrate/skills/</text>
  </g>
  <g fill="var(--violet-soft)" font-size="11">
    <text x="16" y="44">travels with your repo - prefer this one</text>
  </g>
  <g fill="var(--fg-100)" font-size="12" font-family="var(--font-mono)">
    <text x="30" y="75">auth-conventions.md</text>
  </g>
  <g fill="var(--violet-soft)" font-size="11">
    <text x="330" y="75">a flat file</text>
  </g>
  <g fill="var(--fg-100)" font-size="12" font-family="var(--font-mono)">
    <text x="30" y="111">auth-conventions/SKILL.md</text>
  </g>
  <g fill="var(--violet-soft)" font-size="11">
    <text x="330" y="105">a folder, and the only shape</text>
    <text x="330" y="119">that can carry .mcp.json</text>
  </g>
  <g fill="var(--fg-100)" font-size="12" font-family="var(--font-mono)">
    <text x="16" y="146">.claude/skills/</text>
  </g>
  <g fill="var(--violet-soft)" font-size="11">
    <text x="136" y="146">read too, if you already use Claude Code</text>
  </g>
</svg>

Both shapes give you a skill named `auth-conventions`: the name comes from the file stem or the folder name, unless a `name:` line in the frontmatter says otherwise, and `.claude/skills/` is read too. An `.mcp.json` points an agent at an outside tool, so attaching a folder skill that carries one hands the agent those tools as well.

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

## Hand it to an agent

**More > Project** has a **Skills** section listing everything Vibestrate found, each with where it came from. With none yet, the same panel takes a URL and **Fetch skill** pulls one in.

Attaching happens on **Crew**. Each role card carries its skills as removable chips; the empty state offers **Attach a skill**, and after that the `+ skill…` picker adds the next. Opening a role for full editing gives the same **Skills** control alongside its seats, profile and permissions.

In the interactive shell, `vibe` then `8` opens Skills as a grid: arrow up and down for the skill, left and right for the agent, `space` to toggle that pairing.

## From the terminal

```bash
vibe skills list
vibe skills show auth-conventions
vibe skills assign planner auth-conventions
vibe skills unassign planner auth-conventions
vibe skills fetch <url>
```

`assign` writes the id into that role's `skills` list in `.vibestrate/project.yml`, at `crews.<crewId>.roles.<roleId>.skills`. Editing that list by hand works too, as long as the role's other keys stay:

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

Or attach one for a single run. Vibestrate merges what you pass with what each agent already has, never replacing it:

```bash
vibe run "Add 2FA enrollment" \
  --skills auth-conventions,security-review
```

## When a skill is worth it

<div class="docs-cards">

**Write one when**
You keep pasting the same context into task after task. The agent keeps making the same wrong guess and you keep correcting it. A rule your team follows isn't written down anywhere else.

**Skip it when**
It belongs in `.vibestrate/rules.md`, the house rules every agent reads on every turn. It's a one-off, so say it in the task description. It's about a single file, where a comment in that file does the job better.

</div>

## Related

- [Skill discovery and schema reference](/docs/extending/add-skill) - the full folder layout and the optional metadata.

## Next

[Task →](/docs/concepts/task) - the first of the core concepts, now that the walkthrough is done.
