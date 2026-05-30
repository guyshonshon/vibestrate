# Hard Policy Enforcement and Run Assurance

Status: design proposal

## Product Goal

Vibestrate should not be a prompt-passing automation tool.

It should be a local orchestrator that can say:

- this path was not changed,
- this command was not allowed to run,
- this write was blocked before apply,
- this run cannot continue until a human approves,
- this final state is verified by named evidence.

The model can hallucinate. The orchestrator must not.

## Core Principle

Do not ask the model to obey safety rules and then trust its answer.

Instead:

```text
Model proposes work.
Vibestrate checks work.
Vibestrate applies or rejects work.
Vibestrate records evidence.
```

The model may be useful, but Vibestrate is the authority.

## Current System, In Plain Terms

| Area | Today | Problem |
| --- | --- | --- |
| Prompt permissions | Role prompts say read-only/write/shell boundaries. | This is guidance, not enforcement. |
| Worktree cwd | Write-enabled roles run in the worktree. | Useful isolation, but not a filesystem sandbox. |
| Suggestion apply | Proposed patches go through safety checks, policy checks, and `git apply --check`. | Good hard gate, but only for suggestion/bundle apply flows. |
| Approval gates | `requireApprovalAtStages` and Flow approval gates pause the run. | This is real enforcement. |
| Read-only runs | Skip configured write/validation/verify steps and refuse apply routes. | Good, but provider CLIs still receive prompts unless skipped by flow metadata. |
| Validation | Commands run and produce pass/fail evidence. | Strong evidence, but only as good as configured checks. |
| Forbidden paths | Listed in permission profile and prompt. | Not guaranteed for direct provider writes. |

## New Product Promise

Vibestrate should make two separate claims.

### 1. Policy Safety

This can be guaranteed when every write path is guarded.

Example:

```text
No accepted change touched .env, .pem, or secrets/**.
```

This is a hard statement if Vibestrate checked the diff and blocked/reverted
violations before the run became merge-ready.

### 2. Task Accomplishment

This cannot be guaranteed just because a model said it is done.

Vibestrate can only say:

```text
The configured evidence passed.
```

Example:

```text
Tests passed, policy passed, reviewer approved, verifier passed.
```

That is not "truth". It is an evidence-backed assurance level.

## Naming Decision

Avoid the word `confidence` as the primary product concept.

Use:

```text
Run Assurance
```

Why:

- "Confidence" sounds like model belief.
- "Assurance" sounds like system evidence.
- It lets us say "weak assurance" without pretending we know the task is truly complete.

## Assurance Verdicts

Use discrete verdicts, not fake percentages.

```ts
export type RunAssuranceVerdict =
  | "blocked"
  | "unsafe"
  | "unverified"
  | "partially_verified"
  | "verified";
```

Meaning:

| Verdict | Meaning |
| --- | --- |
| `blocked` | The run cannot continue because approval, budget, validation, or policy blocked it. |
| `unsafe` | A hard policy was violated or rollback failed. Do not trust the worktree. |
| `unverified` | No meaningful validation/review evidence exists. |
| `partially_verified` | Some evidence passed, but important checks are missing. |
| `verified` | Required policies, approvals, validation, review, and verification all passed. |

No score is needed for v1. If we later add score, it must be derived only from evidence and capped by missing checks.

## Assurance Artifact

Each run should produce:

```text
.vibestrate/runs/<runId>/assurance.json
```

Example:

```json
{
  "schemaVersion": 1,
  "runId": "run-2026-05-28-abc123",
  "verdict": "partially_verified",
  "summary": "Policy passed and review approved, but no validation commands were configured.",
  "generatedAt": "2026-05-28T09:00:00.000Z",
  "policy": {
    "status": "passed",
    "rulesEvaluated": ["no-env-edits", "no-secret-material"],
    "violations": []
  },
  "approvals": {
    "status": "passed",
    "required": 1,
    "approved": 1,
    "rejected": 0,
    "pending": 0
  },
  "validation": {
    "status": "missing",
    "commands": [],
    "passed": 0,
    "failed": 0
  },
  "review": {
    "status": "approved",
    "artifact": "05-reviewer-output.md"
  },
  "verification": {
    "status": "not_run",
    "artifact": null
  },
  "diff": {
    "status": "passed",
    "filesChanged": 3,
    "insertions": 42,
    "deletions": 8,
    "forbiddenPathsTouched": []
  },
  "caps": [
    "validation_missing",
    "verification_not_run"
  ],
  "evidence": [
    {
      "kind": "policy",
      "status": "passed",
      "path": "events.ndjson"
    },
    {
      "kind": "review",
      "status": "approved",
      "path": "05-reviewer-output.md"
    }
  ]
}
```

