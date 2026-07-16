# Purposeful approval gate - discuss, request changes, resume

Status: revised-after-review (2026-07-10)

## Context - the real goal

Today a human-in-the-loop approval is a dead-end binary. The dashboard card
([`ApprovalBanner.tsx`](../../src/ui/components/approvals/ApprovalBanner.tsx))
and the schema (`approval-types.ts:45`, `z.enum(["approved","rejected"])`) offer
only **Approve** or **Reject**, and Reject is terminal → the run goes `blocked`
(`orchestrator.ts:5451-5472`). The optional note is **logged only, never
re-injected** into the run (`orchestrator.ts:5440`).

The owner's ask: these interactions must *carry a purpose*. When the agent stops
and asks a question - the screenshot case is the planner asking *"clarify what
'Wtf' means"* - the human should be able to **answer and have the run act on it**,
not just approve blindly or reject into a dead stop. Concretely: discuss the
issue, respond with guidance / next actions, "reject partially" (approve the
direction but correct a part), and have the run **pick up from there**.

This is not "surface something that already exists." Grounding found:

- **Free-form discussion exists** - the Consult dock (`runConsult`) is globally
  mounted, including on the dashboard (`App.tsx:519`) - but it is **advisory
  only**; its answers are never fed back into a paused run (`consult.ts:1-9`).
- **A "user text re-enters the run" loop exists** - but only spec-up
  gap-questions (`RunGapQuestions` → `submitSpecUpAnswers` →
  `spec-up-chain.ts:462-479`), hard-wired to the `spec-up-intake` flow.
- **A general "respond / request-changes and resume" for an approval gate exists
  nowhere** - not the dashboard, not the CLI (`decide.ts` = approve/reject), not
  the TUI (`ApprovalsPage.tsx` binds only `a`/`r`). The decision is a two-value
  enum and the note is inert.

Owner decisions (2026-07-10):

- **Design doc + Tier-2 review before code** (this doc).
- The owner initially chose "re-run the paused stage in place." **The adversarial
  review proved that unsafe** (the gate fires after the turn already committed its
  outputs and worktree edits - re-running double-applies). The resume model was
  reshaped to **guidance-forward** (below); this diverges from the initial pick
  and needs an owner nod (Open decisions).

## What exists vs proposed vs foundation

| Component | Status | Evidence |
|---|---|---|
| Approval gate: create → `waiting_for_approval` → poll → approve=proceed / reject=block | **EXISTS** | `awaitApprovalRequest` (`orchestrator.ts:5336-5473`); `ApprovalService` (`approval-service.ts`) |
| Decision schema (two outcomes, inert note) | **EXISTS** | `approval-types.ts:43-50` |
| The gate fires AFTER the turn ran + committed | **EXISTS (the constraint that reshapes the design)** | agent gate = `maybeAwaitApproval` (`orchestrator.ts:5483`), called at the END of `commitTurn` (`orchestrator.ts:2796`, `4669`); outputs/arbitration/handoffs + run-brief already written (`orchestrator.ts:2704-2795`); pre-turn baseline `preTurnTree` is local to `runRole` and discarded (`orchestrator.ts:6324`) |
| The frontier processes each step exactly once | **EXISTS** | `runGraphFrontier` `while processed.size < steps.length` (`orchestrator.ts:3028`) - no "re-run this step in place" op |
| Consult (free-form, advisory, globally mounted) | **EXISTS, reusable for "Discuss"** | `runConsult` (`consult.ts:177`); `ConsultDock` (`App.tsx:519`) |
| Forward feedback tokens (how feedback already flows to a LATER turn) | **EXISTS, the model to reuse** | outputs map + run-brief (`orchestrator.ts:2792`); the review band's declared `per-item-findings` input token (`orchestrator.ts:3949-3956`) - a step is authored to consume a named input |
| Redaction helper (per-site, no chokepoint) | **EXISTS, must be applied explicitly** | `redactSecretsInText` (`diff-service.ts:261`); the review-band injection it resembles is itself NOT redacted (`orchestrator.ts:3940-3956`) |
| `request_changes` outcome + `guidance` field | **PROPOSED** | new |
| Guidance persisted as a forward input token; run continues with a FRESH guided turn (no re-run of the committed turn) | **PROPOSED (reshaped)** | new |
| Atomic/locked `resolve()` write | **PROPOSED (review finding F5)** | `resolve()` is check-then-write, unlocked (`approval-service.ts:130-159`) |
| "Discuss" = consult pre-seeded with approval context | **PROPOSED (thin)** | new |
| Card rebuilt on coal/chalk primitives | **PROPOSED** | old `vibestrate-*` tokens + forbidden eyebrow labels today |
| CLI + TUI parity | **PROPOSED** | new |

