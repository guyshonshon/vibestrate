# Amaco — Autonomous Multi-Agent Completion Orchestrator — Claude Code Implementation Spec

## Working Product Name

Use this working name for now:

> **Amaco**

Repository/package name:

```txt
amaco
```

CLI command:

```txt
amaco
```

This name is only a working implementation name. Keep naming isolated in package metadata, README, and generated templates so it can be renamed later without touching the core architecture.

## One-Line Definition

Amaco is a **local-first autonomous multi-agent completion orchestrator** that runs agent CLIs through a rules-based:

```txt
plan → architect → implement → validate → review → fix → verify
```

loop inside isolated git worktrees.

It uses the user’s existing local agent CLIs, such as Claude Code, Codex, OpenCode, Aider, or custom commands.

It does **not** call model APIs in V0.

---

# 1. What We Are Building

Build the first serious open-source version of a reusable local-first autonomous multi-agent software task task orchestrator.

The tool should let a developer run:

```bash
amaco init
amaco run "Add policy re-acceptance when Terms or Privacy changes"
amaco status
amaco abort <run-id>
```

Then the orchestrator should autonomously run a controlled workflow:

```txt
user task idea
↓
planner agent
↓
architect / risk agent
↓
executor agent
↓
deterministic validation commands
↓
reviewer agent
↓
fixer agent, if needed
↓
validation again
↓
review again
↓
verifier agent
↓
merge-ready / blocked / failed report
```

The goal is to eliminate human involvement during the routine middle of the task while preserving human approval for risky, blocked, destructive, or merge-sensitive decisions.

The orchestrator owns the workflow. Agents are workers.

---

# 2. Core Product Philosophy

The product is **not** a chatbot.

It is **not** a prompt generator.

It is **not** a hosted agent.

It is **not** a Claude Code wrapper only.

It is **not** a clone of Open SWE, SWE-AF, Devin, OpenHands, Aider, Claude Code, or Codex.

It is a local-first orchestration layer around agent CLIs.

Core principle:

> Deterministic orchestrator.  
> Role-specific agents.  
> Strict permissions.  
> Durable artifacts.  
> Real validation commands.  
> Bounded fix loops.  
> Human only on exceptions.

Agents must not freely “group chat” with each other.

Agents hand off work through files/artifacts controlled by the orchestrator.

The system should feel autonomous, but it should be inspectable and controllable.

---

# 3. Scope for This Implementation

Implement a real V0/V1 foundation that is small enough to finish, but architected correctly for future expansion.

## Must Implement Now

- TypeScript Node.js CLI package.
- Project initialization.
- Project config file.
- Rules file.
- Agent definitions.
- Permission profiles.
- Local CLI provider system.
- Git worktree isolation.
- Run state machine.
- Artifact store.
- Event log.
- Planner agent stage.
- Architect/risk agent stage.
- Executor agent stage.
- Validation command runner.
- Reviewer agent stage.
- Fixer loop.
- Verifier stage.
- Final report.
- Status command.
- Abort command.
- Tests.
- Strong README.

## Must Design For, But Not Fully Implement Now

- Adding more agents.
- Custom agent graphs.
- Agent skills / instruction bundles.
- Deep access control.
- Tool/command allowlists.
- Different provider backends.
- Cloud execution backends.
- Docker sandbox backends.
- GUI / immersive local dashboard.
- GitHub PR integrations.
- Remote runners.
- Multi-model routing.

Create clean interfaces and folder structure so these can be added without rewriting the project.

## Must Not Implement Now

- Anthropic API.
- OpenAI API.
- Claude Agent SDK.
- OpenAI Agents SDK.
- LangChain.
- LangGraph.
- Hosted backend.
- Cloud sandbox.
- Database.
- Web dashboard.
- GitHub API.
- Auto-push.
- Auto-merge.
- Real-time daemon.
- Long-running background service.

V0 is local CLI orchestration only.

---

# 4. Technical Stack

Use:

```txt
TypeScript
Node.js
pnpm
ESM
commander
zod
execa
yaml
vitest
tsx
tsup
```

Use strict TypeScript.

Prefer boring, readable, maintainable code.

Avoid premature abstractions, but design the boundaries correctly.

---

# 5. Architecture Overview

The architecture must be layered.

```txt
apps / CLI
  ↓
orchestrator core
  ↓
workflow state machine
  ↓
agent registry
  ↓
provider adapters
  ↓
execution backends
  ↓
project adapters / config
  ↓
artifact store / event log
```

The core orchestrator must not be tied to Claude Code specifically.

Claude Code should be just one local CLI provider preset.

