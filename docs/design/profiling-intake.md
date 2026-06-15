---
title: Profiling - model-independent structured intake of project settings
status: proposed
created: 2026-06-16
related: [durable-project-memory.md, responsible-orchestrator.md]
---

# Profiling (structured intake)

## Vision

Vibestrate as an **E2E tool**: a user has a flow (e.g. "build a website for niche
X"), and *fills it with the data the flow needs* - name, brand color tokens,
niche, methodology - and the flow runs. The "Profiling" system is how Vibestrate
**gathers that data by asking the user concrete, structured questions** (like the
clarifying questions an assistant asks), **persists it durably**, and **reuses it
across runs**. Crucially: **model-independent** - Vibestrate owns the Q&A loop; a
provider only *optionally* drafts a question or *generates a default*.

The mental model: a flow declares the *shape* of what it needs (typed params);
the **project profile** holds the durable *answers*; **intake** is the Q&A that
fills the gaps.

## What already exists (composes - cited)

This is mostly **assembly**, not greenfield:

- **Typed flow params** (`flow-schema.ts:113-164`): `flowParamSchema` already has
  `type` (string/number/boolean/enum/path), `description`, `required`, `default`,
  `values` (enum choices), `secret`. This IS the question schema.
- **Validation + substitution** (`prompt-params.ts:61-107`): `resolveFlowParams`
  coerces/validates supplied values, flags missing-required, rejects unknown;
  `{{params.name}}` substitution into task + step instructions; secrets become
  `[secret:name]` placeholders (never inlined).
- **Intake surfaces today**: CLI `--param k=v` (`run.ts:38`), `POST /api/runs`
  `body.params` (`runs.ts:54-56`), the dashboard **Composer** already renders a
  param form from the schema (`Composer.tsx:475-512`).
- **Human-in-the-loop machinery**: approval gates - durable per-run requests,
  CLI + UI + notifications, run pause/resume on a decision
  (`approval-service.ts`, `approval-types.ts`). The *transport* we extend.
- **`consult`** (`consult.ts`): a one-shot, read-only, typed-JSON advisor with an
  ad-hoc provider override; already proposes `VIBESTRATE.md` updates.
- **`runAssist<T>`** (`assist-runner.ts:38-160`): a one-shot, **model-independent**
  provider call that returns validated JSON, broker-gated + read-only. **This is
  the "generate a default" primitive** - no new provider plumbing needed.
- **Supervisor personas** (`personas.ts`): the advisory posture that can *frame*
  the intake ("your CTO is asking…").

## What's missing (build)

1. **Durable project profile + storage.** Params are supplied *fresh each run*;
   nothing persists them. No `.vibestrate/project-profile.json`.
2. **A structured ask-the-user intake** beyond approve/reject - multi-question,
   typed answers, with optional generated suggestions.
3. **A generate-default hook** wiring a param to `runAssist`.
4. **Param seeding from the profile** (use stored answers as defaults; only ask
   for what's missing).

## Design

### 1. The project profile (durable data, not prose)

A new `.vibestrate/project-profile.json`: a project-global map of **param name ->
typed value**, validated against the flow param types. Source of truth is the
JSON (structured data); a *human-readable reflection* can appear in `STATE.md`
(machine-owned) - never authored in prose.

```jsonc
{
  "schemaVersion": 1,
  "values": {
    "name":         { "value": "Acme",            "setBy": "user",      "at": "..." },
    "niche":        { "value": "SaaS",            "setBy": "user",      "at": "..." },
    "color_tokens": { "value": "#0E7490,#F59E0B", "setBy": "generated", "at": "..." },
    "methodology":  { "value": "tdd",             "setBy": "user",      "at": "..." }
  }
}
```

- **Project-global flat namespace** (V1): `name`/`niche` are reused by any flow
  that declares a param of that name. Simple, matches "fill my project's data
  once." (Open question: per-flow scoping if names collide across flows.)
- **Provenance** (`setBy: user | generated | default`): a *generated* value is
  visibly model-suggested, so the user knows what to trust.
- **Secrets never stored raw.** A `secret: true` param's profile value is an
  `env:NAME` reference (the existing pattern), not the literal - even though
  `.vibestrate/` is gitignored. Writes go through the secret-redaction guard.

### 2. Param resolution order (seeding)

At run start, each declared param resolves in precedence:

```
explicit --param / body.params   >   project profile   >   default   >   INTAKE
```

If, after that, a **required** param is still unset:
- **Interactive** (a human is attached) -> raise a structured INTAKE request.
- **Unattended / CI** -> **fail fast** with a clear "missing profile field(s):
  name, niche - set them with `vibe profile set …` or in Project Settings."
  Never hang waiting for input in unattended mode.

### 3. Structured intake (the new Q&A loop)

Model the intake on the **approval transport** (durable per-run request, CLI + UI
+ notification, pause/resume), but carry **questions + typed answers** instead of
approve/reject. New run-state transition `intake-pending` (sibling of
`waiting_for_approval`).

```ts
type IntakeQuestion = {
  param: string;            // the flow param name
  type: "string"|"number"|"boolean"|"enum"|"path";
  prompt: string;           // the param's `description`, framed as a question
  choices?: string[];       // enum `values`
  default?: string|number|boolean;
  secret?: boolean;
  generate?: GenerateHint;  // present -> offer a "Generate" affordance
  suggested?: string;       // a generated draft (from runAssist), user edits/accepts
};
type IntakeRequest = { id; runId; questions: IntakeQuestion[]; status; ... };
type IntakeAnswer  = { param: string; value: string|number|boolean; from: "user"|"generated" };
```

The **questions are generated deterministically from the flow's param schema** -
NOT by a model. This is the crux of model-independence: Vibestrate builds the
form, renders it in its OWN surfaces, and collects the answers; a provider is
never in the answer loop.

- **CLI**: drive `@inquirer/prompts` from the question types (`input`/`number`/
  `select`/`confirm`/`password`). Reuses the `flow-run-wizard` pattern, which
  currently skips params (`flow-run-wizard.ts` - gap).
- **Dashboard**: the Composer param form already exists; extend it to (a) prefill
  from the profile, (b) show a "Project Settings" editor, (c) show a "Generate"
  button per generatable field.
- On submit: validate via `resolveFlowParams`, persist to the profile, resume.

### 4. Generate a default (model-independent helper)

Extend `flowParamSchema` with an optional `generate` hint:

```ts
generate?: { instruction: string }  // e.g. "Generate a cohesive color palette for a {{niche}} brand"
```

When a param has `generate` and the user clicks "Generate", call **`runAssist`**
with that instruction (interpolating other already-known profile values) + a
type-appropriate output schema. The result is a **suggestion** (`setBy:
generated`) the user reviews/edits/accepts - **never auto-committed**. Works on
any configured provider; if none/offline, the field stays a normal manual input.

### 5. Methodology folds in here (the deferred memory item)

The project **methodology** (TDD/BDD/incremental) is just a profile field with a
known catalog:
- A small `known-methodologies` catalog maps `tdd|bdd|incremental` -> concrete
  planning guidance.
- The planner reads `profile.methodology`; if set to a known value, the *expanded*
  guidance (only that one) is injected into the planner prompt - bounded, so it
  doesn't reintroduce context bloat.
- The advisor may *suggest* a methodology it infers from the codebase (test-heavy
  -> propose `tdd`) through the same gated profile-set path.

This unifies "memory -> planner -> flow": declared in the profile, planned by the
planner, optionally enforced by a `tdd` flow's red gate.

## Model-independence (the crux, restated)

| Concern | Who owns it |
| --- | --- |
| What to ask (questions) | **Vibestrate** - deterministic, from the flow param schema |
| The Q&A surface (form/prompt) | **Vibestrate** - its own UI/CLI, never a provider tool |
| Collecting + persisting answers | **Vibestrate** |
| Drafting a suggestion / generating a default | **Provider (optional)** via `runAssist` - any provider, never required |

So profiling works identically on claude / codex / gemini / local - because the
loop is Vibestrate's and the model is an optional helper. This is the same
inversion as the durable-memory work.

## Safety

- **Secrets**: secret params are `env:NAME` references in the profile, never raw;
  redaction guard on write; never inlined into prompts (existing `[secret:name]`).
- **Generated values are never auto-applied** - always user-reviewed (a model
  hallucinating a brand color must not silently become project truth).
- **Never-auto-purge**: the profile is user data; editing a value supersedes (keep
  provenance/history); never silently wipe a profile.
- **Unattended fail-fast**: missing required fields in CI -> a clear error, never a
  hang. Profiling is an interactive-mode feature; non-interactive needs the
  values pre-set.
- **Concurrency**: profile writes go through the same `file-mutex` the ledger uses.

## Build slices (each shippable + verified)

| Slice | What | Risk |
| --- | --- | --- |
| **P1** | Project profile schema + store (`project-profile.json`, mutex-guarded, secret-safe) + `vibe profile get/set/list` CLI + a read API. | Low-med (new data store). |
| **P2** | Param seeding: resolve params from the profile; unattended fail-fast on missing required. | Med (touches run start). |
| **P3** | Structured intake request + `intake-pending` state + CLI prompts + dashboard form (prefill from profile, "Project Settings" editor). | Med-high (run pause/resume, UI). |
| **P4** | Generate-default hook: `generate` param hint -> `runAssist` -> reviewed suggestion. | Med (provider turn; must stay optional + reviewed). |
| **P5** | Methodology: catalog + planner injection (bounded) + advisor suggestion. | Low-med. |

Order P1 -> P2 -> P3 -> P4 -> P5. P1+P2 alone deliver value (persist + reuse +
fail-fast); P3 adds the interactive "supervisor asks you"; P4 the generation; P5
the methodology.

## Open questions / risks (for the design review)

1. **Profile scope**: project-global flat namespace vs per-flow. Global is simple
   but risks param-name collisions across flows (two flows mean different things
   by `name`). Per-flow is safer but heavier and fragments "fill once". Decide.
2. **Intake transport**: extend the approval machinery vs a parallel intake
   service. Reuse is DRY but approval is binary; carrying typed Q&A may strain it.
3. **When to intake**: just-in-time at run start vs a dedicated up-front "set up
   your project" step vs both. Both is best UX but more surface.
4. **Generated-value trust + cost**: a provider turn per generate is fine
   on-demand, but must never be on a hot path or auto-fired. Confirm it's strictly
   user-initiated.
5. **Profile vs durable memory overlap**: the profile (config the user sets) and
   STATE.md (derived history) are different - keep them separate stores with a
   one-way reflection (profile -> STATE.md human view), not a merge.
6. **Schema evolution**: a flow changes its params; the profile has stale keys.
   Keep unknown keys (don't purge), surface "unused profile fields".

## Decision (pre-review draft - SUPERSEDED below)

Adopt the profile-as-typed-param-values + Vibestrate-owned-intake + optional-
provider-generate model. Build P1 -> P5.

---

## Reviewed plan (FINAL - supersedes the slices/design above)

An adversarial Opus 4.8 review found the centerpiece **already exists** and the
draft carried two correctness bugs. The reframe: **"Durable Param Memory," not
"Intake."**

### What the review changed

1. **The interactive Q&A loop already ships.** `promptMissingFlowParams`
   (`run.ts:758`) already drives `@inquirer/prompts` deterministically from the
   param schema; `orchestrator.ts:602` already fails fast on missing-required
   unattended. So **cut** the `intake-pending` run state (23-file status blast
   radius, no meaningful assurance verdict for an input-paused run) and the
   approval-transport extension and the "new Q&A loop." The real gap is
   **persistence + prefill** - which needs no state-machine change.
2. **Scope: global-flat is a data-integrity bug.** Param names are unconstrained
   (`flow-schema.ts:113`), so two flows' `name` silently cross-contaminate.
   **Default to flow-id-namespaced keys** `{flowId}.{param}`, with an opt-in
   `shared: true` (param-level) for genuinely cross-flow fields (e.g. `niche`,
   `brand`). Namespacing is the safe default; "fill once" still works for shared.
3. **Secrets: store an env-ref, collect an env-var NAME.** There is NO env-ref
   path for flow `secret` params today (the `env:NAME` resolver exists only for
   notification/provider keys). The draft conflated "redact on write" (drops the
   value -> param can't resolve next run) with "store `env:NAME`" (keeps a working
   pointer). **The honest path: a secret param's profile entry collects an
   env-var NAME, validates it's set, and stores `env:NAME` - a raw secret never
   touches the JSON.** Raw secrets are never typed into the profile form.
4. **CI seeding is first-class, not an afterthought.** `.vibestrate/` is
   gitignored, so a profile set interactively can't reach CI by commit. **The
   primary CI path is scriptable: `vibe profile set name=Acme niche=SaaS` and/or
   `VIBESTRATE_PARAM_*` env** - zero interactive step. P2's fail-fast is only a
   trap if this isn't documented as the main automation path.
5. **Methodology + advisor-writes-profile: CUT from this phase.** "The advisor may
   suggest a methodology through the gated profile-set path" is the deferred
   durable-memory **Slice 4** risky-write reincarnated. Keep the advisor OUT of
   profile writes here. Profile = user-set config, full stop. Methodology stays in
   the deferred Slice-4 track.
6. **Generate hook stays, honestly scoped.** `runAssist` is genuinely safe
   (caller-invoked, broker-gated, can't auto-fire) and model-independent. Keep it
   - but it's a **convenience, not a safety gate**: "generate then accept" a
   brand color is not meaningfully safer than auto-apply, so don't claim it as a
   safety property (fine for low-stakes fields).

### The model-independence claim - scoped honestly

The core loop is genuinely model-free **for flat param fill** (deterministic
questions from the schema, Vibestrate-owned surface, provider only optional for
generate). It does **not** generalize to a general clarifying-question system: the
moment a flow needs a *follow-up* question conditioned on a prior answer, you'd
either hard-code branching in the schema or reach for the model (breaking the
claim). V1 is flat fill + reuse; don't oversell it.

### Build order (FINAL)

| Slice | What | Risk |
| --- | --- | --- |
| **P1** | `.vibestrate/project-profile.json`: **flow-id-namespaced** keys (+ opt-in `shared`), mutex-guarded (reuse `withFileMutex`), secret entries store **`env:NAME` only**. `vibe profile get/set/list` (scriptable) + a read API + dashboard "Project Settings" view. | Low-med |
| **P2** | Seed the profile into the **existing** resolution: `explicit --param/body > profile > default > [existing promptMissingFlowParams \| existing fail-fast]`. Reuse `run.ts:758` + `orchestrator.ts:602` verbatim. Document `vibe profile set` / env as the CI seed. | Med (run start) |
| **Prefill** | Composer param form + CLI wizard **prefill from the profile**; persist on submit. **No new run state, no new transport.** | Low-med |
| **P4** | `generate` param hint -> `runAssist` -> reviewed suggestion (convenience, on-demand, gated). | Med |
| ~~P5 methodology~~ | **CUT** - stays in the deferred durable-memory Slice 4 track. | - |

Order: P1 -> P2 -> Prefill -> P4. Same user-visible value ("fill my project once,
reuse it"), ~20% of the original risk, zero state-machine surgery, and the two
load-bearing bugs (cross-flow `name` collision, raw-secret-into-JSON) fixed.
