# Amaco

Amaco runs software tasks through local coding-agent CLIs and keeps the work
inspectable. It creates a git worktree, streams the agent turns, runs project
validation, records artifacts, and stops at `merge_ready`, `blocked`, or
`failed`. It does not push or merge for you.

## Quickstart

```bash
npm install -g amaco
cd your-project
amaco init
amaco doctor
amaco run "Add audit logging to the settings flow"
```

Open Mission Control when you want a UI:

```bash
amaco ui --open
# or start one with a run
amaco run "Tighten retry handling" --ui
```

## What It Runs

The default workflow is:

```text
plan -> architecture -> implement -> validate -> review -> fix -> verify
```

Runs are local-first:

- Providers are local CLIs such as Claude Code, Codex, Ollama, or a configured command.
- Code changes happen in an isolated git worktree.
- Validation uses commands from `.amaco/project.yml`.
- Prompts, outputs, metrics, events, approvals, and reports stay under `.amaco/runs/`.
- Human approval gates can pause a run before it continues.

## Guides

Guides are selectable run recipes. Skills attach prompt context; Guides shape
the steps, participant slots, gates, and artifacts.

The built-in `quality-arbitration` Guide runs a builder/challenger/arbiter flow
for higher-risk feature work and review:

```bash
amaco guides list
amaco guides show quality-arbitration
amaco guides suggest "Refactor provider permissions" --risk high
amaco run "Refactor provider permissions" --guide quality-arbitration
```

Override Guide participants when you want different local CLIs per role:

```bash
amaco run "Add sandbox policy checks" --guide quality-arbitration \
  --guide-slot builder=claude \
  --guide-slot challenger=codex
```

Project Guides live in `.amaco/guides/<guide-id>/guide.yml`. Guide suggestions
are advisory; the selected Guide is always explicit at run start.

## Setup

`amaco init` creates the project files and detects available providers. If the
detected defaults are not enough, use:

```bash
amaco setup
amaco provider detect
amaco provider setup
amaco provider test <providerId>
```

Read and edit validated config without hand-editing YAML:

```bash
amaco config show
amaco config get commands.validate
amaco config set commands.validate '["pnpm typecheck","pnpm test"]'
```

## Useful Commands

```bash
amaco run "<task>" [--ui] [--guide <id>] [--read-only]
amaco status
amaco pause <runId> | amaco resume <runId> | amaco abort <runId>
amaco replay <runId>

amaco approvals list <runId>
amaco approvals approve <runId> <approvalId>
amaco approvals reject <runId> <approvalId>

amaco tasks list
amaco queue status
amaco skills list
amaco suggestions list <runId>
```

Use `amaco --help` and command-specific help for the full CLI surface.

## Project Files

```text
.amaco/
  project.yml        providers, agents, commands, policies
  rules.md           project instructions
  agents/            prompt templates
  skills/            prompt attachments
  guides/            project Guide definitions
  runs/              run state, artifacts, metrics, events
```

## Development

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

Guide implementation notes are in
[`docs/guides-quality-arbitration-plan.md`](docs/guides-quality-arbitration-plan.md).