## Policy Model V2

Today policy rules are patch-oriented. V2 should cover more surfaces.

```ts
export type PolicySurface =
  | "run.preflight"
  | "provider.spawn"
  | "agent.turn.diff"
  | "suggestion.apply"
  | "bundle.apply"
  | "terminal.create"
  | "run.complete";

export type PolicyEffect = "allow" | "deny" | "require_approval";

export type PolicyDecision = {
  effect: PolicyEffect;
  ruleId: string;
  message: string;
  severity: "info" | "warning" | "error";
  evidence?: Record<string, unknown>;
};
```

Policy evaluation must be deterministic. It should not call a model.

## Integration Decision

Do not copy Rampart, Pipelock, Claw Patrol, OPA, or Kyverno directly.

Use them as references for patterns:

- policy decisions happen outside the agent/model process;
- every decision creates evidence;
- hard policies fail closed;
- policy authors get a local test loop;
- scanners are signals, not authority;
- sandboxing is a boundary, not a UX feature.

Vibestrate's mental model should stay Vibestrate-native:

```text
Flow chooses the work sequence.
Crew binds roles to providers/profiles.
Run executes the flow.
Action Broker controls what the run may do.
Policy decides allow / deny / approval.
Assurance explains what actually happened.
```

The new core concept is:

```text
Action Broker
```

Simple meaning:

```text
Anything an agent/provider wants to do goes through Vibestrate first.
```

Detailed meaning:

The Action Broker is the Vibestrate-owned boundary between provider processes and
real effects: file changes, command execution, network calls, MCP tool calls,
terminal sessions, suggestion applies, bundle applies, and final run status.
It evaluates policy, asks for approval when needed, executes through the right
backend, records evidence, and feeds the Run Assurance artifact.

This must be an early core change, not a later feature. If providers,
terminals, suggestions, and UI actions each grow their own policy checks first,
Vibestrate will end up with scattered enforcement paths that are hard to reason
about and easy to bypass.

Core shape:

```ts
export type ActionKind =
  | "provider.spawn"
  | "command.run"
  | "file.patch"
  | "file.write"
  | "network.request"
  | "mcp.tool"
  | "terminal.create"
  | "run.complete";

export type ActionRequest = {
  runId: string;
  stageId?: string;
  roleId?: string;
  kind: ActionKind;
  subject: Record<string, unknown>;
  proposedBy: "provider" | "ui" | "cli" | "system";
};

export type ActionDecision =
  | { effect: "allow"; ruleIds: string[] }
  | { effect: "deny"; ruleIds: string[]; reason: string }
  | { effect: "require_approval"; ruleIds: string[]; reason: string };

export interface ActionBroker {
  decide(request: ActionRequest): Promise<ActionDecision>;
  execute(request: ActionRequest, decision: ActionDecision): Promise<ActionEvidence>;
  record(request: ActionRequest, decision: ActionDecision, evidence?: ActionEvidence): Promise<void>;
}
```

Existing system fit:

| Existing Piece | Keep It? | How It Fits |
| --- | --- | --- |
| Flow | Yes | Defines the sequence of work. It should not enforce safety directly. |
| Crew / role / profile | Yes | Decides who performs each step and with what provider/model budget. |
| Provider adapters | Yes | They become clients of the Action Broker instead of owning effects directly. |
| Suggestion/bundle apply | Yes | Reuse as the first `file.patch` implementation. |
| Approval gates | Yes | Policy decisions create approval requests through the existing approval system. |
| Validation | Yes | Validation produces evidence that caps or raises Run Assurance. |
| Replay/events | Yes | Broker decisions become first-class replay events. |
| Policy UI/CLI | Yes | Both edit the same policy files and call the same broker/policy evaluator. |

