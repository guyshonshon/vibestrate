# Fast Track, Session Policy, and Sub-agent Boundary

Status: P1-P3 shipped, P4 declined (2026-07-05); v0.67.0 (P1) + v0.68.0 (P2-P3)

> **Execution log.**
> - **M0 settled (code-read, not run):** the review descent
>   (`review-descent.ts:24-53`) skips review only when every changed file is
>   strict-prose (`.md/.markdown/.txt/.rst`) and unprotected. `docs/content/` is
>   not a protected glob, so pure-`.md` edits skip review and reach merge_ready;
>   `docs/generated/*.json` and `_nav.json` are non-prose and force a real review.
>   So the docs:generate wrinkle resolves to option (b) *for free and correctly*:
>   copy edits stay instant (generate yields no JSON diff), structural edits
>   regenerate metadata and rightly trip a review. No classifier special-casing.
>   The `--disallowedTools` run-format check (M0.1) is still pending - deferred
>   with P3.
> - **P1 shipped:** built-in `docs` flow (`builtin-flows.ts`), tests
>   (`tests/express-descent.test.ts`), workflow doc + regenerated metadata.
>   Constraint discovered: `skipWhen:"inert_diff"` is schema-incompatible with a
>   checklist segment (existing guard test), so P4 serial multi-doc cannot keep
>   the inert-diff review skip - a per-page-commit run reviews every page.

Original status: revised-after-review (2026-07-05)
Owner decision doc. Canonical for three coupled calls: a fast non-code track, the
session-reuse rule, and how much of the provider's built-in agent powers
Vibestrate amplifies vs. owns.

Read the primitives contract and CLAUDE.md first; this doc only adds the three
decisions below and how to build them.

> This doc was rewritten after an adversarial code review found that its first
> draft reinvented a weaker, non-terminating version of a flow that already
> exists (`express`). The review trail is at the bottom; the corrections are
> baked into the decisions.

---

## Context - the real goal

Three asks arrived bundled. They have different blast radii and must not be
designed as one knob:

1. **Fast track.** A lightweight exercise for **documentation content** -
   "revisit this doc page", "update several docs at once" - targeting the
   `docs/content/` markdown tree that renders to vibestrate.com/docs, not code.
   It must not pay for the full plan -> architect -> implement -> validate ->
   review -> verify loop.
2. **Session / sequencing policy.** When a flow runs several `claude` turns,
   when should they share one provider session vs. run fresh, and what should
   that decision key on?
3. **Sub-agent boundary.** Do we enhance (let each seat's `claude` freely use its
   own subagents, Task tool, skills) or limit (gate them) so orchestration stays
   legible to the supervisor?

The underlying goal is not "add a session engine" or "add a docs engine." The
grounded finding is stronger than the first draft assumed: **the fast track
already exists as the `express` flow**, session reuse already keys on the right
thing, and the sub-agent question is one optional flag. The real work is
*adopting and surfacing* what's built, writing the rules down so we stop
re-litigating them, and one small additive knob.

---

## What exists vs proposed vs foundation

