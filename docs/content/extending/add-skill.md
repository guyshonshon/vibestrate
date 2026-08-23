---
title: Add a skill
description: Write a markdown file, save it under .vibestrate/skills/, and attach it to a role or run.
slug: extending/add-skill
---

## In simple words

A [[skill]] is a markdown file teaching your agents your project's conventions. There is no scaffold to run and no metadata form - write the file, and discovery picks it up.

```bash
mkdir -p .vibestrate/skills
$EDITOR .vibestrate/skills/api-conventions.md
```

<div class="docs-callout tip">

**Tip.** Vibestrate reads `.claude/skills/` too, so skills you already keep for Claude Code work as they are. You do not have to move or duplicate them.

</div>

## The two shapes

<div class="docs-cards">

**A flat `.md` file**
The common case. Instructions only. This page's default.

**A directory with `SKILL.md`**
For a skill that also needs an MCP server alongside its instructions.

</div>

<div class="docs-callout">

**Did you know?** A skill in a directory can bring an MCP server with it, which means attaching that skill hands a role new tools as well as new instructions. That is why skill assignment is gated exactly like a prompt edit.

</div>


## Going deeper

### 1. Create the file

Make a file in `.vibestrate/skills/` named for the skill, like `auth-conventions.md`. The filename minus the `.md` is the name you refer to it by everywhere else, so keep it short and kebab-case (lowercase words joined by hyphens), like auth-conventions, payment-rules or oncall-runbook. A `name:` in the file's frontmatter overrides the filename if you set one.

### 2. Write the body

The body is plain markdown, and there's no structure you're required to follow. That said, most useful skills look like this:

```markdown
# Title - what this is about

### When to use this

One or two sentences naming the surface.

### Rules

- Bullet list of conventions.
- Be specific. "We use X" beats "we prefer X".

### Examples

Short examples of the right way.
Mark anti-patterns explicitly.
```

### 3. Check that it was discovered

Run these two commands to confirm Vibestrate found your file. The first lists every skill it knows about; the second prints one back to you so you can read it.

```bash
vibe skills list
vibe skills show <name>
```

### 4. Attach it

A skill does nothing until you attach it to something. You can attach it to a role in `project.yml`, so that role always gets it. Roles live under `crews.<crewId>.roles`, not a top-level `agents:` key:

```yaml
crews:
  default:
    roles:
      planner:
        skills: [auth-conventions]
        # plus seats, profile, prompt and
        # permissions, which stay required
```

Or attach it to a single run, just for that one task:

```bash
vibe run "Add 2FA" --skills auth-conventions
```

### Skills you already have in .claude/skills/

If your project already uses Claude Code's skill discovery, Vibestrate reads `.claude/skills/` too. You don't need to copy those files anywhere or keep two versions in sync.

### What makes a skill good

Write it like docs for a colleague, not a prompt: state what you'd tell a new engineer on day one - where the rule applies, what to do, what not to do - and skip the persuasion. A good skill is precise about where it applies and what to do. A few habits that pay off:

- **Name the surface.** "When touching `src/payments/...`" is much more useful to an agent than "for payment changes."
- **State the rule, not the reasoning.** "Use `requireSession` from `src/server/auth.ts`" lands better than "we care a lot about security."
- **Mention the anti-pattern.** Spell out what not to do, like "Don't write session middleware inline."
- **Keep it bounded.** A 200-line skill that loads on every agent is expensive. If one grows huge, split it into smaller skills.

### Optional: pointing a skill at an MCP server

A skill can also declare an MCP server (an outside tool an agent connects to) that its agents should reach. The flat `.md` file this page starts with can't carry one - it has no directory of its own to hold a config file next to. For an MCP server, use the **directory form** instead: a folder named for the skill id, holding `SKILL.md` (or `skill.md`) plus a sibling `.mcp.json`.

<svg viewBox="0 0 560 112" width="100%" style="max-width:560px;height:auto" role="img" aria-label="A flat markdown file is the whole skill, and has no directory to hold an MCP config next to it. The directory form keeps SKILL.md beside a .mcp.json, which is what declares the servers.">
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="1" y="1" width="270" height="110" rx="8"/>
    <rect x="289" y="1" width="270" height="110" rx="8"/>
  </g>
  <g fill="currentColor" font-size="12" font-family="ui-monospace,monospace">
    <text x="20" y="54">auth-conventions.md</text>
    <text x="308" y="54">postgres/SKILL.md</text>
    <text x="308" y="78">postgres/.mcp.json</text>
  </g>
  <g fill="currentColor" fill-opacity="0.5" font-size="11">
    <text x="20" y="26">a flat file</text>
    <text x="308" y="26">a folder</text>
    <text x="20" y="100">no MCP server, and no room for one</text>
    <text x="308" y="100">MCP servers, over stdio</text>
  </g>
</svg>

```text
.vibestrate/skills/
  postgres/
    SKILL.md
    .mcp.json
```

`SKILL.md` is the same plain markdown as a flat skill, with optional `name` / `description` frontmatter:

```markdown
---
name: postgres
description: Read-only Postgres access.
---

# Postgres MCP

This skill grants agents read-only Postgres
access, for inspecting queries.
```

`.mcp.json` declares the server itself - the command to run, plus optional args and env. Only the stdio transport is supported (no network surface), and the command is a plain argv[0], never passed through a shell:

```json
{
  "mcpServers": {
    "postgres": {
      "command": "pg-mcp",
      "args": ["--read-only"]
    }
  }
}
```

This is optional, and most skills don't need it. A flat `.md` skill's `mcpServers` are always empty - there's no directory to hold the `.mcp.json` next to it.

### Going deeper

- [Skill (concept)](/docs/concepts/skill) - what a skill is and how agents use it.
- [Attach skills (getting started)](/docs/getting-started/skills) - the quick path to your first one.
