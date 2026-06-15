---
title: Durable project memory (auto-derived, continuously maintained)
status: proposed
created: 2026-06-16
related: [context-scaling.md, responsible-orchestrator.md]
---

# Durable project memory

## The ask (North Star)

A **durable, continuously-maintained, auto-derived project memory** that grounds
every run and survives session/run boundaries - so a new run (or a human, or a
future session) re-orients from the *project's accumulated state*, not from
scratch and not from a long conversation.

GSD Core is the **sanity reference** that this works in practice: its `.planning/`
artifacts (`STATE.md` per project, `CONTEXT.md` per phase) are re-read at every
session start - "agents do not rely on memory; they rely on the file." We adopt
the *principle* (a durable file the orchestrator re-grounds from) and reject the
*mechanism*: GSD is a prompt-pack that **asks a host LLM agent to maintain**
`STATE.md` by convention (with a stateless CLI, `gsd-tools.cjs`, helping it
read/write). That's reliable only as far as the agent follows instructions.

**Vibestrate's way is the inversion:** the *deterministic orchestrator owns the
memory*. It is **derived from structured run state/events/artifacts**, not
written by an LLM at its discretion. One writer, deterministic, regenerable. The
LLM is a *producer of artifacts the orchestrator folds in* - never the keeper of
the state file. This is strictly more reliable: the update always happens (it's
code on a run boundary), not "if the agent remembered to."

## What we already have (de-hallucinated, cited)

The bones exist - this is **unify + auto-derive**, not greenfield.

- **`.vibestrate/project.ledger`** (`src/core/project-ledger.ts`) - an append-only
  NDJSON log with a **pure fold**, `deriveLedgerState(entries)`, into live state:
  `shipped`, `intents` (open goals), `residuals` (known follow-ups), `decisions`
  (incl. "decided against"), `mentions`, and `flags` (duplicate/conflict). Later
  entries supersede earlier by id; an entry is live unless superseded or its
  status retires it. Torn last lines are skipped (crash-safe). It already has a
  **dashboard surface** (`src/ui/app/routes/LedgerPage.tsx`).
- **`VIBESTRATE.md`** (`src/project/project-manual.ts`) - the orchestrator's
  durable, human-readable project model, read before workflow selection (Policy >
  VIBESTRATE.md > rules > heuristics). Sections: Project Model, Dev Commands,
  Orchestration Preferences, Risk Rules, Codebase Conventions, Known Constraints,
  **Lessons Learned** ("durable lessons from prior runs"). Reads are path-guarded,
  secret-redacted, size-bounded. **Writes are manual**: `consult` *proposes* an
  update; a human applies it via a guarded `file.write` (`vibe guide init`).
- **`run-brief.ts`** - a compact, evolving brief the orchestrator maintains
  **across a single flow's steps** (chosen flow, decisions, step outcomes). It is
  **per-run and ephemeral** - it does not persist to the ledger or across runs.

## The gaps (precise)

- **G1 - `VIBESTRATE.md` is hand-applied, not derived.** The state that *should*
  come from run history (Lessons Learned, current position) is only ever updated
  when a human accepts a `consult` proposal. The user's call: "it should derive."
- **G2 - The ledger captures `shipped` at `merge_ready`, but not the rest
  continuously.** Open intents, *blocked/in-progress* runs, decisions-with-*why*,
  and residuals are in the schema but not auto-appended at every run boundary. So
  "where am I / what's blocked / what did we decide and why" isn't durably
  captured for a future run.
- **G3 - No rendered, durable STATE digest.** `deriveLedgerState` yields a
  structured live state, but nothing renders it to a durable, human+agent-readable
  digest that a future run re-grounds from. `renderLedgerForPrompt` injects it
  into the planner once per run, but there's no committed artifact.

## Design (Vibestrate's way)

### 1. One writer: the orchestrator's deterministic projector

A single module owns the project memory. It is the **only** writer. It runs on
**run boundaries** (start, block, fail, merge) - deterministic code, never an LLM
turn deciding to update state. This is the load-bearing inversion vs GSD.

### 2. Continuous capture (closes G2)

Extend ledger appends beyond `shipped`-at-`merge_ready` to every boundary:

- **Run start** - if the task introduces a *new* goal, append an `intent` (open).
  Dedup against live intents (the ledger's supersede-by-id + `flag:duplicate`
  already model this).
- **Run blocked / failed** - append a `residual` carrying the blocker + a
  **resume hint** (the rewind stage to resume at - we already have rewind/resume,
  ISSUE-001). So "what's blocked and how to pick it up" is durable.
- **Run merged** - append `shipped` (as today) **plus** `decision` entries
  *extracted deterministically* from the run's architecture + review artifacts
  (the decision + its *why*; Cognition's first law: carry decisions, not just
  facts). Close the matching `intent` (supersede).