Do early:

- introduce `ActionRequest`, `ActionDecision`, and decision records;
- route suggestion apply and bundle apply through the broker first;
- route provider spawn and terminal create through the broker next;
- add post-turn diff decisions for direct-write providers;
- make approvals come from broker decisions, not only model text markers;
- make assurance read broker evidence instead of model claims.

Do later:

- protocol-aware SQL/Kubernetes/GitHub gateways;
- signed or hash-linked audit chains;
- remote sandbox backends;
- advanced OPA/Rego compatibility;
- credential broker/injection for production integrations.

## Open-Source Inspiration

This system should borrow from mature policy engines and agent sandboxes, not
from prompt-only "be safe" guardrails.

### OPA Gatekeeper

Source: https://open-policy-agent.github.io/gatekeeper/website/docs/

Gatekeeper is useful because it treats policy as admission control, not advice.
Its model separates:

- admission enforcement,
- audit of already-existing resources,
- policy libraries,
- constraint templates,
- scoped enforcement actions.

Vibestrate takeaway:

- Use explicit enforcement points, not a generic `policy.check`.
- Support different actions per enforcement point: `deny`, `warn`, `audit`,
  `require_approval`.
- Add a final/frequent audit pass so bad state that slips through an earlier
  point is still detected and reported.
- For hard safety policies, fail closed. If Vibestrate cannot evaluate the policy,
  the write should not be accepted.

Vibestrate mapping:

```ts
export type EnforcementPoint =
  | "run.preflight"
  | "provider.spawn"
  | "tool.call"
  | "agent.turn.diff"
  | "suggestion.apply"
  | "bundle.apply"
  | "terminal.create"
  | "run.complete"
  | "run.audit";
```

### Conftest

Source: https://github.com/open-policy-agent/conftest

Conftest is useful because it gives policy authors a fast CLI feedback loop for
structured files.

Vibestrate takeaway:

- Policy authoring needs a simulator.
- Every policy should be testable before it is trusted.
- The CLI and UI should both call the same policy evaluator.

Vibestrate commands:

```bash
vibe policies test .vibestrate/policies
vibe policies check --surface agent.turn.diff --patch ./candidate.patch
vibe policies explain --surface provider.spawn --command "bash -lc 'git add . && rm -rf /'"
```

### Kyverno

Source: https://kyverno.io/docs/introduction/

Kyverno is useful because it shows a human-friendly policy-as-YAML model with
clear operations like validate, mutate, generate, and verify images.

Vibestrate takeaway:

- Prefer a simple YAML policy language for users.
- Keep advanced engines optional; do not force users to learn Rego for basic
  project rules.
- Add policy reports: users need to see what was evaluated, what failed, and
  what was skipped.

Vibestrate should start with first-class YAML rules:

```yaml
rules:
  - id: no-env-edits
    match:
      paths: [".env", ".env.*"]
    on:
      agent.turn.diff: deny
      suggestion.apply: deny
      run.audit: report
```

### Codex CLI Sandboxing, Permissions, and Rules

Sources:

- https://developers.openai.com/codex/concepts/sandboxing
- https://developers.openai.com/codex/permissions
- https://developers.openai.com/codex/rules

Codex is useful because it separates sandbox boundaries from approval policy.
The sandbox decides what the agent can do technically. The approval policy
decides when crossing a boundary must pause.

It also has a useful command-rule idea:

- command prefix rules,
- `allow` / `prompt` / `forbidden`,
- most restrictive result wins,
- shell-wrapper handling so `bash -lc "safe && dangerous"` cannot smuggle a
  dangerous command through a safe prefix.

Vibestrate takeaway:

- Keep sandbox and approval as separate concepts.
- Never rely on raw string matching for shell commands.
- Parse simple shell wrappers. If parsing fails, require approval or deny.
- Use "most restrictive wins" when multiple rules match.

Vibestrate command-decision shape:

```ts
export type CommandDecision = {
  decision: "allow" | "prompt" | "forbidden";
  matchedRules: string[];
  parsedCommands: string[][];
  parseConfidence: "parsed" | "opaque";
};
```

Hard rule:

```text
If a command is opaque and the role is not explicitly trusted for opaque shell,
deny or require approval.
```

