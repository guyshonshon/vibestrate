# Shape + Execution program — end-to-end phased design

Status: **proposed (2026-06-20)**, for execution in a FRESH session with
workflows + multi-agents. Sequence: model-first, F1 deferred (the user's call,
adjustable). This is the consolidated plan from the 2026-06-19/20 build + the
design dialogue that followed. It supersedes treating Shape as a flow.

This doc is written to be **self-contained** so a new session needs no
re-discovery. Read it first, then execute phase by phase.

---

## 0. The model (the vocabulary we converged on)

Keep the primitive count small. There are **four** nouns, nothing more:

- **Task** — the WHAT you type ("Make a mini e-commerce").
- **Flow** — the HOW (the process: plan / build / review). Task-agnostic.
  **Flows now also carry skills per phase** (P2). A flow can be content-rich
  ("WhatsApp Integration") or content-agnostic ("Express", "Default") — same
  primitive.
- **Crew** — WHO runs it (roles on profiles filling seats).
- **Skill** — KNOWLEDGE (portable domain rules), attached to flow phases.

**Shape is NOT a primitive and NOT a flow.** It is Vibestrate's universal
capability: *derive the missing specifications by asking the right questions*.
It is applied as a **pre-flow enrichment over whatever flow the user picked**,
when the task is under-specified. The flow author never anticipates the
questions ("which payment provider?") — Vibestrate derives them from the task +
codebase. There is **no Recipe primitive** (rejected: too much to master).

Canonical run: `Task + Flow (+ Crew) -> [Shape enrichment if under-specified] ->
the chosen Flow executes with the spec as input`. Example: "Make a mini
e-commerce" + **Express** -> Vibestrate shapes (asks payment/accounts/catalog) ->
**Express builds it from the spec**. Shape feeds the flow; it never replaces it.

Execution must be **model-agnostic** and **sandboxed** (P3/P4): no safety
mechanism may depend on a specific provider (codex's Seatbelt was the wrong
answer; "hardening" was a false fix).

---

## 1. What is ALREADY shipped (do not rebuild) — on `main`, not pushed

Commits `a03bb190 .. 369cd11e` (7 ahead of origin). The new session can `git log`
these. Already done + tested (2032 green, build green):

- **Shape chain substrate**: `src/shape/shape-chain.ts` (read questions, submit
  answers, approve->roadmap, roadmap->proposal), `src/server/routes/shape.ts`,
  `vibe shape` CLI, the `questions` structured contract
  (`flow-output-contracts.ts`), card fields `acceptanceCriteria`/`est`.
- **In-run UI**: gap-questions screen `RunGapQuestions.tsx` (Guided-Document
  design), live supervisor/agent node-tree `RunTree.tsx` ("Tree" inspector tab),
  in-run chain actions `ShapeRunActions.tsx`, in-run draft review `ShapeReview.tsx`.
- **Adaptive trigger**: `classifyPlanWorthy` (`flow-sizing.ts`) + the step in
  `chooseRunFlow` (`select-workflow.ts`); config `adaptiveShape`.
- **Editable roadmap deps** with a server-side cycle guard
  (`roadmap-service.patchTask`).
- **De-flow (partial)**: a `hidden` flow flag (`flow-schema.ts`) +
  `discoverSelectableFlows` filters the shape flows out of every picker; the 3
  shape flows are `hidden: true`. They still launch by id.
- **3 robustness fixes** to flow contract parsing (fences, single-key unwrap,
  underscore ids) in `flow-arbitration.ts` + `flow-output-contracts.ts`.

### Known gotchas the new session must respect
- **Provider config**: `codex-fast` at `power: minimal` 400s on codex 0.134.0
  (image_gen/web_search + minimal effort). Local fix applied to the gitignored
  `.vibestrate/project.yml` (`minimal -> low`). Not a Shape bug.
- **The dashboard serves built `dist/ui`** (memory: rebuild-after-edits). A UI
  change is invisible until `pnpm build`; the **server process** must be
  restarted to pick up new routes/schemas (run-entry spawns fresh per run, so
  the run-entry code IS current; the long-lived `vibe ui` server is not).
- **`.vibestrate/` is gitignored** — never commit project config / run data.
- **Cosmetic**: a read-only single-turn flow (intake) ends status `blocked`
  (no review step) even though it succeeded — fix in P1 (label honest).
- Verify each phase with `pnpm typecheck` (CLI + UI) + `pnpm test` + `pnpm build`.
  The `approval-service` test is a known flake (passes in isolation).

---

## 2. The phases

