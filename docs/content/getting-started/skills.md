---
title: Attach skills
description: Skills are markdown files that load alongside an agent's prompt. Use them to add domain context, conventions, or playbooks.
section: getting-started
slug: getting-started/skills
---

A *skill* is a markdown file that gets concatenated onto an agent's prompt. It's the most direct way to teach an agent something about your codebase — your authentication model, the conventions you actually use, the playbook for a specific kind of change.

## Where they live

Two roots are scanned:

- `.vibestrate/skills/` — committed alongside your project. Use this for skills that should travel with the repo.
- `.claude/skills/` — picked up when you're already using Claude Code's skill system locally.

Filename without the `.md` extension becomes the skill id. So `auth-conventions.md` is the skill `auth-conventions`.

## A simple skill

```markdown
# .vibestrate/skills/auth-conventions.md

This codebase uses Lucia for sessions. When touching auth:

- Don't create session middleware inline — use `requireSession` from `src/server/auth.ts`.
- Cookies are HttpOnly and SameSite=lax. Don't change those defaults.
- New auth routes go under `src/server/routes/auth/`.
```

That's the whole format. Plain markdown, plain prose — agents read it the same way humans do.

## Attach to an agent

In `project.yml`:

```yaml
agents:
  planner:
    skills: [auth-conventions, error-handling]
  executor:
    skills: [auth-conventions]
```

Or per-run, with `--skills`:

```bash
vibestrate run "Add 2FA enrollment" --skills auth-conventions,security-review
```

Skills passed via `--skills` are *merged* with whatever's configured on each agent — they don't replace.

## List what's available

```bash
vibestrate skills list
vibestrate skills show auth-conventions
```

## When to write a new skill

Write a skill when:

- You're repeating the same context in multiple task prompts.
- The agent keeps making the same wrong assumption that you have to correct.
- There's a convention that's not documented anywhere else in the codebase.

Don't write a skill when:

- The information already lives in CLAUDE.md or your project README — agents will read those naturally as part of project rules.
- It's a one-off — just include it in the task description.
- It's about a single file — comments in the file itself work better.

## Reference

See the [skill discovery and schema reference](/docs/extending/add-skill) for the full filesystem layout and any optional metadata.