| Component | State | Evidence |
|---|---|---|
| Flow = typed DAG of steps, seats, adaptive loop, checklist segment | EXISTS | `src/flows/schemas/flow-schema.ts`; default flow `builtin-flows.ts:21` |
| Each step = a fresh headless `claude` process | EXISTS | `src/providers/claude-code-provider.ts:18` |
| **`express` flow = the fast track: 1 implementer turn + diff-scoped validation + review that self-skips on prose** | EXISTS | `builtin-flows.ts:1040-1092`; `taskKinds: ["docs","chore","tweak","bugfix"]`, `complexity:"low"`, review `skipWhen:"inert_diff"` |
| Inert-diff review descent -> skip evidence satisfies the merge gate deterministically | EXISTS | `computeMergeReady`/`isReviewSatisfied` `merge-readiness.ts:51-75` |
| A non-prose / protected file in the diff forces a real review turn | EXISTS | `skipWhen:"inert_diff"` semantics; review-descent |
| Session reuse across steps, **keyed on Seat**, opt-in via `--resume` | EXISTS | ledger keyed by seat `flow-participant-ledger.ts:111-120`; flag applied `claude-code-provider.ts:50-54` |
| `maxReuseTurns` cap -> fresh session re-grounded from artifacts | EXISTS | `flow-participant-ledger.ts:151-160` |
| Profile knobs (model, power, maxTokens, timeoutMs) -> CLI flags | EXISTS | `profiles/profile-schema.ts`; applied `claude-code-provider.ts:37-42` |
| `fast` crew preset = **lowest real effort (`powerLevels[0]`, e.g. `"low"`)**, cheapest model | EXISTS | `crews/crew-presets.ts:90-98,206,216` (NOT literal `power:"fast"` - see review finding 2) |
| Read-only run skips `skipWhenReadOnly` steps; `--permission-mode plan` CLI-enforced hardening | EXISTS | step flag `flow-schema.ts`; `claude-code-settings.ts:82-84`, `claude-code-provider.ts:22-34` |
| `--disallowedTools` is a real `claude` flag (variadic `<tools...>`) | EXISTS (CLI) | `claude --help`; existing `--allowed-tools` comma-join `claude-code-settings.ts:118` |
| **Fast-track launch surface + `docs`-tuned instructions** (adopt/skin `express`) | PROPOSED | catalog label + CLI/Board picker + optional instructions |
| **`disallowedTools` profile knob** -> the flag | PROPOSED (additive) | new `profile-schema.ts` field + one `args.push`, mirrors `--allowed-tools` |
| **Session-keying rule written into code comment + tunable `sessionReuse`/`maxReuseTurns` from profile** | PROPOSED | comment + lift existing knobs into profile config |
| **Serial multi-doc via checklist-segment band** (one worktree, one commit per item, needs a checklist-bearing card) | PROPOSED (small wiring, NOT free) | `flow-schema.ts:302-314`, `builtin-flows.ts:263-271` |
| **Concurrent multi-doc (several docs at once, isolated)** | FOUNDATION - out of scope | no across-checklist-item concurrency primitive exists (fan-out is within a band, not across items) |

**Honest headline:** the single-doc fast track needs **no** new runtime - `express`
is it. There is exactly one real foundation lurking, and it is *concurrent*
multi-doc: the checklist segment iterates serially in one worktree, so
"handle several documents at once, isolated" is a capability the system lacks.
We scope that OUT for now; serial multi-doc is cheap, concurrent is a separate
investment.

---

## The risks that decide success

- **Scope explosion.** "Fast track" invited a parallel lightweight engine, a
  docs data-model, a diff-less artifact store, and a new `docs-quick` flow. The
  review killed all of it: the fast track is `express`, already built. If we
  catch ourselves authoring a second single-turn flow, stop and ask why
  `express` isn't enough.
- **Termination.** This is where the first draft died. A flow that *writes*
  cannot reach `merge_ready` by simply omitting the review gate - the merge
  predicate requires an APPROVED review OR express-style inert-diff skip evidence
  (`merge-readiness.ts:51-53`). "Strip the gates" is wrong; the review gate is
  the load-bearing termination condition, not removable ceremony. `express`
  terminates correctly *because* of its inert-diff descent, not despite a missing
  gate. Any fast track MUST build on that descent.
- **The wrong session rule.** The one active trap in Decision 2 - a profile-keyed
  rule silently destroys review independence. Written down below so it can't
  regress.
- **Silent-no-op security control.** The `disallowedTools` knob is worthless if
  the comma-join format silently fails to deny (review finding 4). M0 must prove
  the deny actually bites, by running it.

---

## Decision 1 - Fast / non-code track: adopt and surface `express`, do not build `docs-quick`

`express` already is the fast track. It runs one implementer turn, validates only
the actual change, and its review turn carries `skipWhen: "inert_diff"`: for a
pure-prose, unprotected diff the deterministic descent skips the review turn and
emits skip evidence, which satisfies the merge gate with no model review at all
(`merge-readiness.ts:51-53`). The instant the diff touches a non-prose or
protected file, a real review turn runs. That is exactly the safety posture a
"fast doc track" wants: cheap when the change is inert, real review when it
isn't. It already declares `taskKinds: ["docs", ...]` and `complexity: "low"`.

**So the work is adoption + surface, not a new flow:**

- **Launch surface / discoverability.** Make `express` reachable as the "Fast
  track" from CLI (`vibe run --flow express`) and the Board "New task" flow
  picker, with a clear description. Dashboard-by-default: it shows in the flow
  list. (UI/CLI parity.)
