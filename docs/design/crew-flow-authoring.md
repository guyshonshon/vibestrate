# Crew, providers & editable flows — design questions

Status: **design / decision doc** (not yet built). Captures the answers to a
round of "is our model right?" questions, grounded in the current code, with
recommendations and a phased plan. Companion to
[`runner-unification.md`](./runner-unification.md) and
[`flows-unification.md`](./flows-unification.md).

## Where we actually are (verified against the code)

- **Roles → provider** is global config (`roles:` in `project.yml`): each role
  (planner/architect/executor/reviewer/fixer/verifier) names a `provider`,
  `prompt`, `permissions`, `skills`. The **Crew** page edits this.
- **Providers are CLIs** (`type: cli | claude-code`, `command` + `args` +
  `settings`). There is **no first-class `model`** — a model is encoded in a
  provider's args (e.g. a `claude-opus` provider with `--model opus`). **Effort**
  (`effortMap[low|medium|high] → providerId`) swaps the provider **run-wide**.
  So today "which model" == "which provider", by design.
- **Flows are editable.** The Flow Builder already **reorders / adds / removes**
  steps (`moveStep`, `addStep`, `removeStep` → `replaceSteps` patch) and edits
  slots. Any role sequence is buildable — there is **no forced planner-first**;
  a "coder + reviewer" two-step flow is valid today.
- **Loops exist in the model** (`loop: {from,to,decisionStep,maxIterations}`) and
  express coder→reviewer→coder cycles — but **only in hand-authored builtins**.
- **Per-slot provider override** exists at **run time** (`--flow-slot
  builder=codex`, `slotProviders`) but is **not persisted** in the flow and not a
  per-flow editable default.

## The real gaps (what's missing vs. what was assumed missing)

1. **Loop authoring in the UI.** `flowPatchInputSchema` has no `loop` (nor
   `stage` / `skipWhenReadOnly`), so the builder can't create/edit the adaptive
   loop. Loops are builtin-only. → users "can't make a loop between roles."
2. **The default flow has no edit affordance.** Its Flows-page card is
   display-only; there's no "fork & edit" path, so it feels un-editable even
   though forking + the builder work for other flows.
3. **No per-role model / effort axis.** You can't say "planner = sonnet,
   reviewer = opus" without defining a separate provider per model. Effort is
   run-wide, not per-role.
4. **No persisted per-flow provider binding.** A flow can't say "in *this* flow,
   the builder seat defaults to codex" — only a global role default + a
   run-time override.
5. **No model escalation/promotion.** Nothing can "promote the coder to a
   stronger model after it fails review N times."

## Recommendations

### A. Provider vs. model vs. effort — make model a first-class, optional axis
Keep **provider = the CLI** (claude / codex / …). Add an **optional `model` and
`effort`** to the role (and slot) binding, threaded to the provider at run time
(claude-code already takes `--model`; cli providers via an arg template). This
gives "planner = claude/sonnet/low, reviewer = claude/opus/high" without a
provider per model — while staying backward-compatible (omit `model` → provider
default, exactly as now). Effort stays as a run-wide convenience that maps to a
model tier. **Decision needed** (see below).

### B. Make flows fully editable (incl. loops) + discoverable
- Extend `flowPatchInputSchema` with `loop`, `stage`, `skipWhenReadOnly` and add
  builder controls: mark a contiguous range as a loop, pick the decision step +
  bound; tag steps with a stage; toggle read-only-skip.
- Give the **default flow** a "Fork & edit" action (fork → project copy → open
  in the builder), so it's editable like any flow.
- Ship a couple of **starter templates** (e.g. "Coder + Reviewer (looped)") so
  the minimal flows people want are one click away.

### C. Per-flow provider binding (persist slot providers)
Let a flow definition store a per-slot `provider`/`model` default (still
overridable per run). Crew stays the global default; the flow can specialize.

### D. Model escalation on failure (the "promote the coder" idea)
Add an optional **escalation** to the loop: after K failed decision passes,
swap the body roles' model/provider to a stronger tier for the remaining
iterations (e.g. `escalate: { afterIterations: 2, toModel: "opus" }`). The
runner applies it when re-entering the loop. This is the genuinely new
capability and depends on (A) existing.

## Open decision (needs your call)

**Model axis:** do we (1) add an optional `model`/`effort` to role+slot bindings
(provider stays the CLI), or (2) keep "model == provider" and just make it easy
to define model-specific providers + pick them per role? Recommendation: **(1)**
— it matches how users think ("Claude, on Opus, high effort") and is required
for escalation (D).

## Phased plan

- **P1 — editable flows (no new runtime):** extend the patch + builder for
  loop / stage / read-only-skip; default-flow "fork & edit"; starter templates.
  Pure authoring; the runner already executes all of it.
- **P2 — model/effort axis:** add optional `model`/`effort` to role+slot
  bindings; thread to providers; surface in Crew + the builder. (Decision A.)
- **P3 — per-flow provider/model bindings:** persist slot-level defaults.
- **P4 — escalation:** loop `escalate` policy; runner swaps model tier on
  repeated failure; surface in the builder + the run timeline.

P1 is the highest-value, lowest-risk slice and directly answers "why can't I
reorder / loop / build a coder+reviewer flow" — mostly UI + a schema/patch
extension over capabilities the runner already has.
