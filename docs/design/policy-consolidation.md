# Policy Consolidation: one project-level tiered policy surface

Status: revised-after-review (2026-06-28)

Consolidate the TWO rule surfaces that exist today - the project policy engine
(`.vibestrate/policies/*.yml`) and the persona-scoped preference gates (M0-M2,
`personas.<id>.preferences`) - into ONE project-level surface where every
owner-authored rule carries a **tier**. The supervisor (any active persona) is
the *enforcer* of the project's rules; rules are not its identity.

> This doc must be adversarially reviewed (fresh Opus 4.8) BEFORE any code -
> specifically to find where a hard security gate could be weakened, where a
> tier could mis-route, and the fatal flaw. See Review trail.

---

## Context (the real goal)

The literal ask is "merge two config surfaces." The real goal: **a project-wide
rule belongs to the project, not to one supervisor.** "Never use an em-dash" is a
property of this codebase; it must hold no matter which persona reviews. Today it
lives at `personas.<id>.preferences` - so switching supervisor silently drops it.
That is the mis-scoping this fixes.

Persona keeps only its *judgment*: `reviewLenses` (closed-vocab scrutiny aim) and
`prefersPosture` / `specUpPosture` / `riskSignals` / `prefersFlows` /
`reviewerProfile` (how it behaves). It loses `preferences` entirely. The active
persona *ensures the project's rules reach the review*; it does not own them.

### What "project-wide" means for advise scoping (post-review)

The review caught a real incoherence in the first draft: advise selection is
gated by the *active persona's* `reviewLenses` (`preference-gates.ts:59`
intersects a rule's `scope.lenses` with the run's active lenses). So "ANY persona
injects the rule" is only unconditionally true for an **unscoped** rule.

The settled semantics, which fix the actual mis-scoping:

- **Unscoped advise rule (`scope.lenses: []`, the default and normal case)** -
  injected on **every** run under **every** persona. This is the real fix: today
  the rule lives on persona A and vanishes when persona B runs; after the move it
  lives on the project and fires regardless of persona.
- **Lens-scoped advise rule (`scope.lenses` non-empty)** - an *opt-in targeting
  refinement*: it fires only when the run's active lenses include one of them.
  This is targeting ("only check this under the security lens"), NOT persona
  ownership. The rule still belongs to the project; the scope just narrows *which
  runs* see it. A persona that never declares the lens simply never triggers that
  optional rule - which is the owner's stated intent when they scoped it.

The block tier has no lens gate at all (deterministic, run-level); moving it off
persona is an unambiguous fix (a block rule on persona A genuinely no longer runs
under persona B today - `orchestrator.ts:4399`).

Two constraints from the existing design (`docs/design/preference-gates.md`)
carry forward unchanged and are non-negotiable:

- **The model reviewer is the PRIMARY mechanism** for advise. The owner chose a
  model that generalizes over a brittle grep. Do not re-pitch deterministic-first.
- **The optionality law.** A plain `vibe run "<prompt>"` requires zero policies,
  zero gates. Policies are additive, opt-in. `[]` default = byte-identical run.

## What exists vs proposed vs foundation