- **Doc-tuned instructions (optional, thin).** If prose work wants different seat
  guidance than code, add `instructions:` to `express`'s seats (or a thin
  `express`-derived `docs` flow that keeps the *identical* inert-diff review
  descent and only changes the instructions). It must NOT drop the review step -
  it inherits the descent verbatim.
- **Default profile = the `fast` preset**, which emits the provider's lowest real
  effort (`powerLevels[0]`, e.g. `"low"`) and the cheapest model. Do NOT set
  `power: "fast"` on a profile - `"fast"` is a preset *tier id*, not a valid
  `--effort` value (`<low|medium|high|xhigh|max>`), and the CLI would reject the
  turn.

**The target is `docs/content/`.** These are frontmatter markdown pages
(concepts, CLI, workflows, getting-started) plus `_nav.json`, built into
`docs/generated/*.json` by `pnpm docs:generate`. The fast-track flow is scoped
and instructed to that tree. Its `validation` step is **docs-appropriate**, not
code gates: run `pnpm docs:generate` (so the generated metadata stays in sync)
and a frontmatter presence check - not typecheck/test/build.

**The docs:generate wrinkle (load-bearing).** CLAUDE.md §10 requires a
user-facing docs edit to regenerate `docs/generated/*.json` in the *same* commit.
That JSON output is **not prose**, so the inert-diff evaluator may classify the
diff as non-inert and force a real review turn on every user-facing docs change -
partially defeating "fast." Three ways this can go, resolved in M0: (a) markdown
edits alone are inert and skip review, and we regenerate metadata as a separate
mechanical post-step outside the reviewed diff; (b) accept a real (but cheap)
review turn whenever generated JSON changes - honest, slightly slower; (c) teach
the inert-diff classifier that `docs/generated/*` is a mechanical artifact. Lean
(b) for v1: correctness over shaving one turn. This is the single thing the
"non-code = automatically fast" assumption gets wrong.

**Multiple documents - the simple form first.** A single `express` implementer
turn can edit N markdown pages in **one** diff; a pure-prose multi-file diff is
still one inert diff -> one review-skip -> `merge_ready`. That covers "update
several docs at once" with zero new wiring. The checklist-segment is only needed
for **per-doc isolation / one commit per page**: it repeats a band once per
checklist item, serially, in one worktree (`flow-schema.ts:302-314`,
`builtin-flows.ts:263-271`) - real, small wiring, and only if per-page commits
are wanted. **Concurrent** multi-doc (several pages in isolation at once) has no
primitive and is scoped OUT (FOUNDATION row).

Out of scope: a dedicated docs artifact type, a non-git document store, an
in-repo preview render surface (vibestrate.com rendering is the separate
marketing concern), concurrent multi-doc. Separate phases if wanted.

---

## Decision 2 - Session policy: key on Seat, never on profile

This is the load-bearing decision and the reason the doc exists. Confirmed
correct against the code by the adversarial review. Written so no future session
re-proposes the profile-keyed rule.

**Rule: session continuity keys on Seat identity. Profile equality is a
coincidence, never a continuity signal.**

> The rule floated in discussion - "same profile / effort / model -> same
> session" - is the one thing to stop. Counter-example that breaks it: a writer
> seat and a reviewer seat can both be opus / high - identical profile - but you
> emphatically do not want the reviewer inheriting the writer's session.
> Independent context is the entire value of the review. The code keys reuse on
> Seat identity, which is correct; profile equality is a coincidence, not a
> continuity signal.

Why this matters mechanically: two seats sharing a model+effort is common (a
staff-engineer writer and a staff-engineer reviewer). If continuity keyed on
profile, the reviewer would resume the writer's session and inherit its
rationalizations - the review would grade its own homework. Keying on Seat keeps
the reviewer a cold, independent process that only sees the artifacts, which is
the point of having a reviewer at all. Verified: the ledger builds one
participant per Seat (`flow-participant-ledger.ts:111-120`) and resolves
resume/open purely by seat identity and that seat's own turn history
(`:138-199`); profile is never consulted.

**"Should a whole flow run in one session?" No.** A single shared session
collapses three things the supervisor needs:

- between-step grounding injection (the orchestrator re-seeds context per turn),
- independent review / verify (fresh eyes),
- per-seat cost and observability (one session = one blended transcript).