### Agent Firewalls: Rampart, Pipelock, and Claw Patrol

Sources:

- https://docs.rampart.sh/
- https://github.com/luckyPipewrench/pipelock
- https://clawpatrol.dev/
- https://github.com/denoland/clawpatrol

These are closer to Vibestrate's needed direction than prompt guardrails.

Rampart is useful because it gates shell commands, file access, MCP tools, and
tool responses before the agent can use them. It also treats logs as security
evidence, not just debugging output.

Pipelock is useful because it focuses on the network side: egress control, DLP,
SSRF defense, MCP scanning, and receipts signed outside the agent process. The
important idea is that the agent should not be the witness for its own behavior.

Claw Patrol is useful because it holds credentials outside the agent, injects
them at the gateway, parses protocols such as HTTP, SQL, and Kubernetes, and can
gate actions on parsed intent instead of raw URLs or strings.

Vibestrate takeaway:

- Put enforcement outside the model/provider process.
- Treat commands, files, network, MCP calls, and tool responses as separate
  policy subjects.
- Do not give provider processes raw long-lived secrets when a broker can inject
  scoped credentials at the last responsible moment.
- Record decisions as signed or hash-linked evidence so the final assurance
  artifact is not just "the agent said it happened".
- Add policy tests/replays. If a policy change flips a verdict, the developer
  should see that before a real run.

Vibestrate direction:

```text
Provider process
  -> Vibestrate tool/file/command/network broker
  -> deterministic policy decision
  -> sandboxed execution or blocked action
  -> decision record
  -> assurance artifact
```

This is the main architectural shift: Vibestrate should become the broker of action,
not only the scheduler of prompts.

### OpenHands

Source: https://docs.openhands.dev/openhands/usage/sandboxes/overview

OpenHands is useful because it names the execution environment as a sandbox and
keeps provider choices explicit: Docker, process, or remote. It also calls out
that process mode is unsafe.

Vibestrate takeaway:

- Make execution backend a first-class setting.
- Label local process execution honestly as low assurance.
- Prefer Docker/container isolation as the normal write-capable backend.
- Keep remote/sandbox backends pluggable.

Vibestrate backend names:

```yaml
execution:
  backend: docker # process | docker | gvisor | nsjail | bubblewrap | firecracker
  network: disabled
  mounts:
    - path: .
      mode: read-write
    - path: ~/.config
      mode: none
```

### gVisor, nsjail, bubblewrap, and Firecracker

Sources:

- https://github.com/google/gvisor
- https://github.com/google/nsjail
- https://github.com/containers/bubblewrap
- https://github.com/firecracker-microvm/firecracker

These are useful as isolation backends with different tradeoffs.

| Backend | What It Gives | Vibestrate Use |
| --- | --- | --- |
| bubblewrap | Fast Linux mount/user namespace isolation. | Lightweight local sandbox for Linux. |
| nsjail | Namespaces, cgroups, rlimits, seccomp-bpf. | Stronger Linux command sandbox. |
| gVisor | OCI runtime with userspace kernel boundary. | High-assurance container execution. |
| Firecracker | MicroVMs with hardware virtualization isolation. | Highest-assurance backend for untrusted agent work. |

Vibestrate takeaway:

- Do not pretend one backend covers all threat models.
- Expose assurance level by backend.
- For "forbidden read" guarantees, diff checks are not enough; the process must
  not be able to mount/read the forbidden path in the first place.

### LlamaFirewall

Source: https://github.com/meta-llama/PurpleLlama/tree/main/LlamaFirewall

LlamaFirewall is useful because it uses layered scanners across the agent
lifecycle: prompt injection detection, alignment checks, regex/custom scanners,
and CodeShield-style static analysis for generated code.

Vibestrate takeaway:

- Add scanners as risk sensors, not final authority.
- Scanners can trigger `deny`, `require_approval`, or `extra_validation`.
- Static code scanners are useful before accepting generated code, especially
  for security-sensitive files.

Example:

```yaml
rules:
  - id: generated-code-security-scan
    on:
      agent.turn.diff: require_approval
    scanners:
      - semgrep
      - codeshield
    when:
      paths: ["src/**", "api/**"]
```

