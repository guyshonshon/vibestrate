# Preference Gates

Status: revised-after-review (2026-06-28)

Owner-taught, supervisor-curated preferences that are injected into a reviewer
turn so a model verifies an artifact against them - the enforcement tier for
preferences that are real but not mechanizable ("use a hyphen, not an em-dash";
"no eyebrow labels"; "do not over-engineer this").

This is the design for the question: *"Hates when we produce eyebrow labels - how
do we make that become forbidden, taught and applied by any model, without
superbly increasing context?"*

> This doc was adversarially reviewed before any build (see Review trail). The
> review killed the original `block`-severity mechanism and re-scoped M0. What
> follows is the revised design, not the first draft.

---

## Context (the real goal)

The literal ask was "a place to organize knowledge / policy / philosophy beyond a
single VIBESTRATE.md." The real goal is narrower: **make a stated preference
reliably caught and corrected on every relevant run, for any subject, without a
human hand-writing a rule and without bloating every agent's context.**

Three constraints decide the design:

1. **Supervisor-derived, not hand-maintained.** The owner never writes a
   `grep SectionEyebrow` rule. They state the preference once (or the supervisor
   proposes one after catching a correction); the system carries it forward, for
   any subject, including ones no regex was pre-written for.
2. **Model-verified, not deterministic.** The owner explicitly chose a reviewer
   that semantically checks the artifact over a brittle string match, because a
   model generalizes to paraphrases and unanticipated subjects. The accepted
   guarantee is "caught and corrected with high probability," not "byte
   impossible to emit."
3. **Cheap in context.** Preferences hit one reviewer turn, scoped to the
   artifact - never every agent's prompt.

Hard, mechanizable, high-stakes rules (secrets, writes, merges) stay on the
existing deterministic gates, which are correct. This design is only for the
un-mechanizable preference class.

### What "caught and corrected" means here (post-review)

The mechanism is the existing review -> fix -> re-review loop, bounded by
`maxReviewLoops`. A flagged preference triggers a fix turn the same way a
correctness `CHANGES_REQUESTED` does today. That IS practical "forbidden": the
violation is corrected on the run, every run. It is deliberately **not** a
permanent hard merge-cap on a model's say-so - that capability (`block`) is a
separate, deferred, deterministically-backed investment (see Severity, M2). The
owner may never need it; advise + fix-loop already delivers what was asked for.

## What exists vs proposed vs foundation (corrected after review)