Keep process-per-step with opt-in per-seat resume. That is what exists; this doc
ratifies it as the intended design, not an accident.

**When each mode applies** (all already supported by the ledger):

| Situation | Session | Why |
|---|---|---|
| Same seat, adaptive fix-loop iterations | resume | Continuity helps; the seat recalls what it just tried |
| Different seat (review / verify / any cross-role) | fresh | Independence *is* the deliverable |
| Same seat past `maxReuseTurns` | fresh + rehydrate from artifacts | Context-window guard; automatic today |

**Change to make:** none to the mechanism. (a) A load-bearing comment at the
seat-keying site in `flow-participant-ledger.ts:111-120`: "keyed on Seat, not
profile, so an equal-profile reviewer stays an independent process - do not
change to a profile key." (b) Expose `sessionReuse` and `maxReuseTurns` as
profile-visible knobs so the policy is tunable per role without editing the
ledger. (c) Optionally surface the per-turn `contextMode`
(opened / reused / rehydrated / stateless) on the run Tree so the reuse decision
is visible.

---

## Decision 3 - Sub-agent boundary: read-amplify, write/review-own

Today Vibestrate enhances without limit: no `--disallowedTools`, all MCP and
skills wired in, the provider's own subagents observed but not gated. The tension
is real - if a seat's `claude` spins up its own Task subagents and self-review
loops, that orchestration runs *outside* the flow DAG, the participant ledger,
and per-seat profiles. You get double-orchestration you can neither see nor cost,
which undercuts the Tree view and the supervisor value proposition. Blocking
subagents wholesale is also wrong - it makes every seat dumber (no parallel
search / explore).

**The line is READ-amplify vs. WRITE/REVIEW-own:**

- **Amplify (leave free): intra-seat read / explore subagents.** On a read-only
  or `--permission-mode plan` seat they cannot write - and the guard for that is
  the **CLI-enforced `--permission-mode plan` flag**
  (`claude-code-settings.ts:82-84`), NOT the action-broker. (Correction from
  review finding 3: the action-broker gates effects Vibestrate itself routes
  through `gateAction` - `provider.spawn`, top-level `file.patch`, etc.
  `action-broker.ts:20-32,218`. A subagent's own file writes inside a `claude`
  process never pass through it. Do not lean on the broker as a subagent-write
  backstop; the permission mode is the whole guard.) Default: unchanged, free.