## The risks that decide success

- **FATAL if ignored - re-running the committed turn corrupts the worktree.**
  The gate is post-`commitTurn`; the turn's edits are already on disk and its
  outputs already recorded, and the pre-turn baseline is not plumbed to the gate
  (`orchestrator.ts:6324`). So the design does **not** re-run the paused turn.
  Guidance flows FORWARD into a fresh guided turn instead (see The design).
  Failure mode ruled out: a write role that emits `HUMAN_APPROVAL: REQUIRED` →
  human requests changes → re-execute writer over its own edits → double-applied,
  corrupt diff.
- **Only agent-requested gates qualify, and scope by write-capability.** Four of
  the five `awaitApprovalRequest` sites are `source: "policy"` (flow gates,
  run-complete sign-off, diff gate, budget pause) and stay Approve/Reject. Only
  `maybeAwaitApproval` (`orchestrator.ts:5483`) is agent-requested. Even there,
  request_changes is scoped to **planner/read-only-class** gates in v1; a
  write-role gate gets guidance-forward as *new* work on the next turn (which is
  legitimate iterative editing, not a replay), never a re-execution of the
  committed turn.
- **Termination.** guidance-forward → guided turn → agent asks again →
  request_changes again → ∞. Bound with a dedicated `approval.maxChangeRounds`
  cap (default 3). The counter lives on run state so it is honest across the
  loop; be explicit (below) that the whole interaction only holds while the run
  process stays alive.
- **Process-death honesty (review F7).** `waitForResolution` blocks the live
  orchestrator process (`approval-service.ts:161-198`); there is **no
  mid-frontier resume from disk**. If the run process dies while the human
  deliberates, the run restarts from a checkpoint, not from the paused step. State
  this plainly; do not imply durability the code lacks.
- **Concurrency (review F5).** The real defect is not "two POSTs → two re-runs"
  (only the single orchestrator drives continuation) but that `resolve()` is an
  unlocked check-then-write (`approval-service.ts:142-145`) - two concurrent
  resolvers (dashboard + CLI) both pass the guard and last-writer-wins, silently
  replacing the `guidance` the orchestrator then consumes. Make `resolve()`
  atomic/locked before it drives control flow.
- **Redaction (review F6).** Guidance is user free-text on the path to a provider
  prompt. There is no structural chokepoint; each injection site must call
  `redactSecretsInText`. Apply it explicitly on the guidance token AND add a
  single grounding-injection funnel so future sites can't forget.
- **Parity or it's a lie.** request_changes must land in `vibe approvals` and the
  TUI, or the dashboard silently becomes the only place a run can be steered.

## The design

### Decision model

Extend `approvalDecisionSchema.decision` to
`["approved","rejected","changes_requested"]` and add `guidance: string`
(required for `changes_requested`). `ApprovalService` gains `requestChanges(...)`
sharing an **atomic/locked** `resolve()` (fixing F5). Persisted status adds
`changes_requested`.

### Guidance-forward resume (reshaped - NOT an in-place re-run)

