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

Want to watch a run visually? Run with `--ui`:

```bash
amaco run "Add dark mode to settings" --ui
# Supervisor: http://127.0.0.1:4317
```

Or open the dashboard standalone any time:

```bash
amaco ui --open
```

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
amaco run "task description" [--ui] [--ui-port <port>]
amaco status [--json]
amaco abort <runId>

amaco ui [--port <port>] [--open]

amaco provider detect [--json]
amaco provider list [--json]
amaco provider test [providerId] [--yes]
amaco provider set <providerId>
amaco provider setup

amaco config show [--json]
amaco config get <path> [--json]
amaco config set <path> <value>
amaco config validate [--json]

amaco skills list [--json]
amaco skills show <name>
amaco skills assign <agent> <skill>
amaco skills unassign <agent> <skill>
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

## Local Supervisor Dashboard

`amaco ui` starts a small local web server (default `127.0.0.1:4317`) that serves a React dashboard supervising every Amaco run in the current project.

The dashboard is a **read-and-annotate** surface. It can:

- list runs and watch the active one update over an SSE event stream,
- render the workflow timeline with the active stage,
- show the current agent's provider, command, duration, exit code, and attached skills,
- list changed files in the worktree with `+/-` counts and a unified diff per file,
- read run artifacts (planner/architect/executor/reviewer/verifier outputs, validation results JSON, final report) directly,
- attach plain-text **notes** to any run, stage, file, artifact, validation command, or event,
- list discovered **skills** from `.amaco/skills/` and `.claude/skills/` and show which agents use them,
- show **runtime metrics** per agent (duration, exit code, diff stats, cost, tokens) when the provider exposes them.

### What the dashboard does NOT do

- It does not spawn Claude Code, Codex, or any other CLI from the browser.
- It does not have an arbitrary-shell endpoint.
- It does not show `.env` diffs — `.env`, `.env.*`, `*.pem`, `*.key`, and similar paths are flagged as secret-like and the body is suppressed (filename only).
- It does not push, merge, or contact GitHub.
- It binds to `127.0.0.1` only. Cross-origin requests are refused.

### Why the browser does not run Claude directly

Amaco's design separates the supervisor (UI + local server) from the executor (Amaco core, which spawns provider CLIs as child processes). The UI reads `.amaco/runs/<run-id>/` and calls the local server's safe API; the local server calls the same Amaco core that the CLI calls; the core spawns providers. There is no path from the browser to a shell, by design.

```
browser ──HTTP──► local server ──fn calls──► Amaco core ──child_process──► provider CLI
                       │                          │
                       └──── reads files ─────────┘
                            (state, events, artifacts, diff, metrics)
```

This keeps the CLI fully usable without the UI, and keeps the UI from accidentally becoming a remote-code-execution surface.

## Skills

Skills attach reusable instructions to agents at run time. Amaco discovers skills from two roots:

- `.amaco/skills/<name>/SKILL.md` (or legacy flat `.amaco/skills/<name>.md`)
- `.claude/skills/<name>/SKILL.md`

```bash
amaco skills list
amaco skills show example-skill
amaco skills assign reviewer security
amaco skills unassign reviewer security
```

When an agent runs, every skill assigned to it is loaded and embedded in that agent's prompt under an `# Attached Skills` section, alongside the project rules. The skill name and body preview also show up in the run's runtime metrics so you can audit what each agent had access to.

> Amaco does **not** train Claude or any other model. Skills are reusable instruction bundles that get attached at run time — nothing more.

## Claude Code provider notes

The default generic CLI provider (`type: cli`) shells out to a command and pipes the prompt to it. For Claude Code specifically, Amaco also ships a richer provider type, `claude-code`, that:

- reuses the same prompt-building, permission, and worktree-isolation contract,
- accepts an optional `settings` block (output format, max turns, permission mode, allowed tools, settings file, etc.) and only adds CLI flags for keys the user actually set — Amaco never invents flags,
- best-effort parses session id, model, total cost USD, per-model cost, token usage, and tool-call count from JSON or stream-JSON output,
- writes those fields into `.amaco/runs/<run-id>/runtime-metrics.json` so the dashboard and final report can show them.

If you don't configure `settings.outputFormat`, Claude runs in plain text mode and Amaco honestly reports cost/tokens as **"not reported by provider"** — never as zero, never as fabricated values.

To opt in to the richer type, set the provider type in `.amaco/project.yml`:

```yaml
providers:
  claude:
    type: claude-code
    command: claude
    args: ["-p"]
    input: stdin
    settings:
      outputFormat: stream-json
```

The generic `type: cli` provider continues to work for any other local CLI.

## Runtime telemetry

After every agent invocation, Amaco appends an entry to:

```
.amaco/runs/<run-id>/runtime-metrics.json
.amaco/runs/<run-id>/agent-metrics/<agent>-<timestamp>.json
```

Each entry includes: agent id, stage id, provider id and type, command, args, cwd, started/ended timestamps, duration, exit code, prompt and output artifact paths, post-stage diff stats, validation summary, attached skills, and — when the provider reports them — session id, model, cost, per-model cost, token usage, and tool call count.

The final report at `12-final-report.md` includes a "Runtime Metrics" table with the same data. Cost and tokens that the provider didn't report are shown as `—` (or "not reported by provider"), never as 0 or invented numbers.

## Live logs vs interactive terminal

The dashboard's "Logs" tab is **read-only**: it tails artifact files (planner output, executor output, validation stdout/stderr, etc.) and renders them live. There is no interactive terminal, no `xterm.js`, no `node-pty`, and no way to send commands from the browser to a running process in V0.

A future "interactive terminal with strict approval gates" is documented in the roadmap but intentionally not in this phase.

## Security model for local UI

- Bound to `127.0.0.1` only.
- Cross-origin requests rejected at request time.
- All API paths use a strict `runId` allow-list pattern; `..` is rejected.
- Artifact paths are resolved against the run's `artifacts/` dir and rejected if they escape it.
- Diff service redacts `.env`, `.env.*`, `*.pem`, `*.key`, `*.p12`, `id_rsa`, and similar paths — file names visible, body suppressed.
- The server has no endpoint that runs arbitrary shell commands. The only mutating endpoints are: add note, resolve note, abort run.
- `amaco run --ui` and `amaco ui` reuse the exact same setup/doctor/config services the CLI uses — there is no parallel UI-only logic.

## Limitations of V0

- No model APIs. Local CLIs only.
- No GitHub/GitLab integration, no auto-push, no auto-merge.
- Permissions are orchestration-level, not OS-level sandboxing.
- One built-in linear workflow. Custom DAGs are documented but not implemented.
- No cloud or Docker backends.
- The dashboard's "Logs" tab is read-only — no interactive terminal yet.
- Token/cost metrics depend on the provider exposing them. Generic CLIs and unconfigured Claude Code will show "not reported".

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
