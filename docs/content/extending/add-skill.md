---
title: Add a skill
description: Write a markdown file, save it under .vibestrate/skills/, and attach it to an agent or run.
section: extending
slug: extending/add-skill
---

A skill is just a markdown file you write to teach your agents your project's conventions. There's no scaffold to run and no metadata form to fill in. You write the file, save it under `.vibestrate/skills/`, and Vibestrate's discovery picks it up on its own.

Here are the steps, in order.

<div class="docs-flow"><div><b>Create</b><span>Make .vibestrate/skills/&lt;id&gt;.md.</span></div><div><b>Write</b><span>Plain markdown, your conventions.</span></div><div><b>Check</b><span>vibe skills list and show.</span></div><div><b>Attach</b><span>To an agent or a single run.</span></div></div>

## 1. Create the file

Make a file at `.vibestrate/skills/<id>.md`. The filename, minus the `.md`, becomes the skill's id, so pick something short and kebab-case (lowercase words joined by hyphens), like `auth-conventions`, `payment-rules`, or `oncall-runbook`.

## 2. Write the body

The body is plain markdown, and there's no structure you're required to follow. That said, most useful skills look like this:

```markdown
# Title - what this is about

## When to use this

One or two sentences naming the surface this applies to.

## Rules

- Bullet list of conventions.
- Be specific. "We use X" beats "we prefer X".

## Examples

Short examples of the right way to do the thing. Mark anti-patterns explicitly.
```

## 3. Check that it was discovered

Run these two commands to confirm Vibestrate found your file. The first lists every skill it knows about; the second prints one back to you so you can read it.

```bash
vibe skills list
vibe skills show <id>
```

## 4. Attach it

A skill does nothing until you attach it to something. You can attach it to an agent in `project.yml`, so that agent always gets it:

```yaml
agents:
  planner:
    skills: [auth-conventions]
```

Or attach it to a single run, just for that one task:

```bash
vibe run "Add 2FA" --skills auth-conventions
```

## Skills you already have in .claude/skills/

If your project already uses Claude Code's skill discovery, Vibestrate reads `.claude/skills/` too. You don't need to copy those files anywhere or keep two versions in sync.

## What makes a skill good

<div class="docs-callout">

**Write it like docs for a colleague, not a prompt.** State what you'd tell a new engineer on day one: where the rule applies, what to do, what not to do. Skip the persuasion.

</div>

A good skill is precise about where it applies and what to do. A few habits that pay off:

- **Name the surface.** "When touching `src/payments/...`" is much more useful to an agent than "for payment changes."
- **State the rule, not the reasoning.** "Use `requireSession` from `src/server/auth.ts`" lands better than "we care a lot about security."
- **Mention the anti-pattern.** Spell out what not to do, like "Don't write session middleware inline."
- **Keep it bounded.** A 200-line skill that loads on every agent is expensive. If one grows huge, split it into smaller skills.

## Optional: pointing a skill at an MCP server

A skill can also declare an MCP server (an outside tool an agent connects to) that its agents should reach. You do that with frontmatter, the small block of settings fenced by `---` lines at the top of the file:

```markdown
---
mcpServers:
  postgres:
    command: pg-mcp
    args: [--read-only]
---

# Postgres MCP

This skill grants agents read-only Postgres access for query inspection.
```

This frontmatter is optional, and most skills don't need it.

## Going deeper

<div class="docs-cards">

**[Skill (concept)](/docs/concepts/skill)**
What a skill is and how agents use it.

**[Attach skills (getting started)](/docs/getting-started/skills)**
The quick path to your first one.

</div>