### NeMo Guardrails and Portkey Gateway

Sources:

- https://docs.nvidia.com/nemo/guardrails/latest/
- https://github.com/Portkey-AI/gateway/wiki/Guardrails-on-the-Gateway-Framework

These are useful because they show guardrails as a layer around model requests
and responses.

Vibestrate takeaway:

- Input/output guardrails are useful for prompt injection, PII leakage, and
  malformed output.
- They are not enough for filesystem safety.
- Use them before/after model calls, but keep filesystem/command/write
  enforcement in Vibestrate-owned deterministic code.

## Smarter Gateway Design

The Vibestrate gateway should not be one gate.

It should be a chain of enforcement points:

```text
User/task input
  -> input scanners
  -> run preflight policies
  -> provider spawn policies
  -> command/tool policies
  -> sandbox/process isolation
  -> post-turn diff policies
  -> validation policies
  -> final run-complete policies
  -> run audit
  -> assurance artifact
```

This is harder to bypass because each stage sees a different kind of evidence.

| Bypass Attempt | Guardrail |
| --- | --- |
| Hide command inside `bash -lc` | Parse shell AST; most restrictive command wins; opaque scripts require approval. |
| Touch forbidden path directly | Sandbox mount deny + post-turn diff audit + rollback. |
| Generate insecure code without touching forbidden files | Static scanner on accepted diff. |
| Claim tests passed without running them | Assurance reads validation exit codes, not model text. |
| Ask for broad exception once | Exceptions are scoped to one surface, command/path, run, and expiry. |
| Disable policy engine accidentally | Fail closed for hard policies. |
| Policy bug blocks everything | Break-glass override requires explicit human approval and writes evidence. |

## Policy Decision Record

Every enforcement point should write a structured decision record.

```ts
export type PolicyDecisionRecord = {
  schemaVersion: 1;
  runId: string;
  at: string;
  enforcementPoint: EnforcementPoint;
  subject: {
    roleId?: string;
    stageId?: string;
    command?: string[];
    touchedFiles?: string[];
  };
  decision: "allow" | "deny" | "require_approval" | "audit";
  matchedRules: {
    id: string;
    action: string;
    reason: string;
  }[];
  evidence: {
    patchPath?: string;
    parsedCommands?: string[][];
    scannerResults?: unknown[];
  };
  engineStatus: "ok" | "error";
  engineError?: string;
};
```

If `engineStatus === "error"` and any matching policy is hard safety policy,
the default decision is `deny`.

## Exceptions and Break-Glass

Guardrail systems are bypassed when exceptions are broad and invisible.

Vibestrate exceptions must be narrow:

```yaml
exceptions:
  - id: approve-one-migration
    ruleId: approve-db-migrations
    runId: run-2026-05-28-abc123
    paths:
      - "migrations/20260528120000_add_users.sql"
    expiresAt: "2026-05-28T13:00:00.000Z"
    approvedBy: "local-user"
    reason: "Expected migration for this task."
```

Rules:

- no global permanent exception from a run prompt;
- no exception without explicit human approval;
- no exception without reason;
- no exception without expiry or scope;
- exceptions appear in `assurance.json`.

## User-Facing Policy Examples

### Forbid Secret Files

```yaml
rules:
  - id: no-secret-file-edits
    description: Do not allow generated work to modify secret material.
    surface:
      - agent.turn.diff
      - suggestion.apply
      - bundle.apply
    effect: deny
    paths:
      - ".env"
      - ".env.*"
      - "**/*.pem"
      - "**/*.key"
      - "secrets/**"
    message: "Secret files cannot be modified by Vibestrate."
```

### Require Approval for Migrations

```yaml
rules:
  - id: approve-db-migrations
    description: Database migrations need human approval.
    surface:
      - agent.turn.diff
      - suggestion.apply
      - bundle.apply
    effect: require_approval
    paths:
      - "migrations/**"
      - "prisma/migrations/**"
      - "db/migrate/**"
    message: "Database migration changes require approval."
```

### Restrict Commands

```yaml
rules:
  - id: no-destructive-shell
    description: Block destructive commands from provider/tool execution.
    surface:
      - provider.spawn
      - terminal.create
    effect: deny
    commands:
      deny:
        - "rm -rf"
        - "git push"
        - "git merge"
        - "git reset --hard"
    message: "Destructive commands are not allowed."
```