The orchestrator should be able to run any CLI command that accepts input through stdin or argument.

---

# 6. Repository Structure

Create this structure:

```txt
amaco/
  package.json
  pnpm-lock.yaml
  tsconfig.json
  tsup.config.ts
  vitest.config.ts
  README.md
  LICENSE
  .gitignore

  src/
    cli/
      index.ts
      commands/
        init.ts
        run.ts
        status.ts
        abort.ts
        doctor.ts

    core/
      orchestrator.ts
      run-context.ts
      state-machine.ts
      artifact-store.ts
      event-log.ts
      policy-engine.ts
      prompt-builder.ts
      review-parser.ts
      validation-runner.ts
      final-report.ts

    workflow/
      workflow-schema.ts
      default-workflow.ts
      workflow-runner.ts
      workflow-types.ts

    agents/
      agent-schema.ts
      agent-registry.ts
      default-agents.ts
      default-prompts/
        planner.md
        architect.md
        executor.md
        fixer.md
        reviewer.md
        verifier.md

    permissions/
      permission-schema.ts
      permission-profiles.ts
      access-policy.ts

    providers/
      provider-schema.ts
      provider-types.ts
      provider-runner.ts
      cli-provider.ts
      presets/
        claude-code.ts
        generic-cli.ts

    execution/
      execution-backend-schema.ts
      local-worktree-backend.ts
      command-runner.ts

    git/
      git.ts
      worktree.ts

    project/
      config-schema.ts
      config-loader.ts
      init-template.ts
      project-detector.ts

    skills/
      skill-schema.ts
      skill-loader.ts

    utils/
      fs.ts
      paths.ts
      slug.ts
      time.ts
      errors.ts
      json.ts

  tests/
    config-loader.test.ts
    slug.test.ts
    artifact-store.test.ts
    state-machine.test.ts
    prompt-builder.test.ts
    review-parser.test.ts
    validation-runner.test.ts
    permission-profiles.test.ts
    workflow-schema.test.ts
```

If you slightly adjust the structure for maintainability, explain why in the final report.

---

# 7. Core Concepts

## 7.1 Orchestrator

The orchestrator is deterministic TypeScript code.

It decides:

- what stage runs next
- which agent runs
- what context the agent receives
- what provider executes the agent
- what cwd is used
- what permissions are allowed
- what artifact must be produced
- how review decisions are parsed
- when fix loops run
- when max loops are reached
- when human approval is required
- when the run is merge-ready or blocked

The orchestrator must never rely on an agent to decide the whole lifecycle.

Agents may recommend, but the orchestrator decides.

## 7.2 Agents

Agents are role definitions.

Example agents:

```txt
planner
architect
executor
fixer
reviewer
verifier
```

Each agent has:

- id
- display name
- purpose
- prompt template
- provider
- permission profile
- required inputs
- expected outputs
- run cwd policy
- whether it may write code
- whether it may run commands
- whether it may access validation results
- whether it may request human approval

## 7.3 Providers

Providers execute agents.

For V0, implement only local CLI providers.

Example providers:

```txt
claude-code
generic-cli
```

Do not implement model APIs.

## 7.4 Workflows

A workflow is a graph or ordered state machine of stages.

V0 should include a default linear workflow:

```txt
planner → architect → executor → validate → reviewer → fixer loop → verifier → final report
```

The architecture should support custom workflows later.

## 7.5 Permissions

Permissions define what an agent is allowed to do.

V0 cannot fully sandbox arbitrary local CLIs. Be honest.

But V0 must implement structured permission metadata, prompt boundaries, cwd control, and future extension points.

## 7.6 Skills

Skills are reusable instruction bundles that can be attached to agents or projects.

Example skills:

```txt
security
frontend-ux
testing
privacy
database
performance
accessibility
```

V0 should support loading `.amaco/skills/*.md` and including relevant skill files in prompts when an agent or workflow requests them.

Do not implement complex semantic skill selection in V0.

Support explicit skills only.

---

# 8. Project Installation Model

Inside any target project, the user runs:

```bash
amaco init
```

This creates:

```txt
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

Use `.amaco`, not `.aid`, because the product command is `amaco`.

Make it easy to rename later by centralizing paths.

---

# 9. Default `.amaco/project.yml`

Generate:

```yaml
project:
  name: "__CURRENT_FOLDER_NAME__"
  type: generic

git:
  mainBranch: main
  branchPrefix: amaco/
  worktreeDir: ../.amaco-worktrees
  requireCleanMain: false
  allowAutoMerge: false
  allowAutoPush: false

workflow:
  id: default-plan-build-review
  maxReviewLoops: 2
  requireHumanMerge: true