- **Own (stays Vibestrate's job): cross-role sequencing, write-gating, and
  independent review.** A seat must not self-review via its own subagent - review
  is a separate Seat with its own profile and reviewLenses, or the independence
  from Decision 2 is lost inside a single process.
- **Knob, default-off: `disallowedTools`.** A profile-level list (e.g.
  `["Task"]`) threaded to the `--disallowedTools` flag. This **blocks the default
  subagent dispatch path** (the `Task` tool); it is best-effort, not a hard
  boundary - `--agents` custom definitions and MCP tools that fan out are not
  named `Task` and would slip a name-matched denylist (review finding 5). Off by
  default - we do not degrade seats globally; strict flows opt in (typically on
  write seats).

Why a knob and not a default gate: whether nested subagents are acceptable is a
product-values call, and defaulting to "blocked" would silently make every seat
weaker for a control most flows do not need. Ship the mechanism, default to
today's behavior, let strict flows opt in - after we see real double-
orchestration in transcripts.

---

## The design

New/changed surfaces, all small:

1. **Adopt `express` as the Fast track** - a catalog label/description pass so it
   reads as "Fast track" and shows in the flow picker; optional `docs`-tuned
   seat `instructions` (or a thin `docs` flow = `express` + instructions, review
   descent inherited verbatim). No new runner, no new gate logic.
2. **Launch surface** - `vibe run --flow express` (already works) surfaced in the
   Board "New task" flow picker with a short description (UI/CLI parity,
   dashboard-by-default).
3. **`disallowedTools` profile field** - add `disallowedTools?: string[]` to
   `profile-schema.ts`; thread `runRole -> ProviderRunInput ->
   claude-code-provider.ts` as `if (input.disallowedTools?.length) args.push(...)`
   following the `--allowed-tools` precedent (`claude-code-settings.ts:117-119`).
   Exact multi-value format (comma vs. repeated flag) is M0's job to PROVE, not
   assume.
4. **Session-keying comment + tunable knobs** - comment at
   `flow-participant-ledger.ts:111-120`; surface `sessionReuse` / `maxReuseTurns`
   from profile config into the `prepareFlowParticipantTurn` call site.
5. **Tree `contextMode` chip** (optional, if cheap) - show opened / reused /
   rehydrated per turn on the run Tree.
6. **Serial multi-doc** (optional, phase-gated) - author a checklist band on the
   `docs`/`express` flow; only if the serial, one-commit-per-item behavior is
   acceptable to the owner.

Data: no new persisted schema beyond the additive optional `disallowedTools`
profile field. The participant ledger already persists session state.

---

## Build sequencing

Dependency-ordered; each phase independently shippable and mergeable.

- **M0 (scout) - two things, both must be RUN not assumed.**
  1. Actually invoke `claude --disallowedTools Task,Bash ...` (or repeated-flag
     form) against the installed CLI and confirm it *denies* those tools rather
     than silently no-opping on a comma-joined single token. This is the control
     that fails silently if wrong (review finding 4).
  2. Confirm how `express` handles a `docs/content/*.md` edit: does the
     inert-diff evaluator classify markdown as inert and skip review, and does
     bundling `pnpm docs:generate`'s JSON output flip the diff to non-inert
     (forcing a review turn)? Read the inert-diff classifier's file rules. This
     decides whether the docs fast track is actually fast for *user-facing*
     changes (which §10 forces to regenerate) or only for non-generated pages.
     Also confirm the `accept-edits` boundary behaves for prose. One afternoon;
     unblocks P1 and P3.
- **P1 - Fast track (thin `docs` flow off `express`).** A `docs` flow that keeps
  express's inert-diff review descent verbatim, swaps `validation` for
  `docs:generate` + frontmatter check, scopes instructions to `docs/content/`;
  plus catalog surface + Board picker + a docs page. Single-turn multi-file
  editing rides free; per-page-commit multi-doc is a later checklist add. Depends
  on M0(2).
- **P2 - Session policy ratification.** Comment at the keying site + lift
  `sessionReuse` / `maxReuseTurns` into profile config + optional Tree chip. No
  behavior change beyond tunability. Independent of P1.
- **P3 - Sub-agent knob.** `disallowedTools` profile field threaded to the flag,
  format proven by M0(1). Default-off = zero behavior change until a flow opts
  in. Ship a strict-flow example that sets it on write seats. Depends on M0(1).
- **P4 - Serial multi-doc: DECLINED (2026-07-05).** The valuable multi-doc
  capability - edit several pages in one author turn, one inert diff,
  review-skipped, merge_ready - already ships in P1 and is tested
  (`express-descent.test.ts`, the two-file prose case). A checklist-segment
  variant would be *strictly worse* for the fast-track goal: `skipWhen:
  "inert_diff"` is schema-incompatible with a `checklistSegment` (existing guard
  test), so a per-page-commit docs flow reviews EVERY page and loses the skip
  that makes the track fast. So we do not add a checklist docs flow. If per-page
  commits are ever genuinely needed, run the `default`/`express` flow with a
  checklist and accept the real per-page review - that is not a "fast" track and
  shouldn't pretend to be one. Concurrent multi-doc remains a FOUNDATION, out of
  scope.

---

## Open decisions

- **Do we even add a `docs` flow, or just re-label `express`?** Lean: a thin
  `docs` variant is probably warranted here (not just a re-label), because docs
  want a *different validation* step (`docs:generate` + frontmatter check, not
  code gates) and `docs/content/`-scoped instructions. Re-labelling `express`
  alone would run code validation on prose. (Owner call.)
- **docs:generate in the loop (M0 finding drives this).** (a) regenerate outside
  the reviewed diff as a mechanical post-step, (b) accept a cheap review turn
  when generated JSON changes, or (c) classify `docs/generated/*` as inert. Lean
  (b) for v1.
- **`disallowedTools` default for the *default* flow's write seats?** Lean:
  empty default, opt-in per flow, revisit after real double-orchestration shows
  up in transcripts.
- **`accept-edits` vs `auto` for doc edits** - resolve in M0(2).
- **Serial multi-doc worth building now?** Depends on whether one-commit-per-item
  serial is acceptable, or the real need is concurrent (which is a foundation).

---

## Review trail

Adversarial review by an independent Opus 4.8 agent (fresh context, brief:
"break it, verify against code, cite file:line"), 2026-07-05. Every finding was
accepted; the draft's Decision 1 was fatally wrong. Findings, unsoftened:

1. **[CONFIRMED - fatal] A gate-less *write* docs flow lands `blocked`, not
   `merge_ready`.** `computeMergeReady` requires `isReviewSatisfied`, which needs
   an APPROVED review OR (express-only) inert-diff skip evidence
   (`merge-readiness.ts:51-75`). A no-reviewer write flow: `reviewSkipEvidence =
   null` -> blocked. An "advisory" reviewer that says CHANGES_REQUESTED ->
   blocked; there is no advisory-and-ignored review path. The correct primitive,
   `express` with `skipWhen:"inert_diff"` (`builtin-flows.ts:1082`,
   `taskKinds:["docs"]`), already exists and the draft neither used nor mentioned
   it. **Accepted:** Decision 1 rewritten to adopt `express`.
2. **[CONFIRMED] The `fast` preset does not carry `power:"fast"`;** it emits
   `powerLevels[0]` (e.g. `"low"`), and `"fast"` is not a valid `--effort`
   value, so a profile literally set to `power:"fast"` would be CLI-rejected
   (`crew-presets.ts:90-98`, `claude-code-provider.ts:36-41`). **Accepted:** table
   and Decision 1 corrected.
3. **[CONFIRMED] The action-broker does not gate a seat subagent's writes.** It
   gates Vibestrate's own `gateAction` call sites, not file writes happening
   inside a `claude` process (`action-broker.ts:20-32,218`). The real guard for a
   read-only seat is `--permission-mode plan`
   (`claude-code-settings.ts:82-84`). **Accepted:** broker clause dropped from
   Decision 3.
4. **[CONFIRMED] `--disallowedTools` is a real flag but variadic `<tools...>`;**
   the draft's comma-join (mirroring the existing `--allowed-tools` at
   `claude-code-settings.ts:118`) may pass `"Task,Bash"` as one tool name that
   matches nothing - a silent no-op that defeats the control. **Accepted:** M0
   must run it, not just name it.
