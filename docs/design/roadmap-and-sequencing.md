# Roadmap & Sequencing — debated decisions

Status: proposed plan (debate doc). This is where the open ideas from the old
scratch notes get *answered*, not just filed. Each item below states the open
question, what the current system actually does, the decision + rationale, and
where it sits in the master sequence. Raw notes preserved in
`docs/archive/scratch-notes.md`.

The companion `docs/TODO.md` is the lean, sequenced checklist that points back
here for the "why".

---

## The spine: the core model rewrite is Phase 0

`CLAUDE_CORE_MODEL_REWRITE.md` is not just another feature — it's the data
model everything else speaks. It replaces the vocabulary and run payload:

```
Provider → Profile → Role → Crew      (was: role.provider, effortMap)
Flow slots → Flow seats               (was: step.slot + step.roleId)
slotProviders / stepProviders         → seatProfileOverrides / stepProfileOverrides
run-wide provider override            → crewId + profileOverride + stepProfileOverrides
```

**Why it goes first (the sequencing crux):**

1. **It's a breaking change and there are no users.** The rewrite doc says it
   explicitly: don't preserve old YAML, don't write migrations. That window
   closes the moment we ship features people depend on. Cheapest *now*.
2. **Almost every brainstorm idea touches a surface the rewrite reshapes:**
   - HTTP API → exposes the run payload (`slotProviders` → `stepProfileOverrides`).
   - Guides/Flows hub → shares flows; the rewrite is what *makes flows
     shareable* (seats instead of local role/provider ids).
   - Cloud models → the rewrite introduces **Profile** (model/power/budget/
     timeout), which is the correct home for any non-CLI model.
   - Context sources → ride on the run payload + prompt-builder.
   - Telemetry → the rewrite changes `runtime-metrics` + attribution and adds
     per-step resolved provider, which is the dataset worth exporting.
3. **Build-first = build-twice.** Documenting an API, publishing flows, or
   adding cloud providers on top of `slotProviders`/`effortMap` means redoing
   them after the rewrite.

So: **do the core rewrite first**, in its own 12-step order (schemas → flows →
resolver → orchestrator → CLI/API → UI → docs → tests). Everything below is
sequenced *after* it and assumes the new nouns.

**Vocab note for Phase 0:** freeze **Step = a Flow phase** (Plan/Implement/
Review). The Phase-2 Board introduces a card **Checklist** of **items** — a
*different* concept (the task breakdown). Don't reuse "Step" for checklist
items; the whole point of the rewrite is to stop overloading nouns. See §1.

One caveat to flag: the rewrite is large (schemas, flows, orchestrator, CLI,
API, UI, docs, tests in one sweep). It should be its own multi-commit branch
with the pause-rule final report, not stacked with feature work.

---

## 1. Board as a planning surface

**Open question (from notes):** Should the board split into "Plan" + "Board",
or become "Cycle" (task position in lifecycle) + "Board" (Trello-like planning)?
Let users add todos/plans, let AI "enhance" a core idea into a concrete nested
plan, and let the tool suggest the best next step.

**Current reality:**
- The board is *already* task-status-driven, not run-lifecycle-driven. Tasks
  exist independently of runs (`src/roadmap/roadmap-types.ts`).
- Columns split naturally: Backlog/Ready = planning; Queued→Running→Approval→
  Review→Blocked→Done = lifecycle.
- `roadmapItemId` already gives a macro→task ("epic") grouping; `dependencies`
  is a real DAG with cycle detection. **No `parentTaskId` nesting** (adding one
  is schema-breaking).
- **Proposals already exist** (`proposal-parser.ts` + `proposal-service.ts`):
  a markdown artifact that batch-creates roadmap items + tasks + dependencies,
  with dry-run + atomic accept + rollback.

**Decision: Board (planning) and Mission/Runs (execution) are different parts
of the system — keep them apart.** My earlier "one Board, two lenses" idea was
wrong; it would drag the run lifecycle back onto the planning surface (the
existing nav already separates **Board** from **Mission Control**, and that's
correct). Concurrency of runs lives in Mission/Runs, not on the Board.

### Three altitudes of planning (they don't compete)

| Altitude | Input → output | Who | Where |
|---|---|---|---|
| **Macro** | one idea → many cards (+deps) | proposal / roadmap-item | Board |
| **Meso** | one card → an ordered **Checklist** *inside it* | **"enhance"** (assist run, §8) | Board (the card) |
| **Micro** | one checklist item → implementation plan (find the service, design the json…) | **Planner Role** | the Run |