execution:
  backend: local-worktree

providers:
  claude:
    type: cli
    command: claude
    args:
      - "-p"
    input: stdin

agents:
  planner:
    provider: claude
    prompt: .amaco/agents/planner.md
    permissions: read_only
    skills: []

  architect:
    provider: claude
    prompt: .amaco/agents/architect.md
    permissions: read_only
    skills: []

  executor:
    provider: claude
    prompt: .amaco/agents/executor.md
    permissions: code_write
    skills: []

  fixer:
    provider: claude
    prompt: .amaco/agents/fixer.md
    permissions: code_write
    skills: []

  reviewer:
    provider: claude
    prompt: .amaco/agents/reviewer.md
    permissions: read_only
    skills: []

  verifier:
    provider: claude
    prompt: .amaco/agents/verifier.md
    permissions: read_only
    skills: []

commands:
  validate: []

permissions:
  profiles:
    read_only:
      allowWrite: false
      allowShell: false
      cwd: worktree
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

policies:
  forbidMainBranchWrites: true
  forbidSecretsAccess: true
  forbidAutoPush: true
  forbidAutoMerge: true
  preserveArtifacts: true
```

Important: `permissions` are not a true OS sandbox in V0. They control prompt constraints, cwd, orchestration checks, and future extension points.

Document this honestly.

---

# 10. Default `.amaco/rules.md`

Generate:

```md
# Project Rules for Amaco

These rules are provided to local agent CLIs during Amaco runs.

## Project Overview

Describe the project here.

## Architecture Rules

Add architecture constraints here.

## Code Style Rules

Add code style and implementation conventions here.

## Testing Rules

Add testing expectations here.

## Security Rules

Examples:
- Do not read or print secrets.
- Do not edit `.env` files.
- Do not weaken authentication or authorization.
- Do not skip validation commands.
- Do not fake test results.
- Do not make unrelated broad refactors.

## Product / UX Rules

Add product behavior, UX, and copywriting rules here.

## Agent Behavior Rules

- Stay within task scope.
- Ask for human approval only when blocked, unsafe, ambiguous, or when destructive actions are needed.
- Do not push.
- Do not merge.
- Preserve artifacts.
- Report uncertainty clearly.

## Additional Notes

Add anything planner, architect, executor, reviewer, and verifier agents should know.
```

---

# 11. Default Agent Prompt Files

`amaco init` should create editable default agent prompt files:

```txt
.amaco/agents/planner.md
.amaco/agents/architect.md
.amaco/agents/executor.md
.amaco/agents/fixer.md
.amaco/agents/reviewer.md
.amaco/agents/verifier.md
```

The built-in templates should also exist in:

```txt
src/agents/default-prompts/
```

The generated project files should be copies that the user can customize.

---

# 12. Agent Prompt Requirements

## 12.1 Planner Agent

Purpose:

Turn a loose idea into an actionable task.

Access:

Read-only.

Output:

```md
# Plan

## Normalized Task

## Goal

## Scope

## Non-Goals

## Affected Areas

## Implementation Steps

## Validation Strategy

## Risks

## Human Approval Needed?

## Reviewer Checklist
```

Rules:

- Do not code.
- Do not modify files.
- Do not assume missing facts.
- Identify ambiguity.
- Identify dangerous or destructive requirements.
- Create a useful implementation plan.

## 12.2 Architect Agent

Purpose:

Assess architecture, risk, boundaries, and integration approach.

Access:

Read-only.

Output:

```md
# Architecture / Risk Decision

## Summary

## Relevant Constraints

## Recommended Approach

## Data / API / State Implications

## Security / Privacy Notes

## Testing Implications

## Risks and Mitigations

## Executor Boundaries

## Human Approval Needed?
```

Rules:

- Do not code.
- Do not modify files.
- Be conservative around auth, privacy, security, payments, migrations, destructive operations, or cross-service contracts.
- Define implementation boundaries for executor.

## 12.3 Executor Agent

Purpose:

Implement the scoped task.

Access:

Write-enabled inside git worktree.

Output:

```md
# Implementation Summary

## Files Changed

## Commands Run

## Notes / Risks

## Anything Not Completed
```

Rules:

- Implement only scoped changes.
- Do not broaden scope.
- Do not push.
- Do not merge.
- Do not edit secrets.
- Do not weaken tests.
- Do not fake results.
- Do not add placeholder implementations.
- Use project conventions.
- Run relevant checks when possible.

## 12.4 Fixer Agent

Purpose:

Fix validation/review failures only.

Access:

Write-enabled inside git worktree.

Output:

```md
# Fix Summary

