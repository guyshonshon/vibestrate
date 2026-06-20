# Shape: deep multi-round questioning + per-question assist + screen-aware orb

Status: **approved (2026-06-20)**, for execution in this session with workflows
+ multi-agents. This finishes work the Shape+Execution program (P1-P5) explicitly
DEFERRED: the **completeness loop** (`docs/superpowers/specs/2026-06-20-shape-program-design.md`
was single-pass v1; `docs/TODO.md:455` lists "completeness loop (single-pass v1)"
as deferred) and the **"super-simplified for non-developers"** idea braindumped
at `docs/TODO.md:601`.

Self-contained. Read it, then execute phase by phase.

---

## 0. Problem

Today the Shape intake asks questions in **one pass**. The intake agent
(`shapeIntakeFlow`, `src/flows/catalog/builtin-flows.ts`) emits 1-20 questions
in a single shot and judges its own coverage. Three gaps:

1. **Shallow.** A single pass under-covers a real spec. The user wants the
   questioning to "go super far" - keep surfacing gaps until coverage is
   genuinely complete - without being trapped in an endless interrogation.
2. **Opaque.** A question like "which payment provider?" can be unclear to a
   non-developer: what does it mean, what does it change downstream? There is no
   way to ask the tool to explain a single question in plain language.
3. **Unassisted.** A user unsure how to answer has no grounded starting point.
   Prior answers already imply a lot ("B2C app for teens" implies a lot about
   auth) but the tool does not leverage them to propose a draft.

## 1. The four surfaces

| Surface | What it does | Substrate |
| --- | --- | --- |
| **Deep questioning loop** | Bounded multi-round intake: ask -> answer -> gap-check -> ask follow-ups -> ... until "no material gaps" or the user proceeds. Questions grouped by category with per-category progress. | Existing shape run-chain (terminating runs + `resumeFrom`); questions contract |
| **Simplify** | Per-question plain-language restatement + "what this affects" (+ an optional non-developer analogy). On-demand, inline. | `runAssist` primitive |
| **Suggest** | Per-question draft-only editable answer, grounded in prior answers, with a one-line "why". Plus "Suggest all remaining". | `runAssist` primitive |
| **Screen-aware orb** | The consult orb is fed a typed snapshot of the shape screen (questions, answers, blanks, focused field) so it can advise in full context when asked. | `consult` + a new typed ViewContext |

All four are **read-only**, broker-gated, and produce no diffs. They reuse the
existing assist/consult engine - no second AI-call path is created.

---

## 2. Deep questioning loop (bounded multi-round + categories)

### Model
- **Round 1**: intake emits questions, each tagged with a `category` and
  `round: 1`.
- The user answers a round (UI groups questions by category).
- **On submit -> a gap-check run** reads the brief + all answers so far and
  either (a) emits follow-up questions for material remaining gaps, or (b) sets
  an explicit `coverageComplete: true`. The gap-check NEVER emits or controls the
  round number - round is deterministic server state (see Data-model).
- The loop repeats until: gap-check returns `coverageComplete` (or zero
  questions), OR the server-owned round counter reaches the **hard cap of 4**, OR
  the user clicks **"Proceed to spec"**. Then the existing finalize path runs
  (answers -> spec run -> approve -> roadmap/build), unchanged.

### Why this shape
Each round is a short, human-initiated, terminating run that resumes from the
last - it fits the current "no durable pause" chain (`docs/design/shape-phase.md`)
with zero new pause machinery. The gap-check is the **same `shapeIntakeFlow`
question-emitter**, run with the accumulated answers injected as context and an
instruction: "These are already answered. Emit ONLY questions for material
remaining gaps; if coverage is sufficient, emit an empty `questions` array." The
round counter, the cap, and the "proceed now" override live in the shape-chain
state - the agent never decides when to stop the whole loop, only what is still
missing in the next batch.

### Brakes (non-negotiable - this is the anti-feature guard)
- **Hard cap: 4 rounds, enforced server-side.** The round counter is a
  server-owned sidecar; `submitShapeAnswers` reads the prior round, computes
  `next = prior + 1`, and when `next > 4` routes straight to finalize instead of
  launching another gap-check. The cap is NEVER read from the request body and
  NEVER decided by the model - both would be fail-open.
- **"Proceed to spec" on every round.** Always available; calls the existing
  finalize->shape path directly, skipping further gap-checks. The user is never
  trapped.
- The gap-check is **bounded** the same way the intake is (1-20 questions per
  round), so no single round explodes.

