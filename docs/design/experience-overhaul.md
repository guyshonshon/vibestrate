---
title: Experience overhaul - consult efficiency, referenceable answers, full run-control surface, contextual orb
status: proposed
created: 2026-06-16
related: [responsible-orchestrator.md, context-scaling.md, supervisor-task-grounding.md, amaco-ui-supervisor-addendum.md]
---

# Experience overhaul

Captured from a live session walking the consult answer + run composer. Four
epics. This is a **vision/backlog capture** - it records the intent, the facts
behind it, and the open decisions; it does not commit to irreversible choices.
Each epic needs its own slice plan before building. User pains are quoted
verbatim so they don't get sanded off.

Cross-cutting invariant (the user's standing rule): **CLI = TUI = UI**. Anything
the CLI can do, the dashboard and the TUI must be able to do too. Several epics
below are really "the UI fell behind the CLI - bring it back to parity."

---

## Epic A - Consult context efficiency ("does it re-read everything every time?")

> "when we consult, does it really need to read the entire project context every
> time? can it not be graphed and already contexted and loaded?"

**Fact (verified).** Yes, today it re-derives everything per call:
`consult-context.ts` freshly loads the project manual, config+rules, project
metadata, open annotations, ledger state, roadmap tasks, and snapshot counts,
then runs `computeConsultSections`, on **every** consult. The only optimization
is reusing an already-loaded config. There is no persistent cache or graph.

**The tension.** `context-scaling.md` already decided NOT to build a knowledge
graph until a measured bottleneck appears (it breaks local-only / no-model-API
invariants and the existing `FlowContextPacket` covers inter-step context). So
"graph it" fights a logged decision - don't reverse that on vibes.

**Options:**

| Option | What | Verdict |
| --- | --- | --- |
| **Cache + invalidate** (lean) | Memoize the computed consult sections (ledger/roadmap/runs digest) to a small on-disk artifact; rebuild only when the codebase-event stream (already emitted) or the underlying stores change. Incremental, local-only. | Likely ~90% of the win, cheap, no new invariant breakage |
| Full graph / RAG | The deferred T18 knowledge-graph. | Defer until measured; do not pre-build |

**First step: measure.** Instrument one consult call - how long does the context
build actually take, and on what size project? If it's tens of ms, this is
premature. If it's seconds (large ledger/roadmap), ship the cache. Decide with a
number, not a feeling.

---

## Epic B - Referenceable, readable consult answers

> "so ugly, so long, it is hard to read, so many boxes … nothing is
> referenceable, i can not access anything!"

From the screenshots, the consult answer panel:
- **Nothing is clickable.** "Recent activity" lists `merge_ready: Say hello`,
  `blocked: Go through all ru…`, etc. as plain truncated text. Each of these
  IS a run (or task) - it should link to that run/task/file, not be a dead string.
- **Lossy truncation.** `Create a file …`, `make a text …` hide the actual title;
  a hover/expand or a wider layout should show it.
- **Box soup + low contrast.** Nested rounded boxes, grey-on-bright text, hard to
  scan. Too much chrome per unit of information.

**Direction:**
- Every computed item is a **reference** (run -> run detail, task -> board card,
  file -> file viewer). The deterministic sections already carry ids (the ledger
  entries have `sourceRunId`; roadmap suggestions carry `taskId`) - wire them to
  links.
- Replace lossy `…` truncation with full titles (expand-on-hover or a layout that
  fits), so a glance is enough.
- Fewer boxes, higher contrast, denser. The answer is the hero; the computed
  sections are a scannable, linked sidebar/secondary, not five stacked cards.

---

## Epic C - Run control surface = full CLI parity, on a dedicated page

> "it is just not corresponding to our true control system, there are no flags
> (unattended, continuous, etc … there are so many more options), no 'Advanced
> Configurations' for those, it should be mandatory visible on each run … we need
> a dedicated page, not a small component that contains the run task … the panel
> is so hard on the eyes (grey over that bright bg, barely visible), no quick look
> at the flows."

**Fact (verified).** The composer exposes `readOnly`, `unattended`,
`contextPolicy`, skills, persona, crew, flow + step/seat overrides. The CLI run
also has: `effort` / `autoEffort`, `concise`, `select` (force flow selection),
`checklistMode` (continuous / step), `contextSources`, `resumeFrom` (rewind),
and `--task` binding. **None of those are in the UI.** CLI > UI today - a direct
violation of the parity invariant.

**Direction:**
- Promote run composition from a cramped component to a **dedicated Run page**
  (its own route), with room to breathe and a real layout.
- **Every run option is reachable**, with an **"Advanced configuration"**
  section that's always present (collapsed by default, never hidden/absent):
  effort/auto-effort, concise, unattended, continuous/step checklist mode,
  read-only, flow selection (`--select`), context sources, rewind/resume, task
  binding. Source the field list from the CLI run options so parity is mechanical,
  not hand-synced.
- **Quick look at the flows** - the flow picker shows each flow's shape (steps /
  seats / weight) at a glance, not just a name chip.