5. **[PLAUSIBLE] Disallowing `Task` blocks the default subagent path, not all
   nested orchestration** - `--agents` and MCP fan-out are not named `Task`.
   **Accepted:** language downgraded from "the only scheduler" to "blocks the
   default subagent path."
6. **[CONFIRMED] Multi-doc checklist is not free or concurrent.** The segment
   repeats a band serially, one worktree, one commit per item, only against a
   checklist-bearing card (`flow-schema.ts:302-314`, `builtin-flows.ts:263-271`);
   fan-out is within a band, never across items. **Accepted:** serial multi-doc =
   small wiring; concurrent multi-doc = FOUNDATION, scoped out.
7. **[CONFIRMED - safe] Decision 2 (session keys on Seat) is correct** and its
   proposed comment is a zero-risk doc change (`flow-participant-ledger.ts:111-
   120,138-199`). Stands unchanged.

Reviewer's single riskiest assumption in the original draft: *"strip the gates
and the fast flow still terminates cleanly as `merge_ready`"* - it does not;
review is the load-bearing termination condition, and `express`/inert-diff is the
only sanctioned way to skip it on prose. That correction is now the spine of
Decision 1.

### P2/P3 pre-merge review (2026-07-05, independent Opus 4.8, CLI-probed)

The `disallowedTools` implementation (P3) got a Tier-2 review before merge. It
proved, against the real `claude` CLI, that comma-joining the tool list does NOT
stop the variadic `--disallowedTools` from consuming the trailing positional
prompt on an `input:"arg"` provider - and that `--allowed-tools` and
`--mcp-config` share the same latent prompt-swallow. It ships safe only because
the default provider streams the prompt over stdin. **Accepted the root-cause
fix:** push a `--` end-of-options separator before the positional prompt in the
arg branch (`claude-code-provider.ts`), which closes all three variadic-swallow
paths at once. Everything else - no shell-injection (execa, no `shell:true`),
honest legibility-not-write-guard scoping, zero-behavior-change when off, and the
additive `.strict()` schema - was confirmed safe.