| Component | Status | Evidence |
| --- | --- | --- |
| Advise injection (`renderPreferenceGateBlock` -> `composeReviewerStepNotes`, reviewer-only, never the arbiter, never a 2nd `reviewDecision`) | **EXISTS** | `src/orchestrator/preference-gates.ts:73-90`; `src/orchestrator/review-lenses.ts:135-152`; call site `src/core/orchestrator.ts:1136-1151` |
| Block merge-cap (`evaluateBlockPreferences` -> `preferencesClean` -> `computeMergeReady`), deterministic, independent of `reviewDecision`, fork-point scan | **EXISTS** | `src/orchestrator/preference-block-gate.ts:36-80`; `src/core/merge-readiness.ts:44,73`; site `src/core/orchestrator.ts:4396-4441` |
| `confirmedAt` trust gate; consult proposes (pending), owner confirms; model can't author `severity`/`pattern` | **EXISTS** | `src/project/preferences-service.ts:54-102,142-184`; `src/consult/consult.ts:70-77,263-279` |
| Preference CRUD service (add/list/remove/confirm/reject) + CLI + HTTP + UI | **EXISTS** | `src/project/preferences-service.ts`; `src/cli/commands/preferences.ts`; `src/server/routes/config.ts:79-128`; `src/ui/app/routes/SupervisorsPage.tsx:169-331` |
| Blocker surfacing (`supervisor.preference_block` event -> `deriveRunBlockers` `kind:"preference"`) | **EXISTS** | `src/safety/run-assurance.ts:43,190-202` |
| `POLICY_LIMITS`, `extractAddedLines`, glob/regex compile validation (shared primitives, already reused by the block gate) | **EXISTS** | `src/policies/policy-types.ts:9-20`; `src/policies/policy-engine.ts` |
| Apply-time content engine (`evaluatePatchAgainstPolicies`, `rules[]`, suggestion-apply / bundle-apply patch refusal) | **EXISTS** | `src/policies/policy-engine.ts:31-95`; gate `src/reviews/review-suggestion-service.ts:393-402` |
| **HARD security gates - action-broker deny (`actions[]`) + fail-closed-on-load-error; secret-leak refusal** | **EXISTS, MUST STAY UNTOUCHED** | `src/safety/action-broker.ts:66-88,156-165`; `src/policies/action-policy-engine.ts`; secret gate `src/core/diff-service.ts` (`isSecretLikePath`, `checkPatchSafety`) |
| Project-level `ProjectPolicy` record `{id, statement, tier, correction?, matcher?, scope?, source, confirmedAt}` at config scope | **PROPOSED** | rename of `preferenceSchema`; `severity`->`tier`, `pattern`->`matcher`, moved off persona |
| Re-scope every reader from `persona.config.preferences` to project-level `config.policies` | **PROPOSED** | `orchestrator.ts:1137,4399`; `personas.ts:167`; service; consult target `consult.ts:270` |
| UI **Project Policies page** that CREATES both tiers incl. a block matcher (closes the M2 UI parity gap) | **PROPOSED** | the persona `PreferencesEditor` only writes advise; no UI ever set a block matcher |
| Persona catalog reader of `preferences` (typed public-API field on `PersonaCatalogEntry`, feeds `GET /api/supervisors` + `vibe supervisor list` + UI) | **EXISTS - must be removed in migration** | `src/orchestrator/personas.ts:140,167`; built-ins `:50,96`; consumer `src/ui/app/routes/SupervisorsPage.tsx:157`; UI type `src/ui/lib/types.ts` |

Nothing here is a FOUNDATION: every enforcer already exists and is reused. The
work is **re-scoping + renaming + one new UI page + wiring**, not new machinery.
That is the whole point of "extend, don't fork."

## The risks that decide success (and the hard-stays-hard invariant)

This is a security-relevant engine. The consolidation must not, anywhere, let a
soft rule wear a hard rule's authority or a hard gate inherit the soft tier's
fail-open behavior.

- **HARD gates must NOT be folded into the soft `block` tier.** The action-broker
  `deny` (`action-broker.ts:66-88`) is fail-CLOSED: if the policy loader throws,
  `file.patch`/`file.write`/`run.complete`/`git.merge` are *denied*. The
  secret-leak refusal is fail-CLOSED. The soft `block` tier is deliberately
  fail-OPEN (a malformed owner regex goes inert + surfaced, never bricks every
  merge - `preference-block-gate.ts:46-59`). **Collapsing the hard gates into the
  soft tier would silently flip fail-closed to fail-open. Forbidden.** Therefore
  the `.vibestrate/policies/*.yml` engine (apply-time `rules[]` + action
  `actions[]`) and the secret gate stay exactly where they are, with their
  current fail modes, and are surfaced on the one page as a **read-only "Security
  gates (hard, fail-closed)" section, visually + structurally distinct** from the
  owner-authored advise/block rules. "One surface" = one page / one tier
  vocabulary, NOT one fail mode for all rules.

- **Tier mis-routing.** A rule with no tier, or a `block` with no/invalid
  matcher, must FAIL FAST at write time (the schema `.superRefine` already does
  this for `severity:block` requiring `pattern` - carry it forward for
  `tier:block` requiring `matcher`). An advise rule must NEVER reach a
  deterministic enforcer; a block rule must NEVER be the thing that emits
  `reviewDecision`. The router is a pure function of `tier`, total over the enum.

