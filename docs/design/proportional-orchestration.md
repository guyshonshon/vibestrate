# Proportional orchestration (the orchestrator sizes the work and the checks)

Status: **Proposed (design only - nothing shipped).** This generalizes the
shipped, upgrade-only persona flow bias
([`orchestrator-personas.md`](./orchestrator-personas.md)) into a two-directional,
deterministically-floored sizing decision, and replaces the static, project-blind
validator with a project-aware, change-scoped one. It extends the spine
([`responsible-orchestrator.md`](./responsible-orchestrator.md)): the orchestrator
owns judgment, bounded by deterministic evidence.

## Thesis

The orchestrator *is* the staff engineer. Its first job on any task is the one a
human lead does before touching code: **size the work** - how much process this
change actually warrants - and **decide what "validated" means** for this change
in this project. Today it does neither. It runs a fixed seven-phase flow and a
hardcoded command list on every task regardless of size or stack. That is the
opposite of supervision; it is a conveyor belt.

Two failures, one root cause (no proportionality):

1. **The flow is fixed and only ever gets heavier.** Flow selection is
   *upgrade-only* by construction (`flowWeight` exists solely to prevent a
   downgrade), and no built-in flow is lighter than `default` (all are
   `complexity: medium`/`high`). So a trivial task pays the full
   plan -> architect -> implement -> validate -> review -> fix -> verify DAG.
2. **The validator is static and project-blind.** Validation is a literal command
   list (`commands.validate: ["pnpm lint", "pnpm typecheck", "pnpm test"]`). There
   is **no language or build-system detection anywhere in the codebase**. A Java
   project runs `pnpm lint` and fails; a one-line `README` edit triggers the full
   test suite.

### Motivating evidence (a real run)

Run `20260609-071618` - the task was "make a `test.txt` file with a few words":

| Phase | Wall time |
|---|---|
| planner | 191s |
| architect | 120s |
| executor | 506s (inflated by the now-fixed write-permission bug) |
| reviewer | 159s |
| verifier | 105s |
| validation | full `pnpm lint` + `typecheck` + `test` (all failed, all irrelevant) |
| **total** | **~20 min** for a four-word text file |

Even with the write bug fixed, the floor is ~5 sequential model turns plus the
full project test suite. For writing a text file. The cost is not "low
confidence" - it is structure applied without judgment.

## Why "give it confidence to skip phases" is the wrong lever

The tempting fix - let the model skip phases when it feels sure - is precisely the
failure mode the spine names: laundering model confidence as supervision. Skipping
a review because the model is confident in its own work is how a bad change
merges. The correct lever is to size the flow **up front** from *what the task is*
(deterministic signals + bounded judgment), not to skip a code-enforced gate
**mid-flight** from *how the model feels*. Sizing the pipeline and bypassing a
gate are different acts; only the first is allowed here.

---

## Part A - The flow sizer (floored hybrid)

The orchestrator classifies every task into a size and selects a proportional
flow. Three zones, by cost and certainty:

| Zone | Decided by | Result |
|---|---|---|
| **Obvious-trivial** | deterministic fast-path (no model call) | the new `express` flow |
| **Obvious-risky** | deterministic risk signals (already ships) | floored at `default`, upgraded per persona |
| **Gray zone** | one cheap model "sizing" judgment | proportional flow, fail-closed to `default` |

**Obvious-trivial fast-path (free, instant).** Pure, deterministic: a change that
is a single new/edited non-code file, below a small size bound, matching no risk
signal, and on no protected path -> `express`. No model call is spent to decide
this. This catches the `test.txt` case at zero latency.

**The deterministic floor (non-negotiable).** Risk signals (the persona's
`riskSignals`: auth, payment, migration, secrets, concurrency, ...) set a *minimum*
weight class. The sizer may descend **only when no risk signal fires**. A risky
task can never be sized below `default`, regardless of how simple it looks or what
the model judges. This is the existing upgrade-only rule, kept as the guardrail;
the new capability is descent *within* the floor.