### Per-category progress (the user's "category-driven" ask)
Each question carries a `category` from a fixed small set: `scope`, `users`,
`data`, `constraints`, `success`, `integrations`, `other`. The UI groups the
round's questions by category and shows, per category, answered/total; a
category flips to "covered" once a gap-check round surfaces no further question
in it. This is presentation derived from the accumulated questions/answers - no
new persisted state beyond `category` on the question.

### Data-model changes
- **Model-facing** `flowShapeQuestionSchema`
  (`src/flows/schemas/flow-output-contracts.ts:239`) gains exactly one new
  required field the model can legitimately judge:
  - `category: "scope" | "users" | "data" | "constraints" | "success" | "integrations" | "other"`
- **`round` is NOT a model-emitted field.** It is server state. The model has no
  reliable way to know the round, and (per the Brakes guard) must not control the
  loop. `round` is stamped server-side onto each question when it is read/served,
  from the round sidecar - it lives on `PendingShapeQuestions` / the UI
  `ShapeQuestion` type, never on `flowShapeQuestionSchema`.
- **`coverageComplete`**: `flowQuestionsOutputSchema`
  (`flow-output-contracts.ts:260`) gains optional `coverageComplete?: boolean`,
  and its `questions` array min changes `1 -> 0` (a gap-check may legitimately
  return zero). Termination is server-decided from `coverageComplete || empty ||
  round >= 4 || proceeded` - the relaxed min is safe because the server, not the
  model, owns the stop.
- **Round sidecar**: a server-owned `shape-round.json` in the run dir (precedent:
  `shape-target-flow.json`), holding `{ round }`. Read + incremented + cap-checked
  in `submitShapeAnswers`; written when a gap-check round is launched.
