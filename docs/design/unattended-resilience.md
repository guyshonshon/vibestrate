# Design: Unattended-run resilience + budget control

Status: **U1-U4 SHIPPED. U1 (0.7.13) count/time ceilings; U2 (0.7.14)
rate-limit/transient retries; U3 (0.7.15) resilience fallback; U4 (0.7.16) budget
cap actions (downgrade-model / reduce-effort).** The remaining `--unattended`
preset + attended `pause` are optional polish (see U4 below). Owner: maintainer.
Decisions confirmed (see "Decisions" below).

**Note on "pause" (refined during U4):** pausing-for-a-human at a limit only
helps an *attended* run - an unattended overnight run with no one to resume would
just sit forever. So the genuinely-unattended behavior is **downgrade / stop +
the hard ceilings**, which is what U1+U4 deliver. `onLimit/onExhausted: pause`
is therefore an attended-run convenience, deprioritized below the shipped path.

The goal: make a run (or a continuous overnight queue of runs) safe and reliable
to leave **unattended**. Two failure families block that today:

1. **Transient provider problems** - rate limits (HTTP 429 / "quota"), and
   non-rate blips like Claude's "server temporarily unavailable" / "overloaded"
   / 5xx / connection resets / timeouts. These are *recoverable*, but today they
   either fail the whole run (after the 0.7.12 honesty fix) or hang. An overnight
   run should **ride them out**, not die on a momentary hiccup.
2. **Unbounded cost / loss of control** - the daily USD cap exists but is
   **stop-only** and **unmeasured for local CLI providers** (no token metrics),
   so the dollar ceiling effectively does not bind for the common local case. An
   unattended run needs a ceiling that **always binds**.

This doc is the full plan: a failure taxonomy, the policy per class, exact retry
semantics, the fallback + escalation model, the budget ceilings, and the
**complete settings surface**. It reconciles with what already shipped
(`retries`, `continueOnError`, `assessTurnResult`, the spend cap).

---

## Principles

