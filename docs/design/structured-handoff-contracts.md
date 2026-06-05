# Design: Structured handoff contracts

Status: **SHIPPED (builder-side, opt-in; panel-review adopts it first)** · Owner: maintainer

The deferred half of Slice 3 ("Run brief + handoff hardening"): explicit
**structured handoff contracts per phase**. Where the run brief is a compact,
deterministic *summary* of the story so far, a handoff contract is the *packet*
one step hands the next - named JSON instead of free-form prose, so the
through-line is machine-checkable.

---

## Why

A flow's steps already pass artifacts forward by token name (`plan`,
`architecture`, `execution`, `findings`, …). But for the builder phases those
artifacts were free-form text. The next role had to re-read prose; the run
brief could only take a one-line head of it; the dashboard had nothing
structured to render. The review side already had contracts
(`flow-output-contracts.ts`: `findings`, `finding-responses`,
`finding-resolutions`, `decision-summary`); the builder side did not.

Structured handoffs close that gap: the planner emits an ordered plan, the
architect a design with decisions, the implementer an execution report that maps
back to the plan. Downstream steps - and the brief, and the UI - read named
fields (open questions, risks, files, per-step coverage) deterministically.

## The decision: opt-in by token name

There were two ways to add builder-side contracts:

1. **Apply to the existing `plan`/`architecture`/`execution` tokens.** Clean, but
   it changes what *every* run's planner/architect/implementer is asked to
   produce - a default-flow-wide behavior change.
2. **Add new opt-in tokens** (`plan-handoff`, `architecture-handoff`,
   `execution-handoff`) that a flow adopts deliberately. Zero impact until a
   flow opts in.

We took (2). It is also the most consistent with the codebase: the review-side
contracts are **keyed by token name** (a step gets the `findings` contract iff it
declares the `findings` output). Builder-side contracts follow the same rule -
declare `plan-handoff` and you get the plan contract. Flows that still emit
free-form `plan`/`architecture`/`execution` are byte-for-byte unchanged.

`panel-review` is the first flow to adopt the new tokens; the default flow,
quality-arbitration, and pickup are untouched.

## The contracts

Defined in `src/flows/schemas/flow-output-contracts.ts`, each a strict Zod
object with a `contract` literal id + `stepId` (validated against the producing
step) + a small, bounded payload. Core fields are required; the rest default to
empty arrays so a slightly-thin-but-valid emission still parses.

- **`plan-handoff`** (`vibestrate.flow.plan-handoff.v1`): `goal`, ordered `steps`
  (`id`/`title`/`detail`), `filesLikelyTouched`, `assumptions`, `openQuestions`,
  `risks`.
- **`architecture-handoff`** (`vibestrate.flow.architecture-handoff.v1`):
  `approach`, `decisions` (`id`/`decision`/`rationale`/`alternatives`),
  `componentsTouched`, `interfaces`, `risks`, `openQuestions`.
- **`execution-handoff`** (`vibestrate.flow.execution-handoff.v1`): `summary`,
  per-step `steps` (`planStepId`/`title`/`status`/`note`, status one of
  done/partial/skipped/blocked), `filesChanged`, `commandsRun`, `followUps`,
  `risks`.

A `flowHandoffContracts` registry maps each token to its schema + a minimal JSON
example, so both the prompt-side render and the orchestrator-side parse have one
source of truth.

## Flow through the system

1. **Prompt.** `renderFlowOutputContractNotes` (flow-arbitration.ts) walks the
   registry and, for each handoff token a step declares, injects the JSON example
   (with the real step id substituted) into the step prompt.
2. **Parse.** After a step commits, `Orchestrator.recordFlowHandoffOutputs`
   parses the step output against the token's schema using the same
   `parseFlowJsonContract` the review side uses (marker block, JSON fence, or a
   bare object; stepId must match).
3. **On success**, the canonical JSON replaces the registered output (so the next
   step consumes clean structured data) and is persisted to
   `artifacts/flows/<stepId>/<token>.json`.
4. **On failure**, the raw text output stays in place (already registered by
   `registerFlowRoleOutputs`) - graceful degradation, never fatal.
5. **Either way** a `flow.handoff.parsed` event is emitted (`{stepId, token,
   parsed, message?}`) so adoption and parse health are visible in the event log.

The `plan`/`execution` artifact recognition in the runner (used by the final
report and resume seeding) was widened to also match the `-handoff` variants, so
panel-review's report and mid-DAG resume keep working.

## What this is not

- Not a behavior change for existing flows. Opt-in by token.
- Not a hard gate. A non-conforming emission degrades to raw text + an event; it
  does not block the run. (Hardening the *review-decision* path is a separate,
  already-shipped concern.)
- Not a new workflow language. The contracts describe handoff shape, not control
  flow.

## Related

- `responsible-orchestrator.md` - the run brief + handoff hardening slice this
  completes.
- `flow-output-contracts.ts` - the review-side contracts this mirrors.
- `custom-workflow-dags.md` - the panel-review graph flow that adopts it.