| Component | Status | Evidence |
| --- | --- | --- |
| Reviewer-turn advisory injection (`composeReviewerStepNotes`) | **EXISTS** | `src/orchestrator/review-lenses.ts:135-149`; call site `src/core/orchestrator.ts:2486` `[evidence]` |
| Reviewer-vs-arbiter detection (inject on lensed reviewer, not the binding join) | **EXISTS** | `src/orchestrator/review-lenses.ts:114-126` `[evidence]` |
| Closed-vocab safety (a persona/flow cannot smuggle free text into a reviewer) | **EXISTS** | `src/orchestrator/review-lenses.ts:12-18,93-99` `[evidence]` |
| Trusted-free-text trust model: run API/CLI takes a persona **id only**, text read from committed config, never remotely sourced | **EXISTS** | `src/core/run-launcher.ts:70`; `src/server/routes/runs.ts:116,301`; resolved at `src/core/orchestrator.ts:1093,1110,1131` `[evidence]` |
| "Advisory text can never soften a failing gate" invariant | **EXISTS (and fragile - see risks)** | `src/orchestrator/review-lenses.ts:101` `[evidence]` |
| Review -> fix -> re-review loop, bounded; exhaustion lands `blocked` (NOT a distinct `needs_human` status) | **EXISTS** | loop `src/core/orchestrator.ts:4271-4296`; `blocked` set `:4361`; status enum `src/core/state-machine.ts:24-29`; `maxReviewLoops` `src/core/workflow-schema.ts:18`, default 2 `src/core/state-machine.ts:116` `[evidence]` |
| Propose-then-confirm pipeline shape (NOT the read-only manual loader I first cited) | **EXISTS, reusable** | `src/project/manual-proposals.ts` `saveManualProposal`/`applyManualProposal`, status open->applied/rejected `:30,:115` `[evidence]` |
| Per-token context disposition; a reviewer turn is summarized by default in common cases | **EXISTS** | `src/flows/runtime/flow-context-builder.ts:231-295` (summary at `:244-251,:272-279,:289-294`, only artifact path kept `:302`) `[evidence]` |
| **Preference store** (`{id, statement, correction, scope, severity, source, confirmedAt}`) | **PROPOSED** | `confirmedAt` is a NEW field - zero hits in code today; not inherited from the persona precedent |
| **Capture step** (state / propose -> owner confirm -> trusted) | **PROPOSED**, reuses `manual-proposals.ts` shape | - |
| **Glob/lens-scoped selection** with a per-turn cap | **PROPOSED** (globs + active lenses are knowable at review time) | - |
| **`advise`-tier injection** into the existing reviewer's advisory notes | **PROPOSED**, reuses the validated `composeReviewerStepNotes` path | - |
| **Raw-artifact guarantee for the preference-carrying reviewer** | **PROPOSED / FOUNDATION** - a NEW signal threaded from step config into the context-builder disposition logic, a different subsystem than the injection point | - |
| **`block` severity (true merge-cap)** | **FOUNDATION** - a NEW dedicated cap input into `computeMergeReady`; does NOT compose from injection. See risks. | `computeMergeReady` inputs `src/core/merge-readiness.ts:49-67`; `checklistItemsClean` precedent `:37,62` `[evidence]` |

Two corrections the review forced: the capture pipeline I first tagged EXISTS was
a mis-citation (a read-only `loadProjectManual` loader, not a propose/confirm
flow); and `block` severity is genuine new foundation, not "a flag on the
injection" as the first draft's prose implied.

## The risks that decide success

- **Trust / smuggling - VERIFIED SOUND.** The reviewer vocabulary is closed
  *specifically* to stop a persona/flow injecting free text into a reviewer
  (`review-lenses.ts:12-18`). Injecting free-text preferences is safe **only**
  because they inherit the same trust class as committed persona config: the run
  API/CLI accepts a persona/preference **id**, never raw text (`run-launcher.ts:70`,
  `routes/runs.ts:116`), and the text is read from committed config inside the
  orchestrator (`orchestrator.ts:1110,1131`). **Invariant: the run API/CLI must
  never accept a raw preference string - only a stored id; and `confirmedAt ==
  null` means inert (never injected).** A supervisor-*proposed* preference does
  nothing until the owner confirms it. `confirmedAt` is a new discipline, not free
  - it must actually be checked at selection time.