Each phase is a self-contained workstream with its own multi-agent workflow
(scout -> Tier-2 review where flagged -> implement -> review -> verify). Run them
in order; each ends green + committed + ff-merged (no push) per the repo
convention.

### P1 — Shape realignment: enrichment over the chosen flow (model correctness)
**Goal.** Stop routing to a standalone `shape-intake`/`shape`/`shape-roadmap`
flow that *replaces* the chosen flow. Make Shape a **pre-flow phase** that
derives a spec and **hands it to whatever flow the user picked** as context.

**Changes (seams).**
- `chooseRunFlow` (`select-workflow.ts`): the adaptive `shaped` branch must NOT
  return `shape-intake` as the flow. Instead it must mark the run "needs
  shaping" and keep the chosen/selected/default flow as the eventual executor.
- Orchestration: a run that needs shaping runs the **shape enrichment** (emit
  questions -> consult-answer -> derive spec artifact) and then launches/continues
  into the **chosen flow** seeded with the spec via `contextSources`/brief. Reuse
  the existing chain machinery (`shape-chain.ts`, the questions contract, the
  gap-questions UI, the answers->context plumbing) — only the *handoff target*
  changes (the user's flow, not a `shape` flow).
- Collapse `shapeFlow`/`shapeRoadmapFlow` into the enrichment phase. The
  `shape-intake` substrate can remain as the question-emitter, but it must feed
  the chosen flow. The roadmap/decomposition path stays for genuinely large
  builds (adaptive depth), not the simple case.
- Decouple shaping from flow-*selection*: `Task + Flow` and "needs shaping?" are
  orthogonal. Any flow (Express, Default, a domain flow) can be shaped.
- Fix the `blocked`-on-successful-intake cosmetic.

**Buildable now** (no F1 needed) via the run-chain: shape run -> chosen flow run,
seeded. **F1 (durable pause)** would make it one continuous run; deferred.

**Workflow shape.** scout the exact `chooseRunFlow`/orchestrator handoff +
`contextSources` seeding -> Tier-2 review (it changes run routing) -> implement
-> review -> verify with a fake-provider chain test asserting the chosen flow
runs with the spec as context.

**Acceptance.** "Make a mini e-commerce" + `--flow express` -> shaped -> Express
runs with the spec; selecting a flow is honored, not replaced; a well-specified
task skips shaping.

### P2 — Flow owns skills (de-Recipe)
**Goal.** A flow phase can declare skills, injected into that step's prompt.
Confirms no Recipe primitive.

**Changes.** Add `skills?: string[]` to the flow **step** schema
(`flow-schema.ts`); thread into the per-step prompt assembly (`prompt-builder.ts`
/ the runtime-skills merge already used for run-level skills, `loadSkills`).
Surface in the flow builder UI + `vibe flows show`.

**Workflow shape.** scout the prompt-assembly + skills-loading seam -> implement
-> review -> verify (a flow with a step skill injects it; a step without is
unchanged).

**Acceptance.** Authoring a flow can bind a skill to a phase; the agent on that
step gets the skill; no new top-level primitive.

### P3 — Container execution backend (model-agnostic isolation) — EPIC, Tier-2
**Goal.** Run a run inside a disposable **Docker container**; blast radius = the
container, independent of provider. This is the real "run unattended + trust" fix.

**Decided model (do not re-litigate).**
- **Mounts**: ONLY the run's git **worktree** (read-write) + the provider's
  **auth credential** (read-only, e.g. `~/.codex`). Nothing else from the host.
- **Network**: open to the model API (the container *needs* egress; isolation is
  filesystem+process, not network). Optional egress allowlist later.
- **Container, not VM**: Linux namespaces give filesystem+process isolation
  cheaply; gVisor/Firecracker is a later upgrade for kernel-escape paranoia.
- Aligns with the existing `docs/design/docker-backend.md` direction.

**Changes (seams).** `execution.backend` already has `local-worktree`; add a
`container` backend. The detached run (`detached-run.ts` / `run-entry.ts`) must
be able to run inside / spawn into a container with the worktree + auth mounted.
Honest `appliedSandbox`-style reporting (`provider-apply.ts`). Docker is an
**opt-in dependency** (respect minimal-deps posture — degrade to local-worktree
when docker is absent, with a clear message).

**Workflow shape.** scout the run-launch/detached-run path + the docker-backend
design + the auth/credential location (PROBE codex's actual auth path, do not
assume) -> **Tier-2 security review (mandatory)**: adversarial brief on mount
scope, secret crossing, egress, escape, fail-closed-when-docker-missing ->
implement behind the `container` backend flag -> review -> verify (a run executes
in a container, writes confined to the worktree, the diff returns, no host access).

**Acceptance.** A run with `execution.backend: container` runs the agent in a
container that can only touch the mounted worktree; works for codex AND claude;
falls back honestly when docker is unavailable.

### P4 — Permission modes (model-agnostic policy gateways)
**Goal.** `auto / accept-edits / ask / read-only` as Vibestrate-enforced modes,
model-agnostic, layered on P3. Replaces the codex-Seatbelt-specific answer.

**Changes.** The Action Broker (`safety/action-broker.ts`) gates a closed set
today with default-ALLOW + fail-OPEN loader and NO agent-shell-command kind.
This phase: define the permission modes as the policy layer the orchestrator
enforces (what it does with the agent's output: auto-apply vs review vs refuse),
make the relevant gate **fail-closed**, and bind the modes to the run + the
container (the container is the hard wall; the modes are the soft policy). Be
honest: per-command pre-execution interception is impossible with codex (opaque
subprocess); claude streams `tool_use` (display-only today) and *could* be a
future interactive take-over — out of scope here (it fights unattended).

**Workflow shape.** scout the broker + permission-profiles + the read-only clamp
-> Tier-2 review (security) -> implement the modes + fail-closed gate -> review
-> verify.

**Acceptance.** A run's permission mode is enforced (read-only refuses writes;
ask/accept-edits/auto behave per spec) regardless of provider; the broker no
longer fails open on the gated path.

### P5 — Execute phase (the payoff)
**Goal.** Actually run the shaped/roadmapped work safely inside P3+P4 — the
original "Phase 1 Execute". Acceptance criteria become real gates.

**Changes.** Run the approved roadmap cards (or the single shaped flow) with the
spec/architecture as context, supervisor monitoring, loops per card, inside the
container with the chosen permission mode. Tie `acceptanceCriteria` to the
validation runner so "done" is checkable (the F3 idea, scoped to execution).

**Workflow shape.** scout the roadmap-card-run path + validation runner ->
implement -> review -> verify end-to-end (shape -> roadmap -> execute a card in a
container, validate against its acceptance criteria).

**Acceptance.** From a shaped roadmap, a card builds in a container under a
permission mode, validates against its acceptance criteria, and surfaces honestly.

### F1 — Durable pause/resume (TRACKED, not built)
The foundation that would make Shape one continuous run (pause mid-run for
answers) instead of the run-chain, and make every approval gate reboot-safe.
Weeks-scale: atomic durable writes + an ordered last-completed marker +
checkpointing in-memory control state + a re-entrant flow-walk. **Out of this
plan.** Revisit once P1-P5 prove the value.

---

## 3. Execution approach (workflows + multi-agents)

Per phase, the new session runs a **Workflow** roughly:
1. **Scout** (parallel read-only agents) -> a code-grounded map + the keystone
   verification. GATE on any keystone.
2. **Tier-2 adversarial review** (Opus 4.8, fresh context) for any phase touching
   run-routing, security, network, or schema (P1, P3, P4 minimum). Apply findings
   BEFORE building.
3. **Implement** the coupled core (one coherent author; the main loop), using the
   scout map; verify with `pnpm typecheck`/`test`/`build` continuously.
4. **Review** (multi-lens adversarial) of the diff + **tests**.
5. **Verify** live where observable (rebuild + restart `vibe ui`), commit,
   ff-merge to `main` (no push), one phase per merge.

Do NOT parallel-fan-out the coupled core (shared files break integration); fan
out scout, review, tests, and independent UI. This is the pattern that worked
this session.

---

## 4. Out of scope / explicitly deferred
- F1 durable pause/resume (above).
- Per-command interactive "take-over" for claude (fights unattended; only if an
  interactive mode is later wanted).
- Recipe primitive (rejected).
- Artifact inline edit (needs a guarded browser->fs write route + Tier-2);
  reviewable read-only is shipped.
- Pushing to origin (the user pushes deliberately).

## 5. Risks (load-bearing)
- **P1**: a run that re-derives from the bare task instead of consuming the spec
  (verify the chosen flow actually reads the spec context).
- **P3**: secret crossing the container wall; egress; fail-OPEN when docker is
  missing — the Tier-2 review must clear these. codex auth path is `[guess]` until
  probed.
- **P4**: the broker is default-ALLOW + fail-OPEN today; the new gate must be
  fail-closed or the mode is theater.
- **General**: every flow/run-routing change ripples across CLI + UI + server
  enums (this bit us repeatedly); change them in lockstep, lean on typecheck.