## Findings Addressed

## Files Changed

## Commands Run

## Remaining Concerns
```

Rules:

- Fix only reviewer/test findings.
- Do not change scope.
- Do not weaken tests unless explicitly justified and safe.
- Do not push.
- Do not merge.

## 12.5 Reviewer Agent

Purpose:

Review implementation against plan, architecture, validation, and project rules.

Access:

Read-only.

Must output one decision line:

```txt
DECISION: APPROVED
```

or:

```txt
DECISION: CHANGES_REQUESTED
```

or:

```txt
DECISION: BLOCKED
```

Output:

```md
# Review

DECISION: APPROVED | CHANGES_REQUESTED | BLOCKED

## Summary

## Findings

## Required Fixes

## Validation Assessment

## Scope Assessment

## Security / Privacy Assessment

## Merge Readiness

## Human Approval Needed?
```

Decision rules:

Use `APPROVED` only when implementation matches scope, validation is acceptable, and no serious issues remain.

Use `CHANGES_REQUESTED` when concrete fixable issues remain.

Use `BLOCKED` when human decision is needed, task is unsafe, requirements are too ambiguous, implementation is fundamentally wrong, or validation cannot produce a meaningful signal.

## 12.6 Verifier Agent

Purpose:

Final acceptance check after reviewer approval.

Access:

Read-only.

Output:

```md
# Final Verification

## Acceptance Summary

## Validation Summary

## Remaining Risks

## Final Status

VERIFICATION: PASSED | FAILED | NEEDS_HUMAN
```

Rules:

- Check the full run holistically.
- Verify the reviewer’s approval is consistent with artifacts.
- Do not approve if validation failed without justification.
- Do not approve if review was missing or invalid.
- Do not merge.
- Do not push.

---

# 13. Skills System

Implement a simple explicit skill loader.

Project skills live in:

```txt
.amaco/skills/
```

Each skill is a Markdown file:

```txt
.amaco/skills/security.md
.amaco/skills/frontend-ux.md
.amaco/skills/testing.md
```

Agents can reference skills by filename stem in `.amaco/project.yml`:

```yaml
agents:
  reviewer:
    skills:
      - security
      - testing
```

Prompt builder should include the contents of those skill files under a clear section:

```md
# Attached Skills

## security

<content>

## testing

<content>
```

Rules:

- If a configured skill is missing, fail with a clear error.
- Do not auto-select skills in V0.
- Do not read skills outside `.amaco/skills`.
- Prevent path traversal.

---

# 14. Permissions System

Create permission profiles as first-class config.

V0 permissions are orchestration-level, not true OS sandboxing.

Permission profile fields:

```ts
type PermissionProfile = {
  allowWrite: boolean;
  allowShell: boolean;
  cwd: "project-root" | "worktree";
  forbiddenPaths?: string[];
  forbiddenOperations?: string[];
};
```

Built-in permission profiles:

```txt
read_only
code_write
review_only
verify_only
```

Behavior:

- Planner, architect, reviewer, verifier should use read-only profiles by default.
- Executor and fixer should use code-write profile.
- Write-enabled agents must run in the worktree.
- If config attempts to run a write-enabled agent in project-root, fail.
- If auto-push or auto-merge is enabled in V0, fail.
- Prompt builder should include permission boundaries in each agent prompt.
- Event log should record which permission profile was used.

Future extension:

- OS sandbox.
- Docker sandbox.
- command allowlists.
- filesystem allowlists.
- approval hooks.
- cloud worker policies.

Do not implement those now, but keep schema extensible.

---

# 15. Provider System

Implement a provider registry with local CLI providers.

Provider schema:

```ts
type CliProvider = {
  type: "cli";
  command: string;
  args?: string[];
  input: "stdin" | "arg";
  env?: Record<string, string>;
};
```

Support:

```txt
stdin
arg
```

Do not support file input in V0 unless trivial and tested.

Provider result:

```ts
type ProviderRunResult = {
  providerId: string;
  command: string;
  args: string[];
  cwd: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  startedAt: string;
  endedAt: string;
};
```

Requirements:

- Use `execa`.
- Capture stdout/stderr.
- Preserve stderr.
- Return structured result.
- Write full outputs to artifacts.
- Fail clearly if command is missing.
- Do not shell-concatenate prompts unsafely.
- Avoid leaking secrets intentionally.

Provider presets:

- `claude-code` preset documented as using `claude -p`.
- `generic-cli` preset.

Do not make claims about exact Codex/OpenCode/Aider flags unless verified. Document them as custom CLI examples.

---

# 16. Execution Backend System

Create an execution backend abstraction even though V0 implements only local worktree.

Backend interface concept:

```ts
type ExecutionBackend = {
  id: string;
  prepareRun(context): Promise<PreparedExecution>;
  getCwdForAgent(agent): string;
  cleanup?(context): Promise<void>;
};
```

V0 backend:

```txt
local-worktree
```

Responsibilities:

- create git worktree
- create branch
- return worktree path
- prevent writes to original project root
- do not delete worktree automatically

Future backend IDs, documented only:

```txt
docker
remote-sandbox
cloud-runner
```

Do not implement future backends now.

---

# 17. Workflow System

Implement the default workflow as data/config, not hardcoded spaghetti.

Default stages:

```txt
planning
architecting
executing
validating
reviewing
fixing
verifying
finalizing
```

State statuses:

```txt
created
planning
planned
architecting
architected
executing
validating
reviewing
fixing
verifying
merge_ready
blocked
failed
aborted
```

Even if V0 has a single built-in workflow, design the code so a future workflow can define:

- which agents exist
- stage order
- loop rules
- max loops
- approval gates
- optional stages

Do not implement full arbitrary DAG execution in V0. Keep the default workflow reliable.

---

# 18. Run Folder Structure

Create run folder in the original project:

```txt
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

