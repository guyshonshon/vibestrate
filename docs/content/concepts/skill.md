---
title: Skill
description: A markdown file you write once that loads alongside an agent's prompt, so it always knows the things that should be true about your codebase.
section: concepts
slug: concepts/skill
---

A **skill** is a markdown file you write once, and any agent can read it. Use it for the things that should always be true about your codebase: your conventions, your security rules, the "we don't do X here."

Think of it as the note you'd hand a careful new colleague on their first day. You don't repeat the house rules every time you give them a task. You write them down once, point to them, and trust they'll be remembered.

Vibestrate discovers skills by filename. The filename minus `.md` is the skill id, and its contents load into an agent's prompt as extra context. So `auth-conventions.md` is the skill `auth-conventions`.

## Why it helps

Most "the agent did the wrong thing" problems trace back to context the agent didn't have. Skills fix that without retraining a model and without padding every task description with the same boilerplate.

## What a skill looks like

There's no required format. It's markdown. Write it like documentation for a careful colleague.

```markdown
# .vibestrate/skills/payments.md

This codebase handles real money. When touching `src/payments/`:

- Always idempotent. Every external POST must include an idempotency key.
- Currency is stored as integer cents. Never floats.
- Refunds must go through `RefundService.process()` - never inline.
- Log errors with `paymentLogger`, not the default logger (different sink).
```

That's the whole skill. No frontmatter required.

## Where skills live

Drop a skill in either of two folders:

- `.vibestrate/skills/` - committed with your project. Travels with the repo.
- `.claude/skills/` - picked up if you're already using Claude Code's skill discovery.

## Attaching a skill to an agent

Name the skills each agent should get in `project.yml`:

```yaml
agents:
  planner:
    skills: [payments, error-handling]
  executor:
    skills: [payments]
```

Or attach them just for one run, merged into every agent for that run:

```bash
vibe run "Refund a stuck transaction" --skills payments,oncall-runbook
```

## Skills vs project rules

`.vibestrate/rules.md` is loaded for *every* agent on *every* run. Skills are loaded only for the agents and runs that ask for them. Use rules for the universal "this is how we work." Use skills for "this is what you need to know if you're touching X."

## Common mistakes

- **Putting everything in one skill.** A single 5000-word file is hard for any agent to weigh. Split by surface - auth, payments, errors, observability - and attach only the ones relevant to each agent.
- **Writing skills like prompts.** Don't say "you are an expert at...". Say what the convention is. Agents read skills like docs.
- **Using skills for ephemeral info.** "Fix the bug in PR #123" belongs in the task description, not in a skill.

## Going deeper

- A skill can also declare MCP servers (Model Context Protocol) for the agent to connect to during its turn, for the times the context it needs is live rather than written down.
- [Attach skills (getting started)](/docs/getting-started/skills).
- [Extending: add a skill](/docs/extending/add-skill).