- **Model authoring a block.** A model can never author a hard merge-cap. The
  consult proposal schema carries only `statement`/`correction` (`consult.ts:70-77`);
  `proposePreference` hard-omits `severity`/`pattern`. Carry forward: the proposal
  path writes `tier:advise`, `confirmedAt:null` ALWAYS; `tier:block` + `matcher`
  are settable only via `addOwnerPolicy` / owner confirm. Re-verify post-rename.

- **Merge-cap integrity.** `block` stays deterministic, independent of
  `reviewDecision` (its own `preferencesClean`/`policiesClean` input into
  `computeMergeReady`, never the shared decision - no clobber), and keeps the
  fork-point scan (`orchestrator.ts:4403-4408`) so committed-mid-run changes are
  caught. The diff-read-error path stays fail-CLOSED (`:4425-4439`).

- **Scope explosion.** Tempting to build a unified storage backend that swallows
  the file engine + action policies into config. That REBUILDS fail-closed
  enforcers (against "reuse, don't rebuild") and is the most likely place to
  weaken a hard gate. Out of scope. The file engine is reused as-is.

- **Termination.** Unchanged: advise rides the bounded `maxReviewLoops` ->
  `blocked` loop; block caps merge-ready -> `blocked` with a surfaced reason.
  Neither spins.

## The design

### Data: the unified `ProjectPolicy`

```
ProjectPolicy {
  id           // stable; the only thing the run API/CLI references
  statement    // "do not use em-dash characters"
  tier         // "advise" (default, model reviewer)  |  "block" (deterministic)
  correction   // the fix the reviewer names (advise); null = state rule only
  matcher      // regex (block ONLY; required + compilable); null for advise
  scope        // { lenses: [] }  (advise: which reviewer turns; ignored for block)
  source       // "owner" | "supervisor-proposed"
  confirmedAt  // null until owner confirms; null => inert (never injected/enforced)
}
```

This is `preferenceSchema` with `severity`->`tier`, `pattern`->`matcher`, moved
to project scope. `.strict()` + the `.superRefine` (block requires a compilable
matcher) carry over verbatim. `POLICY_LIMITS` bounds `matcher` exactly as today.

**Storage (settled by review):** a **top-level `projectPolicies[]`** config key.
NOT nested under the existing `policies:` block - that block holds fail-CLOSED
boolean security toggles (`forbidSecretsAccess`, `forbidAutoMerge`,
`strictApplyOnly`), and putting fail-OPEN advisory rules beside them would blur
exactly the soft/hard legibility this design protects. `policies:` keeps its
meaning (hard toggles); `projectPolicies[]` is the owner-authored tiered rules.
`scope.lenses` must be empty for a `tier:block` rule (the block evaluator never
reads scope - a lens scope there is a silent no-op, so the `.superRefine` rejects
it at write time).

### Enforcement routing (pure function of `tier`)

| tier | matcher | routed to | fail mode |
| --- | --- | --- | --- |
| `advise` | none | reviewer injection (`renderPolicyAdviseBlock` -> `composeReviewerStepNotes`), model checks, rides review->fix loop | n/a (advisory) |
| `block` | required | merge-cap ONLY (`evaluateBlockPolicies` -> `policiesClean` -> `computeMergeReady`, fork-point scan) | fail-OPEN on malformed matcher (inert + surfaced); fail-CLOSED on diff-read error |
| (hard security gates) | - | action-broker deny + secret-leak refusal + file `rules[]`/`actions[]` - **UNCHANGED** | fail-CLOSED (untouched) |

The advise/block enforcers are the SHIPPED ones, re-pointed at the project array
instead of the persona array. **No apply-time bridge** (review dropped it): the
first draft proposed adapting block policies into `PolicyRule` and reusing
`evaluatePatchAgainstPolicies`, but that engine only runs on the
`suggestion-apply` / `bundle-apply` surfaces (a human applying a reviewer
*suggestion* patch - `policy-types.ts:22-26`, call sites
`review-suggestion-service.ts:393`), NOT the agent's own run-writes. The merge-cap
already scans the **entire fork-point diff** at completion - a strict superset -
and the two engines have *different* secret-skip behavior, so the bridge would add
a second enforcement point with its own fail mode on the same rule (the precise
"weaken a hard gate" risk). req #2's "merge-cap + existing apply-time/action
paths" is satisfied at the **family** level: the deterministic family comprises
the merge-cap (owner block policies) AND the pre-existing apply-time content
engine + action denies (the hard file layer, unchanged). One block tier, one
deterministic family, no duplicated enforcer.

