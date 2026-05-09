# Amaco

Amaco is a local-first autonomous multi-agent completion orchestrator for software tasks.

It runs your existing local agent CLIs through a controlled
**plan → architect → implement → validate → review → fix → verify**
loop in isolated git worktrees.

> Working name. Designed so it can be renamed without touching the core architecture.

## What It Is

- A deterministic TypeScript orchestrator around the local agent CLIs you already use.
- Role-specific agents (planner, architect, executor, fixer, reviewer, verifier) backed by editable Markdown prompts.
- A bounded review/fix loop with real validation commands and durable artifacts.
- Worktree-isolated runs with a strict permission model around what each agent may do.

## What It Is Not

- Not a chatbot.
- Not a hosted agent or cloud service.
- Not a Claude Code wrapper. Claude Code is one supported provider; any local CLI works.
- Not a clone of Devin / OpenHands / Open SWE / SWE-Agent / Aider / Codex / OpenCode.
- Not a model API client. Amaco does **not** call Anthropic, OpenAI, or any other model API in V0.

## Why This Exists

Most agent tools either run a single chat in a terminal or hide everything behind a SaaS. Amaco gives you something in between: a small, deterministic, file-based orchestrator that runs your favorite agent CLIs through a sane workflow and leaves audit-friendly artifacts on disk.

## How It Works

```
user task idea
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

Every stage is deterministic TypeScript code. Each agent is a small role definition with an editable prompt. The orchestrator owns the workflow; agents only do their step and hand back artifacts.

## Local-First / No API Calls

- Amaco does not import the Anthropic SDK, OpenAI SDK, Claude Agent SDK, OpenAI Agents SDK, LangChain, or LangGraph.
- It does not require any API keys.
- It does not push, merge, or talk to GitHub.
- It runs the local CLI commands you already trust.

## Installation

```bash
pnpm add -D amaco        # local
# or
pnpm add -g amaco        # global
```

> Until published, link from a checkout:
> ```bash
> pnpm install
> pnpm build
> pnpm link --global
> ```

## Quickstart

Inside a git repository:

```bash
amaco init
amaco doctor
amaco run "Add policy re-acceptance when Terms or Privacy version changes"
amaco status
amaco abort 20260509-143012-add-policy-reacceptance
```

`amaco run` will:

1. Create a run folder in `.amaco/runs/<run-id>/`.
2. Create a git worktree at `../.amaco-worktrees/<run-id>` on a new branch `amaco/<run-id>`.
3. Walk planner → architect → executor → validate → reviewer (→ fixer loop) → verifier.
4. Write durable artifacts and a final report.

Amaco never pushes or merges. You inspect the worktree, decide, and merge manually.

## Project Configuration

`amaco init` creates:

```
.amaco/
  project.yml
  rules.md
  agents/
    planner.md
    architect.md
    executor.md
    fixer.md
    reviewer.md
    verifier.md
  skills/
    README.md
  runs/
```

Edit `.amaco/project.yml` to point each agent at the provider you want, configure validation commands, and tune permissions.

### Validation Commands

```yaml
commands:
  validate:
    - pnpm lint
    - pnpm typecheck
    - pnpm test
```

Validation runs in the worktree. All commands run; one failure does not stop the rest. Reviewer and verifier see the results.

If you don't configure any, Amaco still runs, but reviewer/verifier will be honest about the weak signal.

## Agent Configuration

```yaml
agents:
  reviewer:
    provider: claude
    prompt: .amaco/agents/reviewer.md
    permissions: read_only
    skills:
      - security
      - testing
```

Each agent has its own editable Markdown prompt. The orchestrator wraps every prompt with safety boundaries and the relevant context (rules, prior artifacts, validation results, permission summary).

## Skills

Skills are reusable instruction bundles in `.amaco/skills/<name>.md`. To attach them, list the filename stem under an agent's `skills` array. Amaco will fail loudly if a configured skill file is missing. There is no automatic skill selection in V0.

## Permission Profiles

Built-in profiles: `read_only`, `code_write`, `review_only`, `verify_only`.

```yaml
permissions:
  profiles:
    code_write:
      allowWrite: true
      allowShell: true
      cwd: worktree
      forbiddenPaths:
        - ".env"
        - ".env.*"
      forbiddenOperations:
        - "push"
        - "merge"
        - "delete-worktree"
