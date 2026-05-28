---
title: Skill
description: Markdown attachments that load alongside an agent's prompt. The fastest way to add domain context that doesn't belong in a one-shot task description.
section: concepts
slug: concepts/skill
---

**Professional explanation.** A skill is a markdown attachment discovered by filename under `.vibestrate/skills/` or `.claude/skills/`, identified by stem, and loaded into an agent's prompt as additional context. Skills may optionally declare MCP servers (Model Context Protocol) the agent should connect to during its turn.

**Simple explanation.** A skill is a markdown file you write once and any agent can read. Use it for the things that should always be true about your codebase — conventions, security rules, "we don't do X here."

## Why it matters

Most "the agent did the wrong thing" problems trace back to context the agent didn't have. Skills fix that without retraining a model and without padding every task description with the same boilerplate.

## Two roots

- `.vibestrate/skills/` — committed with your project. Travels with the repo.
- `.claude/skills/` — picked up if you're already using Claude Code's skill discovery.

The filename minus `.md` is the skill id. `auth-conventions.md` is the skill `auth-conventions`.

## What a skill looks like

There's no required schema. It's markdown — write it like documentation for a careful colleague.

```markdown
# .vibestrate/skills/payments.md

This codebase handles real money. When touching `src/payments/`:

- Always idempotent. Every external POST must include an idempotency key.
- Currency is stored as integer cents. Never floats.
- Refunds must go through `RefundService.process()` — never inline.
- Log errors with `paymentLogger`, not the default logger (different sink).
```

That's the whole skill. No frontmatter required.

## Attaching skills to an agent

In `project.yml`:

```yaml
agents:
  planner:
    skills: [payments, error-handling]
  executor:
    skills: [payments]
```

Or per run, merged into every agent for that run:

```bash
vibestrate run "Refund a stuck transaction" --skills payments,oncall-runbook
```

## Skills vs project rules

`.vibestrate/rules.md` is loaded for *every* agent on *every* run. Skills are loaded only for the agents and runs that ask for them. Use rules for the universal "this is how we work"; use skills for "this is what you need to know if you're touching X."

## Common mistakes

- **Putting everything in one skill.** A single 5000-word file is hard for any agent to weigh. Split by surface — auth, payments, errors, observability — and attach only the ones relevant to each agent.
- **Writing skills like prompts.** Don't say "you are an expert at...". Say what the convention is. Agents read skills like docs.
- **Using skills for ephemeral info.** "Fix the bug in PR #123" belongs in the task description, not in a skill.

## Related

- [Attach skills (getting started)](/docs/getting-started/skills).
- [Extending: add a skill](/docs/extending/add-skill).
