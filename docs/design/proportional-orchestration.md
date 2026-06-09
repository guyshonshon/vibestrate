# Proportional orchestration (the orchestrator sizes the work and the checks)

Status: **Proposed (design only - nothing shipped). Revised after an independent
adversarial review (recorded at the end); the review materially changed the
design - read it.** This extends the spine
([`responsible-orchestrator.md`](./responsible-orchestrator.md)) and generalizes
the shipped, upgrade-only persona flow bias
([`orchestrator-personas.md`](./orchestrator-personas.md)).

## Thesis

The orchestrator *is* the staff engineer. Its first job on any task is the one a
human lead does before touching code: **size the work** - how much process this
change warrants - and **decide what "validated" means** for this change in this
project. Today it does neither: it runs a fixed seven-phase flow and a hardcoded,
project-blind command list on every task. That is a conveyor belt, not supervision.

The headline correction from the adversarial review, baked into this revision:
**you may size DOWN the thinking, but you may not size down the scrutiny except on
evidence from the actual diff.** Skipping the planner/architect turns (pure cost,
recoverable) is safe; dropping review/verify/validation is only safe when the
*real changed files* say the change is inert. The risk floor must read the diff,
not the user's prose.

### Motivating evidence (a real run)

Run `20260609-071618` - "make a `test.txt` file with a few words":

| Phase | Wall time |
|---|---|
| planner | 191s |
| architect | 120s |
| executor | 506s (inflated by the now-fixed write-permission bug) |
| reviewer | 159s |
| verifier | 105s |
| validation | full `pnpm lint` + `typecheck` + `test` (all failed, all irrelevant) |
| **total** | **~20 min** for a four-word text file |

Two independent cost levers are bundled in that number: (a) five sequential model
turns, (b) the full irrelevant test suite. They are separable, and (b) is the
bigger, safer win.

## Front vs back: the distinction the whole design rests on

A flow has two halves with completely different safety profiles:

- **Front (planner, architect):** the orchestrator *thinking* before it writes.
  Skipping it costs quality of approach, not scrutiny of output. A mis-skip is
  recoverable (the implement turn just had less guidance) and is still caught
  downstream by the back gates and the per-turn diff gate. **Front phases are
  flow-optional - safe to lean on a sizing judgment.**
- **Back (review, verify, validation):** the orchestrator *checking* what was
  produced. Dropping these ships less-checked code. A mis-drop is the failure the
  spine exists to prevent. **Back phases are floor-mandatory - they may only be
  leaned when the actual diff proves the change inert.**

Every decision below is an application of this split.

## Why "give it confidence to skip phases" is the wrong lever

Letting the model skip phases because it feels sure is the spine's named failure:
laundering model confidence as supervision. Dropping the `verify` gate from a flow
definition *is* removing a code-enforced gate - just at design time instead of
runtime. So the sizer is allowed to lean the **front** on judgment, but the
**back** is gated by deterministic, diff-derived evidence - never by a model's
sense that the task is small.

---

## Part A - The flow sizer (front-only judgment, diff-floored back)

### A1 - Sizing the front (where the latency win is, and it's safe)

The orchestrator picks how much thinking a task needs:

| Zone | Decided by | Front |
|---|---|---|
| Obvious-trivial | deterministic fast-path (no model call): single edit to a provably-inert file (see B3 allowlist), under a size bound, no protected path | skip planner + architect |
| Gray zone | one cheap model "sizing" turn (fast profile, low effort) returning `{frontPlan, reasoning, signals}` | lean front per its call |
| Obvious-standard/complex | default | full front |

The gray-zone sizer's authority is **strictly the front**. It can say "skip the
planner/architect for this." It **cannot** say "skip review/verify" - that is not
in its output schema. A confidently-wrong sizer therefore wastes or saves a
planning turn; it can never delete scrutiny of its own output. This neutralizes
the "confident-misclassification" failure mode: the back gate is decided by the
diff (A2), not the sizer.

### A2 - Sizing the back (diff-aware floor; the part that must be honest)

The back gates (review/verify/validation) are governed by a **post-implementation,
diff-derived risk floor** - evaluated against the *actual changed files*, not the
task text:

- After `implement`, match the changed paths against a **protected-path matcher**:
  `src/**/auth/**`, `**/security/**`, migration dirs, `package.json`/lockfiles, CI
  config, infra/IaC, and (conservatively) any code-class file in B3's taxonomy.
- **Touches a protected path, or any non-inert file -> the back gates run**, in
  full, regardless of how the front was sized or what the task text said.
- **Only when the entire diff is provably inert** (B3 allowlist: docs/text/assets)
  may the back lean to format-only.

This is the core fix from the review. Today `classifyTaskRisk`
(`personas.ts:119-127`) is a case-insensitive **substring match on the task
description**. That is fine for *upsizing* (a miss merely under-reviews an
already-`default` flow) and unsafe for *downsizing* (a miss skips review/verify on
real sensitive code - e.g. "update the user lookup" edits `src/auth/session.ts`
but contains no risk keyword). So the task-text classifier stays **upsizing-only**;
descent of the back gates is decided on the diff.

