---
title: Supervisor task grounding - propose, don't guess
status: proposed
created: 2026-06-16
related: [responsible-orchestrator.md, project-ledger.md, profiling-intake.md, pickup-execution.md]
---

# Supervisor task grounding (propose, don't guess)

## The bottleneck

A weak task is the failure mode:

```
vibe run "Improve logging"
```

The planner guesses what "improve logging" means, the reviewer critiques the
planner's *own guess*, and you get a diff that's plausible and probably wrong.
Nothing in the loop ever asked "improve it *where*, to *what end*?" - and unlike
a chat with a model that has the conversation loaded, Vibestrate has no idea what
you were looking at when you typed it.

The naive fix - "make every task a detailed brief" - is the thing we explicitly
*don't* want: it makes every run tedious. The user's framing: the **supervisor
should have more sense**. If there's a roadmap and you say "a new task" / "pick
something to start", it should **propose** ("these make the most sense to start
with…") instead of forcing you to replay a full prompt each time.

## Two problems, deliberately separated

These are conflated in the complaint but have very different cost/risk:

- **(A) Propose from grounded context.** When the task is empty / "pick from the
  roadmap" / thin, ground it against the context Vibestrate *does* have - the
  **roadmap + ledger + codebase** - and surface a ranked shortlist to pick from,
  instead of the planner guessing on the literal string. Low risk, high value,
  **model-independent**. This doc is about (A).
