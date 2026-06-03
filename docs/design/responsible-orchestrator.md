# Responsible orchestrator + workflow selection

Status: **design of record (pre-implementation).** This document supersedes the
product framing of `custom-workflow-dags.md` without deleting it. Workflow DAGs
remain required, but they are an execution primitive the orchestrator may choose,
not the main product promise.

Companion docs: `custom-workflow-dags.md` (graph substrate and parallelism),
`runner-unification.md` (one runner), `policy-enforcement-assurance.md` (hard
gates vs prompt guidance), `pickup-execution.md` (checklist loop precedent), and
`vocabulary.md` (canonical terms).

## Product thesis

Vibestrate should replace as much of the human-in-the-loop senior engineer role
as can be replaced honestly:

- understand the project before acting;
- choose the right Flow and Crew for the task;
- inspect whether role outputs are credible;
- require evidence instead of accepting model confidence;
- decide when to validate, retry, ask another role, switch workflow, sandbox,
  pause, or block;
- keep durable project knowledge concise and current;
- let the user consult the orchestrator directly from CLI and UI.

The current system already has most of the mechanical pieces: Task + Flow + Crew
= Run; each Step maps to a Seat, Crew Role, Profile, and Provider; the runner
persists artifacts and moves to the next step. The missing piece is
**responsible orchestration**: a project-aware controller that owns judgment,
memory, and workflow selection instead of blindly walking a selected recipe.

## Reframe

The old framing:

```text
User chooses Flow -> orchestrator runs the Flow -> roles hand outputs forward
```

The target framing:

```text
Task -> responsible orchestrator
     -> reads VIBESTRATE.md + project config + annotations + recent evidence
     -> selects Flow + Crew + execution posture
     -> builds a run brief
     -> supervises the run
     -> critiques handoffs and evidence
     -> records durable lessons/proposals
```

Workflow DAGs still matter. They let the orchestrator choose non-linear patterns
when useful: late review panels, independent checklist branches,
continue-past-failure, parallel validation, or isolated write branches. But most
tasks should remain mostly sequential because the real value is not parallelism;
it is good judgment, precise context, and disciplined handoffs.

## Non-negotiable model

- **The orchestrator owns the lifecycle.** Roles recommend; the orchestrator
  decides the next controlled action.
- **Code-enforced gates stay code-enforced.** A model-assisted orchestrator cannot
  talk past policy, approvals, Action Broker decisions, diff gates, validation, or
  budget caps.
- **Every judgment must leave evidence.** Workflow selection, retries, blocks,
  sandbox recommendations, and `VIBESTRATE.md` updates are recorded as artifacts
  or events.
- **The default path is sequential.** Parallelism is a tool, not a posture.
- **Learning is explicit.** Durable project memory is updated through proposed,
  auditable changes, not vague hidden memory.
- **Authority is bounded by verifiable evidence.** The orchestrator is itself a
  model, and an LLM judging an LLM is not a credibility oracle - it shares the
  blind spots and can be talked into approval by confident prose. So every
  judgment must cite **deterministic** evidence (validation commands, the diff
  gate, policy matches, file facts). Where no such evidence exists, the
  orchestrator lowers its own confidence and surfaces the residual risk to the
  human in plain language; it never rubber-stamps the unverifiable as if it were
  verified. The failure mode to avoid is **laundering model confidence as
  supervision** - which is worse than no supervisor, because the "orchestrator"
  label makes a non-engineer trust it more. "Replace the human" therefore means
  removing the need for the human to be a *qualified reviewer* of every
  intermediate step, not removing the human's *authority* over irreversible or
  outward actions (merge to main, push), which always stays.

## `VIBESTRATE.md`

Every project may have a root-level `VIBESTRATE.md`. It is the concise operating
manual the orchestrator reads before selecting a workflow or advising the user.
It is project-owned and should normally be committed.

`VIBESTRATE.md` is different from `.vibestrate/rules.md`:

