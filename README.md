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

amaco approvals list <runId> [--json]
amaco approvals show <runId> <approvalId> [--json]
amaco approvals approve <runId> <approvalId> [--note "..."]
amaco approvals reject <runId> <approvalId> [--note "..."]

amaco roadmap add <title> [--description ...] [--priority low|medium|high]
amaco roadmap list [--json]
amaco roadmap show <id>
amaco roadmap update <id> [--title ...] [--status ...]
amaco roadmap archive <id>

amaco tasks add <title> [--roadmap <id>] [--priority ...] [--skills ...] [--files ...]
amaco tasks list [--status ...] [--json]
amaco tasks show <id>
amaco tasks comment <id> "<body>"
amaco tasks ready <id>
amaco tasks queue <id>
amaco tasks cancel <id>
amaco tasks run <id>
amaco tasks report <id>

amaco run "<task text>" [--task <taskId>]

amaco queue list [--json]
amaco queue add <taskId>
amaco queue remove <taskId>
amaco queue run [--exit-when-drained]
amaco queue pause | amaco queue resume
amaco queue status [--json]

amaco roadmap proposals [--json]
amaco roadmap proposal show <id>
amaco roadmap proposal parse <id> [--json]
amaco roadmap accept <id> [--dry-run] [--allow-unresolved-dependencies]
amaco roadmap plan "<broad goal>" [--id <proposalId>]
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
- The server has no endpoint that runs arbitrary shell commands. Mutating endpoints are: add note, resolve note, abort run, **assign skill, unassign skill, approve approval, reject approval**.
- `amaco run --ui` and `amaco ui` reuse the exact same setup/doctor/config services the CLI uses — there is no parallel UI-only logic.

## Dashboard skill assignment

You can attach skills to agents from the dashboard without touching YAML.

In the **Skills** tab of the inspector, each skill row has six toggleable agent chips (planner / architect / executor / fixer / reviewer / verifier). Click one to attach; click again to detach. The change is written to `.amaco/project.yml` through the same schema-validated path that `amaco skills assign` uses on the CLI.

What skills are:

- Reusable instructions Amaco loads at run time and embeds in the agent's prompt.
- Discovered from `.amaco/skills/<name>/SKILL.md` (or legacy flat `.amaco/skills/<name>.md`) and `.claude/skills/<name>/SKILL.md`.
- **Skills do not train the model.** They are run-time guidance that gets attached to specific agents.

Server endpoints used by the UI (and available to scripts):

```
POST /api/skills/:skillId/assign     { "agentId": "executor" }
POST /api/skills/:skillId/unassign   { "agentId": "executor" }
```

Both endpoints validate that the skill exists, the agent exists, and the resulting `.amaco/project.yml` is still valid before writing. Invalid writes are refused.

## Human approval gates

Amaco pauses a run for an explicit human decision in two situations:

1. **Agent-requested** — an agent emits `HUMAN_APPROVAL: REQUIRED` in its output.
2. **Policy-required** — your `.amaco/project.yml` lists the stage in `policies.requireApprovalAtStages`.

In either case the orchestrator transitions the run to `waiting_for_approval`, persists a single approval request to `.amaco/runs/<run-id>/approvals.json`, and waits. You approve or reject from CLI or dashboard; the run resumes or becomes `blocked`.

### Structured approval requests

Agents can describe *what* they want signed off on, not just "this needs you". The full signal is:

```
HUMAN_APPROVAL: REQUIRED
HUMAN_APPROVAL_REASON: <one-sentence plain-language reason>
HUMAN_APPROVAL_RISK: low | medium | high
HUMAN_APPROVAL_REQUEST: <the specific action you want the human to approve>
```

Only the first line is required. Defaults when the others are missing:

| Field | Default |
| --- | --- |
| `HUMAN_APPROVAL_REASON` | `null` |
| `HUMAN_APPROVAL_RISK` | `medium` |
| `HUMAN_APPROVAL_REQUEST` | `Continue past the <stage> stage.` |

Invalid risk values fall back to `medium`. The marker is **case-sensitive** so casual mentions in prose do not trigger the gate.

### Approval risk levels

| Risk | When to use |
| --- | --- |
| `low` | Cosmetic boundary clarifications. If you can pick `low`, you probably do not need to pause the run. |
| `medium` | Significant-but-reversible decisions. The default. |
| `high` | Destructive, security-sensitive, privacy-sensitive, data-loss, auth, payment, migration, or irreversible decisions. |

The dashboard renders `low` as neutral, `medium` as cyan accent (matches in-flight stages), and `high` as warm warning — clearly more attention-getting but **never** panic-red. Failure red is reserved for actually-broken runs.

### Approval requested action

The `HUMAN_APPROVAL_REQUEST` line should describe a concrete action. Good:

> Approve switching session storage from cookie to server-side
> Approve dropping the `legacy_users` table
> Approve adding `payments` write access to the worker role

Bad:

> Approve the plan
> Continue
> Continue with implementation

The dashboard banner shows the requested action prominently above the reason. The CLI shows it in `amaco approvals show`. The final report records it in the Approval Decisions table.

### Per-stage approval policies

Configure stages where Amaco **must** pause regardless of what agents emit:

```bash
amaco config set policies.requireApprovalAtStages "[\"architecting\",\"verifying\"]"
```

Allowed stage names: `planning`, `architecting`, `executing`, `validating`, `reviewing`, `fixing`, `verifying`. The schema rejects unknown stages and refuses to write the change. The default is an empty array (no forced approvals).

A policy-required approval is created **once per stage per run** — it does not re-trigger on fixer-loop revisits of the same stage.

If both an agent emits `HUMAN_APPROVAL: REQUIRED` and the project policy lists that stage, Amaco creates **one** approval, not two. The agent's metadata wins (more specific) and the approval record is marked `alsoRequiredByPolicy: true` so the audit trail is honest about the dual cause.

#### CLI examples

```bash
# Force human approval before implementation begins, and again before merge-ready.
amaco config set policies.requireApprovalAtStages "[\"architecting\",\"verifying\"]"

# Disable forced approvals.
amaco config set policies.requireApprovalAtStages "[]"

# Inspect.
amaco config get policies.requireApprovalAtStages
amaco doctor   # shows "Approval required at: architecting, verifying"
```

#### Dashboard behavior

When a run is paused, the dashboard shows an approval banner at the top of the run detail page with a risk pill, an `agent-requested` / `policy` / `agent + policy` source pill, the requested action prominently, the reason, a link to the source artifact, an optional decision-note field, and Approve / Reject buttons. The Approvals inspector tab shows the same fields for every approval in the run.

The default planner / architect / reviewer / verifier prompts mention the structured syntax and tell agents to use `high` risk only for genuinely high-stakes decisions. Routine uncertainty does not pause the run.

### Why Amaco pauses

The orchestrator owns the workflow and never silently accepts or rejects human-approval signals. If an agent says "this needs you", the run pauses. You decide. The run resumes (or blocks) based on your decision, never on an agent's recommendation.

### Approve or reject from CLI

