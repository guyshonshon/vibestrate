# Amaco

Amaco is a local-first autonomous multi-agent completion orchestrator for software tasks.

It runs the local agent CLIs you already use — Claude Code, or any custom CLI you wire up — through a controlled
**plan → architect → implement → validate → review → fix → verify**
loop in isolated git worktrees.

> No API keys. No cloud. No auto-push or auto-merge. Just your local CLIs and your project.

## Quickstart for vibe coders

```bash
npm install -g amaco
cd your-project
amaco init
amaco doctor
amaco run "Add dark mode to settings"
```

That's the whole flow. If Claude Code is installed and on your PATH, Amaco detects it automatically and writes a runnable config. You never have to open YAML.

## What Amaco does for you

- Detects your project type (Next.js, Vite, TypeScript, Node) and package manager (pnpm/npm/yarn/bun).
- Detects your local coding CLI (Claude Code, Codex, OpenCode, Aider).
- Generates a complete `.amaco/project.yml`, agent prompts, and skills folder.
- Runs an isolated workflow on a fresh branch in a git worktree.
- Runs your real validation (typecheck/lint/tests) and feeds the results into the reviewer.
- Bounded fix loop, then a verifier, then `merge_ready` or `blocked` — never auto-merged.
- Writes durable artifacts (Markdown + JSON + NDJSON) so a future dashboard can render every run.

## Zero-config setup

`amaco init` is genuinely out-of-the-box.

When run inside a git repository:

1. Verifies it's a git repo.
2. Detects project name, type, and package manager.
3. Detects local coding CLIs.
4. Generates `.amaco/project.yml`, `.amaco/rules.md`, `.amaco/agents/*`, `.amaco/skills/`, and `.amaco/runs/`.
5. Prints a friendly summary and tells you exactly what to run next.

If a provider is detected:

```
✓ Amaco initialized.

Project:
  Name: my-app
  Type: Next.js
  Package manager: pnpm

Provider:
  ✓ Claude Code detected: claude (v2.x)
  Default agents will use: claude -p

Validation:
  • pnpm typecheck
  • pnpm test

Next:
  → amaco doctor
  → amaco run "your task"
```

If no provider is detected:

```
✓ Amaco initialized, but no local coding CLI was detected.

Next:
  → amaco provider setup
  → amaco doctor
  → amaco run "your task"
```

### Init flags

- `amaco init` — uses a short wizard if your terminal is interactive, otherwise behaves like `--yes`.
- `amaco init --yes` — non-interactive: use safe detected defaults, never wait for input.
- `amaco init --interactive` — force the guided wizard.
- `amaco init --force` — overwrite templates (your `.amaco/runs/` are preserved).

## Provider detection

```bash
amaco provider detect
```

Output:

```
Detected local coding CLIs:

✓ Claude Code — ready
  Command: claude (v2.x)

○ Codex CLI — not found
○ OpenCode — not found
○ Aider — not found
```

Detection only runs `<command> --version` with a short timeout. It never sends a real prompt and never authenticates.

Claude Code ships a verified preset (`claude -p` with stdin). Other CLIs detect as `detected, needs setup` because Amaco does not invent prompt-flag conventions for tools whose interfaces aren't pinned. Wire them up with `amaco provider setup`.

## Guided setup

Two wizards:

- `amaco setup` — provider, validation, and run defaults.
- `amaco provider setup` — provider only.

Both are short, plain-language, and always show what will be saved before saving.

```
? Which local coding CLI should Amaco use for its agents?
> Claude Code (detected: claude v2.x)
  Custom command
```

For custom CLIs you'll be asked for: provider id, command, args, input mode (stdin / arg). You can opt in to a safe smoke test that sends only a tiny no-op prompt and looks for a magic token — no real task is sent.

## Config without editing YAML

`amaco config` lets you read and edit `.amaco/project.yml` without ever opening it:

```bash
amaco config show
amaco config validate
amaco config get commands.validate
amaco config set workflow.maxReviewLoops 3
amaco config set git.mainBranch main
amaco config set commands.validate '["pnpm typecheck","pnpm test"]'
```

- Booleans / numbers / strings are parsed automatically.
- Arrays and objects via JSON.
- Every write is validated against the schema before saving — invalid writes are refused with a clear message.
- Comments and structure in the YAML are preserved.

## Doctor and recovery

```bash
amaco doctor
amaco doctor --fix
amaco doctor --json
```

Doctor checks: git availability and repo, config presence and validity, provider availability, all agents referencing valid providers, prompt files, skills, write-permission cwd policy, validation commands, `.env` files, auto-push/merge.

`--fix` makes only safe restorations:

- Recreates missing `.amaco/runs`, `.amaco/skills`, and `.amaco/agents` directories.
- Restores missing default agent prompt files (never overwrites your edits).
- Restores `.amaco/skills/README.md` if missing.
- Adds the Claude provider when `claude` is on PATH and no providers are configured.
- Adds detected validation commands when none are configured.

`--fix` never deletes files, never overwrites custom prompts, never runs model prompts, never pushes, and never merges.

## Validation commands