- `.vibestrate/rules.md` is prompt guidance injected into role turns.
- `VIBESTRATE.md` is the orchestrator's durable project model and operating
  policy. It may be summarized into role prompts, but its primary reader is the
  orchestrator.

Precedence is explicit: **Policy (code-enforced) > `VIBESTRATE.md` (advisory
operating manual, committed, updated by proposal) > `.vibestrate/rules.md`
(per-turn prompt guidance).** `VIBESTRATE.md` is *advisory to the orchestrator* -
its durable model, not a gate. It can never override a code-enforced gate.

Suggested structure:

```md
# VIBESTRATE.md

## Project Model
What this project is, main domains, architecture boundaries, critical flows.

## Development Commands
Install, test, typecheck, lint, build, run locally. Include known order.

## Orchestration Preferences
Preferred flows, crew choices, when to use heavier review, when to stay lean.

## Risk Rules
When to suggest sandbox mode, approval gates, isolated execution, extra
validation, or human review.

## Codebase Conventions
Patterns, naming, generated files, ownership boundaries, style rules.

## Known Constraints
Fragile areas, migrations, external services, secrets, platform limits.

## Lessons Learned
Short durable lessons from prior runs. Aggressively pruned.
```

Example risk rule:

```md
- Propose sandbox mode when a task asks to run untrusted scripts, modify install
  hooks, touch provider execution, change policy enforcement, or operate on
  secrets/credentials paths.
```

### Update policy

The orchestrator may propose updates to `VIBESTRATE.md` when a run produces a
durable lesson:

- a validation command was needed but missing from the manual;
- a recurring architecture boundary was discovered;
- a file or generated area should not be touched;
- a task class consistently needs a specific Flow or sandbox posture;
- a convention was enforced by review/validation.

Updates should be small diffs with evidence:

```text
Proposed VIBESTRATE.md update:
Add "Run pnpm test:server after touching src/server/**".
Evidence: runs A/B/C all failed until this command was run.
```

No hidden long-term memory. If it matters later, it should land in
`VIBESTRATE.md`, project config, policies, annotations, or a run artifact.

## Orchestrator consult

Add a project-aware consult surface:

```bash
vibe consult "Should this auth refactor use the default flow or a heavier review?"
vibe consult --task <taskId>
vibe consult --run <runId>
```

UI: a **Consult** icon opens the same capability in Mission Control, task detail,
run detail, and project settings.

Consult is not a generic chatbot. It answers from controlled project context:

- `VIBESTRATE.md`;
- `.vibestrate/project.yml`, policies, flows, crew, profiles;
- `.vibestrate/rules.md`;
- annotations marked visible to agents;
- recent run summaries and validation evidence;
- task/checklist context;
- selected files when the user is on Codebase.

Consult can recommend actions, but effects still go through normal routes:

- start a run;
- select or override Flow/Crew/Profile;
- propose `VIBESTRATE.md` changes;
- create annotations;
- propose policy/config changes;
- request sandbox mode;
- explain why a run blocked.

**Hard limit - consult is advisory.** It may *propose* changes (diffs a human
approves) and tune *advisory* things (VIBESTRATE.md preferences, flow-selection
bias), but it can **never** edit policy, the Action Broker, the diff gate, or
budget caps. "Design the orchestrator by talking to it" is scoped to proposals
and advisory tuning - the code-enforced safety floor stays outside the model's
reach, so the system cannot talk itself into lowering its own guardrails. Consult
is also a write-capable surface (it can start runs, request sandbox, propose
config), so every effect it triggers routes through the Action Broker and policy
like any other - it is an advisor with a megaphone, not a bypass.

## Workflow selection

The orchestrator chooses a Flow by default. The user can still force a Flow with
`vibe run --flow`, but normal operation should be:

```bash
vibe run "Add GitHub OAuth"
```

The run launcher asks the orchestrator for a **workflow selection decision**:

```json
{
  "flowId": "default",
  "crewId": "default",
  "executionPosture": "normal",
  "confidence": "medium",
  "reasons": [
    "task touches application code only",
    "validation commands are known",
    "no policy/security files detected"
  ],
  "risks": [
    "auth-sensitive code path"
  ],
  "upgrades": [
    {
      "condition": "diff touches src/security/** or auth middleware",
      "flowId": "security-review-panel"
    }
  ]
}
```

Selection inputs:

- task text and linked task metadata;
- effort/risk heuristic;
- files likely to be touched when known;
- `VIBESTRATE.md` orchestration preferences and risk rules;
- available Flows and their declared capabilities;
- Crew/Profile/provider availability;
- budget and timeout constraints;
- whether sandbox backends are available.

The selection decision is written as an artifact and event before the run starts.
If the user forced a Flow, the orchestrator still records advice but honors the
explicit choice unless it violates policy.

## Flow capability metadata

Flows should declare what kind of task they are good for. This lets the
orchestrator select them without relying on the label alone.

Sketch:

```yaml
id: security-review-panel
label: Security-sensitive implementation
capabilities:
  taskKinds: [feature, refactor, bugfix]
  strengths: [security, policy, auth, provider-execution]
  costClass: high
  latencyClass: high
  requires:
    validation: true
  avoids:
    readOnly: true
  graph:
    supportsDag: true
    maxFanout: 3
```

Keep this small. It is selection metadata, not a second workflow language.

## Default execution philosophy

Default runs should be mostly sequential:

```text
plan -> architect -> implement -> validate -> review -> fix? -> validate -> verify
```

For higher-risk tasks, the orchestrator may choose a late review panel:

```text
plan
-> architect
-> implement
-> validate
-> review panel: correctness / tests / architecture-or-risk
-> arbiter
-> fix if needed
-> validate
-> verify
```

Late review is preferred over midstream review because the reviewers inspect a
real diff and real validation evidence. Midstream panels are reserved for tasks
where the plan itself is dangerous or ambiguous: migrations, security policy,
execution backends, data loss risks, large architectural moves.

## Where DAGs fit

`custom-workflow-dags.md` remains the graph execution design. This document
changes the product role of that work:

- DAGs are not "make every run parallel."
- DAGs are how the orchestrator expresses a selected non-linear workflow.
- The first practical DAG remains a bounded late review panel.
- Write parallelism remains deferred and isolated.
- Checklist DAGs and continue-past-failure remain future workflow choices.

The first DAG slice should be selected by the orchestrator only when it is worth
the extra cost. For example:

- security-sensitive code;
- broad architectural changes;
- low validation confidence;
- unfamiliar project area;
- user explicitly asks for heavier review;
- `VIBESTRATE.md` says this task class needs panel review.

## Efficiency rules

Responsible orchestration must not silently multiply tokens.

- The orchestrator's own overhead is proportional to the task. A trivial task
  gets a cheap one-shot selection and the orchestrator then gets out of the way;
  the full supervisory loop (run brief per step, handoff critiques) is reserved
  for tasks whose risk/effort justifies it. Supervision must not cost more than
  the work it supervises.
- Default to linear flows.
- Run panels late, over concrete artifacts.
- Keep fan-out width small; start with 2 reviewers, max 3.
- Give each reviewer a distinct lens, not the same prompt.
- Feed reviewers compact context: task brief, relevant diff/files, validation
  summary, and narrow prior artifacts.
- Require bounded structured output: max findings, severity, evidence, fix
  suggestion.
- Feed the arbiter canonical findings, not full transcripts.
- Reserve frontier budget before launching parallel steps.
- If remaining budget cannot cover the selected Flow, choose a cheaper Flow or
  block with advice.

## Responsible judgment loop

Between major steps, the orchestrator updates a **run brief**:

- current task understanding;
- chosen Flow/Crew/Profile and why;
- assumptions;
- decisions made;
- open risks;
- changed files;
- validation status;
- review findings;
- what the next role needs to know.