### Supervisor = enforcer

`orchestrator.ts:1136` renders advise from `config.projectPolicies` (project).
An unscoped rule injects under any persona; a lens-scoped rule additionally
intersects the run's active lenses (the opt-in targeting refinement, see scoping
section above). `orchestrator.ts:4399` reads block policies from the project
array, not `resolvePersona(...).preferences`. Persona config no longer has
`preferences`; the `PersonaCatalogEntry.preferences` field
(`personas.ts:140,167`), its built-in defaults (`:50,96`), the
`GET /api/supervisors` shape, the UI type, and the `SupervisorsPage` consumer are
all removed.

### Capture parity (UI <-> CLI, no gaps)

- CLI `vibe policies` gains `add | list | remove | confirm | reject` (project-level,
  no `personaId` arg). The existing `vibe policies list|check|doctor|config`
  (file-engine read + safety toggles) stay; `list` merges both classes.
- HTTP: project-level `GET/POST/DELETE /api/policies/rules` +
  `.../rules/:id/confirm|reject` (re-scoped from `/api/personas/:id/preferences`).
- Consult proposes a `tier:advise` policy at PROJECT scope (pending), owner
  confirms. `persistConsultPreferenceProposal` re-points from the default persona
  to `config.projectPolicies`.
- UI: a **Project Policies page** (NOT the Supervisors cards) creating BOTH tiers,
  including a block matcher field - closing the M2 UI parity gap. The Supervisors
  page loses the `PreferencesEditor`.