**Prerequisite (does not exist today):** a path-based protected-path matcher. The
codebase has only `.env`-path + token-shape *content* guards in `diff-service.ts`;
there is no "does this diff touch auth/migrations/manifests" matcher. Building it
is a precondition for any back-gate descent - not a reuse.

### A3 - The `express` flow

`express` = **lean front** (implement, scoped validation) with the **back
conditional on A2**: if the diff is inert, it ends there; if the diff touches
anything real, review/verify are scheduled before merge-readiness. So `express` is
not "a flow that drops verify" - it is "a flow that defers the back-gate decision
to the diff." A misrouted non-trivial change still gets reviewed because its diff
trips the floor.

### A4 - Overrides + honesty

`--flow` forces (sizer never overrides); `--select` keeps the LLM picker; explicit
config always wins. Every sizing decision and the diff-floor evaluation are
recorded as evidence (events + artifact, like the shipped `persona.upgraded`), so
the choice is auditable. The run-assurance verdict already degrades honestly when
gates are absent (`run-assurance.ts:198-227`: no verify -> caps at
`partially_verified`); the design must **not** let a leaned-back run read as fully
checked.

---

## Part B - Project-aware, scoped validation

### B1 - The language/stack census (read-only first)

A GitHub-linguist-style breakdown by share, from a static extension->language map
(no Ruby `linguist` dependency) plus manifest/lockfile detection:

```jsonc
{
  "languages": [ { "language": "TypeScript", "share": 0.90 }, { "language": "HTML", "share": 0.05 } ],
  "primaryStacks": ["node-typescript"],     // a SET, not a scalar (polyglot repos)
  "buildSystems": ["pnpm"],
  "manifests": ["package.json", "pnpm-lock.yaml", "tsconfig.json"]
}
```

Ships **first as a read-only surface only** (a "languages" bar on the project
page). Useful on its own, zero execution risk, and lets the detector be validated
against real repos before anything runs off it.

### B2 - Ecosystem -> candidate validators (propose, then approve-per-script-hash)

The census derives **candidate** validators per ecosystem/intent (node: `tsc`,
`vitest`/`jest` from scripts; python: `pytest`/`ruff`/`mypy`; java: `mvn`/`gradle`;
rust: `cargo`; go: `go test`/`vet`). Trust model, corrected by the review:

- A derived command is **proposed**, never auto-run. Explicit `commands.validate`
  always wins.
- **One-time confirmation is insufficient.** A confirmed string like `pnpm test`
  dispatches to whatever `package.json`'s `test` script says *at run time*;
  `cargo test` runs `build.rs`, `pytest` imports `conftest.py` - all look benign,
  so verb-denylisting the command string is theater. Instead: a *derived*
  (non-human-typed) validator routes through the broker as **`require_approval` on
  first execution per resolved-script-hash** (hash the actual script body it
  dispatches to), and re-prompts when that body changes. That is the real
  supply-chain guard; it scopes approval to "the thing actually executed changed,"
  not "a new command was proposed."
- All execution stays through the existing action broker, worktree-bounded; the
  server never executes an HTTP-supplied command string (unchanged rule).

### B3 - Per-change scoping (fail-safe taxonomy: allowlist the inert, everything else is code)

The validator picks which checks run for *this* diff. The review showed an
extension table is undecidable for safety (`.json` can be `package.json` scripts;
`.sql` can be a migration; `.yaml` can be CI/k8s - all behavior). So the default
is **inverted to fail safe**:

- **A small, conservative allowlist of provably-inert extensions** - `.md`, `.txt`,
  `.rst`, images, fonts - may drop to format-only (prettier/markdownlint/link/spell).
- **Everything else - including all `.json` / `.yaml` / `.toml` / `.sql` / config /
  data - is code-class:** it gets at least one real check for its stack
  (typecheck/test), or, if no validator is known, the run surfaces an **assurance
  cap** ("no validator known for `.xyz`; nothing ran") - never a silent skip
  reported as validated.
- Ambiguous or unrecognized -> treated as code-class (more checking, not less).

**Honesty about scope:** B3 keys on the changed files' types, not the dependency
graph. It is **not** test-impact analysis - a TS edit that breaks a Python contract
test in a monorepo will be mis-scoped. So B3 must **log what it skipped and why**
(no silent narrowing), and full test-impact selection stays in the cut-list. When
in doubt about a stack/monorepo, run the configured `commands.validate` as-is.

---

## How the two halves compose

```jsonc
{
  "projectProfile": { /* B1 census, cached, refreshed on manifest change */ },
  "sizing": { "frontPlan": "skip-planner-architect", "reasoning": "...", "signals": ["..."] },  // A1
  "backFloor": { "protectedPathsTouched": false, "changeClasses": ["docs"], "backGates": "format-only" }, // A2
  "validationPlan": { "ran": ["markdownlint"], "skipped": ["vitest"], "skipReason": "no code files changed", "source": "configured" } // B3
}
```

Persona and sizer compose by precedence: **deterministic risk floor (persona
`riskSignals` for upsizing + the diff-aware protected-path floor for any back
descent) sets the minimum; the sizer picks only the front within it.**