Capture is **structured extraction from existing artifacts/events**, not an LLM
narrating. Where extraction is lossy (e.g. distilling "why" from prose), it falls
back to a bounded head/tail clip - never a model call in the core path.

### 3. Derived STATE digest (closes G3)

A **deterministic renderer** over `deriveLedgerState` produces a durable,
human-readable digest, regenerated on every run boundary:

- **Current position** - active runs + stage; blocked runs + blocker + resume hint.
- **Open intents** - goals not yet shipped.
- **Recently shipped** - last N, newest first.
- **Decisions (with why)** - the live decision log, incl. "decided against".
- **Blockers / residuals** - known follow-ups.

It is a *cache over the append log* - fully regenerable from `project.ledger`, so
it can never be the source of truth and losing it is harmless (rebuild). It is
git-committable (the team sees project state in PRs) and re-read by the planner.

### 4. `VIBESTRATE.md` split: human intent + machine state (closes G1)

Don't fight over one file. Split ownership inside it with a **fenced managed
block**:

```
## Project Model            } human-authored
## Development Commands      } (intent, policy,
## Orchestration Preferences } north-star) - the
## Risk Rules                } orchestrator NEVER
## Codebase Conventions      } touches these
## Known Constraints         }

<!-- vibestrate:state:begin (auto-derived; edits here are overwritten) -->
## Project State             } machine-owned: the
## Lessons Learned           } derived STATE digest +
<!-- vibestrate:state:end -->  distilled lessons
```

The projector regenerates **only** the fenced block from the ledger on each run
boundary (idempotent text replace between the markers; absent markers => append
the block once; never clobber human sections). This makes `VIBESTRATE.md`
*derive* its state - resolving "manual is bad" - while keeping the human's intent
authoritative. `consult` can still *propose* edits to the human sections (that
stays a reviewed apply); the machine sections need no proposal - they're derived.

### 5. Role-isolated projection (aligns with context-scaling.md)