### Require Evidence Before Merge Ready

```yaml
rules:
  - id: merge-ready-requires-tests
    description: Do not mark a run merge-ready without validation.
    surface:
      - run.complete
    effect: deny
    require:
      validation: passed
      review: approved
      policy: passed
    message: "A run cannot become merge-ready without passing validation and review."
```

## CLI Interaction

The CLI should write the same policy files that the UI writes.

```bash
vibe policies list
vibe policies doctor
vibe policies check ./candidate.patch --surface suggestion.apply

vibe policies add no-secret-file-edits \
  --surface agent.turn.diff \
  --surface suggestion.apply \
  --effect deny \
  --path ".env*" \
  --path "**/*.pem" \
  --message "Secret files cannot be modified by Vibestrate."

vibe policies edit no-secret-file-edits
vibe policies remove no-secret-file-edits
```

For users who prefer files:

```bash
$EDITOR .vibestrate/policies/no-secret-file-edits.yml
vibe policies doctor
```

## UI Interaction

Mission Control should expose the same data:

- Policies page: list, search, enable/disable, edit.
- Policy doctor: malformed YAML, duplicate ids, unreachable rules.
- Policy simulator: paste diff, select surface, see allow/deny/approval.
- Run detail: show which policies were evaluated.
- Assurance panel: show the final verdict and exact evidence.

The UI must not create a separate policy storage model. It edits `.vibestrate/policies/*.yml`.

## True Enforcement Architecture

To make forbidden paths guaranteed, one of these must be true.

### Option A: Apply-Only Mode

Agents do not write directly. They produce patches or structured file operations.
Vibestrate applies them through the policy gateway.

```text
Provider output -> proposed patch -> policy gateway -> git apply -> validation
```

Pros:

- Strongest local guarantee.
- Easy to reason about.
- Every write is audited before it happens.

Cons:

- Some coding agents are better when they can edit directly.
- Requires good patch extraction and retry UX.

### Option B: Sandboxed Execution Mode

Agents can write, but only inside a sandbox/worktree snapshot. Vibestrate checks the
resulting diff after the turn and blocks or reverts violations.

```text
Snapshot worktree -> provider runs -> diff audit -> accept or rollback
```

Pros:

- Works with existing coding CLIs.
- Preserves agent ergonomics.

Cons:

- Prevents acceptance of bad writes, but may not prevent attempted reads/writes unless the sandbox is OS-enforced.
- Requires reliable rollback snapshots.

### Product Decision

Implement both:

- default mode: sandboxed execution with post-turn diff audit and rollback;
- strict mode: apply-only writes for users who want maximum guarantees.

## Write Gateway

Every accepted code change must pass through one function.

```ts
export async function acceptWorktreeDiff(input: {
  projectRoot: string;
  runId: string;
  roleId: string;
  stageId: string;
  surface: "agent.turn.diff" | "suggestion.apply" | "bundle.apply";
  beforeRef: string;
  afterRef: string;
}): Promise<
  | { ok: true; acceptedDiffPath: string; decisions: PolicyDecision[] }
  | { ok: false; blockedReason: string; decisions: PolicyDecision[] }
> {
  const diff = await createDiff(input.beforeRef, input.afterRef);
  const decisions = await policyGateway.evaluate({
    surface: input.surface,
    patch: diff.text,
    touchedFiles: diff.touchedFiles
  });

  const deny = decisions.find((d) => d.effect === "deny");
  if (deny) {
    await rollbackTo(input.beforeRef);
    return {
      ok: false,
      blockedReason: deny.message,
      decisions
    };
  }

  const approval = decisions.find((d) => d.effect === "require_approval");
  if (approval) {
    await createApprovalRequest(approval);
    await waitForApproval();
  }

  return {
    ok: true,
    acceptedDiffPath: await persistAcceptedDiff(diff),
    decisions
  };
}
```

## Orchestrator Hook

Every write-capable role turn should be wrapped.