**The gray-zone sizer (cheap judgment, the part the user can't do).** This is the
product value: a "traditional vibe coder" cannot judge whether a change needs a
heavy flow - the orchestrator does it for them. For tasks that are neither
obviously trivial nor obviously risky, run **one** cheap classification turn (fast
profile, low effort, tight structured output) that returns:

```jsonc
{
  "size": "trivial | standard | complex",
  "flow": "express | default | panel-review",
  "reasoning": "one line, human-facing",
  "signals": ["new-file", "no-tests-touched", "single-module"]  // what it keyed on
}
```

Rules: the sizer can pick a *lighter* flow than `default` only if the deterministic
floor allows it; it can pick *heavier* freely; **uncertain -> `default`** (fail
closed). Its decision is recorded as evidence (a `flow.sized` event + the
reasoning + signals, exactly like the shipped `persona.upgraded`), so turning the
sizer on visibly changes which flow runs and says why - or it failed, cheaply.

**The `express` flow (new built-in, `complexity: low`).** The minimum honest loop:
`implement -> scoped-validate` (optionally a single light `review` for code).
No separate planner/architect turn, no verify gate. It is selectable like any
flow and forkable.

**Overrides (unchanged precedence).** `--flow` forces and the sizer never
overrides it; `--select` keeps the existing LLM picker; explicit config always
wins. The sizer is the new *default* behavior when nothing is forced, replacing
"always `default`".

### Sizer cost guard

The sizer must not reintroduce the latency it removes. Obvious-trivial and
obvious-risky never reach the model. Only the gray zone pays a sizing turn, and
that turn runs on a fast/cheap profile with low effort and a tiny prompt. If the
sizing turn would cost more than the phases it could save (a heuristic budget),
skip it and use `default`.

---

## Part B - Project-aware, scoped validation

Replace the static command list with a two-layer model: **detect the project**,
then **scope to the change**. The orchestrator (the "Validator" judgment) decides
*what "validated" means here*, instead of running one fixed list everywhere.

### B1 - The language/stack census (linguist-style)

On first run (and refreshed on demand), compute a repository **language census**
- a GitHub-linguist-style breakdown by share:

```jsonc
{
  "languages": [
    { "language": "TypeScript", "share": 0.90, "files": 412 },
    { "language": "HTML",       "share": 0.05, "files": 18 },
    { "language": "CSS",        "share": 0.03 },
    { "language": "Markdown",   "share": 0.02 }
  ],
  "primaryStack": "node-typescript",
  "buildSystems": ["pnpm"],          // from lockfile + package.json scripts
  "manifests": ["package.json", "pnpm-lock.yaml", "tsconfig.json"]
}
```

Detection reads manifests/lockfiles, not guesses: `package.json` +
`pnpm-lock.yaml`/`yarn.lock`/`package-lock.json` -> the node package manager;
`pom.xml`/`build.gradle` -> Maven/Gradle; `pyproject.toml`/`requirements.txt` ->
Python (+ `pytest`/`ruff`/`mypy` if declared); `Cargo.toml` -> Cargo;
`go.mod` -> Go; `composer.json` -> Composer; `Gemfile` -> Bundler. The
extension-share census uses a static extension->language map (a small internal
table; we do **not** pull in the Ruby `linguist`). Unknown extensions are counted
as `other`, never forced into a language.

This is also a genuinely useful read-only surface on its own (a "languages" bar on
the project page), independent of validation.

### B2 - Ecosystem -> candidate validators (detect, then propose - never auto-run)

The census derives **candidate** validation commands per ecosystem and per
intent (format / lint / typecheck / test / build):

| Stack | format | lint | typecheck | test |
|---|---|---|---|---|
| node-typescript | `prettier --check` | `eslint` | `tsc --noEmit` | `vitest`/`jest` (from scripts) |
| python | `black --check` | `ruff` | `mypy` | `pytest` |
| java-maven | - | - | - | `mvn -q test` |
| rust | `cargo fmt --check` | `cargo clippy` | `cargo check` | `cargo test` |
| go | `gofmt -l` | `go vet` | - | `go test ./...` |

**Hard rule: detection proposes; it never auto-executes a derived command.** A
derived command is surfaced at setup and in the dashboard for the human to confirm
or edit, and it **populates `validationProfiles`** (which already exist). An
explicit `commands.validate` always wins. Running a guessed command unconfirmed is
fail-open and a side-effect risk (a wrong test target, a destructive script); we
fail closed.

### B3 - Per-change scoping (a `.txt` is not a `.ts`)

The validator picks *which* checks to run for *this* diff, keyed on the changed
file types - not the whole suite every time:

| Change class | Examples | What runs |
|---|---|---|
| code | `.ts` `.py` `.java` `.rs` `.go` | typecheck + test for that stack (scoped to the touched package where detectable) + lint |
| markup / docs | `.md` `.txt` `.rst` | formatting / spell / link-check / markdown-lint - **not** the test suite |
| config | `.json` `.yml` `.toml` | parse + schema validation (no behavior tests) |
| data / query | `.csv` `.sql` | syntax / schema validation where a tool exists |
| asset / binary | images, fonts | presence/size sanity only |

So the user's example: a `.txt` file gets a syntax/format/link sanity check, not
`pnpm test`. A `.ts` change gets typecheck + the relevant tests.

**Scoping floor (fail closed).** A *code* change always gets at least one real
check (typecheck or test) when one is known for its stack; only non-code changes
may drop to formatting-only. A code change in an *unknown* stack does **not**
silently skip - the run surfaces "no validator known for `.xyz`; nothing ran" as a
cap on the run-assurance verdict, never a false "validated".

---

## How the two halves compose

```jsonc
// per-run, recorded as artifacts + events
{
  "projectProfile": { /* B1 census, cached, refreshed on manifest change */ },
  "sizing": { "size": "trivial", "flow": "express", "reasoning": "...", "signals": ["..."] },  // Part A
  "validationPlan": {                                                                          // Part B3
    "changeClasses": ["docs"],
    "ran": ["markdownlint", "prettier --check"],
    "skipped": ["vitest"],
    "skipReason": "no code files changed",
    "source": "derived" | "configured"
  }
}
```

The persona upgrade and the sizer both touch flow selection; they compose by
precedence: **deterministic risk floor (incl. persona `riskSignals`) sets the
minimum; the sizer picks altitude within it.** A `security` persona on a task that
touches auth stays floored at `security-review` even if the diff looks tiny.

## Non-negotiables (the guardrails)

1. **Deterministic risk floor is absolute.** The sizer may descend below `default`
   only when no risk signal fires; it can never lower a floored/upgraded flow.
2. **Size up front, never skip a gate mid-flight.** The sizer chooses which phases
   run before execution. It does not let a confident model bypass a code-enforced
   gate (policy / diff / validation / approval / budget) once running.
3. **Detection proposes; it never auto-runs a derived command.** Explicit
   `commands.validate` always wins; a guessed command is confirmed by a human
   before it can execute, and only through the existing broker, worktree-bounded.
4. **No silent skip on code.** A code change with no known validator is surfaced as
   an assurance cap, never reported as validated.
5. **Every sizing and scoping decision is logged with its signals/reasoning** -
   evidence, not vibes - so the choice is auditable and reversible.
6. **No confidence dial.** Nothing here adds a knob that raises confidence or
   weights evidence; proportionality changes *what runs*, never *what a result
   means*.

## Reuse, not reinvent

- Sizer: `chooseRunFlow` + `flowWeight` + the deterministic risk classifier + the
  existing `--select` LLM picker. New: a `low`-complexity `express` flow and the
  descent path (today the weight check only blocks descent).
- Validation: the existing `commands.validate` + `validationProfiles`. New: the
  census/detector that *populates* them, and the per-change scoping selector.
- Evidence: the same event/artifact pattern as `persona.upgraded` /
  `workflow.selected`.

## Minimal first slice (ship cheap wins first; earn the rest)

1. **Census + ecosystem derivation, propose-only** (B1 + B2). Read-only, high
   value, no execution risk. A "languages" surface + suggested validators at setup.
2. **Per-change validation scoping** (B3). The biggest single latency win on a real
   repo - stop running the suite for a doc edit. Floored.
3. **The `express` flow + the deterministic obvious-trivial fast-path** (Part A,
   no model call). Catches the `test.txt` class for free.
4. **The gray-zone sizer** (the cheap classification turn). Last, because it is the
   most complex and the one that most needs the floor + fail-closed behavior
   proven first.

## Cut-list (deferred or rejected)

- A **confidence dial** to skip gates - rejected (contradicts the spine).
- **Auto-running** an unconfirmed derived validation command - rejected (fail-open
  side-effect risk).
- Full **monorepo per-package dependency-graph** scoping and **test-impact
  selection** (run only tests affected by the diff) - deferred; B3's
  touched-package heuristic is the cheap first step.
- Bundling the Ruby **`linguist`** dependency - rejected; use a small internal
  extension map.

## Open questions

- **Sizer break-even.** When is the gray-zone sizing turn cheaper than just running
  `default`? Needs a measured heuristic, not a guess.
- **Polyglot repos.** A repo that is 60% TS / 40% Python - per-change scoping
  handles it (key on the changed files' languages), but the "primaryStack" label
  is fuzzy; may need to be a set, not a scalar.
- **Census freshness.** Cache the census where, and invalidate on what (manifest
  change? every N runs?) without restating it every run.
- **Persona x sizer precedence** - stated above (floor then altitude), needs a test
  that a risky-but-tiny task stays floored.

## Security note (Tier-2 gate for the build)

Part B derives and runs shell commands per project. The build of B2/B3 is a
security-sensitive change and will get an independent adversarial review before
merge (per the agent protocol Tier-2 rule): detection must never execute an
unconfirmed command; all validation runs through the existing action broker,
bounded to the run worktree; a derived command that looks destructive
(non-test targets, `rm`, publish/deploy verbs) is refused, not proposed.

## Adversarial review

To be recorded here when the design is pressure-tested before the first
implementation slice (mirroring `orchestrator-personas.md`).