- **Readability pass** - fix the grey-over-bright contrast; the run page must be
  legible, not barely-visible.
- The **task-grounding propose interaction** (below) lives here: when the brief
  is empty / "from roadmap", the page proposes a ranked shortlist (the
  `suggestNext` engine) to pick from. (This subsumes the earlier standalone
  propose-UI question.)

Related already-done: **F1** (shipped on `feat/supervisor-task-grounding`) wires
a bound card's description + open checklist into the run brief, so a picked card
actually grounds the run - the prerequisite for the propose flow to be worth
anything. See supervisor-task-grounding.md.

---

## Epic D - Information architecture: Consult as home, a contextual orb elsewhere

> "that mission control should be replaced with Consult (keep the consult orb only
> on other pages that aren't there, and the first impression of the orb is to
> offer help on the relative path we're at, of course, still being able to do all
> - just like you suggest help when i have some file open (i saw you have
> install.sh open, should we deploy? etc…))"

The vision: the **home/landing surface is a Consult-style assistant**, not a
form. On every *other* page, a **consult orb** offers help **scoped to where you
are** (the current route / selected run / open file) as its first impression -
while still being able to run a full consult / any action.

**The tension (must decide, not assume).** "Replace Mission Control with Consult"
conflates **advise** (consult is read-only by design) with **do** (Mission
Control launches + monitors runs). Deleting the cockpit loses the do-surface.

**Defensible framing:** the home becomes a **conversational assistant that also
launches work** - consult that can hand off into a run (Epic C's Run page) or a
proposed start (task-grounding). The run cockpit isn't deleted, it's reached
*through* the assistant (or kept as its own route). Decide: merge vs relocate vs
replace.

**The contextual orb** (the genuinely new, delightful piece):
- Route-aware first impression: on the run-detail page -> "want me to explain
  this failure / suggest a fix?"; on the board -> "here's what I'd start"; on a
  file viewer with `install.sh` open -> "should we deploy?".
- Mirrors how an agent with context proactively offers the relevant next move
  instead of waiting for a fully-specified prompt. Still opens into full consult.
- Read-only-advisory by default (consult's contract); any *action* it offers
  routes through the existing gated paths (run launch, suggestion apply), never a
  new unguarded effect.

---

## Open questions / decisions to make before building

1. **A:** measure consult context-build cost first; cache only if the number
   justifies it. Graph stays deferred.
2. **D (biggest):** replace vs merge vs relocate Mission Control. Recommend
   *merge* (assistant-led home that launches runs), not delete. Needs its own IA
   sketch + the addendum (`amaco-ui-supervisor-addendum.md`) re-read.
3. **C:** mechanically derive the UI run-option list from the CLI options so
   parity can't silently drift again - is there a shared schema, or do we
   introduce one?
4. **Orb scope:** how much "suggest an action from the current path" is
   deterministic (route -> known affordances) vs a model call. Keep deterministic
   affordances first; model narration optional + gated (same posture as consult).
5. Sequencing across epics (below).

## Suggested sequencing

- **B (referenceable consult answers)** - highest value-per-effort, mostly wiring
  ids to links + a readability pass. Low risk. Do first.
- **C (run page + full flag parity)** - the parity gap is a concrete, bounded
  build; folds in the propose UI. Do second.
- **A (consult cache)** - only after measuring; cheap if warranted.
- **D (IA + orb)** - largest + most reversible-only-with-care; needs its own
  design pass (the merge-vs-replace decision). Do last / behind a design doc.

This doc is the capture; each epic graduates to its own slice plan when picked.