On `changes_requested`, the gate does **not** re-execute the committed turn.
Instead it:
1. Persists the **redacted** guidance as a forward input token (modeled on the
   review band's `per-item-findings` declared-input pattern, `orchestrator.ts:3949`).
2. Resumes the run FORWARD with a **fresh guided turn**: for the planner gate,
   that is another planning pass that consumes the guidance token (so *"clarify
   Wtf"* → human answers → planner re-plans with the answer → proceeds) - added
   as the next frontier step, not a re-entry of the completed one. For a
   write-role gate (v1: kept minimal), the guidance seeds the next step's
   grounding as additional direction - forward iteration, never replay.
3. Bounds consecutive rounds by `approval.maxChangeRounds`; on exhaustion,
   cap-and-block honestly.

This reuses how feedback already flows forward (a later turn consumes a named
token) instead of inventing a frontier re-entry mechanism, and it never touches
an already-committed turn's worktree state. State machine: reuses the existing
`waiting_for_approval` → `fromStatus` round-trip; **no new status needed** (review
F8, verified safe).

### "Discuss" (thin, advisory)

A **Discuss** control opens the existing Consult dock pre-seeded with a
`viewContext` of the approval's requestedAction / reason / artifact (redacted).
Advisory only; changes no run state. Reuses `runConsult` entirely.

### HTTP + parity

- `POST /api/runs/:runId/approvals/:approvalId/request-changes` `{ guidance }`,
  refusing a policy-sourced or non-pending approval (fail closed).
- CLI `vibe approvals request-changes <id> --guidance "..."`; TUI `c` binding +
  guidance composer.

### Card redesign (bundled)

Rebuild `ApprovalBanner.tsx` on coal/chalk: design/* `Button` (Approve primary,
Request-changes, Reject), `Chip` for risk/source (not bordered pills), kill the
uppercase faint-grey eyebrow labels, restructure the facts into clean framed rows
/ `StatTile`s with colored labels, one guidance composer, full loading/empty/error
states, verified in both themes.

## Build sequencing

- **M0 (scout) - through the REAL frontier, not a fixture (review F2).** In
  `runGraphFrontier`/`maybeAwaitApproval`, make a planner gate return
  `changes_requested`, persist a redacted guidance token, and drive a fresh guided
  planning turn that consumes it, bounded by the cap - end to end on a fake
  provider (gate → request_changes → planner re-plans with guidance → approve →
  proceeds). If a guided forward turn can't be cleanly scheduled at this call
  site, that determines the whole feature's shape; do not scout on a bespoke
  harness.
- **M1.** Schema + `requestChanges` + **atomic** `resolve()` + tests
  (no-overwrite, concurrent-resolver race).
- **M2.** Gate return refactor (discriminated outcome) + guidance-forward at the
  agent-requested site + cap + explicit redaction + injection funnel. Fake-provider
  integration test incl. the termination cap and the process-death limitation
  documented.
- **M3.** HTTP route + CLI + TUI parity, fail-closed for policy gates.
- **M4.** Card redesign on coal/chalk; preview click-through both themes; drive a
  real request_changes on a seeded planner gate.
- **M5.** Docs + CHANGELOG + version.

## Open decisions

- **Resume model - needs owner nod.** The review killed "re-run in place." The
  reshape is **guidance-forward** (fresh guided turn consuming a token). The
  alternative the reviewer floated is **reject-then-respawn-seeded** (option a:
  block cleanly + re-launch a run seeded with guidance, reusing the *proven*
  spec-up re-entry seam). Guidance-forward keeps it one continuous run (better
  UX) but requires scheduling a guided turn in the frontier; respawn-seeded is
  heavier UX but reuses a shipped seam. Lean: guidance-forward for the planner
  case; fall back to respawn-seeded if M0 shows frontier scheduling is costly.
- **Write-role gates in v1:** offer request_changes (guidance seeds next step) or
  restrict to planner-class only and leave write gates approve/reject? Lean:
  planner-class only in v1 (review F1/F3 - safest), widen later.
- **Cap:** dedicated `approval.maxChangeRounds` default 3.
- **Discuss → guidance hand-off:** advisory first; "use this consult answer as my
  request-changes guidance" is a fast follow.

## Review trail

Adversarial review (Opus 4.8, fresh context, brief: break it, verify against
code, cite file:line). Verdict: **should-be-reshaped.** Findings, quoted and
adjudicated:

- **FATAL - "the re-run seam does not exist at the agent-requested gate; the gate
  fires strictly AFTER the turn ran and committed"** (`orchestrator.ts:2796`,
  `2704-2727`, `6324`). **ACCEPTED.** Abandoned in-place re-run; reshaped to
  guidance-forward (fresh guided turn consuming a redacted token). Removes the
  worktree double-apply / double-record hazard entirely.
- **CRITICAL F2 - "'generalizes the review-loop seam' is not true; the review
  loop is an outside-the-frontier band re-run with a declared input token, the
  gate is an inside-the-frontier single-pass pause"** (`orchestrator.ts:3932-4017`
  vs `2796`). **ACCEPTED.** The design now reuses only the *forward declared-input
  token* pattern, not step re-entry; M0 must run through the real frontier.
- **CRITICAL F1/F3 - "scope must be by `profile.allowWrite`, not 'has a role
  turn'; a write role emitting HUMAN_APPROVAL → re-run double-applies edits"**
  (`orchestrator.ts:5495`, `6324`). **ACCEPTED.** v1 scopes request_changes to
  planner/read-only-class gates; write gates get forward-iteration guidance, never
  replay.
- **F5 - "`resolve()` is an unlocked check-then-write; concurrent resolvers race
  and silently replace guidance"** (`approval-service.ts:142-145`). **ACCEPTED.**
  Made `resolve()` atomic/locked an M1 requirement.
- **F6 - "redaction is scattered, no chokepoint; the review-band injection it
  copies is itself unredacted"** (`orchestrator.ts:3940-3956`). **ACCEPTED.**
  Explicit `redactSecretsInText` on the guidance token + a grounding-injection
  funnel.
- **F7 - "no mid-frontier disk resume; the interaction only holds while the run
  process is alive"** (`approval-service.ts:161-198`). **ACCEPTED as an honesty
  requirement**, documented in Risks; not hidden.
- **F8 - "state machine is fine; `changes_requested` needs no new status, reuse
  the round-trip"** (`state-machine.ts:369-383`). **ACCEPTED, no change needed** -   removed the speculative new-status idea.
- **Safer alternative** (reject-then-respawn-seeded, reusing the spec-up seam):
  **RECORDED as the fallback** in Open decisions if M0 shows guidance-forward
  frontier scheduling is costly.

Reviewer's scariest-outcome check - "a re-run that double-applies writes to the
worktree or resumes into a committed state" - is now structurally impossible: the
design never re-runs a committed turn.

## Build progress

- **M0 (scout) - DONE** (`c55bb149`), then corrected. Proved guidance-forward
  through the frontier. CRITICAL follow-up (`9d729e51`): M0 only wired the GRAPH
  path, but the default flow is the LINEAR `runFlowSequence`, which ignored
  `changesGuidance` and PROCEEDED PAST the gate (like approved). M0's "GREEN" was
  a false positive - the assertion (merge_ready + approval status) is also
  satisfied by proceed-past. Fixed both paths (shared `composeGuidedNotes`) and
  strengthened the test to assert the agent actually re-runs WITH the guidance.
  LESSON: assert the mechanism (did it re-run?), not just the end state.
- **Parallel fail-closed** (`a89ca912`): a change-request on a fan-out sibling
  can't be re-run cleanly, so it hits `failStepFatal` (blocks), not silent
  completion.
- **M1 - DONE** (`9d729e51`): atomic `resolve()` via `withFileMutex` (TDD'd
  concurrent-resolver race); `policies.approvalMaxChangeRounds` (default 3);
  round cap derived from the persisted `changes_requested` count (resume-durable).
- **F2 fail-closed** (`c3b861d4`): the four non-agent gate sites (run.complete
  sign-off, high-risk diff gate, policy approval-gate steps, budget pause) now
  fail CLOSED on `changes_requested` instead of proceeding as approved.

## Whole-branch review trail (M1)

Second adversarial review (Opus 4.8, whole diff `03988d6e..9d729e51`). Ruled out
the three scary outcomes (no unbounded human loop - counter monotonic + exact
stageId match; no guidance leak - double-redacted, reaches prompt; linear re-run
skips only post-commit work, never required work). Findings:

- **F1 - "no human-trigger surface; requestChanges is dead outside tests."**
  ACCEPTED as EXPECTED - that is M3 (CLI/HTTP/UI). Not a defect; the branch is
  backend-core staging until M3.
- **F2 - "four of six gate sites treat changes_requested as APPROVE" (fail-open,
  latent).** ACCEPTED, FIXED (`c3b861d4`).
- **F3 - cap counter is per-flow-status, not per-gate.** DEFERRED - fail-safe
  (blocks early, never loops). M2: key the counter on `step.id`.
- **F4 - mutex covers only resolve(), not create()/expiry writer.** DEFERRED -
  low risk. M2: lock those writers too.

## Remaining milestones

- **M2** - F3 per-step counter, F4 lock create()/expiry, run-brief double-append
  guard on re-run (N1).
- **M3** - HTTP `request-changes` route (refuse for policy-sourced approvals) +
  `vibe approvals request-changes` + TUI parity.
- **M4** - card redesign on coal/chalk primitives + Discuss affordance.
- **M5** - docs + CHANGELOG + version.