```ts
const beforeRef = await snapshotWorktree({
  worktreePath,
  runId,
  stageId,
  roleId
});

const result = await runProvider(...);

if (profile.allowWrite) {
  const accepted = await acceptWorktreeDiff({
    projectRoot,
    runId,
    roleId,
    stageId,
    surface: "agent.turn.diff",
    beforeRef,
    afterRef: "worktree"
  });

  if (!accepted.ok) {
    await blockRun(accepted.blockedReason);
    return;
  }
}
```

## Filesystem Guarantee

Diff checking guarantees what enters the accepted worktree.

It does not fully guarantee that a provider process never attempted to read a
secret file. For that, Vibestrate needs OS/process isolation.

Strict guarantee requires:

- container/sandbox execution backend;
- mounted worktree only;
- no project-root mount unless explicitly read-only;
- scrubbed environment;
- explicit allowlist for mounted paths;
- no host shell tools beyond allowlisted commands.

This aligns with the existing Docker execution backend roadmap issue.

## Run Assurance Generator

Generate assurance at every terminal run state.

```ts
export async function generateRunAssurance(input: {
  projectRoot: string;
  runId: string;
}): Promise<RunAssuranceReport> {
  const state = await readRunState(input);
  const events = await readEvents(input);
  const metrics = await readMetrics(input);
  const approvals = await readApprovals(input);
  const validation = await readValidation(input);
  const policy = derivePolicyStatus(events);
  const review = deriveReviewStatus(state, events);
  const verification = deriveVerificationStatus(state, events);

  return deriveVerdict({
    state,
    policy,
    approvals,
    validation,
    review,
    verification,
    metrics
  });
}
```

Verdict rules should be conservative:

```ts
if (policy.status === "violated") return "unsafe";
if (approvals.rejected > 0 || approvals.pending > 0) return "blocked";
if (validation.status === "failed") return "blocked";
if (validation.status === "missing") return "partially_verified";
if (review.status !== "approved") return "partially_verified";
if (verification.status === "failed") return "blocked";
if (verification.status === "passed") return "verified";
return "partially_verified";
```

## Implementation Path

### Phase 0: Action Broker First

This phase should happen before adding more provider features.

- Add the `ActionRequest`, `ActionDecision`, and `ActionEvidence` model.
- Add one broker service used by CLI, UI, orchestrator, suggestions, and bundles.
- Route suggestion apply and bundle apply through the broker.
- Write decision records for allow, deny, and approval.
- Do not yet build a complex sandbox or network firewall.

Why first:

```text
If every surface gets its own policy code, later safety work becomes a rewrite.
If every surface asks the broker first, later safety work becomes plugins/backends.
```

### Phase 1: Rename the Promise

- Stop presenting permission prompt text as enforcement.
- In docs/UI, call prompt boundaries "instructions".
- Reserve "policy enforcement" for code-enforced gates.
- Add `Run Assurance` docs and empty artifact shape.

### Phase 2: Policy Engine V2

- Extend policy surfaces beyond patch apply.
- Add effects: `deny`, `require_approval`.
- Add path matchers for agent-turn diffs.
- Add command matchers for spawn/terminal surfaces.
- Keep the old patch rule shape only if it can map cleanly into V2.

### Phase 3: Post-Turn Diff Gate

- Snapshot worktree before every write-capable role.
- Run provider.
- Compute diff.
- Evaluate `agent.turn.diff` policies.
- If deny: rollback snapshot, block run, record violation.
- If approval: pause, approve/reject, then accept or rollback.
- Persist accepted diff evidence.

### Phase 4: Strict Apply-Only Mode

- Add `writeMode: direct | apply-only` to role/profile policy.
- In apply-only mode, write-capable roles must output patches or structured file edits.
- Vibestrate applies edits through the same gateway used by suggestions.
- If the model cannot produce a valid patch, the run is blocked with a clear reason.

### Phase 5: Assurance Report

- Add `assurance.json`.
- Show it in final report, CLI, TUI, and Run Detail UI.
- Add `vibe runs assurance <runId> --json`.
- Add "why not verified?" explanations.

### Phase 6: OS Sandbox

- Use the Docker/sandbox backend for strict process isolation.
- Mount only allowed paths.
- Scrub env by default.
- Make forbidden-path read/write guarantees real at the process boundary.

## Acceptance Criteria