- **(B) Reconstruct what the user referenced.** The "you get it because you have
  context; our system doesn't" gap, for a genuinely novel vague task that isn't
  on the roadmap. This is a model-grounding / clarifying-question feature that
  fights local-first + model-independence and is the main tedium risk. The
  profiling design already rejected a general clarifier for exactly this reason
  (profiling-intake.md: "does NOT generalize to a general clarifying-question
  system… you'd reach for the model, breaking the claim"). **(B) is DEFERRED to
  its own bounded design. It must not ride on (A).**

The reframe that makes (A) the right first move: the user's advantage over
Vibestrate isn't magic, it's *loaded context*. Vibestrate's equivalent context is
the roadmap/ledger/codebase. So "have more sense" = "when the task is thin, lean
on the context you have and **propose**", not "read my mind".

## What already exists (this is mostly assembly - cited)

- **`suggestNext(tasks): Suggestion[]`** (`roadmap/suggest-next.ts`): a **pure,
  deterministic** backlog ranker - dependency-ready first, then priority, then
  fewer open blockers, then age. Each `Suggestion` carries `{ taskId, title,
  ready, priority, openBlockers, reason }` with a one-line human rationale. **This
  is the "these make the most sense to start with" engine - it already exists.**
- **Roadmap cards** (`roadmap/roadmap-types.ts`): a Task carries `title`,
  `description`, `priority`, `riskLevel`, `notes`, an ordered `checklist[]`, and
  `dependsOn`/blocker links - rich grounding context per card.
- **`vibe run --task <id>` (pick-up)**: already grounds a run in a card and
  iterates its checklist (pickup-execution.md). The *execution* half of "pick a
  card → run it" is already wired.
- **Consult `computeConsultSections`** (`consult/consult-sections.ts`): already
  computes a deterministic "Suggested next steps" section (open follow-ups + open
  intents) from ledger + roadmap + runs; the model narrates, never invents.
- **Continuity ledger** (`project-ledger.ts`): open intents / residuals / "blocked
  - resume from run X" - more grounded candidates than just the roadmap.
- **Supervisor persona + `select-workflow`**: the advisory posture and the
  "selected flow with confidence + reasons" pattern to mirror for "selected task
  with reasons".

**The gap is small and specific:** nothing puts that shortlist in front of you at
**run start**. `run.ts:155` simply errors ("A task description is required.") on an
empty task; a thin task goes straight to the planner. There is no "this is
underspecified - here's what I'd actually start, pick one" gate.

## Design

### 1. The propose-gate (run start)

A new, deterministic **proposal** step that fires on an **explicit** trigger (see
§2 - never a vagueness-sniffer):

1. Load the roadmap tasks + (optionally) the ledger's open intents/residuals.
2. Rank with the existing `suggestNext` (pure). Ledger items fold in as extra
   candidates with their own rationale ("blocked at executing - resume", "open
   intent, never shipped").
3. Surface the top-N as a **shortlist with one-line reasons** in Vibestrate's own
   surfaces (CLI picker + dashboard) - the supervisor "proposing", framed by the
   persona ("Here's what I'd start with…").
4. The user **picks one** (or "none - I'll type a task"). The chosen card's full
   context (title + description + checklist + notes) becomes the grounded run via
   the **existing `--task <id>` pickup path** - no new execution machinery.

Model-independence: the questions (the ranked candidates + rationale) are
**deterministic from `suggestNext` + the roadmap/ledger**. A provider is optional
and only *narrates/refines* the shortlist (via the already-safe `runAssist`) -
never invents a task, never required. Identical inversion to profiling.

### 2. Trigger: explicit, not heuristic (decided)

The gate fires only on an **explicit** signal:

- `vibe run` with **no task** (today an error → becomes "propose from roadmap"),
- `vibe run --from-roadmap` / a `--propose` flag,
- the dashboard "Start next" / composer "propose" affordance.

It does **NOT** try to auto-classify a free-text task ("Improve logging") as
"too vague". Reason: a vagueness heuristic nags on every legitimately-short task -
the exact tedium we're trying to remove. (A later, **opt-in** "offer to propose
when a task looks thin, one keystroke to dismiss" increment is possible, but is
not slice 1 and must be off by default.)

### 3. Surfaces

- **CLI**: reuse the `flow-crew-picker` horizontal-selector pattern - a "pick a
  starting task" picker showing title + reason + ready/blocked. Pick → run with
  `--task`. Non-TTY/unattended: fail fast listing the top candidates (never hang).
- **Dashboard**: a "Start next" panel (composer or roadmap board) listing the
  ranked shortlist with rationale; click → spawns the run for that card. Read API
  returns the deterministic ranking so the UI shows the same order as the CLI.

### 4. Deterministic-first, model-optional

The ranking + rationale are pure. The optional model pass (`runAssist`,
read-only, gated) may only **re-order within the deterministic candidate set** or
**sharpen a one-line reason** - it is given the candidate list and told it may not
add items. If no provider / offline, the deterministic shortlist stands. This
keeps "the supervisor has sense" true on any provider and with none.

## Safety / invariants

- **No invented work.** The model can never add a task not already in the
  roadmap/ledger - it ranks/narrates a fixed candidate set (same posture as
  consult's "do NOT invent next steps that aren't there").
- **Never auto-runs.** The proposal is a suggestion; a run starts only when the
  user picks. Unattended mode fails fast with the candidate list, never
  auto-selects (no surprise spend).
- **No tedium by default.** Explicit trigger only; a short free-text task runs
  exactly as typed unless the user asked to propose.
- **Reuses the gated execution path.** Picking a card runs through the existing
  `--task` pickup - no new write surface, no new run state.

## Build slices (each shippable + verified)

| Slice | What | Risk |
| --- | --- | --- |
| **G1** | Pure "proposed starts" ranker: fold ledger open-intents/residuals into `suggestNext`'s candidate set + a render helper. Unit-tested, no I/O. | Low |
| **G2** | CLI propose-gate: empty task / `--from-roadmap` → picker (TTY) or fail-fast list (non-TTY) → run via `--task`. | Med (run start) |
| **G3** | Dashboard "Start next" panel + read API (same deterministic ranking). | Med (UI) |
| **G4** | Optional model narration/refine pass (`runAssist`, gated, candidate-set-bounded). | Med (provider; must stay optional) |
| ~~B~~ | General clarifier for novel vague tasks. | **Deferred - separate design** |

Order G1 → G2 → G3 → G4. G1+G2 alone deliver the user's ask ("supervisor proposes
from the roadmap instead of me replaying the prompt").

## Open questions

1. **Ledger candidates in slice 1, or roadmap-only first?** Roadmap-only is the
   cleanest MVP; ledger residuals ("resume the blocked run") are arguably the
   highest-value candidates. Lean: roadmap-only G1, ledger fold-in as G1.5.
2. **Where the dashboard surface lives** - composer ("propose") vs roadmap board
   ("start this") vs a dedicated "Start next" panel. Probably the composer (it's
   the run-start surface).
3. **(B) scope** - when we get there: bounded, opt-in, model-gated,
   honestly-labelled. Out of scope here.

## Decision (pre-review draft - SUPERSEDED below)

Build (A) as the run-start **propose-gate** over the existing `suggestNext` +
roadmap + `--task` pickup, **explicit-trigger**, deterministic-first with optional
model narration. Defer (B). Slices G1 → G4.

---

## Reviewed plan (FINAL - supersedes the slices/decision above)

An adversarial Opus review (fresh context) found the draft's load-bearing premise
**false** and the slice plan over-built. Corrections:

1. **"`--task` already grounds a run in the card → just assembly" is FALSE.**
   Verified: the orchestrator builds the brief from `Task: ${this.task}` + the
   flow brief + (only under the `pickup` flow + `--checklist-mode`) the checklist.
   A card's `description` was **never** injected anywhere. So "pick a card → run"
   handed the planner a bare title - the exact guessing failure. **The real first
   fix is brief-injection**, not a picker. This SHIPPED as **F1**
   (`roadmap/task-grounding.ts` + `orchestrator.ts`): a bound card's description +
   open checklist now ground the brief for ANY `--task` run (redacted, bounded;
   a title-only card adds nothing rather than fake-grounding).
2. **Don't build a new gate/picker - reuse.** `suggestNext` is ALREADY surfaced
   three ways (`vibe tasks suggest`, `GET /api/tasks/suggest`, the board's
   "Suggested next" affordance) plus consult's parallel `suggestedNextSteps`. A
   new CLI picker + dashboard panel would be a third/fourth surface that disagrees
   on ordering. Instead: make empty `vibe run` print the EXISTING shortlist, and
   upgrade the board affordance to start→run. Converge on `suggestNext` as the one
   ranker.
3. **(A) does NOT fix a directly-typed thin task** ("Improve logging") - that's
   the deferred (B). The explicit-trigger only helps the empty / from-roadmap
   case. Don't claim otherwise.
4. **Ledger candidates can't be `--task`-dispatched** (ledger entries carry no
   `taskId`, only `sourceRunId`). A picked ledger item needs the resume/rewind
   path, not `--task`. Drop ledger fold-in from slice 1.

### Where this lives now

The remaining UI work (empty-run proposes from the shortlist; readable, parity
run surface) is folded into **`experience-overhaul.md` Epic C** (dedicated Run
page with full CLI-parity controls + the propose interaction). (B) stays its own
deferred design. F1 is the standalone shipped piece from this track.