Not every file exists for every run.

Artifacts must be durable and readable.

---

# 19. Run ID

Format:

```txt
YYYYMMDD-HHMMSS-<slug>
```

Example:

```txt
20260509-143012-add-policy-reacceptance
```

Slug rules:

- lowercase
- trim
- spaces to dashes
- remove unsafe characters
- collapse duplicate dashes
- max 60 characters
- fallback to `task` when empty

Add tests.

---

# 20. State File

Create:

```json
{
  "runId": "20260509-143012-add-policy-reacceptance",
  "task": "Add policy re-acceptance when Terms or Privacy version changes",
  "status": "created",
  "projectRoot": "/absolute/path/to/project",
  "worktreePath": "/absolute/path/to/.amaco-worktrees/20260509-143012-add-policy-reacceptance",
  "branchName": "amaco/20260509-143012-add-policy-reacceptance",
  "reviewLoopCount": 0,
  "maxReviewLoops": 2,
  "startedAt": "2026-05-09T11:30:12.000Z",
  "updatedAt": "2026-05-09T11:30:12.000Z",
  "finalDecision": null,
  "verification": null,
  "error": null
}
```

Use strict types.

Every transition updates `updatedAt`.

Invalid transitions throw clear errors.

Add tests.

---

# 21. Event Log

Create:

```txt
events.ndjson
```

Each event:

```json
{"timestamp":"...","type":"run.created","message":"Run created","data":{}}
```

Events:

```txt
run.created
state.changed
git.worktree.created
agent.started
agent.completed
agent.failed
provider.started
provider.completed
provider.failed
validation.started
validation.command.completed
review.decision
verification.decision
run.completed
run.failed
run.aborted
```

Do not log secrets.

Do not dump full prompts into events.

Prompts are artifacts.

---

# 22. Git Behavior

Required:

1. Detect git repository.
2. Detect git root.
3. Detect current branch.
4. Create branch name:

```txt
config.git.branchPrefix + runId
```

5. Create worktree:

```bash
git worktree add -b <branchName> <worktreePath>
```

6. If branch exists, fail clearly.
7. If worktree path exists, fail clearly.
8. Do not checkout or modify original working tree source files.
9. Do not delete worktrees automatically.
10. Do not push.
11. Do not merge.

If `policies.forbidMainBranchWrites` is true, no write-enabled provider may run in project root.

Executor and fixer must run in worktree.

Validation commands run in worktree.

Reviewer/verifier run in worktree read-only.

---

# 23. Policy Engine

Implement policy checks:

- `.amaco/project.yml` exists before `amaco run`.
- current directory is inside git repository.
- auto-push disabled.
- auto-merge disabled.
- write-enabled agents use worktree cwd.
- `.env`, `.env.local`, `.env.production`, `.env.development` warnings.
- do not read `.env` contents.
- do not include `.env` contents in prompts.
- do not recursively dump entire repo into prompts.
- refuse destructive cleanup.

The policy engine should produce warnings and hard failures.

Warnings should be written to events and final report.

Hard failures should mark run failed before running agents.

---

# 24. Validation Runner

Read:

```yaml
commands:
  validate:
    - pnpm lint
    - pnpm typecheck
    - pnpm test
```

Run all commands in worktree.

Do not stop after first failure.

Capture each result:

```json
{
  "commands": [
    {
      "command": "pnpm lint",
      "exitCode": 0,
      "status": "passed",
      "durationMs": 1234,
      "stdoutPath": "artifacts/validation/pnpm-lint.stdout.txt",
      "stderrPath": "artifacts/validation/pnpm-lint.stderr.txt"
    }
  ],
  "summary": {
    "total": 3,
    "passed": 2,
    "failed": 1
  }
}
```

If no commands configured:

```json
{
  "commands": [],
  "summary": {
    "total": 0,
    "passed": 0,
    "failed": 0
  },
  "note": "No validation commands configured."
}
```

Reviewer and verifier should see this.

Do not claim tests passed unless commands actually ran and exited 0.

---

# 25. Review Parser

Parse exact decision line:

```txt
DECISION: APPROVED
DECISION: CHANGES_REQUESTED
DECISION: BLOCKED
```

If missing or invalid, treat as blocked:

```txt
Reviewer did not provide a valid DECISION line.
```

Add tests.

---

# 26. Verification Parser

Parse verifier line:

```txt
VERIFICATION: PASSED
VERIFICATION: FAILED
VERIFICATION: NEEDS_HUMAN
```

If missing or invalid, treat as `NEEDS_HUMAN`.

If reviewer approved but verifier fails, final status should be blocked, not merge-ready.

---

# 27. Prompt Builder

Prompt builder should assemble prompts from:

- task idea
- project rules
- project config summary
- agent prompt template
- attached skills
- previous artifacts
- permission profile
- expected output format
- safety boundaries
- run context
- validation results where relevant

Do not inline entire repository.

Do not read secret files.

Do not include `.env`.

Do not include huge files automatically.

Agents can inspect project files themselves if their local CLI supports it.

Every prompt must include:

```txt
You are running under Amaco.
Do not push.
Do not merge.
Respect your role and permission boundaries.
If blocked, say so clearly.
Do not fake results.
```

Executor/fixer prompts must include:

```txt
All code changes must happen only in the git worktree.
Do not edit secrets.
Do not weaken tests just to pass validation.
Do not make unrelated broad refactors.
```

Reviewer/verifier prompts must include:

```txt
You are read-only.
Review artifacts and diff.
Do not edit files.
```

---

# 28. CLI Commands

Implement:

```bash
amaco init
amaco run "<task idea>"
amaco status
amaco abort <run-id>
amaco doctor
```

## 28.1 `amaco init`

Creates `.amaco`.

Options:

```bash
amaco init --force
```

Do not overwrite existing config without `--force`.

Do not delete existing runs.

## 28.2 `amaco run`

Required:

- task idea argument
- git repo
- `.amaco/project.yml`
- create run folder
- create worktree
- run full default workflow
- print progress
- write artifacts
- final report

Terminal output should be concise:

```txt
Amaco run created: 20260509-143012-add-policy-reacceptance
Worktree: ../.amaco-worktrees/20260509-143012-add-policy-reacceptance
Branch: amaco/20260509-143012-add-policy-reacceptance

Planning...
Architecting...
Executing...
Validating...
Reviewing...
Verifying...

Final status: merge_ready
Artifacts: .amaco/runs/20260509-143012-add-policy-reacceptance
```

Do not print full prompts to terminal.

## 28.3 `amaco status`

Shows recent runs.

Fields:

- run id
- task
- status
- branch
- worktree path
- startedAt
- updatedAt
- finalDecision
- verification

Support:

```bash
amaco status --json
```

## 28.4 `amaco abort <run-id>`

Marks run aborted.

V0 does not kill background processes because V0 runs are synchronous.

Do not delete worktree.

Explain manual cleanup.

## 28.5 `amaco doctor`

Useful for open-source usability.

Checks:

- inside git repo
- `.amaco/project.yml` exists
- config valid
- provider commands appear available
- git available
- validation commands configured
- warns if `.env` files exist
- reports CLI version

Do not fail project if validation commands are empty; warn.

---

# 29. Final Report

Write:

```txt
12-final-report.md
```

Structure:

```md
# Amaco Final Report

## Run

- Run ID:
- Task:
- Status:
- Branch:
- Worktree:
- Started:
- Updated:

## Final Decision

APPROVED / CHANGES_REQUESTED / BLOCKED / FAILED

## Verification

PASSED / FAILED / NEEDS_HUMAN

## Summary

## Planner Output

Path:

## Architecture Output

Path:

## Execution Output

Path:

## Validation Results

Summary table.

## Review Output

Path:

## Review Loops

## Policy Warnings

## Next Steps

If merge_ready:
- Inspect the worktree.
- Review the diff.
- Run validation manually if desired.
- Merge manually.

If blocked:
- Read the review and verification artifacts.
- Resolve blocker.
- Start a new run or continue manually.
```