Roles do not receive the entire run history by default. They receive the current
run brief plus selected artifacts. This is how the crew "knows each other"
without token blow-up.

The run brief is not long-term memory. At the end of the run, durable lessons may
be proposed for `VIBESTRATE.md`; transient details stay in run artifacts.

## Evidence-based escalation

The orchestrator may escalate when evidence says the current path is weak:

- validation missing or failing;
- reviewer emits credible high-severity findings;
- implementation touches risky paths;
- provider output is malformed or ignores the contract;
- repeated fix loop fails;
- budget/time is being exceeded;
- selected Flow no longer matches discovered task shape.

Escalation options:

- run an additional targeted reviewer;
- switch to a heavier Flow at a boundary;
- request sandbox mode;
- require approval;
- ask consult-style clarification;
- block honestly with evidence.

Escalation must be bounded. The orchestrator cannot spawn unbounded agents or
invent an open-ended research loop.

## Sandbox posture

Sandboxing is an execution posture the orchestrator can recommend or select when
available. It is not only a user toggle.

Postures:

- `normal` - current local worktree execution.
- `strict-apply-only` - write-capable roles propose diffs, Vibestrate applies.
- `sandbox` - run provider commands in a stronger local/container/remote backend.
- `approval-required` - pause before risky effects.

`VIBESTRATE.md` and policy can define when to suggest or require these postures.
Policy wins over model judgment.

## Implementation slices

### Slice 1 - project memory and consult

- Add root `VIBESTRATE.md` discovery and prompt/context rendering.
- Add `vibe consult` using the existing assist primitive where possible, but
  backed by project-aware context.
- Add UI Consult icon that calls the same server route.
- Add `VIBESTRATE.md` proposal artifacts; do not auto-write at first.

### Slice 2 - workflow selection decision

- Add Flow capability metadata.
- Add an orchestrator selection service that returns Flow/Crew/Profile/posture
  with reasons.
- Wire `vibe run` and `POST /api/runs` to use selection when no Flow is forced.
- Persist selection artifacts and events.

### Slice 3 - run brief and handoff hardening

- Maintain a compact run brief after major steps.
- Feed roles the run brief plus selected artifacts instead of broad history.
- Add structured handoff contracts for plan, architecture, implementation
  summary, validation summary, review findings, and verifier decision.

### Slice 4 - bounded late review panel

- Implement the DAG substrate needed for a late read-only review panel.
- Enforce hard read-only behavior, not prompt-only read-only.
- Add frontier budget reservations and width caps.
- Let the orchestrator choose the panel Flow when evidence warrants it.

### Slice 5 - advanced DAG workflows

- Checklist DAGs and continue-past-failure.
- Isolated write parallelism only behind a real execution-backend branch model.
- More specialized review panels as real usage proves value.

## Naming and surfaces

CLI:

```bash
vibe consult "..."
vibe consult --task <taskId>
vibe consult --run <runId>
vibe run "..."                 # orchestrator selects Flow by default
vibe run "..." --flow default  # explicit override
```

UI:

- Consult icon in Mission Control, Task Detail, Run Detail, Project/Codebase.
- Workflow selection explanation before or during run start.
- `VIBESTRATE.md` proposal review surface.
- Run detail shows the orchestrator's run brief and selection rationale.

Docs:

- `VIBESTRATE.md` becomes a getting-started concept.
- `custom-workflow-dags.md` stays as the graph execution design.
- Public docs should describe "responsible orchestration" before DAGs.

## Decision

Build the responsible orchestrator first. Keep the workflow DAG work, but make it
serve orchestrator-selected workflows rather than drive the product identity.

The target product is not "parallel agents." The target product is a local,
project-aware engineering supervisor that can choose when a simple linear run is
enough, when a heavier review workflow is justified, and when it should stop
because the evidence is not good enough.