```

Permissions in V0 are **orchestration-level**, not OS sandboxing. They control:

- which cwd the agent runs in (always `worktree` for write-enabled agents),
- what boundaries are injected into the prompt,
- what invariants the orchestrator enforces before invoking the provider.

A V0 permission profile cannot stop a misbehaving CLI from doing something destructive on your machine. Use providers you trust.

## CLI Provider Model

A provider is just a local CLI you can pipe a prompt to.

```ts
type CliProvider = {
  type: "cli";
  command: string;
  args?: string[];
  input: "stdin" | "arg";
  env?: Record<string, string>;
};
```

### Claude Code Example

```yaml
providers:
  claude:
    type: cli
    command: claude
    args: ["-p"]
    input: stdin
```

### Custom CLI Example

You can wire any CLI that accepts a prompt via stdin or a single argument. Aider, Codex, OpenCode, or your own script all fit. (Amaco does not prescribe specific flags for those — configure whatever your tool actually expects.)

```yaml
providers:
  myagent:
    type: cli
    command: ./bin/myagent
    args: ["--prompt"]
    input: arg
```

## Run Artifacts

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

Artifacts are durable Markdown / JSON. The state file is JSON; events are NDJSON. A future GUI can render this without any extra plumbing.

## Safety Model

- Worktree isolation. All write-enabled agents run in a fresh worktree on a fresh branch.
- No auto-push. No auto-merge. The orchestrator refuses to enable either.
- `.env` files are flagged but never read into prompts. Their contents are never inlined.
- Recursive repo dumps are avoided. Agents inspect files themselves through their own CLIs.
- Bounded fix loops via `workflow.maxReviewLoops`. After exhaustion, the run becomes `blocked`.
- Reviewer must emit a `DECISION: ...` line. Missing/invalid decisions are treated as `BLOCKED`.
- Verifier must emit a `VERIFICATION: ...` line. Missing/invalid verifications are treated as `NEEDS_HUMAN`.
- Final status is `merge_ready` only when reviewer approved **and** verifier passed.

> Amaco is not a full sandbox in V0. It runs local CLI tools on your machine. Configure only providers you trust.

## Limitations of V0

- No model APIs. Local CLIs only.
- No GitHub / GitLab integration.
- No real-time daemon. Runs are synchronous; abort marks state but does not kill child processes (V0 runs are sequential).
- Permissions are orchestration-level, not OS-level sandboxing.
- One built-in linear workflow. Custom DAGs are documented but not implemented.
- No cloud backend, no Docker backend.

## Roadmap

Documented but not implemented in V0:

- Pause/resume active runs and `/btw` notes during runs.
- Interactive approval gates and human-in-the-loop UI.
- Custom workflow DAGs and parallel agents.
- Docker, remote sandbox, and cloud-runner execution backends.
- GUI dashboard (desktop and web).
- GitHub PR creation, GitLab support, optional auto-merge under strict gates.
- Richer JSON review schemas.
- Provider presets for OpenCode / Aider / Codex.
- Claude Agent SDK and OpenAI Agents SDK adapters.
- Secret scanning, policy plugins, run replay UI.
- Multi-project workspace and team mode.

## Contributing

Amaco is small on purpose. Issues and PRs welcome.

Architecture conventions to keep contributions coherent:

- `src/core/` — orchestrator and durable run primitives. Don't reach into provider/git directly from CLI.
- `src/workflow/` — workflow definitions. The default workflow is data; custom workflows will plug in here.
- `src/providers/` — provider abstractions. Adding a new local CLI preset is a small change here.
- `src/execution/` — execution backends. The local-worktree backend is the only V0 implementation; new backends slot in behind the same interface.
- `src/permissions/` — permission profiles and access policy. Don't bypass profile resolution.
- `src/project/` — project config schema and init template. Renaming `.amaco` later only requires changes in `src/utils/paths.ts`.
- `src/utils/` — small helpers. Keep them dependency-free.

## License

MIT
