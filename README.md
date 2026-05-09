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
- No external Slack/Telegram/PR pipelines, no auto-merge, no auto-deploy.

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