Per the context-scaling single takeaway ("one writer + role-isolated context;
ground the producers, clean-room the judges"):

- **Producers** (plan/architect/implement) receive the STATE digest as
  **grounding** - the decision log + open intents + constraints. This is the
  concrete realization of rung-2c's "running decision log."
- **Judges** (review/verify) stay **clean-room** - they already drop the brief;
  they must also *not* receive the project digest (a clean window catches more,
  per Cognition; re-feeding the judge everything is worse, not just costlier).

So the memory is *written once, projected by role* - not a blackboard everyone
reads. This is exactly the shape the prior research converged on.

### 6. Deterministic-first; optional bounded distillation

Core derivation is **deterministic** (structured from artifacts/events). The one
place an LLM helps is a narrative "what is this project, in 3 sentences"
distillation of the Lessons Learned. That is **optional, gated, and uses a local
provider turn** (no model APIs - V0/V1 invariant), clearly fenced, and never the
source of truth (regenerable from the ledger). Ship deterministic; add distill
only if the raw digest proves too noisy on a real project.

## Safety & invariants

- **Never loses history.** The ledger is append-only (supersede, don't delete);
  the digest is a regenerable cache. Aligns with the "never auto-purge" rule.
- **Never clobbers human content.** The managed block is fenced; the projector
  only ever rewrites between the markers. A malformed/absent file degrades to "no
  state section," never to overwriting Project Model.
- **Fail-closed derivation.** A bad fold/render keeps the last good digest and
  logs; it never writes a partial/empty digest over a good one.
- **Secret-safe.** All writes go through the existing redaction + size-bound +
  path-guard that `writeProjectManual` already enforces. Decisions/residuals
  extracted from artifacts are redacted before they hit the ledger.
- **One writer, deterministic.** No LLM maintains the file; the update is code on
  a run boundary, so it always happens and is reproducible.

## Build slices (incremental, each shippable + verified)

| Slice | What | Risk |
| --- | --- | --- |
| **A** | Continuous capture: append `intent`/`residual`/`decision`(+why) at run start/block/fail/merge; deterministic extraction from artifacts; dedup against live state. | Med - touches run boundaries; needs the existing supersede/dedup. |
| **B** | Deterministic STATE-digest renderer over `deriveLedgerState` -> `.vibestrate/STATE.md` (regenerable). Pure, table-tested. | Low - pure render. |
| **C** | Auto-derive the fenced `VIBESTRATE.md` state block from the digest (idempotent managed-block replace; never touch human sections). | Med - editing a committed file; the fence + fail-closed are load-bearing. |
| **D** | Role-isolated projection: feed the digest to producers as grounding; assert judges stay clean-room. | Med - changes producer prompts; needs the same review rung-2 needed. |
| **E** | (Gated, optional) bounded local-provider distillation of Lessons Learned. Only if B's raw digest is too noisy on a real project. | Low/deferred. |

Order: **B -> A -> C -> D** (build the pure renderer first to nail the shape, then
feed it, then wire the file, then project). E is deferred behind a measured need.

## Open questions / risks (for the design review)

1. **Decision-with-why extraction is the hard part** (Cognition: "compression is
   hard to get right"). Deterministic extraction from architecture/review
   artifacts may be lossy. Mitigation: start with the *decision marker* +
   head/tail of the rationale; measure whether producers actually use it.
2. **Managed-block editing of a committed file** is the riskiest write. Must be
   idempotent, fenced, fail-closed, and never reorder/clobber. Alternative: a
   *separate* `.vibestrate/STATE.md` (no fence risk) and leave `VIBESTRATE.md`
   fully human - but that doesn't satisfy "VIBESTRATE.md should derive." Decision
   needed: managed-block-in-VIBESTRATE.md vs separate-STATE-file-+-reference.
3. **In-progress vs blocked granularity.** How much in-flight state to durably
   capture vs leave to live run state? Over-capturing churns the ledger.
4. **Cross-run dedup / staleness.** The supersede-by-id + flag model exists, but
   the projector must apply it correctly so the digest doesn't accumulate stale
   intents/decisions.
5. **Token cost of grounding producers** with the digest - bound it through the
   same context packet budget (don't reintroduce the bloat we just measured).

## Decision

Adopt the orchestrator-owned, deterministic, derived model. Build B -> A -> C ->
D. Defer E. Resolve open question #2 (managed block vs separate file) in the
design review before Slice C.

---

## Reviewed plan (FINAL - supersedes the slices/open-questions above)

After an adversarial Opus 4.8 design review + user direction. The review found
three would-be-fatal flaws in the draft; this plan fixes each.

### What the review changed

1. **"One writer" was false under the scheduler.** `maxConcurrentRuns > 1`
   spawns separate OS processes, each appending to the ledger + writing the
   digest with **no lock** - multi-line NDJSON appends can tear, and the torn-line
   reader then *silently drops* a decision (breaking "never loses history"); the
   file rewrite is a lost-update race. -> A cross-process **write mutex** is a
   **prerequisite** (Slice 1), not an afterthought.
2. **`.vibestrate/` is gitignored**, so the draft's "git-committable, team sees
   state in PRs" motivation for editing `VIBESTRATE.md` is moot (single-user,
   pre-publish). The derived state lives in a **separate machine-owned
   `.vibestrate/STATE.md`** - regenerable, not authoritative, harmless to lose.
3. **`writeProjectManual` REFUSES secret-shaped content and is "never
   auto-called."** Auto-writing it every run would fail-*stuck* on a token shape.
   -> the derived `STATE.md` uses a **redacting, atomic** writer, never the
   refusing manual writer; `VIBESTRATE.md` edits stay **gated** (below).
4. **"Decision + why" has no structured source** (decisions are verdict labels;
   the rich content is LLM prose). -> defer deterministic decision-extraction;
   ship structured-source captures first; do lessons via the advisor (judgment +
   human gate), not a deterministic clipper.
5. **Clean-room judges + producer grounding is ~80% already shipped**
   (`orchestrator.ts:4575`, `renderLedgerForPrompt`). -> rescope to "feed the
   richer digest + regression-test."

### The model (locked)

| Surface | Owner | Write path |
| --- | --- | --- |
| `.vibestrate/STATE.md` | **Machine, deterministic** | Auto each run boundary; pure render over `deriveLedgerState`; **atomic temp+rename**, re-derived from the current ledger so last-writer-wins is *correct* (freshest); regenerable cache (losing it is harmless). Redacting writer. |
| `VIBESTRATE.md` (human sections) | **Human** | Authored by the user. The machine never rewrites Project Model / Risk Rules / Conventions. |
| `VIBESTRATE.md` (lessons + methodology) | **Advisor (consult/supervisor persona) + human gate** | Advisor *proposes* judgment edits via the existing `writeProjectManual` (broker, secret-refuse, size-bound, path-guard). **approve-by-default; opt-in auto-apply for low-risk additions; always `git revert`-able** (it's a committed file). This is the "CTO advisor keeps it current" the user asked for - gated, not blind. |

The split = deterministic-structured (machine -> STATE.md) vs lossy-judgment
(advisor+human -> VIBESTRATE.md). The loop: **memory (what we do) -> planner (how)
-> flow (enforce)**.

### Concurrency design

- **Ledger append**: serialized by the new write mutex (Slice 1). Entries can be
  4 KB+ (`detail`), so single-`appendFile` atomicity is not guaranteed - the mutex
  is the fix, not single-line tricks.
- **STATE.md write**: atomic temp+rename + always re-derive from the *current*
  ledger. No mutex needed beyond the ledger's (last writer has the freshest
  state, so its full overwrite is correct). A reader never sees a torn file.
- **VIBESTRATE.md write**: gated/low-frequency; goes through the mutex + the
  existing broker guards.

### Planner methodology awareness (folded in)

- Declare the project methodology in `VIBESTRATE.md` -> **Orchestration
  Preferences** (e.g. "TDD: test-first, prove red before green"; "incremental,
  commit-per-item").
- The planner already reads `VIBESTRATE.md` before workflow selection; give it a
  small **known-methodology catalog** (TDD / BDD / incremental) so it recognizes
  the declared one and maps it to behavior (test-first ordering, flow choice).
- The advisor may *propose* a methodology to the manual when it infers one from
  the codebase (test-heavy -> suggest TDD), through the same gated path.
- Reconnects to the deferred `tdd` *flow*: declared in memory -> planned by the
  planner -> (optionally) enforced by a flow's red gate.

### Build order (each shippable + verified; Tier-2 review on the risky ones)

1. **Slice 1 - write mutex** (`withFileMutex`): short-held, O_EXCL create +
   pid/mtime stale-reclaim (reuse `isProcessAlive`). NOT the scheduler singleton
   (which terminates the holder). Concurrency test. **Tier-2 reviewed.**
2. **Slice 2 - STATE.md renderer**: pure render over `deriveLedgerState`; atomic
   redacting write; route `ledger.append` through the mutex. Table-tested.
3. **Slice 3 - safe captures**: append `intent` (open) at run start; `residual` +
   resume-hint at block/fail. Structured sources only.
4. **Slice 4 - advisor VIBESTRATE.md**: gated proposals (lessons + inferred
   methodology); approve-default + opt-in auto-apply + revertible.
5. **Slice 5 - planner**: read methodology + catalog; project STATE.md grounding;
   regression-test judges still clean-room.
6. **Deferred**: deterministic "decision + why" extraction (no structured source
   - do via the advisor instead); optional local-provider distillation.

### Staleness (new, before grounding producers)

A derived-but-wrong "open intent" would *mislead* the next producer. Before Slice
5 grounds producers on the digest: age-cap or mark entries older than N runs
**"unconfirmed"** in the render, so stale state can't masquerade as current truth.

---

## The efficiency principle: store vs projection (load-bearing)

"The orchestrator knows a lot" must NOT mean "every turn sends a lot." Separate
the two:

- **The STORE is global** - one append-only ledger, one history, one source of
  truth (a per-role/per-phase *store* fragments it and recreates GSD's
  agent-maintained-files model). Grows with project history.
- **The PROJECTION is per-role and bounded** - each agent gets only its
  role-slice, and the *projection*, not the store, is what hits the prompt. Three
  guards keep it flat as the store grows:
  1. **Project, don't broadcast** - producers get the digest; judges get a clean
     room (nothing). (`orchestrator.ts:4567,4581` - planner-only + cleanRoom drop.)
  2. **Packet token budget** - the context packet caps per-turn tokens and
     summarizes/references past a threshold; the digest rides that budget.
  3. **Staleness cap** - old open intents/residuals render as `(unconfirmed)` and
     fall out of relevance, so the digest can't grow unbounded into a turn.

The "per-phase" concern is the *ephemeral* context packet (recomputed each step),
not a durable per-phase file - which is why we ship one global STATE.md, not
GSD-style per-phase CONTEXT.md files.

## Build status (2026-06-16)

- **Slice 1 (write mutex)** - SHIPPED (`ff2f030b`). Tier-2 reviewed; the reviewer
  caught double-hold + release-deletes-peer, both fixed.
- **Slice 2 (STATE.md digest)** - SHIPPED (`ff2f030b`).
- **Slice 3 (run-start intents + blocked/failed residuals)** - SHIPPED.
- **Slice 5 (staleness cap)** - SHIPPED. Grounding (planner gets the digest) and
  clean-room judges were ALREADY in code; staleness marking is the new guard.
- **Slice 4 (advisor co-authors VIBESTRATE.md)** - DEFERRED, deliberately. It's
  the one Tier-2 risky-write (auto-editing a committed file) with a real scope
  question (proactive? opt-in auto-apply?). The existing `consult` already covers
  the on-demand propose->apply case; the proactive/auto increment is a separate,
  reviewed decision.
- **Methodology awareness** - DEFERRED to the separate "profiling/methodology"
  plan (it's a planner-behavior feature, not core to durable memory).

The durable memory is **complete and useful** as of Slice 5: runs ground on a
fresh, non-misleading, role-projected project memory that survives sessions.