- **`block` severity breaks merge composition (the review's fatal finding).**
  `computeMergeReady` (`merge-readiness.ts:49-67`) has exactly four inputs and **no
  slot for a second reviewer's verdict**. `reviewDecision` is **last-writer-wins**
  across review turns (`orchestrator.ts:4126,2612`). So a "dedicated
  preference-review turn" that emits a `DECISION:` line and runs after the
  correctness reviewer would **overwrite** a correctness `BLOCKED` with `APPROVED`
  when it finds no style violation - **softening a failing gate**, the exact
  `review-lenses.ts:101` invariant this design claims to keep. Therefore:
  - **The preference reviewer must NOT emit into the shared `reviewDecision`.** In
    `advise` tier it emits annotations only (or folds into the single existing
    reviewer's notes).
  - **`block`, if ever built, gets its OWN cap input** into `computeMergeReady`
    (mirroring `checklistItemsClean` at `merge-readiness.ts:37,62`), never the
    shared decision. It can only ADD a gate condition, never relax one.

- **A model verdict in the merge path is a false-positive storm waiting to
  happen.** Because preference-compliance is model-judged (the deliberate trade),
  an always-injected, merge-capping, model-judged rule is the
  maximum-blast-radius config: one over-broad `block` ("never use the word
  'simple'") could brick every merge whose diff trips the model's reading, with no
  deterministic floor. So: **`block` is reserved for the mechanizable subset and
  must be backed by a DETERMINISTIC auto-derived check, not a model verdict** -
  that is what makes the merge-cap safe (zero false positives, no model in the
  merge path). Purely-semantic preferences ("do not over-engineer") can only ever
  be `advise`. Plus a circuit-breaker: a `block` check that fails N consecutive
  runs auto-demotes to `advise` and alerts the owner. This is a hard requirement,
  not an open decision.

- **Reviewer blindness via compression - REAL and cross-subsystem.** A reviewer
  turn is handed a summarized diff by default in common cases
  (`flow-context-builder.ts:244-251,272-279,289-294`); the em-dash is gone before
  the model looks. The disposition is decided per-token *inside the context
  builder*, which has no concept of "this is a preference reviewer", and is
  decoupled from `composeReviewerStepNotes` in the orchestrator. So "raw artifact
  for the preference reviewer" is **not** a free rider on injection - it is a
  second new signal threaded into a different subsystem, and it is **load-bearing
  for M0's own success** (the em-dash demo fails silently against a summary).

- **Termination - sound, but contingent.** The existing loop lands cleanly on
  `blocked` at exhaustion (`orchestrator.ts:4271-4296,4361`) - never spins, never
  auto-passes. This guarantee belongs to the *correctness* `reviewDecision`. An
  `advise` preference rides that same loop and inherits it. A `block` preference
  reaches a clean halt **only if** wired as its own cap input (above); under the
  naive clobber implementation it could auto-pass. (Note: the terminal status is
  `blocked`; there is no `needs_human` enum - earlier draft overstated this.)

- **Scope - globs real, domains aspirational.** `globs` (changed-file paths) and
  `lenses` (the active persona's lenses) are knowable at review time. `domains`
  ("ui"/"docs"/"code") would need an artifact classifier that **does not exist**.
  So selection in M0/M1 is glob + lens only; domain classification is its own
  deferred problem, not a dependency. The per-turn cap is trivial; the *selection*
  feeding it is the real work.

## The design

### Data: the preference record

```
Preference {
  id            // stable; the only thing the run API/CLI accepts
  statement     // "do not use em-dash characters"
  correction    // "use a hyphen ( - ) instead"   (the fix the reviewer names)
  scope         // { lenses?: [...], globs?: [...] }   (no domain classifier yet)
  severity      // "advise" (default)  |  "block" (deferred, deterministically-backed only)
  source        // "owner" | "supervisor-proposed"
  confirmedAt   // null until owner confirms; null => never injected
}
```

Stored as owner-committed config (sibling to `personas.<id>.reviewLenses` /
`specUpPosture`), inheriting the committed-config trust model.

### Severity (re-scoped after review)

- **`advise` (default, all preferences, model-judged).** Injected into the
  reviewer's advisory notes. A violation is flagged and rides the existing
  review -> fix -> re-review loop. Corrected on the run; never a standalone
  merge-cap. This is the user's "the reviewer catches it and the agent goes by
  it." **Everything in M0/M1 is `advise`.**
- **`block` (deferred, opt-in, deterministically-backed only).** A true merge-cap
  via a NEW dedicated `computeMergeReady` input, fed by an auto-derived
  deterministic check (so the owner still never hand-writes grep - the system
  derives it from the record), with a circuit-breaker. A model verdict never
  directly caps a merge. Unavailable to purely-semantic preferences.

### Flow

1. **Capture (taught).** Owner states a preference, or the supervisor proposes one
   after observing a correction (`source: supervisor-proposed`, `confirmedAt:
   null` - inert). Owner confirms via the `manual-proposals.ts` propose/apply
   shape; confirmation sets `confirmedAt` and makes it injectable. Confirmation is
   what keeps the smuggling hole closed.
2. **Select (scoped, capped).** At a reviewer turn, pick confirmed preferences
   whose `scope` (lens/globs) matches the artifact, up to a per-turn cap. Dropped
   overflow is logged, never silently cut.
3. **Inject (applied by the model).** Render each as an imperative, fix-carrying
   check into the existing reviewer's advisory notes - a new block in
   `composeReviewerStepNotes`, beside lens emphasis and posture, injected only on a
   lensed reviewer turn (`review-lenses.ts:114-126,146`), never on the arbiter, and
   **never as a second `reviewDecision`**:

   ```
   Owner preferences - verify the change against each; flag every violation with
   its exact location and the stated correction:
   - no em-dash characters. If any changed line contains an em-dash, flag it; the
     fix is a hyphen ( - ).
   - no eyebrow / kicker labels above headings. The heading carries the section.
   ```
4. **Verdict + loop.** Flagged preferences fold into the single existing
   reviewer's `CHANGES_REQUESTED` and ride the bounded fix loop. No new gate
   semantics in M0.

### Reliability engineering (pushing "most likely" up)

Design requirements, not nice-to-haves:

- **Raw artifact for the preference-carrying reviewer** (see the compression
  risk). Load-bearing for M0.
- **One preference = one imperative line that names the fix.** Salience beats
  volume.
- **Bounded loop** with the existing clean `blocked` exit.
- **Optional dedicated annotate-only preference turn** (M1+) to avoid diluting the
  bug-finder's attention - but only if dilution proves real, and it must NOT emit
  `reviewDecision`.
- **Deterministic backstop / `block` path** for the mechanizable subset (M2),
  auto-derived, never hand-maintained.

## Build sequencing

- **M0 (scout - advise-only, zero merge-path risk). GREEN-LIT by review with two
  conditions.** Add the `Preference` record to config; render one hand-seeded,
  confirmed preference into the existing reviewer's notes via
  `composeReviewerStepNotes`, `advise` only; **guarantee the reviewer reads the raw
  artifact** (condition 1 - load-bearing, not deferred); glob/lens scoping only.
  Point a run at a diff that introduces an em-dash; confirm the reviewer flags it
  and the fix loop corrects it. Proves injection + scoping + the model's catch rate
  with no new gate semantics and no clobber risk.
- **M1 (capture).** The propose/confirm pipeline (reuse `manual-proposals.ts`);
  build `confirmedAt` and enforce it at selection. Preferences become teachable.
- **M2 (deferred, gated).** `block` as a NEW `computeMergeReady` cap input, backed
  by an auto-derived deterministic check, with the circuit-breaker. Gets its own
  design + review of the verdict-composition seam before any build (condition 2).
- **M3 (optional).** Dedicated annotate-only preference turn if dilution proves
  real.

Each milestone depends only on earlier ones. M0 carries no merge-path risk.

## The optionality law (non-negotiable)

A plain `vibe run "<prompt>"` requires zero preferences, zero policies, zero
gates. Preferences, policies, and posture are additive, opt-in layers - never on
the critical path to a simple prompt. `preferences` defaults to `[]` (a run with
none is byte-identical to before); capture is a one-shot act
(`vibe preferences add ...` or one UI click), never a configuration journey; the
UI surfaces depth behind progressive disclosure, never a required step. Any change
that puts a gate on the default path is a regression of this law.

## M1: capture (owner-explicit), SHIPPED-SCOPE

Goal: stop hand-editing YAML to teach a preference, without adding friction to the
common path. Grounded in existing surfaces: `vibe policies` (CLI template,
`src/cli/commands/policies.ts`), `setConfigValue` (YAML round-trip + validate
before write, `src/setup/config-update-service.ts`), and the read-only
`SupervisorsPage` / `/api/personas`.

- **A typed `preferences-service.ts`** is the one core both CLI and HTTP call:
  `addOwnerPreference` (sets `source: owner`, `confirmedAt: now` - trusted at
  creation, no confirm step), `listPreferences`, `removePreference`. It validates
  against `preferenceSchema` and writes via the config service (fail-closed).
- **CLI `vibe preferences list|add|remove`** (parity sibling of `vibe policies`).
- **HTTP `GET/POST/DELETE /api/personas/<id>/preferences`** backing the UI - the
  first persona-config WRITE surface, so it is narrow, audited, project-root
  bounded (no arbitrary config keys; only the preferences array of a known
  persona).
- **UI parity:** a preferences section on the supervisor surface (add field +
  list + remove), so the rule about never telling the owner to run a CLI holds.

Owner-add is confirmed-on-create; the `confirmedAt`/`source: supervisor-proposed`
machinery already in the M0 schema stays dormant until M1.5.

## M1.5 (deferred): the "taught" path

The supervisor proposes a preference from an observed correction (e.g. the owner
tells the supervisor "stop using em-dashes" in a consult), written as
`source: supervisor-proposed, confirmedAt: null` (inert), surfaced for the owner
to confirm - reusing the `manual-proposals.ts` open/applied/rejected shape. This is
the conversational, lowest-friction capture and the north star; it plugs into the
same store M1 builds, so it is a source, not a new pipeline.

## Open decisions

- Preferences per-persona (symmetric with `reviewLenses`, switching persona
  switches the set) vs project-global vs both. Leaning per-persona.
- Per-turn injection cap value.
- Whether the dedicated preference turn (M3) is worth its extra cost vs folding
  into the existing reviewer (M0's choice).

Settled by review: domains-scope is out (no classifier); `block` is never a
shared-decision clobber and never a raw model verdict; the deterministic backstop
is NOT optional-last for the mechanizable subset of `block`.

## Review trail

Adversarial pass (Opus 4.8, fresh context, 2026-06-28). Verified every
load-bearing claim against code with file:line. Findings and disposition:

1. **Trust/smuggling - SOUND.** Confirmed the id-only run path and config-sourced
   text (`run-launcher.ts:70`, `orchestrator.ts:1093,1110,1131`). No path for raw
   free text to reach a reviewer. ACCEPTED; invariant restated explicitly.
2. **`block` severity is the fatal flaw.** `computeMergeReady` has no second-verdict
   input and `reviewDecision` is last-writer-wins (`orchestrator.ts:4126`), so a
   separate decision-emitting preference turn would clobber/soften the correctness
   gate - violating the very `review-lenses.ts:101` invariant the doc claimed to
   keep. ACCEPTED IN FULL; `block` re-designed as a dedicated cap input,
   deterministically-backed, deferred to M2 behind its own review; the
   preference reviewer never emits `reviewDecision`.
3. **Termination contingent; `needs_human` is not a real status.** ACCEPTED;
   corrected to `blocked`, and the clean-halt guarantee now noted as contingent on
   the M2 wiring.
4. **Compression blindness is real and cross-subsystem.** Reviewer turns are
   summarized by default; "raw artifact" needs new plumbing into the context
   builder, not a free rider on injection. ACCEPTED; elevated into M0 scope as a
   hard condition.
5. **Scope domains hand-wave.** No artifact classifier exists. ACCEPTED; dropped
   to glob/lens scoping.
6. **EXISTS/PROPOSED honesty - two mis-tags.** Capture pipeline mis-cited
   (read-only loader vs `manual-proposals.ts`); `block` framed as additive.
   ACCEPTED; table corrected, citations fixed (`src/core/orchestrator.ts`, not
   `src/orchestrator`).
7. **"Deterministic-first for the mechanizable examples" alternative.** PARTIALLY
   ACCEPTED. The owner deliberately chose model-reviewer-primary and "not by a
   grep", so the model reviewer stays the general primary at `advise`. The
   reviewer's point is honored where it is decisive - the merge-CAP path (`block`)
   - which is now deterministic-only and auto-derived (owner never hand-writes a
   rule). The two are not in conflict once severity is split this way.

Verdict: M0 green-lit (advise-only, raw-artifact, no merge-path). M2 (`block`) NOT
green-lit until the verdict-composition seam and circuit-breaker are designed and
reviewed.

M1 adversarial CODE review (Opus 4.8, fresh context, 2026-06-28). Verified safe
(empirically): the built-in materialization preserves all six behavioral fields
(reviewLenses/posture/riskSignals/...), the trust bypass is closed at both layers
(POST body is `.strict()`, `addOwnerPreference` hard-sets `source:owner` +
`confirmedAt:now`, so a pre-confirmed/supervisor-proposed entry cannot be forged),
no path traversal via `personaId`, writes are fail-closed (whole-config schema
validation before persist). Findings + disposition:

- F1 (no route-level test for the new write surface) - ACCEPTED, fixed:
  `tests/preference-routes.test.ts` covers add/list/remove + the forge-rejection +
  400 mapping + the unknown-persona 404.
- F2 (GET on an unknown persona silently returned the default's preferences) -
  ACCEPTED, fixed: `listPreferences` now rejects an unknown persona, and the GET
  route maps it to 404.
- F3 (UI `PreferencesEditor` crashes against a STALE running backend that predates
  the `preferences` field) - ACCEPTED as fail-fast-correct per the no-backcompat
  rule; named here: after this lands, restart `vibe ui` (rebuild the server), not
  just the UI bundle, or the Supervisors page white-screens until the backend
  emits `preferences`.
- F4 (UI `slugId` derives the id from the statement, so two statements that
  slugify alike collide on the duplicate guard) - ACCEPTED as a minor UX wart;
  the CLI takes an explicit id.
- F6 (last-writer-wins on concurrent adds to project.yml) - ACCEPTED as fine for a
  single-user local tool; consistent with every other config writer. Not atomic.

Second pass - adversarial CODE review of the M0 implementation (Opus 4.8, fresh
context, 2026-06-28, against the committed diff). Findings and disposition:

1. **Inert on the default flow (decisive).** The wiring only touched the
   graph-frontier executor (`runGraphFrontier`). The `default` flow has no `needs`,
   so it runs the linear walk (`runFlowSequence`), which rendered reviewer notes
   with a bare `renderFlowStepNotes` - so the preference block (and, pre-existing,
   the lens emphasis + spec-up posture) never fired on a plain run. The unit tests
   missed it because none exercised a real executor. ACCEPTED; FIXED: the linear
   walk now routes reviewer notes through `composeReviewerStepNotes` and threads
   `forceFullTokens`, and `tests/preference-gates-e2e.test.ts` runs both a linear
   and a graph flow with a fake provider and asserts the preference text lands in
   the reviewer prompt (and not the executor prompt). This also fixes the
   pre-existing lens/posture silent gap on linear flows.
2. **Unbounded forced-full diff.** `forceFullTokens` embeds the whole diff with no
   size ceiling, so a huge diff + any confirmed preference can bloat the reviewer
   prompt. ACCEPTED as a known M0 limitation (not a blocker for an advise-only
   slice). Follow-up: force-full only under a byte ceiling, else keep the summary
   and log that the preference reviewer saw a summary.
3. **`scope.lenses` is run-level, not per-reviewer-step.** The block is computed
   once per run against the persona's declared lenses, so `scope.lenses` is an
   on/off switch ("does the persona declare this lens?"), not per-reviewer
   targeting. Matches M0 intent; documented here so it isn't mistaken for
   per-step scoping.
4. Trust gate, injection placement (reviewer-only, never a second decision), schema
   strictness/defaults, event wiring: all verified sound.