- **Recoverable != fatal.** Infrastructure problems (rate limit, 5xx, overload)
  are retried; logic/auth/usage problems are not (retrying won't help).
- **Never lose control.** There is always a ceiling that binds *without* relying
  on measured cost - turn count and wall-clock.
- **Never lose context.** A retry resumes, it does not restart from zero. (See
  "Context preservation" - the flow context is already artifact-backed, so this
  is mostly true today; session reuse makes it fully true and cheaper.)
- **Explicit, never silent.** Every retry, backoff, fallback, downgrade, and cap
  hit is recorded as an event and visible in the dashboard/CLI. No magic.
- **Honest accounting.** Every attempt is a real invocation and is metered.
- **Off by default where it changes behavior; on by default where it is pure
  robustness.** Resilience retries default ON (conservative); hard ceilings
  default OFF (opt-in), so nothing changes for existing users until they set one.

---

## Failure taxonomy

Every turn outcome is classified into exactly one class. Classification reads the
provider result (`exitCode` + `stderr`/`stdout` for CLI; HTTP `status` +
`Retry-After` for http-api) or the thrown error.

| Class | Examples | Detection |
| --- | --- | --- |
| **success** | exit 0 + non-empty output | `assessTurnResult` (shipped) |
| **control** | user abort, approval rejected, spend-cap stop, broker deny | the existing control-signal classes (shipped) |
| **rate-limit** | HTTP 429, "rate limit", "quota exceeded", "too many requests" | http-api: `status === 429`; CLI: stderr regex |
| **transient** | HTTP 5xx/408, "server temporarily unavailable", "overloaded", "connection reset", "ETIMEDOUT", network errors | http-api: `status >= 500 \|\| 408`; CLI: stderr regex |
| **hard** | bad flag, auth (401/403), missing binary (ENOENT), schema/parse failure, empty output, any non-zero exit not matching above | the default - "none of the above" |

- **control** always propagates and is **never** retried.
- **rate-limit** and **transient** are **auto-retried** (resilience retries).
- **hard** is **not** auto-retried (retrying a bad flag won't help) - it is only
  retried if the flow step opted in with `retries: N`, then tolerated by
  `continueOnError` or it fails the run (all shipped behavior).

Detection patterns are a built-in default set **plus** a user-extensible list
(`resilience.transient.patterns` / `resilience.rateLimit.patterns`), because CLI
providers phrase errors differently and we cannot enumerate them all up front.
Unknown non-zero exits stay **hard** (fail-closed: we do not retry things we do
not understand, to avoid burning budget on a real error).

---

## Per-class policy

```
classify(turn):
  success  -> commit
  control  -> propagate (never retry)
  rate-limit -> resilience-retry (honor Retry-After), then fallback, then escalate
  transient  -> resilience-retry (exponential backoff), then fallback, then escalate
  hard       -> flow `retries` budget (if any), then continueOnError/fail (shipped)
```

"escalate" = `resilience.onExhausted`: **fail** the run honestly (default) or
**pause** it for a human (so an overnight run waits instead of dying when a
provider is down for a long time).

---

## Retry semantics ("what happens on a retry")

This is the part to get exactly right.

1. **Same turn, resumed - not restarted.** Only the failing turn re-runs. All
   prior steps' outputs/artifacts are intact; the run does not roll back.
2. **Context is preserved on two levels:**
   - **Flow context (always):** Vibestrate rebuilds each turn's context from
     persisted artifacts + the run brief, so a retry sends the *same* context as
     the first attempt. Context is never lost at the flow level - this is already
     true today.
   - **Provider session (when supported):** if the provider supports session
     reuse (e.g. claude-code `--resume <sessionId>`), a resilience retry
     **reuses the session** so the model keeps its server-side conversation state
     and we send a delta, not the full packet again (cheaper, faster, no loss).
     One-shot CLIs with no session re-send the same packet (no content loss, just
     re-cost). Governed by `resilience.preserveContext` (default true).
3. **Backoff:** exponential with jitter, capped.
   - rate-limit: if the provider gave **Retry-After** (http-api header, or a CLI
     hint we can parse), honor it; else `min(maxDelay, base * 2^(attempt-1))`.
   - transient: `min(maxDelay, base * 2^(attempt-1))` + jitter.
4. **Bounded:** at most `maxRetries` per class, per turn. Resilience retries are
   **separate** from the flow `retries: N` budget (infrastructure recovery is not
   the author's flakiness budget).
5. **Honest record:** each attempt emits `flow.step.retried` with
   `{ stepId, attempt, maxAttempts, class, delayMs, reason }`; metrics record
   every real invocation; a `flow.step.retry_exhausted` event precedes a fallback
   or escalation.
6. **Abort-responsive:** the backoff wait is interruptible - a user abort / spend
   cap during a wait stops immediately (control always wins).

### Should we retry 429? Yes.

A 429 is the textbook recoverable error; failing an overnight run on a momentary
limit is the wrong default. We retry with backoff honoring `Retry-After`, bounded
by `maxRetries`, then fall back to an alternate profile if configured, then
escalate. Same machinery handles "server temporarily unavailable" (transient).

---

## Fallback (alternate profile)

When resilience retries for a class are exhausted and a `fallbackProfile` is
configured (per class, or a global default), the turn re-runs **once** on the
fallback profile (a different provider/model that may not be limited/down). This:

- is **explicit** (configured), never automatic model-swapping;
- is **recorded** (`provider.fallback` event: "fell back claude-balanced ->
  claude-fast: rate-limited after 5 retries");
- preserves the flow contract (the fallback still fills the same Seat and emits
  the same output token), but the change in model is visible so quality shifts
  are never hidden;
- if the fallback ALSO fails -> escalate (`onExhausted`).

Distinct from `budget.fallbackProfile` (cost downgrade) - same mechanism, two
triggers (resilience vs budget). They share one implementation.

---

## Budget control - the "never lose control" ceiling

The dollar cap stays, but the **binding** ceiling for unattended runs is
count/time, because it holds even when cost is unmeasured (CLI providers).

New, all **null/off by default** (no behavior change until set):

- `budget.maxTurnsPerRun` - hard cap on agent turns in one run.
- `budget.maxWallClockMinPerRun` - hard wall-clock cap per run.
- `budget.maxTurnsPerDay` - across all runs today (binds even when USD is 0/unmeasured).
- `budget.maxWallClockMinPerDay` - across all runs today.
- `budget.onLimit` - `stop` (default) or `pause` when a count/time ceiling is hit.

Checked at the same point as the existing spend cap (before each turn) via the
broker, so a hit is recorded as evidence and the run ends honestly (and the Run
Assurance verdict reflects it). A single run is already bounded by its flow, so
these matter most for **expensive turns** and **continuous queues**.

Plus: finally implement the spend cap's promised actions (currently stop-only):

- `capAction: downgrade-model` -> switch seated steps to `budget.fallbackProfile`
  (reuses the fallback mechanism above) instead of stopping. Only meaningful when
  cost is measured; with unmeasured CLI cost it stays `stop` (honest).
- `capAction: reduce-effort` -> drop provider effort/power one notch where the
  provider supports it; else `stop`.

---

## Settings surface (the solid setting plan)

One new `resilience` block + extensions to `budget`. Full shape with defaults:

```yaml
resilience:
  enabled: true                 # master switch for auto-retry/backoff/fallback
  preserveContext: true         # reuse provider session on a retry when supported
  onExhausted: stop             # stop | pause  (pause = wait for a human)
  rateLimit:
    maxRetries: 5
    baseDelayMs: 2000
    maxDelayMs: 120000          # 2 min
    respectRetryAfter: true
    patterns: []                # user-added regexes, merged with built-ins
    fallbackProfile: null       # alternate profile if still limited
  transient:
    maxRetries: 4
    baseDelayMs: 1000
    maxDelayMs: 60000           # 1 min
    patterns: []                # e.g. your provider's exact "temporarily unavailable" wording
    fallbackProfile: null

budget:
  # existing
  spendCapDailyUsd: null
  capAction: stop               # stop | downgrade-model | reduce-effort
  warnThresholdPct: 0.8
  fallbackProfile: null
  # new (all off by default)
  maxTurnsPerRun: null
  maxWallClockMinPerRun: null
  maxTurnsPerDay: null
  maxWallClockMinPerDay: null
  onLimit: stop                 # stop | pause
```

All editable in `vibe config` **and** the dashboard Settings page (UI/CLI parity,
per the repo rule). Defaults chosen so: resilience is on (pure robustness), hard
ceilings are off (opt-in), nothing changes for current users until they opt in.

---

## Reconciliation with shipped features

- `assessTurnResult` (0.7.12) stays the success gate; classification runs on its
  failures.
- `retries: N` (Slice 5) becomes the **hard-class** retry budget (author-declared
  flakiness). Resilience retries (rate-limit/transient) are separate + automatic.
- `continueOnError` (Slice 5) still decides tolerate-vs-fail **after** all retries
  + fallback are exhausted.
- The spend cap (S5-era) gains real cap actions + the new count/time ceilings.
- Run Assurance (0.7.11) already downgrades on tolerated failures; a budget/limit
  stop is `blocked`, recorded as evidence.

---

## Surfaces (events, CLI, UI - parity)

- Events: `flow.step.retried` (extended with `class`/`delayMs`), new
  `flow.step.retry_exhausted`, `provider.fallback`, `budget.limit` (count/time),
  existing `spend.*`.
- CLI: `vibe config` for all settings; run timeline shows retries/fallbacks; a
  `--unattended` convenience that sets sensible ceilings + `onExhausted: pause`.
- UI: Settings page section for Resilience + Budget; the run detail timeline
  badges retries/fallbacks/limit hits.

---

## Phasing

- **U1 - Hard count/time budget ceilings. SHIPPED (0.7.13).** `maxTurnsPerRun` /
  `maxWallClockMinPerRun` / `maxTurnsPerDay` / `maxWallClockMinPerDay`, enforced
  before every agent turn (`enforceBudgetCeilings`); a hit throws a
  `__BudgetLimitSignal` -> the run blocks honestly, emits `budget.limit`, and
  notifies. Count/time bind without measured cost (the CLI-unmeasured case).
  Settable via `vibe budget set --max-*`, `PATCH /api/budget`, and the dashboard
  Budget control (UI/CLI parity). `onLimit` ships as `stop` only; `pause` lands
  with the unattended-mode/approval work below. Under a parallel fan-out the
  per-run turn count can overshoot by up to (wave width - 1) - it still binds.
- **U2 - Resilience retries. SHIPPED (0.7.14).** `runProviderResilient` wraps the
  provider invocation inside `runRole` (so both linear + graph turns benefit): a
  failure is classified (`provider-resilience.ts`: rate-limit / transient / hard
  from the result's stderr+stdout or the thrown error's message, built-in patterns
  + user `resilience.<class>.patterns`) and, when rate-limit/transient, retried
  with backoff (rate-limit honors a parsed Retry-After, capped; transient
  exponential + jitter). Hard failures + exhausted retries surface the original
  outcome to the existing handling (assessTurnResult / rethrow). The backoff sleep
  is abort-interruptible. `resilience` config (on by default). **Context note:**
  the retry re-sends the same artifact-rebuilt prompt, so context is preserved by
  construction; provider-session delta-reuse is an optimization deferred (a failed
  attempt has no usable session). **Cost note:** failed rate-limit/transient
  attempts incur ~no tokens, so one role-metric for the final attempt is honest.
- **U3 - Resilience fallback. SHIPPED (0.7.15).** Per-class
  `resilience.<class>.fallbackProfile`: when rate-limit/transient retries are
  exhausted, `tryProviderFallback` runs the turn once on an alternate Profile (a
  model that may not be limited/down) - different provider, session dropped, not
  itself retried, recorded as `provider.fallback`. Clean success -> proceed; else
  the original outcome stands.
- **U4 - Budget cap actions. SHIPPED (0.7.16).** `enforceSpendCap` no longer
  always stops: when the daily $ cap is hit it applies a run-level
  `this.budgetOverride` once - `downgrade-model` switches the rest of the run to
  `budget.fallbackProfile` (validated; else falls through to stop honestly),
  `reduce-effort` drops to the provider's minimum effort. runRole applies the
  override (provider/profile for downgrade; lowest power level for reduce-effort).
  Recorded as `spend.action`; the hard count/time ceilings (U1) remain the
  ultimate stop. Also fixed the API/UI field-name bug (`fallbackProvider` ->
  `fallbackProfile`) so downgrade is configurable from the dashboard, and added a
  fallback-profile input to the Budget control.
  *Remaining polish (optional): `onLimit/onExhausted: pause` (attended only) + a
  `--unattended` preset that sets sensible ceilings + downgrade.*

Each is its own branch, verified, with docs + changelog, per the repo workflow.

---

## Decisions (confirmed)

1. **Limit defaults** - confirmed: rate-limit 5 retries (2s -> 2min), transient 4
   (1s -> 1min).
2. **`onExhausted` / `onLimit`** - confirmed: `stop` is the global default; a
   `--unattended` mode (and per-setting overrides) flips to `pause`. These must be
   settable via flag + config, not hardcoded. (U1 ships `stop`; `pause` lands with
   the approval/unattended-mode work in U2/U3.)
3. **Fallback scope** - confirmed: per-class `fallbackProfile`.
4. **Hard-class auto-retry** - confirmed (maintainer's call): keep hard failures
   non-auto-retried; only the flow's `retries: N` applies.
5. **Wall-clock accounting** - confirmed: per-run start-to-now (also catches
   hangs); daily = sum of each run's start-to-updated. All usage metered.
