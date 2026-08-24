---
title: Add a skill
description: Write a markdown file, save it under .vibestrate/skills/, and attach it to a role or run.
slug: extending/add-skill
---

## In simple words

A [[skill]] is a markdown file teaching your agents your project's conventions. There is no scaffold to run and no metadata form: write the file, and discovery picks it up.

```bash
mkdir -p .vibestrate/skills
$EDITOR .vibestrate/skills/api-conventions.md
```

Attaching it is the dashboard's job. `vibe ui` (`127.0.0.1:4317`) > **Crew** > open a crew > each role card has a **Skills** block with a **+ skill…** picker. Whatever you attach is appended to that role's prompt on every turn.

<div class="docs-callout tip">

**Tip.** Vibestrate reads `.claude/skills/` too, so skills you already keep for Claude Code work as they are, with nothing to move or duplicate.

</div>

## The two shapes

<div class="docs-cards">

**A flat `.md` file**
The common case. Instructions only. This page's default.

**A directory with `SKILL.md`**
For a skill that also needs an MCP server alongside its instructions.

</div>

<div class="docs-callout">

**Did you know?** Because a directory skill can bring an MCP server, attaching one hands a role new tools as well as new instructions. That is why skill assignment is gated exactly like a prompt edit.

</div>


## Going deeper

### 1. Create the file

A file in `.vibestrate/skills/` named for the skill, like `auth-conventions.md`. The filename minus the `.md` is the name you refer to it by everywhere else, so keep it short and kebab-case; a `name:` in the frontmatter overrides it.

### 2. Write the body

Plain markdown, no required structure. Most useful skills look like this:

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

**More** > **Project** has a **Skills** section listing everything Vibestrate found, with the file path behind each name. When the list is empty it offers a **Fetch skill** box that pulls one from an http(s) URL.

The same read, in a terminal:

```bash
vibe skills list
vibe skills show <name>
```

### 4. Attach it

A skill does nothing until it is attached to something.

**To a role, permanently.** Crew editor, role card, **Skills**, **+ skill…**, then **Save** in the masthead. `vibe shell` does the same on its Skills page: `↑↓` picks the skill, `←→` picks the agent, `↵` toggles the pair. The CLI writes to `project.yml`:

```bash
vibe skills assign <agent> <skill>
vibe skills unassign <agent> <skill>
```

Either way the result is the role's `skills` list, under `crews.<crewId>.roles` - there is no top-level `agents:` key:

```yaml
crews:
  default:
    roles:
      planner:
        skills: [auth-conventions]
        # plus seats, profile, prompt and
        # permissions, which stay required
```

**To one step of a flow.** The Flow Builder's step inspector has a **Skills (this step)** picker, for knowledge that belongs to a phase rather than to a worker.

**To one run.** When the skill matters for this task only:

```bash
vibe run "Add 2FA" --skills auth-conventions
```

### What makes a skill good

Write it like docs for a colleague, not a prompt: what you would tell a new engineer on day one, minus the persuasion.

- **Name the surface.** "When touching `src/payments/...`" beats "for payment changes."
- **State the rule, not the reasoning.** "Use `requireSession` from `src/server/auth.ts`" beats "we care a lot about security."
- **Mention the anti-pattern.** "Don't write session middleware inline."
- **Keep it bounded.** A 200-line skill loading on every agent is expensive; split one that grows.

### Optional: an MCP server

A skill can declare an MCP server (an outside tool an agent connects to). A flat `.md` file has nowhere to keep the config, so use the **directory form**: a folder named for the skill id, holding `SKILL.md` (or `skill.md`) plus a sibling `.mcp.json`.

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

`.mcp.json` declares the server: the command to run, plus optional args and env. Only the stdio transport is supported, and the command is a plain argv[0], never passed through a shell:

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

Most skills need none of this. A flat `.md` skill's `mcpServers` is always empty.

### Related

- [Skill (concept)](/docs/concepts/skill) - what a skill is and how agents use it.
- [Attach skills (getting started)](/docs/getting-started/skills) - the quick path to your first one.