The Planner Role is *not* made redundant by enhance: meso = *what to build*,
micro = *how to build this one piece in this codebase*. Different jobs.

### Vocabulary

- **Checklist** = the ordered breakdown that lives *inside a card*; entries are
  **items** (todos). They stay in the card on purpose, so context isn't
  scattered across many cards.
- **Step** stays reserved for **Flow phases** (Plan/Implement/Review) — see the
  note in Phase 0. Never call a checklist item a "Step".

### "Enhance"

Not "reword it" — it **decomposes** a card into a concrete Checklist
(e.g. "Make health endpoint and test it" → `1. /health returns json`,
`2. test the endpoint`). An **assist run** (§8) produces the items, appended
into the card. (Distinct from macro proposals, which create *separate* cards.)

### Two execution doors

1. **Mission Control instant task** — ad-hoc brief, run now. No checklist needed.
   (Exists today.)
2. **Pick-up from the Board** — a card *with* a Checklist, run with a mode:
   - **Continuous** — the orchestrator carries the *whole* checklist
     autonomously. This is the point of an orchestrator: its **role-scoped
     agents are designed to pick up each item** and keep going, where a chat
     assistant would stall after one step.
   - **Step-by-step** — pause between items for the human. Reuses the existing
     pause/resume + control machinery.

### Board columns (coarse, *not* the run lifecycle)

`Planned · In-progress · Needs testing · Completed · Archived`. These are a
**coarse human kanban**, not the orchestrator's nine fine stages. Status is
auto-nudged (→ In-progress when a run starts; → Needs testing when it reaches
merge_ready), but the *fine* live lifecycle stays in Mission/Runs. Board and
Mission both show status, at different granularity — that's fine; mirroring the
*fine* stages onto the board is what we're avoiding.

### "Needs testing" = a non-blocking advisory state

Not an approval gate (those block). It means *the agent did its part but a
human should look* — e.g. a 3D/animation/UI task the model literally can't
*see*, or anything needing human taste/UX judgment. The run is **not stuck
waiting**; the card is flagged, and the human's verdict routes it to Completed
or back to In-progress. Model it as an advisory status, distinct from approvals.

### Promotion (Fork C) — link, don't move