- **Chosen-flow carry-forward**: `submitShapeAnswers` already threads
  `shapeTargetFlowId` from the prior run (`shape-chain.ts:119,179`); every
  inserted gap-check round MUST re-thread it (the sidecar is only re-written when
  it's truthy, `orchestrator.ts:935`), or the user's flow silently downgrades to
  the default. A 4-round chain-integrity test asserts the target survives.
- **Accumulated answers**: `renderAnswersDoc` currently OVERWRITES `shape-answers.md`
  (`shape-chain.ts:123,165`). It must read the prior doc forward and APPEND the
  new round, grouped by round + category, so the terminal spec run sees the union
  of all rounds. Still injected as a **file contextSource**, never inlined into a
  prompt - preserving the existing redaction-on-file-source safety property.
- Consumers to update in lockstep (the schema-ripple the program doc warns about,
  TODO risk note): `flow-output-contracts.ts` (schema + prompt example at :361),
  `ui/lib/types.ts:2` (`ShapeQuestion`), `ui/lib/api.ts:689`, `cli/commands/shape.ts:76`,
  `RunGapQuestions.tsx`, `shape-chain.ts:85` (`PendingShapeQuestions`). Old
  in-flight `questions.json` artifacts that lack `category` will fail safeParse
  and read as "no pending questions" - acceptable for this single-user pre-publish
  repo (no durable in-flight runs), called out so it isn't mistaken for a bug.
- **Loop implementation choice**: fresh-run-per-round (the path
  `submitShapeAnswers` already exercises) + the server-owned sidecars above. The
  reviewer's "single resumed run with an internal counter" is cleaner but bets on
  resuming a single-step intake run N times (unverified) - noted as a future
  simplification, not built blind.

### Seams touched
- `src/flows/catalog/builtin-flows.ts` - intake prompt (emit category/round;
  gap-check coverage instruction).
- `src/flows/schemas/flow-output-contracts.ts` - question schema.
- `src/shape/shape-chain.ts` - round tracking, gap-check launch (reuse intake),
  cap, proceed-now path, accumulating answers doc.
- `src/server/routes/shape.ts` - a "proceed to spec" action + round/coverage in
  the questions GET payload.
- `src/cli/commands/shape.ts` - `--proceed` on answer; show round/coverage.
- `src/ui/components/runs/RunGapQuestions.tsx` - category grouping, round +
  per-category progress, "Proceed to spec".

### Acceptance
A plan-worthy task surfaces questions, and answering a round produces a
**follow-up round** drilling into remaining gaps; coverage completes (or caps at
4, or the user proceeds) and the existing spec/roadmap/build chain runs unchanged
with the fuller answer set as context. A well-specified task still completes in
one round (gap-check returns empty).

---

## 3. Per-question Simplify

- A **Simplify** control on each question. On click it calls `runAssist` with
  the question text + its `why` + the brief, and returns a short plain-language
  restatement and a one-line "what this affects in your plan". An optional
  **"explain for a non-developer"** toggle adds a concrete analogy (the
  `TODO.md:601` idea), still one-shot.
- Rendered as an inline expansion under the question. Deeper back-and-forth is
  the orb's job (section 5), not Simplify's - Simplify stays one-shot and cheap.

## 4. Per-question Suggest (draft-only)

- A **Suggest** control on each question. It calls `runAssist` with the question
  + **all prior answers in the chain** + the brief, and returns
  `{ suggestedValue, why }`. The value is written into the field as an
  **editable draft**, badged "suggested", with the one-line "why" shown beneath.
  **It never auto-submits** - the user still presses answer/submit. This is the
  load-bearing safety choice: auto-filling would rubber-stamp answers the user
  never considered and poison the spec.
- **"Suggest all remaining"**: a round-level action that fills every blank with a
  grounded draft for review. Same draft-only semantics for every field. The call
  returns an array of `{ questionId, suggestedValue, why }` for the round's
  blanks (one provider call, not N).
- **Unreviewed-suggestion guard** (reviewer NIT #5): a field filled by Suggest is
  marked `suggested` + `reviewed: false` in local UI state and does **not** count
  toward the submit-ready gate until the user touches/edits it. Submitting while
  any unreviewed suggestion remains shows a "N suggested answers not yet reviewed"
  warning. This keeps "Suggest all" from becoming one-click rubber-stamping.

### Shared assist endpoint
- New route `POST /api/shape/assist`:
  `{ runId, mode: "simplify" | "suggest" | "suggest-all", questionId? , forNonDeveloper? }`.
  - `simplify` -> `{ text, affects, analogy? }`
  - `suggest` -> `{ suggestedValue, why }`
  - `suggest-all` -> `{ items: { questionId, suggestedValue, why }[] }`
- Built on `runAssist` (`src/assist/assist-runner.ts`) - same provider
  resolution (planner profile by default), same broker gating, same audit
  bucket. **A purpose-built request/response shape, NOT a widening of
  `ConsultResult`** (consult's VIBESTRATE.md-proposal / ledger-section schema is
  the wrong shape here). The assist *engine* is reused; only a thin shape-mode
  caller is new.
- CLI parity: `vibe shape simplify <runId> <questionId> [--for-non-developer]`,
  `vibe shape suggest <runId> <questionId>`, `vibe shape suggest <runId> --all`.
- `api.ts` gains `shapeAssist(...)`.

### Security
- Read-only, broker-gated, no diffs. Inputs (question text, prior answers) are
  user-typed shape data already on screen and in run artifacts.
- **Redaction is an explicit call, not an assumption** (reviewer BLOCKER #1).
  `runAssist`/`runConsult` do NOT redact free-text input today - `redactSecretsInText`
  (`core/diff-service.ts`) runs only inside `materializeContextSources`. So the
  shape-assist caller MUST call `redactSecretsInText(priorAnswersText)` itself and
  pass the redacted string into the `instruction` it hands to `runAssist`. No env
  values, no secret-shaped strings reach the model.
- Same route guards as `/api/consult`: localhost + CSRF + bearer (global Fastify
  hooks, verified to cover `/api/*`); keep an explicit 401/403 route test.

---

## 5. Screen-aware orb (reactive, typed)

The orb stays fully functional everywhere, but on the shape screen it becomes
**screen-aware**: when the user opens it and asks, it already knows the run, the
questions, and what is answered, so it can advise on a specific field.

### Mechanism
- A typed client-side **ViewContext** store. A screen publishes a structured
  snapshot of its meaningful state; the orb reads the current snapshot and
  includes it in the `consult` call.
- **V1 scope: the shape screen only.** Its snapshot is
  `{ screen: "shape-questions", runId, questions: {id, question, category, round, answered}[], blanks: string[], focusedField?: string }`.
  The provider pattern is generic enough that other screens can publish later -
  but **no generic DOM/screenshot scraper is built** (explicitly rejected by the
  user). The snapshot is a typed projection of state the client already holds.
- `consult` (`src/consult/consult.ts` request + `consult-context.ts` assembly)
  gains an optional `viewContext` field. When present it is serialized, run
  through `redactSecretsInText` (`core/diff-service.ts`) **by an explicit call in
  the viewContext assembler** (consult does not redact free text today, reviewer
  BLOCKER #1), and only then assembled into the prompt as "the user is currently
  on the Shape screen; here is the live state".
- **Reactive only.** The snapshot is used solely when the user opens the orb and
  asks. No proactive nudging, no stuck-detection, no unsolicited highlights in
  V1 (tracked as a possible later phase).

### Security
- The view snapshot is user-typed shape answers - low risk - but it is redacted
  by the explicit `redactSecretsInText` call above before it reaches the model
  (NOT inherited from consult, which does not redact free text). No new egress,
  no new write path, same `/api/consult` guards.
- **Pre-existing hole noted**: consult/assist feed `question`/`instruction`/`rules`
  unredacted today. This feature does not widen that hole (it redacts its own new
  inputs), but closing it centrally - redacting the user `question` and non-file
  sections in `runConsult`/`runAssist` - is a worthwhile follow-up logged in the
  remaining-work triage (it would also make these paths redacted-by-default).

---

## 6. UI / CLI parity (every action on both surfaces)

| Action | UI | CLI |
| --- | --- | --- |
| Answer a round | RunGapQuestions form | `vibe shape answer` |
| Proceed to spec now | "Proceed to spec" button | `vibe shape answer --proceed` |
| Simplify a question | per-question Simplify | `vibe shape simplify` |
| Suggest an answer | per-question Suggest | `vibe shape suggest` |
| Suggest all blanks | round-level "Suggest all remaining" | `vibe shape suggest --all` |
| Ask the orb in context | orb (screen-aware) | `vibe consult` (with run context) |

The dashboard surface is the shape-questions screen; everything is doable from
the CLI too (repo invariant).

---

## 7. Verification plan
- `pnpm typecheck` (CLI + UI), `pnpm test`, `pnpm build` per phase.
- Fake-provider chain test: a plan-worthy task -> round 1 questions -> answers ->
  gap-check emits round 2 -> answers -> coverage complete -> spec run launched
  with the accumulated answers as context. Assert the cap (no 5th round) and the
  "proceed" override (skips gap-check).
- Assist tests (fake provider): simplify returns text+affects; suggest returns a
  draft value + why and **does not** submit; suggest-all returns one item per
  blank.
- Redaction tests: a planted secret in an answer is scrubbed before it reaches
  the assist/consult prompt (extend the existing planted-token tests).
- Route tests: `/api/shape/assist` and the new shape actions are localhost +
  CSRF + bearer gated; fail-closed without token where the others are.
- Live where observable: rebuild `dist/ui`, restart `vibe ui`, click through a
  shape run (report honestly if only typecheck/build ran).

## 8. Out of scope (explicit)
- Proactive orb (nudging / stuck-detection / unsolicited highlights).
- A generic screen-context bus / DOM scraper for non-shape screens.
- Auto-fill-and-submit for Suggest (rejected: poisons the spec).
- Durable pause (F1) - the loop stays a chain of terminating runs.
- Widening `ConsultResult` to serve shape (separate request/response instead).

## 9. After this feature: the "remaining" program (triaged)

The user asked to then "do all of the remaining, including end-to-end tests".
"All" cannot be literal - the backlog includes items the user has told us to
keep out, and items that are blocked or need human eyes. Triaged from
`docs/TODO.md`:

**In-scope, safe to do unattended (local-only, no external APIs, verifiable):**
- End-to-end tests (explicitly requested) - the keystone of this program.
- `workflow.maxReviewLoops` display-only-at-runtime fix (`TODO.md:588`) - small,
  well-scoped dead-wire fix; own review.
- Fail-loud on out-of-catalog effort in a hand-edited profile (`TODO.md:182`).
- Unknown-id CLI provider not shown on the Providers list (`TODO.md:320`).
- Audit/confirm no Telegram/Discord/WhatsApp adapter code lingers (the user's
  explicit ask at `TODO.md:220`) - a read-only verification, flag if found.

**Flagged, NOT touched unattended (blocked / external / needs human eyes):**
- Phase C write-parallelism, S6 Docker slices 2-3 (blocked on backend/proxy).
- Hub Publish, GitHub/GitLab PR creation (outward-facing, secret-bearing).
- WhatsApp/Telegram/Discord adapters (user: keep out).
- Cloud `/models` probing (no model APIs unless requested).
- P6 UI Phase 2, T15/T16 tours (need rendered-screen eyes / deferred to prod).
- E1 Windows, E2 Homebrew, Always-on, T18 RAG, T19 beyond-code (platform /
  design-first / spikes).

Each in-scope item ships green + committed + ff-merged to `main` (no push), one
concern per merge, per the repo convention.