Never claim merge happened.

---

# 30. Open-Source README

Write a polished README.

Use this definition prominently:

```md
Amaco is a local-first autonomous multi-agent completion orchestrator for software tasks.

It runs your existing local agent CLIs through a controlled plan → architect → implement → validate → review → fix → verify loop in isolated git worktrees.
```

README sections:

```md
# Amaco

## What It Is

## What It Is Not

## Why This Exists

## How It Works

## Local-First / No API Calls

## Installation

## Quickstart

## Project Configuration

## Agent Configuration

## Skills

## Permission Profiles

## Validation Commands

## CLI Provider Model

## Claude Code Example

## Custom CLI Example

## Run Artifacts

## Safety Model

## Limitations of V0

## Roadmap

## Contributing

## License
```

Important messaging:

- no model APIs
- no cloud required
- no auto-push
- no auto-merge
- local CLI tools only
- worktree isolation
- not a full security sandbox in V0
- extensible architecture for future GUI/cloud/providers

---

# 31. GUI Future-Proofing

Do not implement the GUI in V0.

But structure artifacts and state so a GUI can be added later.

Specifically:

- Use JSON state.
- Use NDJSON events.
- Use markdown artifacts.
- Use stable artifact names.
- Keep run metadata easy to list.
- Keep core orchestrator separate from CLI.
- Avoid direct `console.log` inside core logic; return events/progress to CLI.

Document future GUI:

```txt
A local dashboard could visualize runs, stages, artifacts, diffs, validation output, review decisions, and approval gates.
```

Future GUI package might be:

```txt
apps/desktop
apps/web
```

Do not create now.

---

# 32. Cloud Future-Proofing

Do not implement cloud.

But design for future execution backends.

Backend abstraction should make this possible later:

```txt
local-worktree
docker
remote-sandbox
cloud-runner
```

Keep backend interface clean.

Do not let the orchestrator directly hardcode git worktree logic everywhere.

Only local worktree backend is implemented now.

---

# 33. Human Approval Gates

V0 should not have interactive mid-run approval.

But design states/artifacts for future approval gates.

Agents may output:

```txt
Human Approval Needed: yes
Reason: ...
```

Orchestrator should detect this in a simple way if possible, but do not overbuild.

Future approval states:

```txt
waiting_for_approval
approval_granted
approval_denied
```

Document as roadmap.

For V0:

- if a stage clearly asks for human approval or returns blocked, mark run blocked.
- do not continue through unsafe ambiguity.

---

# 34. Tests

Implement tests with Vitest.

Required:

## Config Loader

- valid config loads
- invalid config fails
- missing provider fails
- missing skill fails clearly

## Slug

- lowercases
- strips unsafe chars
- truncates
- fallback when empty

## Artifact Store

- creates run dirs
- writes/reads artifacts
- blocks path traversal

## State Machine

- valid transitions
- invalid transitions
- terminal state handling
- timestamp update

## Prompt Builder

- includes task
- includes project rules
- includes skills
- includes permission boundaries
- includes previous artifacts
- excludes `.env` contents

## Review Parser

- approved
- changes requested
- blocked
- invalid/missing decision

## Verification Parser

- passed
- failed
- needs human
- invalid/missing verification

## Validation Runner

- command pass
- command fail
- continues after fail
- writes stdout/stderr

## Permission Profiles

- write agent cannot run in project root
- read-only agent has correct metadata
- forbidden paths are represented

## Workflow Schema

- default workflow valid
- maxReviewLoops required
- agents referenced by workflow exist

Tests must not require Claude, Codex, OpenCode, or Aider installed.

Use fake local Node scripts for provider tests.

---

# 35. Package Scripts

Use:

```json
{
  "scripts": {
    "dev": "tsx src/cli/index.ts",
    "build": "tsup src/cli/index.ts --format esm --dts --clean",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc --noEmit"
  }
}
```

Expose binary:

```json
{
  "bin": {
    "amaco": "./dist/index.js"
  }
}
```

Ensure CLI shebang:

```ts
#!/usr/bin/env node
```

---

# 36. Security / Safety Model

Implement protections:

- git worktree isolation
- no model API keys
- no GitHub token
- no auto-push
- no auto-merge
- no reading `.env`
- no recursive repo dump
- permission profiles
- role prompts
- durable artifacts
- validation output preserved
- final report honest about limitations

README must say:

```md
Amaco is not a full sandbox in V0. It runs local CLI tools on your machine. Configure only providers you trust.
```

