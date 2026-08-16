---
title: Skill
description: A markdown file you write once that loads alongside an agent's prompt, so it always knows the things that should be true about your codebase.
slug: concepts/skill
---

A **skill** is a markdown file you write once, and any agent can read it. Use it for the things that should always be true about your codebase: your conventions, your security rules, the "we don't do X here."

Think of it as the note you'd hand a careful new colleague on their first day. You don't repeat the house rules every time you give them a task. You write them down once, point to them, and trust they'll be remembered.

Skills live in `.vibestrate/skills/` (committed with your project) or `.claude/skills/` (picked up if you already use Claude Code). Each one is either a folder holding a `SKILL.md` or a single flat `.md` file, and its name is that folder or file name - so `.vibestrate/skills/auth-conventions/SKILL.md` gives you the skill `auth-conventions`. A `name:` in the frontmatter overrides that. Prefer the folder shape: only a folder can sit beside a `.mcp.json` and bring MCP servers with it.

## Why it helps

Most "the agent did the wrong thing" problems trace back to context the agent didn't have. Skills fix that without retraining a model and without padding every task description with the same boilerplate.

## What a skill looks like

There's no required format. It's markdown. Write it like documentation for a careful colleague.

```markdown
# .vibestrate/skills/payments/SKILL.md

This codebase handles real money. When touching `src/payments/`:

- Always idempotent. Every external POST must include an idempotency key.
- Currency is stored as integer cents. Never floats.
- Refunds must go through `RefundService.process()` - never inline.
```

That's the whole skill. No frontmatter required.

## Attaching a skill to an agent

Name the skills each role should get in `project.yml`. Roles live under `crews.<crewId>.roles`, not a top-level `agents:` key:

```yaml
crews:
  default:
    roles:
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

- A folder-shaped skill can declare MCP servers (Model Context Protocol) in a `.mcp.json` beside its `SKILL.md`, for the times the context an agent needs is live rather than written down. Attaching the skill attaches the servers. A flat `.md` skill has no folder of its own, so it can never carry them.
- Assigning or unassigning a skill from the dashboard crosses the Action Broker as a `file.write` against `project.yml`, so a policy that denies file writes refuses it with the policy's own message and the decision lands in `.vibestrate/runs/roles/actions.ndjson`. The request names the Role's instruction file alongside the config, because a skill is instructions replayed into that Role's turns and can hand it new tools - so a path-scoped rule aimed at either file refuses the assignment. That gate is on the HTTP surface: `vibe skills assign` and the terminal shell write the same field with no gate. **Installing** a skill from a URL is not gated either - `vibe skills fetch` and the dashboard's fetch both write a new file into `.vibestrate/skills/` behind their own guards (private hosts refused, 256 KB cap, secret-shaped content redacted, no overwrite unless you ask), and nothing reads it until it is assigned to a Role, which is gated. See [[safety]].
- [Attach skills (getting started)](/docs/getting-started/skills).
- [Extending: add a skill](/docs/extending/add-skill).