**The highest-risk line (review #6): keep the owner-add body and the
consult/propose path on SEPARATE schemas.** The owner-add HTTP body and CLI gain
`tier` + `matcher` (so the UI can author a block). The consult/propose path must
NOT share that schema: `proposePreference` (and `persistConsultPreferenceProposal`)
hard-set `tier:"advise"`, `matcher:null`, `confirmedAt:null` server-side
regardless of any input, so a model can never author a block or a pre-confirmed
rule. This is the load-bearing security invariant; it gets its own test (a
proposal carrying a forged `tier:block`/`matcher`/`confirmedAt` is stripped to a
pending advise rule).

### Migration (pre-publish, no back-compat, fail-fast)

1. `preferenceSchema` -> `projectPolicySchema` (rename fields), moved out of
   `personaConfigSchema` into top-level `projectPolicies[]`. Persona schema is
   `.strict()`, so a leftover `personas.<id>.preferences` in a live `project.yml`
   now FAILS config load. The review flagged that the orchestrator run path has no
   `loadConfig` guard, so a generic strict-schema rejection is a poor failure. So:
   config load detects a legacy `personas.*.preferences` key *before* strict
   validation and throws a targeted error - "run `vibe policies migrate`" - and
   `vibe policies migrate` is the mandatory one-shot that lifts persona preferences
   into `projectPolicies` (keeping `confirmedAt`, since they were confirmed) and
   deletes the persona field. A noisy migrate beats a silent drop or an opaque
   crash mid-run.
2. The file-engine `rules[]`/`actions[]` are NOT migrated - they remain the hard
   layer, surfaced read-only on the new page. "Reconcile as block-tier" = present
   the deterministic file rules under the same tier vocabulary, NOT relocate
   fail-closed enforcers into the fail-open config path.
3. Rename internals for one mental model: `preference-gates.ts` ->
   `policy-advise.ts`, `preference-block-gate.ts` -> `policy-block.ts`,
   `preferences-service.ts` -> `project-policy-service.ts`,
   `merge-readiness` `preferencesClean` -> `policiesClean`, the
   `supervisor.preference_*` events -> `supervisor.policy_*`. Mechanical; tests
   move with them.

## Build sequencing (dependency-ordered, TDD per slice)

- **M0 (scout): schema + router, no wiring.** `projectPolicySchema` + a pure
  `routePolicy(tier)` (total over the enum, block-needs-matcher fails fast).
  Unit-tested. Proves the data model + tier discipline before touching enforcers.
- **M1: re-scope advise.** Re-point `orchestrator.ts:1136` + renderer at the
  project array; drop persona `preferences`. E2E: a project advise policy reaches
  the reviewer under ANY persona (the load-bearing test).
- **M2: re-scope block + apply-time bridge.** Re-point the merge-cap at the
  project array; add the apply-time adapter. E2E: a project block policy caps a
  run under a persona that does not "own" it; verify hard gates untouched.
- **M3: capture parity.** Project-level service + CLI + HTTP + consult re-point +
  the Project Policies UI page. `vibe policies migrate`.
- **M4: docs + version.** CHANGELOG + bump, `supervisor.md`, a policies concept
  doc, primitives/CLAUDE links, `pnpm docs:generate`.

## Decisions settled by review

- Config key: **top-level `projectPolicies[]`** (sharp soft/hard separation; `policies:` stays hard toggles).
- Block enforcement: **merge-cap only**, no apply-time bridge.
- Migration: **mandatory `vibe policies migrate`** + a targeted config-load error.
- Advise scoping: unscoped = every persona; lens-scope = opt-in targeting refinement.

## Known carry-forward (not introduced here, flagged)

- `getCurrentBranch(this.projectRoot)` (`orchestrator.ts:4404`) resolves the block
  scan's base branch from the main checkout's *current* branch, not the run's
  recorded fork base - so a concurrent checkout could shift the merge-base and the
  scan could miss added lines (fail-open by omission). Pre-exists this work; the
  proper fix (persist the run's base SHA at creation) is its own change. Fixed here
  only if trivial; otherwise tracked as a follow-up, not silently re-blessed.

## Out of scope

No new policy DSL beyond `tier` + `matcher`. No rules-engine framework. No
physical merge of the file engine / action policies into config. No persona-scoped
rule override (lenses already cover persona-specific scrutiny). The hard security
gates' enforcement is not modified.

## Review trail

Adversarial pass (Opus 4.8, fresh context, 2026-06-28) BEFORE implementation.
Verified the hard-stays-hard invariant sound (action-broker fail-closed untouched;
secret-leak independent + fail-closed; block fail-open-on-bad-regex /
fail-closed-on-diff-error; block never clobbers `reviewDecision`; shared
`POLICY_LIMITS`/`extractAddedLines`; model-authors-a-block hole currently closed).
Findings + disposition:

1. **Fatal: advise-scoping incoherence.** "ANY persona injects the rule" is false
   for a lens-scoped rule (advise is gated by the active persona's lenses,
   `preference-gates.ts:59`). ACCEPTED as a doc-coherence fix: unscoped = every
   persona (the real fix vs persona-owned today); lens-scope = opt-in targeting,
   not ownership. Semantics made explicit.
2. **Blocker: `PersonaCatalogEntry.preferences` unlisted reader** (`personas.ts:140,167`,
   built-ins `:50,96`, `GET /api/supervisors`, UI). ACCEPTED; migration blast
   radius expanded.
3. **Blocker: apply-time bridge is scope creep + a second fail-mode and does
   nothing useful** (the apply engine only runs on suggestion-apply; merge-cap is a
   superset). ACCEPTED; bridge dropped, block is merge-cap-only.
4. **Block `scope.lenses` silent no-op footgun.** ACCEPTED; `.superRefine` rejects
   non-empty `scope.lenses` on `tier:block`.
5. **Migration failure surface worse than admitted** (orchestrator run path
   unguarded). ACCEPTED; mandatory `vibe policies migrate` + targeted config-load
   error on a legacy key.
6. **Keep the matcher-accepting body separate from the consult path.** ACCEPTED as
   the load-bearing invariant; `proposePreference` hard-sets advise/null; own test.
7. **`policies.rules[]` namespace collision.** ACCEPTED; top-level `projectPolicies[]`.
8. **`getCurrentBranch(projectRoot)` fork-point latent bug.** ACCEPTED-DEFER;
   pre-existing, tracked as carry-forward, fixed only if trivial.

Verdict: buildable and safe after items 1, 2, 3, 6 (the four the reviewer named as
gating). Proceed to TDD implementation.