```bash
amaco approvals list <runId>
amaco approvals show <runId> <approvalId>
amaco approvals approve <runId> <approvalId> --note "looked at it"
amaco approvals reject <runId> <approvalId> --note "wait for design review"
```

If `amaco run` is still attached, the run resumes (or blocks) automatically as soon as you decide. If you killed the CLI, the approval is still persisted in `approvals.json` — you can run the same `amaco approvals approve/reject` later and the next time you re-run the workflow you can pick up from a clean state.

### Approve or reject from dashboard

When a run is paused, the dashboard shows an approval banner at the top of the run detail page with:

- the agent and stage that asked,
- the reason (if provided),
- the requested action,
- a link to the source artifact,
- an optional decision-note field,
- **Approve** and **Reject** buttons.

The browser POSTs to `/api/runs/:runId/approvals/:approvalId/approve` or `/reject`. The orchestrator's polling loop sees the resolution and resumes (or transitions to `blocked`).

### Resume behavior

V0 uses **in-process polling**. While `amaco run` is attached, it polls `approvals.json` every ~1.5s and continues as soon as the file shows the request resolved. Ctrl+C stops the polling but the state on disk (`waiting_for_approval`, the pending approval, every event so far) is preserved.

If the CLI process exited while waiting, the run remains in `waiting_for_approval` and you can resolve the approval whenever you like — there is no separate `amaco resume` command in V0; rather than fake a resume by reading prior artifacts back into memory, Amaco prefers honesty: the persisted approval is the audit record.

### Audit trail

Every approval request and decision is durable:

- `.amaco/runs/<run-id>/approvals.json` — full history (creation, status, reason, requested action, source artifact, decision note, resolved-by, timestamps).
- `events.ndjson` — `approval.requested`, `approval.approved`, `approval.rejected`, `approval.expired`, `run.resumed` events.
- `runtime-metrics.json` — `approvalsSummary` (total / approved / rejected / pending / expired / total wait ms).
- `12-final-report.md` — Approval Decisions section with the full table and the summary line.

These are local files. They are not cloud approvals. They are not synced to a team service. They live next to the run.

### Safety model for approvals

- Only approve/reject endpoints exist for resolving approvals — no arbitrary "resume with custom payload" endpoint.
- Approving an already-resolved approval returns 409.
- Rejecting an already-resolved approval returns 409.
- `amaco doctor` reports pending approvals as warnings but **never auto-decides** them.
- `amaco doctor --fix` does not touch any approval.
- Rejection always transitions the run to `blocked` — it is never a soft warning.

## Roadmap board

`amaco ui` includes a Board view at `#/board` that breaks broad goals into supervised tasks.

- **Roadmap items** are big ideas: `Build onboarding`, `Add billing`, `Migrate to React 19`. They live in `.amaco/roadmap/roadmap.json`.
- **Tasks** are units of work small enough that a single Amaco run can plausibly complete one. They live in `.amaco/roadmap/tasks/<id>.json`.
- **Comments** are persisted Markdown notes scoped to a task, file, artifact, run, approval, etc. They live in `.amaco/roadmap/comments/<taskId>.json`.

CLI:

```bash
amaco roadmap add "Build onboarding flow" --description "Make first-run setup simple for vibe coders"
amaco tasks add "Create setup wizard" --roadmap rm-build-onboarding-…
amaco tasks comment task-create-setup-wizard-… "Make sure this works without editing YAML"
amaco tasks queue task-create-setup-wizard-…
amaco queue run
```

Or `amaco run "<text>" --task <taskId>` to run a single task in the foreground.

### Tasks and micro-steps

Inside a single task, the orchestrator runs the existing pipeline in order:

```
planning → architecting → executing → validating → reviewing → fixing → verifying
```

The task detail page shows this as a **micro-step pipeline**, derived live from the run's events / metrics / approvals. Each step displays its agent, status (pending / running / passed / failed / blocked), and links to the artifacts and approvals it produced. Nothing in the pipeline is faked: the steps are a presentation view over the same audit data the existing run detail page already shows.

### Comments and review

Comments support targets: `task`, `step`, `artifact`, `file`, `diff`, `approval`, `run`. The dashboard exposes adding and resolving comments on a task; the CLI mirrors it via `amaco tasks comment` and (server side) `POST /api/tasks/:id/comments`. Resolution is soft — comments stay on disk under `.amaco/roadmap/comments/<task>.json` for the audit trail.

## Concurrent runs

A single task's pipeline is sequential. Across **independent** tasks, Amaco can run multiple at once if you opt in.

```yaml
scheduler:
  maxConcurrentRuns: 1            # default — safe
  maxConcurrentWriteAgents: 1     # reserved for a future per-agent budget
  conflictPolicy: warn            # warn | block
  queuePolicy: fifo               # fifo | priority
```

```bash
amaco config set scheduler.maxConcurrentRuns 2
amaco config set scheduler.conflictPolicy block
amaco queue add <taskA-id>
amaco queue add <taskB-id>
amaco queue run        # process-bound; Ctrl+C stops the loop, queue persists
```

### Worktree per task

Every task run gets a fresh git branch and worktree (this is the same `local-worktree` backend `amaco run` already uses). Two concurrent tasks therefore have **separate worktrees** — they cannot accidentally write to the same files.

### Conflict detection

Before the scheduler starts a queued task, it compares that task's declared `touchedFiles` (and the live `git diff` file lists of currently-running tasks) against the candidate's hints. If the lists overlap:

- `conflictPolicy: warn` — start the second task anyway and surface a warning under `.amaco/scheduler/conflicts.json` and in the dashboard's Queue view.
- `conflictPolicy: block` — keep the second task queued and mark it `blocked` until the conflicting run finishes.

This is **best-effort**, not perfect static analysis. Globs and prefix matching are intentionally not in V0; the policy must be predictable and explainable.

### Why the scheduler is process-bound (not a daemon)

`amaco queue run` is the loop. While it is running, queued tasks become children of that process. When you press Ctrl+C (or kill the process), the queue, scheduler state, and any conflict warnings remain persisted on disk; the next `amaco queue run` picks up where you left off. There is no background daemon in V0 — this keeps the operational model honest and the audit trail simple.

### Dashboard

The Board page shows columns: Ideas, Ready, Queued, Running, Waiting Approval, Review, Blocked, Done. The Queue page shows the running tasks, the queue, the policy snapshot, and any conflict warnings (amber-warn, never panic-red). Adding tasks/comments and queueing happens in the dashboard via the same safe routes the CLI uses.

There is **no** `POST /api/tasks/:id/run` endpoint — spawning a child Amaco process from the browser would be an arbitrary-shell vector. The dashboard surfaces `amaco tasks run <id>` as copy-paste guidance instead.

## Roadmap proposals

The planner agent can draft a roadmap from a broad goal. The user reviews, dry-runs, and accepts. Nothing is written until accept succeeds.

```bash
amaco roadmap plan "Build the first public beta experience"
# → saved as .amaco/roadmap/proposals/<id>.md

amaco roadmap proposals
amaco roadmap proposal show <id>
amaco roadmap accept <id> --dry-run
amaco roadmap accept <id>
```