---

# 37. Manual Smoke Test

After implementation, test with a temp repo.

Example:

```bash
mkdir /tmp/amaco-smoke-project
cd /tmp/amaco-smoke-project
git init
echo '{"scripts":{"test":"node -e \"console.log(123)\""}}' > package.json
git add .
git commit -m "init"
```

Run:

```bash
amaco init
```

For smoke testing without Claude, use a local fake provider script.

Example fake provider:

```js
#!/usr/bin/env node
let input = "";
process.stdin.on("data", chunk => input += chunk);
process.stdin.on("end", () => {
  if (input.includes("DECISION:")) {
    console.log("DECISION: APPROVED\n\nSmoke review approved.");
  } else if (input.includes("VERIFICATION:")) {
    console.log("VERIFICATION: PASSED\n\nSmoke verification passed.");
  } else {
    console.log("Smoke agent output.");
  }
});
```

Do not bake fake provider into production behavior.

---

# 38. Acceptance Criteria

Implementation is acceptable only if:

1. `pnpm install` works.
2. `pnpm typecheck` passes.
3. `pnpm test` passes.
4. `pnpm build` passes.
5. `amaco init` creates `.amaco/project.yml`, `.amaco/rules.md`, `.amaco/agents`, `.amaco/skills`, `.amaco/runs`.
6. `amaco doctor` works.
7. `amaco run "test task"` creates a run folder.
8. `amaco run` creates git worktree.
9. Planner runs.
10. Architect runs.
11. Executor runs in worktree.
12. Validation commands run in worktree.
13. Reviewer runs.
14. Review decision is parsed.
15. Fix loop works for `CHANGES_REQUESTED`.
16. Verifier runs after reviewer approval.
17. Final status becomes `merge_ready` only when review approved and verification passed.
18. Final status becomes `blocked` when reviewer blocks.
19. Final status becomes `blocked` when verifier fails/needs human.
20. Final status becomes `blocked` after max review loops.
21. `amaco status` lists runs.
22. `amaco abort` marks run aborted.
23. No model API code exists.
24. No GitHub API code exists.
25. No auto-push exists.
26. No auto-merge exists.
27. `.env` contents are not read into prompts.
28. README explains safety model and limitations.
29. Code is structured for future GUI/cloud/provider extensions without implementing them now.

---

# 39. Roadmap to Document, Not Implement

Document:

```txt
pause/resume active runs
/btw notes while run is active
interactive approval gates
custom workflow DAGs
parallel agents
Docker backend
remote sandbox backend
cloud runner backend
GUI dashboard
desktop app
GitHub PR creation
GitLab support
auto-merge after strict gates
richer JSON review schema
provider presets for OpenCode/Aider/Codex
Claude Agent SDK adapter
OpenAI Agents SDK adapter
secret scanning
policy plugins
run replay UI
multi-project workspace
team mode
```

Do not implement these now.

---

# 40. Development Order

Implement in this order:

1. Project setup.
2. Config schema.
3. Agent schema.
4. Permission schema.
5. Workflow schema.
6. Utility functions.
7. Artifact store.
8. State machine.
9. Event log.
10. Git/worktree helpers.
11. Provider runner.
12. Skills loader.
13. Prompt builder.
14. Review parser.
15. Verification parser.
16. Validation runner.
17. Execution backend.
18. Orchestrator.
19. CLI commands.
20. Default prompts/templates.
21. README.
22. Tests.
23. Manual smoke test.
24. Final verification.

Do not start with GUI.

Do not start with cloud.

Do not start with model APIs.

---

# 41. Final Response Required From Claude Code

After implementation, return:

```md
# Implementation Report

## Summary

## Files Created / Modified

## Architecture Notes

## Commands Run

## Test Results

## Manual Smoke Test Result

## How To Try Locally

## Known V0 Limitations

## Recommended Next Step
```

Be honest about anything incomplete.

Do not claim commands passed unless they actually passed.

Do not claim the system is a full sandbox.

---

# 42. Final Reminder

Build the foundation correctly.

The product is:

> A local-first autonomous multi-agent completion orchestrator for software tasks.

It must be:

- local-first
- no API
- multi-agent
- orchestrator-controlled
- rules-based
- permission-aware
- worktree-isolated
- artifact-driven
- validation-backed
- review-loop capable
- future-proof for GUI/cloud/providers
- small enough to actually work in V0

Do not overbuild.

Do not fake features.

Do not call APIs.

Do not implement cloud.

Do not implement GUI.

Do not push.

Do not merge.

Make the core architecture intelligent, flexible, and open-source ready.