- A policy forbidding `.env*` blocks direct agent changes, suggestion apply, and bundle apply.
- A denied direct agent change is rolled back before the run continues.
- A policy requiring approval for `migrations/**` creates an approval gate before accepting the diff.
- `assurance.json` is generated for completed, blocked, failed, and aborted runs.
- A run with no validation can never display `verified`.
- A run with policy violations can never display `verified`.
- UI and CLI read/write the same policy files.
- Tests prove denied paths do not remain in the accepted worktree.

## Non-Goals

- Do not claim the model is honest.
- Do not claim task completion without validation evidence.
- Do not treat a reviewer approval as a substitute for tests.
- Do not call model self-reporting "confidence".

## Bottom Line

Vibestrate should not trust models. It should trust evidence.

The product value is not "run prompts in order".
The product value is:

```text
controlled execution + hard policy gates + visible evidence
```

---

## Implementation status

### S0 — Action Broker boundary + decision/evidence records ✅ shipped

The boundary and the audit record landed first (`src/safety/action-broker.ts`):

- `ActionRequest` / `ActionDecision` / `ActionEvidence` / `ActionRecord` types
  and the `ActionBroker` interface, matching the model above.
- `DefaultActionBroker` — deterministic, side-effect-free `decide()` running an
  ordered `ActionEvaluator[]` chain (first `deny` wins, else first
  `require_approval`, else `allow`); `record()` appends one NDJSON line to the
  per-run evidence log.
- Evidence log at `runs/<id>/actions.ndjson` (`runActionsPath`), read back by
  `readActionLog()` (tolerates a torn final line).
- Orchestrator wiring: every **`provider.spawn`** is decided before the child
  process starts and recorded with post-execution evidence (exit code,
  duration) after. Fail-closed — a non-allow decision throws
  `__ActionDeniedSignal`, which blocks the run (status `blocked`, not `failed`)
  and emits `action.denied` / `action.approval_required` events.
- Default policy is **allow** (no evaluators wired yet), so run behavior is
  unchanged until the Policy Engine (S2) plugs evaluators into the same chain.

**`file.patch` slice (suggestion apply/revert).** `ReviewSuggestionService.apply`
and `.revert` now gate through the broker *after* the existing built-in safety
checks (`checkPatchSafety`) and the legacy `applyPolicyGate`, immediately before
the first `git apply`. The two gates coexist deliberately: `applyPolicyGate` is
the S1-era patch-policy path; the broker is the unifying boundary + evidence log.
S2 folds the former into a broker evaluator so there is one decision path. A
non-allow verdict marks the suggestion `failed` (it does **not** throw — the
service returns structured results), leaving the worktree untouched; success and
failure both append `file.patch` evidence. Construction is centralised in
`createActionBroker` and the `gateAction` helper (decide → record-on-deny →
caller records outcome), so every later effect kind inherits the S2 evaluator
chain from one place. The service takes an injectable `broker` for tests.

The **bundle** apply/smartApply/revert (`SuggestionBundleService`) gate the same
way — one `file.patch` decision per operation, taken after preflight clears and
before the first `git apply`, with evidence recorded at each terminal outcome.
The bundle service shares its broker with the inner `ReviewSuggestionService`, so
smartApply's per-step reverts (which delegate to the single-suggestion path) are
gated too, and an injected (test) broker propagates to both. That completes
`file.patch` coverage across the suggestion + bundle apply surface.

**Remaining effect kinds (S0 complete).** `run.complete` gates the run's terminal
verdict in the orchestrator (a non-allow decision downgrades merge_ready→blocked
and emits `action.denied`/`action.approval_required`); `command.run` gates each
validation command in `runValidationCommands` (a deny skips it as a failed
result); `file.write` gates the MCP-config materialisation (subject carries the
path only, never the token-bearing body); `terminal.create` gates the PTY spawn
in `TerminalService` (refuses 403 on deny). All construct their broker via
`createActionBroker`/an injectable factory and use `gateAction`, so the S2
evaluator chain reaches every effect kind from one place.

Still advisory until S2 wires evaluators (default-allow). `network.request` /
`mcp.tool` remain conceptual kinds in the enum, gated if/when those surfaces gain
a Vibestrate-owned call site.