### Proposal marker format

The planner agent emits plain-text marker blocks (no fenced code required):

```
AMACO_ROADMAP_ITEM:
TITLE: Build onboarding
DESCRIPTION: Make first-run setup simple for vibe coders.
PRIORITY: high
TAGS: onboarding, setup

AMACO_TASK:
TITLE: Create setup wizard
ROADMAP: Build onboarding
DESCRIPTION: Add guided setup flow.
RISK: medium
SKILLS: typescript-node-cli, ux-design
LIKELY_FILES: src/cli/commands/setup.ts, src/setup/setup-service.ts
VALIDATION: pnpm typecheck, pnpm test

AMACO_TASK:
TITLE: Add setup tests
ROADMAP: Build onboarding
DEPENDS_ON: Create setup wizard
RISK: low
SKILLS: testing
LIKELY_FILES: tests/setup-service.test.ts
```

Required: `TITLE` on every block. Everything else is optional with sane defaults (`PRIORITY` and `RISK` default to `medium`; invalid values fall back with a warning). `LIKELY_FILES` paths are validated for traversal — entries with `..` or absolute paths are rejected. Duplicate task or roadmap titles in the same proposal are fatal errors.

### Reviewing and dry-running

```bash
amaco roadmap accept <id> --dry-run
```

prints the would-be roadmap items, tasks, and dependency edges, plus any warnings/errors. **No files are written.** If the proposal has unresolved `DEPENDS_ON` references that don't match any task title (in the proposal *or* on the existing roadmap), dry-run shows a fatal error — re-run with `--allow-unresolved-dependencies` to skip them instead.

### Accepting

```bash
amaco roadmap accept <id>
```

is **atomic**: parses → validates → detects cycles → resolves dependencies → only then writes the roadmap items + tasks. If a write fails midway, the records this transaction created are rolled back. The acceptance is recorded in `.amaco/roadmap/proposals/<id>-accepted.json` so accepting the same proposal twice is refused.

### Dashboard

The `Proposals` view in the dashboard lists drafts and lets you preview, dry-run, and accept from the browser. Errors and warnings are surfaced inline; the Accept button is disabled when there are errors. The accept flow uses the same safe API the CLI uses; there is no separate write path.

## Dependency graph

Tasks can declare dependencies on other tasks (`task.dependencies: string[]` of task ids). Once accepted, the system surfaces these everywhere:

- **Board cards** show "Blocked by N · Unlocks N" pills (amber when blocked, neutral when unlocking other tasks).
- **Task detail** has a Dependencies section with two columns: Blocked by (with each blocker's status colour-coded) and Unlocks. Both lists are click-through.
- **Task report** (`amaco tasks report <id>`) includes dependency lists, an explicit blocker explanation when the task can't start yet, and a link back to the source proposal id when the task came from one.

This is **a clean dependency list, not a graph canvas**. V0 deliberately avoids visual graph rendering — a sortable list is more readable for the kinds of dependency depth real projects have.

### Scheduler dependency handling

`amaco queue run` walks queued entries in policy order (FIFO or priority) and picks the **first ready** one — meaning every dependency is `done` (or `cancelled`). Blocked entries stay queued and the scheduler re-checks on the next tick. So:

```bash
amaco queue add <taskB-id>   # depends on A
amaco queue add <taskA-id>
amaco queue run
```

works fine — the scheduler skips B (A is open), runs A, sees B becomes ready, runs B. No out-of-order execution.

Cycles are caught at proposal-accept time, not at scheduler time. The only way a cycle could appear in `.amaco/roadmap/tasks/` is via manual JSON editing — the CLI / UI never produce one.

## Notification center

Every state transition that warrants attention — approvals requested, runs reaching `merge_ready`/`blocked`/`failed`, validation failures, scheduler conflicts, queue drains — is recorded as a structured notification under `.amaco/notifications/notifications.json`. Notifications never block the orchestrator: delivery is fire-and-forget, and a gateway that errors records a failed receipt without affecting the run.

In the dashboard, the bell icon in the header shows an unread badge and opens a side-drawer with filters (all / unread / attention; filterable by category). Each item links back to the relevant run, task, or queue page; mark-read and resolve are one click. The bell polls every four seconds.

```bash
amaco notifications list                # latest 25 with unread/resolved markers
amaco notifications read <id>           # mark as read
amaco notifications resolve <id>        # close the loop
amaco notifications settings            # show enabled toggles + gateway status
amaco notifications test                # write one test notification
```

Notification rules live in `.amaco/notifications/rules.json` and respect:

- a global `enabled` switch + per-channel toggles (`cli`, `inApp`, `browser`, `desktop`),
- a `defaultMinSeverity` (`info` → `critical`),
- per-trigger toggles (`notifyOnApprovalRequested`, `notifyOnRunCompleted`, `notifyOnRunBlocked`, `notifyOnRunFailed`, `notifyOnValidationFailed`, `notifyOnSchedulerConflict`, `notifyOnTaskBlocked`),
- `enabledCategories` / `quietCategories` (run, approval, task, scheduler, conflict, validation, review, system, gateway).

## Browser notifications

The dashboard can surface high-attention events as system notifications through the browser's `Notification` API. The first time you visit `Settings`, click "Allow browser notifications" — Amaco never auto-requests permission. When granted, the bell automatically posts a system notification for new unread items at `attention` or `critical` severity. Other severities stay in-app only.

If you deny the permission, everything keeps working — the bell still shows the unread count and the drawer behaves the same way.

## Communication gateways

Amaco can fan a notification out to outside-the-laptop channels. Configuration lives in `.amaco/notifications/gateways.json` (kept separate from `project.yml` so secrets never bleed into the project config). Channels available in V0:

| id          | type       | what it does                                                      | needs                    |
| ----------- | ---------- | ----------------------------------------------------------------- | ------------------------ |
| `in-app`    | built-in   | appears in the dashboard bell — persistence is the delivery       | nothing                  |
| `cli`       | built-in   | prints a single dim line in the running terminal                  | nothing                  |
| `webhook`   | HTTP POST  | generic JSON `POST` of the notification record                    | url                      |
| `discord`   | webhook    | rich embed via a Discord channel webhook                           | discord webhook url      |
| `slack`     | webhook    | bullet text via a Slack incoming webhook                           | slack webhook url        |
| `telegram`  | bot API    | MarkdownV2 message via a Telegram bot                              | bot token + chat id      |
| `whatsapp`  | placeholder| **planned**: returns a `skipped` receipt and reports planned status | n/a — see below          |

```bash
amaco gateways list                     # show every gateway with config status
amaco gateways enable webhook --url "env:AMACO_WEBHOOK"
amaco gateways enable slack --url "env:SLACK_WEBHOOK_URL"
amaco gateways enable discord --url "env:DISCORD_WEBHOOK_URL"
amaco gateways enable telegram --token "env:TELEGRAM_BOT_TOKEN" --target "env:TELEGRAM_CHAT_ID"
amaco gateways test slack               # send a test ping
amaco gateways disable telegram
```

In the dashboard, the gear icon in the header opens **Settings**. Each gateway shows enabled/disabled, its severity threshold, and (for `url`/`token`/`target`) whether the value is a literal or an `env:NAME` reference and whether the env var is currently set. **Secret values never round-trip to the browser** — the API returns only `{ kind: "env-ref" | "literal", envVarSet?: boolean, hasValue?: boolean }`.

### Webhook gateway

```bash
amaco gateways enable webhook --url "env:AMACO_WEBHOOK"
```

POSTs JSON of the form:

```json
{
  "type": "amaco.notification",
  "notification": {
    "id": "nf-run-…",
    "severity": "success",
    "category": "run",
    "title": "Run reached merge_ready",
    "message": "Run … finished cleanly. Inspect the diff before merging.",
    "runId": "…",
    "taskId": null,
    "approvalId": null,
    "actionRequired": false,
    "actionLabel": "Open run",
    "actionUrl": "#/runs/…",
    "createdAt": "2026-05-10T…Z"
  }
}
```

Timeout: 5 s. Failures are recorded in `receipts.json` with the URL/token redacted, never logged.

### Discord, Slack, Telegram

These three are thin formatters on top of the webhook transport.

- **Discord** — paste a channel webhook URL (Server Settings → Integrations → Webhooks).
- **Slack** — create an Incoming Webhook (`api.slack.com/messaging/webhooks`).
- **Telegram** — create a bot via `@BotFather`, get a chat id (e.g. via `@userinfobot`). The bot must have permission to message the chat.

All three render an emoji per severity, escape MarkdownV2 reserved characters where applicable, and only relay messages that meet the gateway's `minSeverity`.

### WhatsApp (planned)

WhatsApp is intentionally a placeholder in V0. A safe adapter requires a verified provider (Twilio, WhatsApp Cloud API) plus phone-number registration that we cannot fake. The schema and routing layer are real, so a future commit can drop in a real adapter without touching anything else; for now `deliver` always returns a `skipped` receipt with a clear "planned" reason and `test` reports the planned status without ever making an HTTP call.

### Secrets via environment variables

Any gateway value (`url`, `token`, `target`) accepts the `env:VAR_NAME` syntax — the resolved value is read from `process.env` at delivery time and is never written to disk, never logged, never returned by the API. `amaco doctor` cross-checks enabled gateways against the current environment and reports missing env vars.

```bash
export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/T0/B0/xxx"
amaco doctor   # → ✓ slack gateway: ready  /  ✗ slack gateway: SLACK_WEBHOOK_URL not set
```

If a gateway throws, Amaco records a failed receipt — with the URL/token stripped via the same redactor used for error logging — and the run continues. Bearer tokens, Slack/Discord webhook paths, and Telegram bot URLs are also redacted by pattern, so even a misbehaving error message can't leak credentials.

## Project-aware dashboard

The dashboard is bound to the directory you launched Amaco from. The header tells you exactly which project it is supervising, and `#/project` opens a single page that answers *“what is Amaco controlling right now?”*:

- project name, root path (one-click copy), package manager, project type
- git: main branch, current branch, latest commit hash and subject
- configured providers, agents, skills, validation commands
- scheduler config, recent runs, queue length, pending approvals, running tasks
- policies (forbid main-branch writes / secrets / auto-push / auto-merge, forced approval stages)

Status cards at the top summarise the same data into glanceable counts (Git clean/dirty, Providers configured, Validation configured, Skills count, Pending approvals, Running tasks, Queue length).

The dashboard is **read-only** in this phase. It can inspect the project, but it does not edit files, push, fetch, or merge.

## Codebase explorer

`#/codebase` is a three-pane explorer:

- **left** — file tree (project root by default; flip to a run worktree to inspect what an Amaco branch produced),
- **center** — file viewer with line numbers, language hint, byte size, and total-line count,
- **right** — context inspector with copy buttons for path / file:line references.

Clicking a line number copies a `path:line` reference to your clipboard. References parsed from artifacts/reviews/comments are clickable and deep-link back into this view at the right line.

Tree exclusions are baked in: `.git`, `node_modules`, `dist`, `build`, `out`, `coverage`, `.next`, `.turbo`, `.cache`, `.parcel-cache`, `.vite`, `.svelte-kit`, `.gradle`, `.idea`, `.pytest_cache`, `.mypy_cache`, `__pycache__`, `target`, `venv`, and a few more. The `.amaco/` directory only appears when you opt in with `?includeAmaco=true`. Hidden files are off by default.

## Project bounds and safety

Every UI file read goes through one central guard (`src/core/path-guard.ts`):

- absolute paths must resolve inside an allowed root (project root, or a known Amaco run worktree); anything else is `400`.
- `..` segments are rejected outright.
- the resolved path's `realpath` must still live inside the same root, so symlinks that point outside the project are rejected too (and macOS `/var` ↔ `/private/var` is handled explicitly).
- secret-like files (`.env`, `.env.*`, `*.pem`, `*.key`, `*.p12`, `id_rsa`, `id_rsa.pub`, common `secrets.{json,yaml,toml}`) are flagged before any read happens — Amaco returns metadata and a redaction notice but never their bytes.

Routes that surface files (`/api/project/file`, `/api/runs/:runId/file`, `/api/project/tree`, `/api/runs/:runId/tree`) all share this guard. There is no other path used by the UI to read code.

## File viewer and line references

`/api/project/file?path=…&lineStart=…&lineEnd=…` returns:

```json
{
  "file": {
    "path": "src/example.ts",
    "rootKind": "project",
    "language": "typescript",
    "size": 421,
    "isBinary": false,
    "isSecretLike": false,
    "isTruncated": false,
    "totalLines": 24,
    "lineStart": 1,
    "lineEnd": 24,
    "lines": [{ "number": 1, "text": "export const x = 1" }]
  }
}
```

- Files larger than 512 KB are returned with `isTruncated: true` and an empty `lines` array (use the CLI for big files).
- Binary files come back with `isBinary: true` and no text.
- Secret files come back with `isSecretLike: true`, no lines, and a `notice` explaining why.
- Line ranges are clamped to a 4 000-line window per response.

Reference parsing (`POST /api/code-references` + `parseCodeReferences()`) recognises `src/foo.ts`, `src/foo.ts:42`, `src/foo.ts:42-57`, `src/foo.ts#L42`, `src/foo.ts#L42-L57`, and `src/foo.ts line 12`. Each match is annotated with `existsInProject` (and, when a `runId` is supplied, `existsInWorktree`). The dashboard's artifact viewer turns those matches into accent-coloured buttons that jump straight to `#/codebase?path=…&line=…`.

## Run worktree view

Run detail now leads with a worktree block: branch, dirty/clean badge, ahead/behind versus upstream, latest commit, the worktree path (one-click copy), and shortcuts to the Codebase and Git views scoped to that run. The diff viewer's per-file header gains *Open in project* / *Open in worktree* / *Copy path* buttons. Artifact viewer shows the raw artifact text but turns code references inside it into clickable links.

A new **Agent work** tab in the inspector summarises each agent's stage, provider, duration, skills attached, validation summary, review/verification decisions, files-changed delta, diff stats, artifacts, and notes. Attribution is **best effort** — Amaco snapshots the worktree diff after each stage but does not snapshot per-file authorship.

The **Git** inspector tab on a run shows the same status + bounded history (`git log --max-count=N`) as the dedicated `#/git` page, scoped to that run's worktree.

## Git status and history

`#/git` is the dashboard view; the routes are:

- `GET /api/project/git/status` and `…/history?limit=N` for the project,
- `GET /api/runs/:runId/git/status` and `…/history?limit=N` for a run worktree.

Status reports branch, upstream (when configured), ahead/behind counts, dirty/clean, the latest commit hash + subject, and the per-file `git status --porcelain=v1` codes. History caps at `limit` commits (default 20, max 200) and uses `git log` with a strict format string.

The dashboard never calls `git fetch`, `git push`, or `git merge`. There are no buttons for those actions. All git access is local-only.

## Agent work attribution

`/api/runs/:runId/agent-work` builds its rows from the persisted runtime metrics file. Each row carries:

- agent id + stage + provider id/type
- start/end timestamps + duration + exit code
- skills attached + skills the agent requested
- artifact paths (prompt / output / stdout / stderr) — clickable into the Artifact tab
- files-changed-after, diff insertions/deletions after this stage
- validation summary (when the stage is `validating`)
- review / verification decision (when relevant)
- per-stage notes the orchestrator collected

The endpoint always sets `bestEffort: true` and includes a `notice` explaining what that means. We never invent per-file authorship: when the per-stage diff is unknown, the row says so.

## Secret redaction

The same matchers used by the diff redactor (`src/core/diff-service.ts` → `isSecretLikePath`) apply to the file tree, the file viewer, and the task Files section. A secret-like file is visible in the tree as a `redacted` chip but its bytes never leave the server. In the Task page, declared `touchedFiles` that look like secrets render as a disabled `🔒` row.

## Live codebase freshness

The Project, Codebase, Git, and Run-detail views subscribe to a server-sent-events channel that pushes light freshness deltas (`project.git.changed`, `run.git.changed`, `filetree.changed`, `codebase.snapshot.updated`). Payloads are small — a status summary or up to ~32 changed-file paths — and **never include file contents**.

Routes:

- `GET /api/project/events/stream`
- `GET /api/runs/:runId/codebase/events/stream`

The UI shows a `live · 12s ago` pill in each header. If the channel drops the pill flips to `reconnecting` with exponential backoff up to 30 s; manual refresh always works. Heartbeats every 15 s keep proxies from dropping idle connections.

Watcher cadence is intentionally low-cost: 4 s polling for git status, 8 s polling for filesystem mtimes, and a hard cap of 8 000 walked entries. There is **no** native file-system watcher and no per-file content read for freshness.

## Open in editor

The dashboard ships a narrow handoff to a local editor — never an IDE, never a terminal. Disabled by default. Configure once, per project:

```bash
amaco editor detect            # probes code, code-insiders, cursor
amaco editor set code          # or: amaco editor set cursor
amaco editor test src/foo.ts   # confirms the launch works
```

The `editor` config block in `.amaco/project.yml`:

```yaml
editor:
  enabled: true
  command: code
  args:
    - --goto
    - "{file}:{line}:{column}"
```

`{file}`, `{line}`, `{column}` are substituted **after** the path passes the central path guard. The command itself must be a single token (`a–z A–Z 0–9 _ -`) — no spaces, no shell metacharacters, no path separators. Launches use fixed argv (`shell: false`) with a 10 s timeout.

UI surfaces:

- **File viewer** — header has an `editor` button; secret-like files block the click.
- **Diff viewer** — per-file header gains an `editor` button alongside *Open in project / Open in worktree / Copy path*.
- **Artifact viewer** — clickable code references already deep-link to `#/codebase`; the editor button next to the file viewer takes it the rest of the way.

Each successful or failed launch is logged into the run's `events.ndjson` as `editor.opened` / `editor.open_failed`.

## Review suggestions

Reviewer/verifier artifacts can carry an explicit suggestion block:

```text
AMACO_SUGGESTION:
TITLE: Replace blocking call with async
FILE: src/queue.ts
LINES: 42-58
BODY:
The current implementation deadlocks under contention.
PROPOSED_PATCH:
diff --git a/src/queue.ts b/src/queue.ts
--- a/src/queue.ts
+++ b/src/queue.ts
@@
-…
+…
AMACO_SUGGESTION_END
```

Only blocks that begin with the literal `AMACO_SUGGESTION:` marker are recognised — the parser **never** invents suggestions from prose. Each block becomes a record under `.amaco/runs/<runId>/suggestions.json`:

```json
{
  "id": "s-…",
  "source": "reviewer",
  "sourceArtifactPath": "artifacts/09-review.md",
  "file": "src/queue.ts",
  "lineStart": 42,
  "lineEnd": 58,
  "title": "Replace blocking call with async",
  "body": "…",
  "status": "open",
  "proposedPatch": "diff --git …",
  "requiresApproval": true,
  "approvalId": null
}
```

CLI:

```bash
amaco suggestions list <runId>
amaco suggestions show <runId> <suggestionId>
amaco suggestions approve <runId> <suggestionId> --note "looks right"
amaco suggestions reject <runId> <suggestionId>
amaco suggestions apply <runId> <suggestionId>
```

The dashboard exposes the same flow on a **Suggestions** inspector tab in Run Detail. You can also create a suggestion manually from the file viewer.

## Applying suggestions safely

Suggestion *application* is gated. The flow is:

1. Suggestion is created (parsed or manual).
2. User clicks **Approve** — Amaco writes a fresh approval into `approvals.json`, immediately resolves it as approved, and stamps the suggestion's `approvalId`.
3. User clicks **Apply** — Amaco runs `git apply --check` against the run's worktree first, then `git apply` only if the check passes.

Hard refusals before any git command runs:

- the run has no worktree (project root is **never** a target),
- the suggestion has no `proposedPatch`,
- the suggestion is not in `approved` state,
- any patched path escapes the worktree (`..`, absolute, or `~/`-rooted),
- any patched path matches the secret-file allow-list (`.env`, `*.pem`, `*.key`, `*.p12`, `id_rsa`, `secrets.*`).

If `git apply --check` fails, Amaco never invokes `git apply`. Either way, the suggestion's status flips to `applied` or `failed`, and a `suggestion.applied` / `suggestion.apply_failed` event lands in the run's events log. The worktree is left untouched on failure.

Applying a suggestion **does not** push, merge, or run validation — exactly the same posture as a normal Amaco run reaching `merge_ready`. You stay in control of the merge.

## Why apply is approval-gated

Suggestions can come from a non-deterministic reviewer/verifier model, from a teammate, or from yourself half a coffee in. Routing the apply step through the existing approval system means every patch leaves an audit record in `approvals.json` *and* `events.ndjson`, with the same UI/CLI tooling that already governs every other write-side action in Amaco. There is no path to a one-click apply that bypasses the gate.

## Notifications integration

`suggestion.created` for new attention-worthy suggestions and `suggestion.applied` / `suggestion.apply_failed` for outcomes are routed through the existing notification gateways. We deliberately do **not** push a notification for every filesystem event during a run — freshness lives in the in-page pill, not in the bell.

## Validating applied suggestions

Once a suggestion's patch is applied to the run worktree, you can run the project's configured `commands.validate` against it. Validation is **explicit** — Amaco never quietly runs your test suite, your linter, or your typechecker. You opt in, per suggestion.

```bash
amaco suggestions apply <runId> <suggestionId> --validate
amaco suggestions validate <runId> <suggestionId>
```

The dashboard shows a **Validate** button on every applied suggestion in the Suggestions inspector. Results are persisted to `.amaco/runs/<runId>/suggestion-validations/<suggestionId>.json` and the suggestion's status flips to `validation_passed` or `validation_failed`. If `commands.validate` is empty, the call returns a clear *no commands configured* notice with the exact CLI command to set one — we never claim validation passed when nothing actually ran.

Validation **does not** auto-revert on failure. You decide the next step.

## Review passes / suggestion bundles

A **review pass** is just a named group of suggestions that approve, apply, validate, and revert as a unit. Internally we call them bundles; the user-facing UI says "review pass". Persisted under `.amaco/runs/<runId>/suggestion-bundles.json`.

```bash
amaco bundles list <runId>
amaco bundles create <runId> --title "Reviewer fixes" --suggestion s-1 s-2
amaco bundles add <runId> <bundleId> <suggestionId>
amaco bundles remove <runId> <bundleId> <suggestionId>
amaco bundles preflight <runId> <bundleId>
amaco bundles approve <runId> <bundleId> --note "all good"
amaco bundles apply <runId> <bundleId> --validate
amaco bundles validate <runId> <bundleId>
amaco bundles revert <runId> <bundleId>
```

A bundle:

- can only contain suggestions that belong to the **same run** (cross-run mixing is rejected at create time)
- rejects duplicate suggestion ids
- needs **its own** approval before apply (created and resolved through the same `approvals.json` flow as everything else)
- only edits membership while in `draft`

## Applying multiple suggestions safely

Bundle apply is genuinely **all-or-nothing**:

1. **Static preflight** — every suggestion exists, has a `proposedPatch`, passes the secret-file matcher, has no `..`/absolute/`~/`-rooted targets, and resolves inside the worktree. Same-file overlaps are surfaced as warnings (we still apply; we just tell you).
2. **`git apply --check` for every patch up front.** If any check fails, **nothing is applied** and the bundle flips to `failed`. The worktree is not touched.
3. **Apply each patch in declared order.** If a downstream conflict appears mid-apply (rare — the up-front check usually catches it), Amaco reverse-applies the patches it already landed and leaves the worktree as it was when we started. The bundle flips to `failed`. If even the rollback fails (vanishingly rare with `git apply -R`), the bundle flips to `partially_applied` and the error message surfaces in `errorMessage`.
4. **Persist** the combined applied + reverse patches under `.amaco/runs/<runId>/suggestion-bundles/<bundleId>-applied.patch` and `…-reverse.patch` for safe revert.

The dashboard's review-pass panel surfaces preflight findings inline and labels same-file warnings as warnings, not errors.

## Reverting applied suggestions

Single-suggestion revert uses the captured patch and `git apply -R --check` followed by `git apply -R`:

```bash
amaco suggestions revert <runId> <suggestionId>
amaco bundles revert <runId> <bundleId>
```

Hard refusals before any git command runs:

- the suggestion or bundle was never applied,
- the captured patch file is missing,
- the reverse path would touch secret-like or out-of-worktree files.

`git apply -R --check` runs first. If the worktree has drifted in ways `git apply -R` can no longer reconcile (you edited the same lines manually, or another patch overlaps), the revert flips the suggestion/bundle to `revert_failed` with a clear error and the worktree is **left untouched**. Successful revert flips the status to `reverted` and stamps every member suggestion as `reverted` for bundle-level operations.

We do not use `git reset`. We do not touch the project root. We do not push. We do not merge.

## Validation profiles

The `commands.validate` array is the **default** validation profile — every existing flow keeps using it when no profile is specified. To run a different command set per suggestion or per review pass, configure named profiles under `commands.validationProfiles`:

```yaml
commands:
  validate:
    - pnpm test
  validationProfiles:
    quick:
      description: Fast TypeScript check
      commands:
        - pnpm typecheck
    full:
      description: Full local validation
      commands:
        - pnpm typecheck
        - pnpm test
        - pnpm build
```

Profile names must be a single token of letters/digits/dash/underscore. The names `default`, `all`, and `none` are reserved. Profiles must list at least one command.

```bash
amaco validation profiles                 # list default + every named profile with the resolved commands
amaco validation profile show quick       # show one profile's commands and source
```

### Suggestion-level profile (marker)

Reviewer/verifier artifacts can declare the right profile per suggestion right inside the marker block:

```text
AMACO_SUGGESTION:
TITLE: Fix settings type guard
FILE: src/settings.ts
LINES: 10-20
VALIDATION_PROFILE: quick
BODY: Use a narrower guard before reading settings.value
PROPOSED_PATCH:
diff --git a/src/settings.ts b/src/settings.ts
…
AMACO_SUGGESTION_END
```

The parser captures the profile name verbatim (trimmed). It never invents one from prose. The dashboard preselects this profile in the suggestion's row dropdown ("(from marker)" label) and the CLI honors it without an explicit `--profile`.

### CLI

```bash
amaco suggestions validate <runId> <id> --profile quick
amaco suggestions apply <runId> <id> --validate --profile quick
amaco suggestions apply <runId> <id> --validate --auto-revert-on-fail --profile quick

amaco bundles validate <runId> <bundleId> --profile full
amaco bundles apply <runId> <bundleId> --validate --profile full
amaco bundles smart-apply <runId> <bundleId> --stop-on-validation-fail --profile quick
amaco bundles smart-apply <runId> <bundleId> --stop-on-validation-fail --use-suggestion-profiles
```

`--profile` only applies when validation actually runs (`--validate` or `--stop-on-validation-fail`). The CLI rejects the combo otherwise. `--profile` and `--use-suggestion-profiles` are mutually exclusive — pick the override **or** "let each step decide".

### Resolution rules

1. Caller-supplied `--profile` / `validationProfile` wins (`source: override`).
2. For smart apply with `--use-suggestion-profiles`, each step's own `validationProfile` wins (`source: suggestion`), falling back to the bundle's profile, then to the default.
3. For validate / apply without an override, the suggestion's own `validationProfile` is used when present (`source: suggestion`), then the bundle's profile (`source: bundle`), then the default (`source: default`).
4. Missing profile → 404. Empty profile → 400. Empty default → `no_commands_configured` (the existing behavior is preserved exactly).

Profiles are just named command lists. They are **not** safer than the commands you already configure under `commands.validate` — they only let you scope the validation cost to what each change actually needs. A profile that runs `rm -rf /` is just as dangerous as `commands.validate: ["rm -rf /"]` would be. Configure thoughtfully.

### Persistence

Every validation result file (`.amaco/runs/<runId>/suggestion-validations/<id>.json` and `.../suggestion-bundle-validations/<id>.json`) now records:

```json
{
  "profileName": "quick",
  "profileSource": "suggestion",
  "profileCommands": ["pnpm typecheck"],
  …
}
```

Smart-apply step results (`.../<bundleId>-smart-apply.json`) carry the same per-step profile in `steps[i].validation`. The final report's Review Passes table now includes a `Profile` column.

## Why validation is explicit

Auto-running validation after every apply would either be noisy (validation is slow on real projects) or dishonest (we'd have to invent partial-success modes). Making it a single button keeps the cost visible: you ran it, you got a result. The result file is small (only the head of stdout/stderr — first 4 KB each — and exit codes) so it never bloats `.amaco/`. The opt-in flags below stack on top of that explicit posture — they never run validation as a side effect of a plain *Apply*.

## Apply and validate

Single suggestion:

```bash
amaco suggestions apply <runId> <suggestionId>                       # apply only
amaco suggestions apply <runId> <suggestionId> --validate            # apply, then run commands.validate against the worktree
amaco suggestions apply <runId> <suggestionId> --validate --auto-revert-on-fail
```

The dashboard surfaces the same three options on the suggestion's *Apply* split-button:

- **Apply** — patch only.
- **Apply & validate** — runs `commands.validate` after the patch lands.
- **Apply, validate, revert if validation fails** — opens a confirm prompt that explains what will happen, then chains the three steps.

`--auto-revert-on-fail` is **only** valid with `--validate`. Without `--validate` the CLI exits with a clear error and the API returns 400; the dashboard disables the auto-revert checkbox until the validate option is selected. We never try to revert a patch that didn't go through validation.

`commands.validate` empty? The auto-revert flag is silently downgraded — there's nothing to fail. Status flips to `applied` (not `validation_passed`) and the dashboard shows the "configure validation" hint.

## Auto-revert on validation failure

When validation runs **and** fails **and** the user opted in:

1. Amaco runs `git apply -R --check` against the captured forward patch.
2. If the check passes, runs `git apply -R` and stamps the suggestion `reverted_after_validation_failed`.
3. If the check fails, leaves the worktree byte-for-byte unchanged and stamps `validation_failed_revert_failed` with the underlying error.

The bundle-level flow is identical: `amaco bundles apply ... --validate --auto-revert-on-fail` runs the bundle's combined revert if the post-apply validation fails. Same statuses (`reverted_after_validation_failed` / `validation_failed_revert_failed`) at the bundle level.

Auto-revert *cannot always succeed* — the revert is patch-based, so user edits made after the apply on the same lines can stop `git apply -R --check` cold. When that happens we tell you, in the suggestion's `errorMessage`, in the events log, and in a notification.

## Smart apply review passes

All-or-nothing apply (`amaco bundles apply`) preflights every patch up front and applies them as one transaction with rollback on first failure. **Smart apply** is different: it walks the suggestions one-by-one, optionally validating after each step, optionally reverting only the failing step. Earlier successful steps **stay applied** when a later step fails — that's the whole point.

```bash
amaco bundles smart-apply <runId> <bundleId>
amaco bundles smart-apply <runId> <bundleId> --stop-on-validation-fail
amaco bundles smart-apply <runId> <bundleId> --stop-on-validation-fail --auto-revert-failing
```

Bundle status flow:

- `smart_applied` — every step applied (and validated, if `--stop-on-validation-fail` was on).
- `smart_stopped` — a step's validation failed, the failing step was **not** auto-reverted, prior steps stay applied.
- `smart_reverted_failing` — a step failed validation, the failing step was reverted via `--auto-revert-failing`, prior steps stay applied.
- `smart_failed` — `git apply --check` or `git apply` outright rejected a step (rare; preflight usually catches static issues).

The full step-by-step result is persisted to `.amaco/runs/<runId>/suggestion-bundles/<bundleId>-smart-apply.json`:

```json
{
  "bundleId": "b-…",
  "mode": { "validateEachStep": true, "autoRevertFailing": true },
  "steps": [
    { "suggestionId": "s-1", "applyStatus": "applied", "validation": { "status": "passed", "passed": 1, "failed": 0 }, "revertStatus": null },
    { "suggestionId": "s-2", "applyStatus": "applied", "validation": { "status": "failed", "passed": 0, "failed": 1 }, "revertStatus": "reverted" }
  ],
  "finalStatus": "smart_reverted_failing",
  "failedAt": 1
}
```

The dashboard renders this same step list inline on the review pass (Smart apply block), with status pills per step.

## All-or-nothing vs smart apply

| Mode | When to use | Worktree state on failure |
| --- | --- | --- |
| `bundles apply` (all-or-nothing) | The patches must land together — they depend on each other. | Worktree is restored. The bundle either fully landed or didn't. |
| `bundles apply --validate --auto-revert-on-fail` | Same as above, *plus* you want the patches gone if validation fails. | Worktree is restored if validation fails (or `validation_failed_revert_failed` if the revert itself can't run cleanly). |
| `bundles smart-apply` | Independent patches, you'd rather keep partial progress. | Earlier passing steps stay applied. |
| `bundles smart-apply --stop-on-validation-fail [--auto-revert-failing]` | You want a per-step "is this safe?" gate, optionally reverting only the offending step. | Earlier passing steps stay applied; failing step optionally reverted; later steps not run. |

Smart apply is **not atomic**. If you need atomic, use the all-or-nothing apply. The dashboard labels them as separate buttons; the CLI uses different verbs (`apply` vs `smart-apply`). We never call smart apply atomic.

## Why auto-revert is opt-in

Validation failure does not automatically mean the code is broken. Lint can be cosmetic; a flaky test can be flaky; a typecheck failure can be on a file the user is mid-fix on. Auto-reverting unconditionally would surprise the user and discard work they may have wanted to inspect. Auto-revert is therefore opt-in **per action**: you check a box (or pass `--auto-revert-on-fail`), and the dashboard's confirm prompt restates exactly what's about to happen before fired.

There is no global *always auto-revert* setting. By design.

## Partial states and how to recover

| Status | What it means | Recovery path |
| --- | --- | --- |
| `applied` | Patch on disk, no validation run. | `amaco suggestions validate` or `… revert`. |
| `validation_failed` | Patch on disk, validation failed, no auto-revert opted in. | Inspect, fix, or `amaco suggestions revert`. |
| `reverted_after_validation_failed` | Validation failed, auto-revert restored the worktree. | Done — worktree is back to the pre-apply state. |
| `validation_failed_revert_failed` | Validation failed, auto-revert couldn't run cleanly (drift). | `amaco suggestions revert` after resolving the drift, or manually edit. |
| `smart_stopped` | Smart apply stopped after a failing step; that step is still on disk. | `amaco suggestions revert <runId> <failingId>` to drop just that step, or `amaco bundles revert` to roll the whole pass back. |
| `smart_reverted_failing` | Smart apply stopped, failing step already reverted. Earlier steps on disk. | `amaco bundles revert` if you want to roll back the rest, or leave it. |
| `smart_failed` | `git apply --check` rejected a step. Worktree was not touched. | Inspect the offending suggestion's `errorMessage` and re-author the patch. |
| `partially_applied` (legacy) | Bundle apply mid-failure rollback didn't fully restore. | Manual cleanup; consult `events.ndjson`. Should be very rare. |

## Why revert is patch-based and worktree-only

`git apply -R` is the only revert mechanism that respects the rest of the worktree's state. `git reset --hard` would clobber unrelated changes; a manual snapshot would lose the user's later edits. Patch-based revert with a `--check` pre-flight gives an honest answer: either the patch *can* be reversed cleanly, or it tells you what stopped it. There is no destructive fallback.

## Notifications integration

`suggestion.validation_passed`, `suggestion.validation_failed`, the bundle-level `bundle.created` / `approved` / `applied` / `validation_passed` / `validation_failed` / `reverted` / `revert_failed` events, plus the new `suggestion.auto_revert_succeeded` / `auto_revert_failed`, `bundle.auto_revert_succeeded` / `auto_revert_failed`, and `bundle.smart_apply_started` / `step_passed` / `step_failed` / `step_reverted` / `completed` / `stopped` events, all flow through the existing notification gateways. Internal preflight steps still do **not** notify — the bell stays quiet unless something attention-worthy happened.

## What the UI can and cannot do

It **can**: read the project metadata, browse the file tree (project + run worktrees) with live freshness indicators, view file contents with line numbers, ranges, and syntax highlighting, jump to `path:line` references in artifacts/reviews/comments, see git status + bounded history for project and run worktrees, summarise per-agent work, hand off to a configured local editor, capture review suggestions, apply approved patches inside the run worktree only, group suggestions into review passes, run the project's configured `commands.validate` against the run worktree on demand, opt into auto-revert when validation fails, smart-apply review passes step-by-step with optional per-step validation and per-step revert, and revert applied suggestions or whole review passes via `git apply -R`.

It **cannot** (this phase): edit or save arbitrary files in-browser, push or fetch from a remote, merge, run an interactive terminal, expose `.env` contents, talk to GitHub/GitLab, or sandbox at the OS level. Suggestion + review-pass *apply* / *validate* / *revert* / *smart-apply* are the only write-side actions; every other surface remains read-only. Auto-revert is opt-in per action — there is no global *always auto-revert* setting.

## Limitations of V0

- No model APIs. Local CLIs only.
- No GitHub/GitLab integration, no auto-push, no auto-merge.
- Permissions are orchestration-level, not OS-level sandboxing.
- One built-in linear workflow. Custom DAGs are documented but not implemented.
- No cloud or Docker backends.
- The dashboard's "Logs" tab is read-only — no interactive terminal yet.
- Token/cost metrics depend on the provider exposing them. Generic CLIs and unconfigured Claude Code will show "not reported".
- Approval gates use in-process polling. If you kill `amaco run` while a run is `waiting_for_approval`, the approval still resolves correctly, but the orchestrator is gone — there is no `amaco resume` command in V0. The persisted approval and events remain a complete audit record.
- Skill assignment from the dashboard updates `.amaco/project.yml` directly. There is no "stage approval" gate around config writes.
- The scheduler is **process-bound**, not a daemon. `amaco queue run` is the loop; killing it stops scheduling (queue and conflict warnings persist).
- Conflict detection is best-effort: it compares declared `touchedFiles` and live `git diff` file lists. Globs, prefix matching, and import-graph reasoning are intentionally not in V0.
- Stages within a single task are still strictly sequential. There is no parallel execution within a single task.
- The dashboard does **not** have a "start scheduler" button — that would require spawning a child Amaco process from HTTP. Use `amaco queue run` from your terminal.
- AI-assisted roadmap planning depends on the local planner provider's output. The parser is forgiving but agents will not always produce perfect marker blocks; the dry-run is the user's safety net.
- Dependency surfacing in the UI is **a clean list, not a graph canvas**. V0 deliberately avoids fancy graph rendering.
- WhatsApp is intentionally a placeholder; Slack/Discord/Telegram/webhook gateways ship real, but Amaco still does **not** open PRs or trigger deploys.
- Notifications poll on a 4-second cadence in the dashboard; there is no live SSE stream for the bell yet.
- The dashboard is **read-first**. The only write-side actions are: applying an approved suggestion's patch inside the run worktree, applying a review pass (bundle of approved suggestions), running the project's configured `commands.validate` against the run worktree, and reverting an applied suggestion or pass via `git apply -R`. There is no in-browser editor, no terminal, no save-any-file endpoint, and no auto-merge. Per-agent file attribution remains best-effort.
- Bundle apply is all-or-nothing through `git apply --check` for every patch up front; downstream conflicts mid-apply trigger a reverse-apply rollback. If even the rollback fails, the bundle flips to `partially_applied` rather than pretending success.
- Revert is patch-based via `git apply -R --check` followed by `git apply -R`. If you edited the same lines after the apply, revert can fail cleanly — Amaco never tries to overwrite drifted files with `git reset`.
- Validation is explicit by default. The `--validate` flag (or the dashboard's *Apply & validate* option) opts into a single post-apply validation. The optional `--auto-revert-on-fail` flag (and the corresponding dashboard option) chains a revert when validation fails, but only when validation actually ran. There is no global *always auto-revert* setting and no auto-bisect.
- Smart apply is **not atomic**. Earlier passing steps stay applied when a later step fails — that is what the user opted into. Use the all-or-nothing `bundles apply` if you need atomic.
- Auto-revert is patch-based (`git apply -R`). If you edit the same lines after the apply, `--check` will refuse and the suggestion flips to `validation_failed_revert_failed` with the worktree byte-for-byte unchanged. Manual cleanup is on you in that case.
- Suggestion extraction only recognises explicit `AMACO_SUGGESTION:` marker blocks — natural-language prose is intentionally not auto-parsed.
- Editor handoff launches a single configured command via fixed argv. We do not embed a full editor.

## Roadmap

- Pause/resume active runs and `/btw` notes.
- Interactive approval gates.
- Custom workflow DAGs and parallel agents.
- Docker, remote sandbox, and cloud-runner execution backends.
- Local supervisor dashboard (UI on top of these services).
- GitHub PR creation, GitLab support, optional auto-merge under strict gates.
- Provider presets for Codex / OpenCode / Aider once their flag conventions are pinned.
- Secret scanning, policy plugins, run replay UI.
- Replace the WhatsApp placeholder with a real Twilio / WhatsApp-Cloud-API adapter.

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