## Non-negotiables (the guardrails)

1. **Front-only judgment.** A model sizing decision may lean the front
   (planner/architect); it may never drop a back gate (review/verify/validation).
2. **Back descent is diff-derived, never task-text.** Review/verify/validation may
   lean only when the *actual changed files* are provably inert (B3 allowlist) and
   touch no protected path. Task-text risk classification is upsizing-only.
3. **Fail safe to more checking.** Unknown extension, unknown stack, ambiguous
   change, or detector uncertainty -> treat as code-class and run the gates / use
   the configured commands. Never default to skipping.
4. **No silent skip; honest verdict.** A skipped check is logged with its reason; a
   code change with no known validator is an assurance cap, never "validated." A
   leaned run must not read as fully checked.
5. **Derived validators are approved per resolved-script-hash**, re-prompted on
   change; explicit `commands.validate` always wins; all runs go through the broker.
6. **No confidence dial.** Nothing here raises confidence or weights evidence;
   proportionality changes *what runs*, never *what a result means*.

## Reuse vs build-new (corrected)

- Reuse: `chooseRunFlow`, the `--select` picker, `validationProfiles`,
  `commands.validate`, the per-turn diff gate, the assurance-cap machinery.
- **Build new (not reuse):** a **diff-aware protected-path matcher** (none exists;
  only `.env`/token content guards do) - the precondition for A2; a `low`-complexity
  `express` flow; the language census/detector; the per-script-hash approval gate.

## Minimal first slice (reordered by the review: model-free + zero-execution-risk first)

1. **B3 scoping over the existing `commands.validate`** - model-free, proposes no
   new command. "No code files changed -> skip the configured test commands; run a
   format/link check or nothing." The biggest latency win at near-zero risk;
   it kills the `test.txt` validation cost immediately.
2. **`express` lean-front + the deterministic inert-extension fast-path** (no model
   call). Catches the obvious-trivial class for free. Back stays full until A2 ships.
3. **The census as a read-only "languages" surface** (B1, no derivation).
4. **B2 derivation behind the per-script-hash approval gate.**
5. **The protected-path matcher (A2), then the gray-zone sizer (A1)** - last, and
   **no back-gate descent ships until A2 exists.** Until then, sizing leans the
   front only.

## Cut-list (deferred or rejected)

- **Gating back-gate descent on task-text risk** - rejected (the central flaw; it
  is upsizing-only).
- A **confidence dial** to skip gates - rejected (contradicts the spine).
- **Auto-running** a derived validator, or approving it once instead of
  per-script-hash - rejected (supply-chain / fail-open).
- An extension **denylist** ("these are safe to skip") - rejected for an inert
  **allowlist** (fail-safe default).
- Full **monorepo dependency-graph / test-impact selection** - deferred; B3's
  type-keyed scoping with logged skips is the cheap first step.
- Bundling the Ruby **`linguist`** - rejected; small internal extension map.

## Open questions

- **Protected-path matcher coverage** - the floor is only as good as the path list;
  needs a conservative, reviewed default set and a project override.
- **Sizer break-even** - on the median (non-trivial) task the gray-zone sizer only
  *adds* a turn; it may rarely be worth running. Measure before shipping A1; B3
  alone may be most of the win.
- **Census freshness** - cache where, invalidate on what (manifest change).
- **Polyglot scoping** - `primaryStacks` as a set helps, but per-change scoping
  still can't see cross-language test dependencies (see B3 honesty note).

## Adversarial review (recorded)

An independent Opus review (pre-implementation) found the original draft's central
flaw: it reused `classifyTaskRisk` - a **substring match on the task text** - as an
"absolute floor" to gate **downsizing**, when that classifier is only safe for
**upsizing**. Quoted: *"substring-on-task-text is a fine trigger for 'add more
review' and a dangerous trigger for 'remove review'... the risk lives in the diff,
not the task text. A real authn change ships through the lightest pipeline because
the user didn't type a keyword."* It also flagged the gray-zone sizer as
confidence-laundering, the change-class taxonomy as undecidable at the extension
level (with an internal contradiction against `effort-heuristic.ts`, which leans
`package.json` *high*), and one-time validator confirmation as the wrong trust
model (scripts dispatch to project-controlled config at run time).

All findings were accepted. The resulting changes: (1) the sizer's authority is
restricted to the **front**; (2) **back-gate descent is gated on a new diff-aware
protected-path matcher**, not task text, and does not ship until that matcher
exists; (3) the change-class taxonomy is **inverted to a fail-safe inert
allowlist**; (4) derived validators require **per-script-hash approval**; (5) the
slices are reordered so the model-free, zero-execution-risk scoping ships first and
the sizer last. The review confirmed the per-turn diff gate is flow-independent (so
`express` cannot leak secrets or write `main`) and that the assurance verdict
degrades honestly - the residual risk is a human trusting a `partially_verified`
badge on a "trivial" task, which non-negotiable #4 addresses.

A second adversarial review will be recorded here before the first slice that
runs derived commands (B2) or descends a back gate (A2).