Amaco runs your real checks inside the worktree, and the reviewer/verifier see the results.

If your `package.json` has `lint`, `typecheck`, `test` (and similar), Amaco suggests them automatically based on your detected package manager:

| Manager | Example command |
| --- | --- |
| pnpm   | `pnpm typecheck`, `pnpm test` |
| npm    | `npm run typecheck`, `npm run test` |
| yarn   | `yarn typecheck`, `yarn test` |
| bun    | `bun run typecheck`, `bun run test` |

You can override anytime:

```bash
amaco config set commands.validate '["pnpm lint","pnpm test"]'
```

## CLI commands at a glance

```bash
amaco init [--yes] [--interactive] [--force]
amaco setup
amaco doctor [--json] [--fix]
amaco run "task description"
amaco status [--json]
amaco abort <runId>

amaco provider detect [--json]
amaco provider list [--json]
amaco provider test [providerId] [--yes]
amaco provider set <providerId>
amaco provider setup

amaco config show [--json]
amaco config get <path> [--json]
amaco config set <path> <value>
amaco config validate [--json]
```

## How a run works

```
your task
   │
   ▼
planner ─►  architect ─►  executor ─►  validate ─►  reviewer
                                                       │
                                          CHANGES_REQUESTED
                                                       │
                                                    fixer ──► validate ──► reviewer (bounded loop)
                                                       │
                                                    APPROVED
                                                       │
                                                       ▼
                                                    verifier
                                                       │
                                                       ▼
                                              merge_ready / blocked
```

Every stage is deterministic TypeScript. Each agent has its own role and editable Markdown prompt. The orchestrator owns the workflow; agents only do their step and hand back artifacts.

Final status is `merge_ready` only when the reviewer approved **and** the verifier passed. Amaco never pushes or merges. You inspect the worktree, decide, and merge manually.

## Run artifacts

```
.amaco/runs/<run-id>/
  state.json
  events.ndjson
  artifacts/
    00-idea.md
    01-planner-prompt.md
    02-plan.md
    03-architect-prompt.md
    04-architecture.md
    05-executor-prompt.md
    06-execution-output.md
    07-validation-results.json
    08-reviewer-prompt.md
    09-review.md
    10-verifier-prompt.md
    11-verification.md
    12-final-report.md
    loops/
      loop-1/
        fixer-prompt.md
        fix-output.md
        validation-results.json
        reviewer-prompt.md
        review.md
```

## Safety model

- Worktree isolation. Write-enabled agents always run in a fresh worktree on a fresh branch.
- No auto-push. No auto-merge. Amaco refuses to enable either.
- `.env` files are flagged but never read into prompts.
- Bounded fix loops via `workflow.maxReviewLoops`. After exhaustion, the run becomes `blocked`.
- Reviewer must emit a `DECISION:` line. Missing/invalid → `BLOCKED`.
- Verifier must emit a `VERIFICATION:` line. Missing/invalid → `NEEDS_HUMAN`.
- `merge_ready` only when reviewer **APPROVED** and verifier **PASSED**.

> Amaco is not a full sandbox. It runs local CLI tools on your machine. Configure only providers you trust.

## Limitations of V0

- No model APIs. Local CLIs only.
- No GitHub/GitLab integration, no auto-push, no auto-merge.
- Permissions are orchestration-level, not OS-level sandboxing.
- One built-in linear workflow. Custom DAGs are documented but not implemented.
- No cloud or Docker backends.

## Roadmap

- Pause/resume active runs and `/btw` notes.
- Interactive approval gates.
- Custom workflow DAGs and parallel agents.
- Docker, remote sandbox, and cloud-runner execution backends.
- Local supervisor dashboard (UI on top of these services).
- GitHub PR creation, GitLab support, optional auto-merge under strict gates.
- Provider presets for Codex / OpenCode / Aider once their flag conventions are pinned.
- Secret scanning, policy plugins, run replay UI.

## Advanced: manual YAML configuration

Manual editing of `.amaco/project.yml` is supported but is not the normal user path. Prefer `amaco config set ...` and `amaco provider ...` so writes are schema-validated and the YAML stays clean.

If you do edit by hand, run `amaco config validate` after each change.

The full schema lives in `src/project/config-schema.ts`. Top-level keys: `project`, `git`, `workflow`, `execution`, `providers`, `agents`, `commands`, `permissions`, `policies`.

## Contributing

Architecture conventions:

- `src/core/` — orchestrator and durable run primitives.
- `src/setup/` — UI-agnostic services: setup, provider setup, config update, doctor. CLI commands and a future local dashboard share this layer.
- `src/cli/` — Commander commands and small UI helpers (`ui/format.ts`, `wizards/`). Commands should be thin: parse args, call services, render results.
- `src/providers/` — provider abstractions and detection. Adding a new local CLI preset is a small change here.
- `src/execution/` — execution backends. Local-worktree is the only V0 implementation.
- `src/permissions/` — permission profiles and access policy.
- `src/project/` — project config schema, init template, project detection.
- `src/utils/` — small helpers, dependency-free.

## License

MIT