A checklist item can be **promoted to its own card**; the new card keeps a
**"derived from" pointer** back to the origin item (and the item shows "→ card
X"). A relation, not a hard reparent — flexibility via linking.

### Suggest-next

A pure ranker over the *backlog* (not the queue), using priority +
dependency-readiness — sibling to `pickNextEntry`.

### Continuous-mode execution (RESOLVED — locked)

How the orchestrator walks a card's checklist autonomously. Two unlocks make
this clean instead of a special-case mess:

1. **Depth-per-item is a Flow decision, not a global constant.** A Flow declares
   which of its steps **repeat per checklist item** (its `checklistSegment`) vs.
   run once. "How thorough per item" = *which Flow you pick the card up with*.
   Fits the rewrite exactly (Flow = the recipe; now it also says which part
   loops). No hard-coded depth.
2. **Every run iterates a checklist.** A Mission-Control instant task is a
   checklist of **one synthetic item**. One execution model; today's behavior is
   the N=1 degenerate case. No separate "instant" vs "pick-up" code path.

**Run shape:**

```
ONCE      Plan / Architect (holistic) — sees the whole card + all items,
          sequences them, spots shared concerns.
PER ITEM  for each item, in order, in the SAME worktree:
            • micro-plan  (Planner role, scoped to THIS item — keeps the
                           Planner useful; this is the micro altitude)
            • implement
            • optional per-item check
            • commit (tagged with item id) + write a compact item summary
            • [between-item gate] continuous → go; step-by-step → pause
ONCE      Review / Verify / Fix (holistic, over the whole accumulated diff)
ONCE      Summary + final report (per-item outcomes table)
```

Which steps sit in the PER-ITEM band = the Flow's `checklistSegment`. The
orchestrator runs the segment once per item, everything else once.

**Locked decisions:**

- **One worktree, one run, context carried forward.** After each item write a
  *compact* summary (changes, key files, follow-ups) and feed it forward as a
  prior-artifact — **not** full diffs (token blow-up). Reuses
  `flow-context-builder` budget logic; `compact` control directive folds old
  summaries when budget tightens. *This is the make-or-break for "the agent
  doesn't get exhausted" — build and test it first (see §1 build order).*
- **Per-item commits** tagged with the item id → attribution, single-item
  revert, and board per-item status all fall out of git.
- **Failure = stop-on-failure, linear.** Item fails after bounded per-item
  retries → mark blocked, remaining items pending, run → blocked, surface to
  human. (Continue-past-failure needs a checklist *DAG* → deferred.)
- **Continuous vs step-by-step = the same loop + a between-item gate.** Reuses
  the existing `pauseRequested`/resume + control stream. Not a separate path.
- **"Needs testing" = non-blocking advisory marker** (`HUMAN_REVIEW: ADVISORY`,
  parsed like our decision markers but non-blocking). Run stays terminal/
  merge_ready; card → Needs testing; human verdict routes it (§1).
- **Budget guardrail** — per-run cap pauses the loop into a "needs attention"
  state (optionally downgrades to a cheaper Profile), never silent overrun.
- **Resumable** — per-item status + commits let a crashed/aborted run resume
  from the last completed item (extends resume-from-stage). → v1.1.

**v1 scope:** checklist on Task; unified loop (synthetic-1-item for instant);
Flow `checklistSegment`; holistic-plan → per-item band → holistic-review;
forward-carried summaries; per-item commits + attribution; linear +
stop-on-failure + bounded retries; continuous + step-by-step; advisory
Needs-testing; budget pause.

**Deferred (genuinely bigger):** checklist DAG (item deps) + continue-past-
failure + **parallel item execution** (worktree-per-item then merge — this *is*
§3's parallel/merge work); resume-from-item; mid-loop profile downgrade.

**Recommended first build step:** the per-item context-carry (compact summary →
forward prior-artifact) on a 3-item card, *before* wiring the full loop. If the
summaries are weak, item 5 won't know what item 2 did — that's the real risk,
not the loop.

**Sequence:** Board planning UI can start early; **enhance / pick-up execution
land after the rewrite** (they spawn runs that resolve Crew+Flow). → Phase 2.

**Safety:** unchanged — proposals/enhance are gated (dry-run + explicit accept);
checklist items don't auto-spawn runs.

---

## 2. Sources & context scoping

**Open question:** Scope an agent to specific sources (websites, PDFs, files);
optionally *enforce* web search.

**Current reality:**
- `buildRolePrompt` (`src/core/prompt-builder.ts`) composes rules + skills +
  prior artifacts + notes. `runtimeSkills` is the proven per-run attachment
  point. `PriorArtifact[]` is the content channel — but today it's **flow-only**.
- Path guard (`src/core/path-guard.ts`) is solid: project root + worktree only,
  symlink-escape proof, secret-like redaction. **No URL/PDF ingestion exists.**

**Decision:**
- **Don't enforce web search.** It's a *provider-specific capability* (Claude
  Code may have it; Codex may not). Faking a uniform "enforce web search" across
  heterogeneous CLIs is brittle and violates the rewrite's own principle that
  power/capability is provider-specific. Surface it honestly per-Profile where
  the provider supports it; hide it where it doesn't.
- **Do scope via supplied sources.** Add a per-run/per-task `ContextSource[]`:
  `{ kind: "file" | "url" | "pdf", ref, label }`. Materialize each into
  `runs/<id>/context/` (files copied path-guarded; URLs fetched; PDFs parsed
  locally to text), then inject through the existing `PriorArtifact` channel —
  generalizing the flow-only mechanism to any run. Reuse the flow context
  **token budget** logic.

**Safety:** URL fetch is the only *outbound* action here → opt-in, bounded, and
fetched content runs through secret redaction *before* entering a prompt. PDF
parsing is local. No silent network — consistent with the posture.

**Sequence:** rides on the *new* run payload + prompt-builder, so land it after
the rewrite (add `contextSources` to the new payload, not the old one). →
Phase 3.

---

## 3. Parallelism & merge

**Open question:** Can we run two tasks across two worktrees, then merge them?

**Current reality:**
- **Parallel execution already works.** The scheduler runs up to
  `maxConcurrentRuns` (≤16), each run in its own worktree+branch, with
  **file-overlap conflict detection** (`conflict-detector.ts`, warn/block).
- **Merge is the missing half.** Vibestrate explicitly never merges; runs land
  on separate branches and the user merges by hand (`final-report.ts`,
  `policy-engine.ts`).

**Decision:** The real deliverable is a gated **Integration surface** (CLI+UI),
not "parallel runs" (we have those):
- For a set of `merge_ready` runs, compute a **merge preview**: pairwise
  `git merge --no-commit --no-ff` dry-runs in a scratch worktree → surface
  conflicts (extends the existing file-overlap detector to real git results).
- Let the user **sequentially integrate** selected branches into a dedicated
  **integration branch** — never `main`, never auto-push, never auto-merge.
- The fully-automatic "fan-out subtasks then fan-in" is the larger *custom
  workflow DAG / parallel agents within one task* item — kept deferred (V1+).

**Safety:** stays inside the worktree-bounded, explicit-write model; integration
branch is a new artifact, main is untouched, no push.

**Sequence:** mostly independent of the rewrite (operates on branches/runs) but
the preview should read the new resolved run snapshot. Conflict-preview is the
high-value, low-risk first slice. → Phase 4.

---

## 4. HTTP API exposability

**Open question:** Can external callers drive the tool over HTTP? Big core
changes? (Notes flagged: "should be in changelog.")

**Current reality:** We're ~80% there already. Fastify @ `127.0.0.1:4317`, a
full route surface, and **`POST /api/runs` already takes a structured `RunSpec`
(not shell) and spawns a detached run** that outlives the request. It's mostly
UI-decoupled. Gaps: **no auth/token**, no version/contract, and the run payload
is about to change in the rewrite.

**Decision:** Don't build a new API layer — **harden and document the one we
have**:
- Freeze a versioned `/api/v1` contract **after** the rewrite stabilizes the
  payload (so we don't version a shape that's about to break).
- Add an **optional bearer-token** middleware that engages only for non-loopback
  binds; loopback stays no-auth + origin-allow-listed (unchanged default).
- Keep localhost-only by default. Remote/cloud exposure stays out of scope.

**Answer to "big core changes?":** No. The hard parts (detached spawn,
structured payloads, SSE) already exist. This is a version prefix + thin auth
middleware + API docs. Changelog-worthy, low effort.

**Sequence:** after the rewrite (payload stability is the prerequisite). →
Phase 1.

---

## 5. Guides / Flows hub + skill fetching

**Open question:** A hub to fetch/share guides (templates) and skills, given
this is local-first / serverless. Is hosting even possible?

**Current reality:** flows = builtin + `.vibestrate/flows/*/flow.yml`;
fork/patch/delete exist; **no remote fetch**. Same for skills (all local
discovery). The rewrite is precisely what makes a flow *portable* (seats, not
local role/provider ids).

**Decision:** You don't host a backend — the "hub" is the **npm-without-a-
registry** pattern:
- A **curated index** (a JSON manifest in a community git repo) pointing at raw
  flow-YAML / skill-folder URLs. Fetch = download + **schema-validate** +
  **shell-metachar/secret guard** + drop into `.vibestrate/`. Static hosting
  (GitHub raw / any CDN) is enough; no server, stays local-first.
- **This is unblocked *by* the rewrite:** a shared flow must not carry your
  local crew. Sharing flows full of `roleId`/`slotProviders` (today's shape)
  wouldn't port. Seats fix that — so the hub comes *after* the rewrite.
- **Skill AI-overview** ("is this helpful / already present / conflicting?") =
  a **read-only assist run** (§8) against the local crew + project context.

**Sequence:**
- **Phase 1:** single-flow import/export (URL or file, validated). Smallest
  useful slice, lands right after the rewrite.
- **Phase 4:** browsable curated index + skill fetching + AI-overview.

---

## 6. Non-CLI / cloud-API providers

**Open question:** Run models beyond local CLIs.

**What "local-first" actually means here (corrected):** local-first is about
**sovereignty, not egress**. The invariant is *there is no Vibestrate-operated
backend or relay* — the user runs an independent tool they fully control, and
nothing ever flows to a service **we** run. Whether the user's own machine
calls `api.openai.com` with the user's own key is *their* sovereign choice; it
does **not** violate local-first. A cloud API is simply **another provider type
whose destination is external**, alongside `cli` and a localhost proxy.

**Current reality:** provider union is `cli | claude-code`. A `type: "http-api"`
provider is straightforward. The rewrite's **Profile** (model/power/budget/
maxTokens/timeout) is the natural seam to hang any non-CLI provider off.

**Decision:** Treat non-CLI providers as first-class provider types, not a
deferred "tier":
- **Localhost proxy providers** (Ollama serve / LM Studio / vLLM): provider
  points at a `localhost` endpoint. No egress at all.
- **Cloud-API providers** (`type: http-api` → `api.anthropic.com`,
  `api.openai.com`, …): the user configures it with their own key. Just another
  destination.

The only *added responsibility* vs. a CLI (where the CLI owns the key + egress)
is that Vibestrate now holds the key and builds the request, so:
- **key via env-var ref only**, never written to YAML / artifacts / logs (reuse
  `secret-resolver` + redaction);
- **transparency** — UI marks the provider's destination as external so egress
  is never a surprise;
- defaults stay local (the spec's "no model APIs unless explicitly requested"
  is about *not auto-wiring* cloud, not about forbidding the user from choosing
  it).

**Sequence:** after the rewrite (needs Profile). Build both non-CLI provider
types with the Provider/Profile work. → Phase 3.

---

## 7. Telemetry / quality dataset (Langfuse etc.)

**Open question:** ML/telemetry integration for agent compliance + quality;
build a dataset of which model is best at which task.

**Current reality:** we already compute per-role runtime metrics, cost/tokens,
stage latency, and the cross-run `overview-aggregator`. The Quality Arbitration
flow already produces head-to-head model judgments. The rewrite adds **per-step
resolved provider/profile**, which is exactly the missing dimension.

**Decision:** keep it **local-first and opt-in**. Add an exporter that maps our
existing events/metrics to **OpenTelemetry traces** (Langfuse ingests OTLP). No
data leaves by default; the user configures an endpoint explicitly. It's an
exporter over data we already have — not new instrumentation.

**Sequence:** after the rewrite (per-step provider in the trace is the valuable
part). Low priority. → Phase 5.

---

## 8. The "assist" primitive (folds in "AI helpers / claude -p")

Several features above need a small AI call: enhance-a-plan (§1), suggest-next
(§1), skill AI-overview (§5). Rather than three bespoke paths, define **one
internal primitive**: a **one-shot, read-only, structured-output run** against
the default crew/profile. The notes' "AI integration helpers (claude -p)" is
this primitive — not a standalone phase. Define it once in Phase 2, reuse it.

---

## Master sequence

| Phase | Work | Depends on | Effort |
|------|------|-----------|--------|
| **0** | **Core model rewrite** (Flow/Step/Seat/Crew/Role/Profile/Provider) | — | Heavy, own branch |
| **1** | API hardening + `/api/v1` docs (§4) · single-flow import/export (§5) | 0 | Small |
| **2** | Board (planning, separate from Mission) + card Checklist + enhance + pick-up exec (continuous/step-by-step) + suggest-next (§1) · **assist primitive** (§8) | 0 | Medium |
| **3** | Context sources: files/URLs/PDFs (§2) · non-CLI providers: localhost proxy + cloud-API (§6) | 0 | Medium |
| **4** | Integration / merge-preview surface (§3) · Guides hub browse + skill fetch + AI-overview (§5) | 1,2 | Medium |
| **5** | Opt-in OTel/Langfuse exporter (§7) | 0 | Small |
| **deferred** | Custom workflow DAGs & parallel agents in one task · Docker/cloud **execution** backends · GitHub/GitLab PR creation · real WhatsApp adapter | — | Large/optional |

---

## Decisions locked

- **Sequencing** — Phase 0 (whole core rewrite) ships first on its own branch,
  all internal steps end-to-end without stopping between them, per
  `CLAUDE_CORE_MODEL_REWRITE.md`. No interleaving with feature work.
- **Local-first = sovereignty, not egress** (§6) — cloud-API providers are a
  first-class provider type (user's own key, no Vibestrate-operated backend);
  built in Phase 3 with the Provider/Profile work, not deferred.
- **Board ≠ lifecycle** (§1) — Board is planning only (Trello of cards +
  in-card Checklists); execution lifecycle + concurrency stay in Mission/Runs.
  Three planning altitudes (macro/meso/micro). "Step" reserved for Flow phases;
  card breakdown is "Checklist / items". "Needs testing" is advisory, not
  blocking. Promotion is a link, not a reparent.
- **Continuous-mode execution** (§1) — every run iterates a checklist (instant
  task = synthetic 1 item); depth-per-item is the Flow's `checklistSegment`;
  holistic-plan → per-item band → holistic-review; one worktree with compact
  forward-carried summaries; per-item commits; linear stop-on-failure;
  continuous/step-by-step = same loop + between-item gate. Full v1/deferred
  scope in §1.

## Open questions for you (genuinely your call)

_None outstanding — the board model, model-access line, and sequencing are all
settled above. Remaining unknowns are captured as the open spike (§1)._
