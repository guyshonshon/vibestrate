---
title: Attach skills
description: A short note you hand an agent so it knows your codebase's rules before it starts.
section: getting-started
slug: getting-started/skills
---

A **skill** is a short note, written in plain markdown, that gets added to an agent's instructions before it starts work. It's how you teach an agent something about your project: how login works, the conventions you actually follow, the right way to handle a certain kind of change.

Think of it as the briefing you'd give a new contractor on their first day. Instead of repeating "we do it this way here" every single time, you write it down once and hand it over.

## Write one

A skill is just a markdown file. Drop it in one of two folders:

- `.vibestrate/skills/` - travels with your project, so anyone who clones the repo gets it too. Use this one by default.
- `.claude/skills/` - picked up automatically if you already use Claude Code's skills locally.

The file name (without the `.md`) becomes the skill's name, so `auth-conventions.md` is the skill `auth-conventions`. Inside, just write plain prose. Agents read it the same way a person would:

```markdown
# .vibestrate/skills/auth-conventions.md

This codebase uses Lucia for sessions. When touching auth:

- Don't create session middleware inline - use `requireSession` from `src/server/auth.ts`.
- Cookies are HttpOnly and SameSite=lax. Don't change those defaults.
- New auth routes go under `src/server/routes/auth/`.
```

## Hand it to an agent

Name the skills you want in `project.yml`, per agent:

```yaml
agents:
  planner:
    skills: [auth-conventions, error-handling]
  executor:
    skills: [auth-conventions]
```

Or attach one for a single run with `--skills`:

```bash
vibe run "Add 2FA enrollment" --skills auth-conventions,security-review
```

Skills you pass with `--skills` are added on top of whatever each agent already has. They don't replace them.

To see what's available:

```bash
vibe skills list
vibe skills show auth-conventions
```

## When a skill is worth it

Write one when:

- You keep typing the same context into task after task.
- The agent keeps making the same wrong guess that you have to correct.
- There's a rule that isn't written down anywhere else in the project.

Skip it when:

- It's already in CLAUDE.md or your README. Agents read those on their own as part of the project rules.
- It's a one-off. Just say it in the task description.
- It's about one file. A comment in that file works better.

## Going deeper

- [Skill discovery and schema reference](/docs/extending/add-skill) - the full folder layout and any optional metadata.
