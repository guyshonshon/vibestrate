---
title: Add a skill
description: Write a markdown file, drop it in .amaco/skills/, attach it to an agent or run.
section: extending
slug: extending/add-skill
---

A skill is a markdown file. There's no scaffold to run, no metadata to fill in — write the file, save it under `.amaco/skills/`, and Amaco's discovery picks it up.

## Steps

1. Create `.amaco/skills/<id>.md`. The filename minus `.md` is the skill id. Pick something kebab-case: `auth-conventions`, `payment-rules`, `oncall-runbook`.
2. Write the skill body as plain markdown. There's no required structure. Most useful skills follow:

   ```markdown
   # Title — what this is about

   ## When to use this

   One or two sentences naming the surface this applies to.

   ## Rules

   - Bullet list of conventions.
   - Be specific. "We use X" beats "we prefer X".

   ## Examples

   Short examples of the right way to do the thing. Mark anti-patterns explicitly.
   ```

3. Verify it's discovered:

   ```bash
   amaco skills list
   amaco skills show <id>
   ```

4. Attach to an agent in `project.yml`:

   ```yaml
   agents:
     planner:
       skills: [auth-conventions]
   ```

   Or for a single run:

   ```bash
   amaco run "Add 2FA" --skills auth-conventions
   ```

## Skills in `.claude/skills/`

If your project already uses Claude Code's skill discovery, Amaco reads `.claude/skills/` too. You don't need to duplicate.

## What makes a skill *good*

- **Names the surface.** "When touching `src/payments/...`" is much more useful than "for payment changes."
- **States the rule, not the reasoning.** "Use `requireSession` from `src/server/auth.ts`" — not "we care a lot about security."
- **Mentions the antipattern.** "Don't write session middleware inline" — explicitly.
- **Bounded length.** A 200-line skill loaded on every agent is expensive. If it's huge, split it.

## Optional: declaring MCP servers

A skill can declare an MCP server its agents should connect to:

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

The frontmatter is optional. Most skills don't need it.

## Related

- [Skill (concept)](../concepts/skill).
- [Attach skills (getting started)](../getting-started/skills).
