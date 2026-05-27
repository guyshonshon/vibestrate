# Roadmap (prioritized)

Consolidated from the scratch `TODO_NEW*.md` notes + the recent design threads,
deduped and ordered. Each epic is roughly independent; phases within an epic are
sequential. This is the "what's next + why now" view; `docs/TODO.md` tracks the
fine-grained shipped/backlog checklist.

---

## Epic A — Provider structured output + real token/cost control  ← active

The keystone: a provider's output becomes **structured** so amaco gets live
streaming *and* real token/cost data, behind a per-provider adapter that keeps
supervision uniform. Full design + guarantees:
[`provider-structured-output.md`](./provider-structured-output.md). This
**absorbs** the "make the cost/token ledger real" note — structured output is
what makes the ledger real; the pricing/cap/dashboard work sits on top.

- **A1 — Output adapter layer. ✓ done.** `NormalizedTurn { responseText,
  metrics }` + `ProviderOutputAdapter`; every provider routes through it on the
  `text` adapter (zero behavior change). Control/live/metrics consume only the
  normalized shape. Parity + fail-loud tests.
- **A2 — Claude `stream-json` adapter. ✓ done.** Live token-by-token output +
  native token/cost/model metrics; lossless response-text extraction (control
  parsers unaffected), fail-loud on a malformed stream. Validated against real
  claude 2.x. Now the **default** claude preset (`type: claude-code`,
  stream-json) — the two preset builders are unified, so `init` / `doctor` /
  the dashboard all write it. Existing `type: cli` claude configs keep working.
- **A3 — Pricing table + universal token capture. ✓ done.** Local static
  list-price table (USD/1M by model, prefix-matched). Cost precedence:
  CLI-reported → `tokens × price` (labelled estimate) → null (never
  fabricated). Tokens are real where the provider reports them (claude) and
  estimated from text otherwise, so every provider shows token counts; `est.`
  labels on per-step + run-level metrics. No network calls.
- **A4 — Metrics dashboard.** Total-tokens KPI (vs prev window), tokens-by-role
  over time, per-model table (calls/tokens/cost), median run duration. Keep the
  `/api/metrics/overview` payload backward-compatible (add fields).
- **A5 — Daily spend cap (configurable policy + action).** Enforce
  `spendCapDailyUsd`, configurable from **both the UI and the CLI**, with a
  chosen **action** when the cap is hit — not just a hard stop. Options:
  - **stop** — block the next phase (hard stop) with a clear message;
  - **downgrade model** — switch to a cheaper provider/model (via effortMap /
    a configured fallback) and continue;
  - **reduce effort** — drop the run's effort level a notch and continue.
  Plus a warn-notify at a threshold (~80%). Needs real per-run cost (A3).
- **A6 — (optional) Webhooks.** POST on approve / merge / cap-hit, via the
  existing `src/notifications/` system.

## Epic B — Run control & rework

- **B1 — Rewind to a phase + rework from there.** Today you can replay but not
  re-run *from* a phase with changes. Real case: a run failed because every
  agent was read-only; the fix (give the executor write + re-run from exec) has
  no UI path. Add: re-run from a chosen step + a per-run agent permission
  override.
- **B2 — Run navigation + "blocked" UX.** Reaching a run shouldn't require going
  through "all runs"; the `blocked` state needs a clearer, more actionable
  surface (what blocked it, what to do).

## Epic C — Guides intelligence

- **C1 — Task complexity vs guide complexity.** Estimate a task's complexity
  (mirror the existing effort heuristic), give guides a target complexity, and
  warn when a heavy multi-phase guide is overkill for a trivial task
  ("this flow might be too much — try a simpler one").

## Epic D — Naming & model unification (design first)

- **D1 — Settle the vocabulary.** Decide whether **Agents** and **Providers**
  are one concept; pin down Crew / Flow (vs Guide) / Task vs Run /
  Orchestrator vs Supervisor. Goal: as few, as clear concepts as possible.
  This is a design decision before any rename — renames ripple through UI,
  docs, and config.

## Epic E — Platform

- **E1 — Windows support.** Audit what breaks on Windows (path handling,
  detached spawns, signals, worktrees) and decide supported scope.

## Cross-cutting — Docs discipline

On every user-facing change: update the handwritten docs (`docs/content/`),
regenerate the source-aware reference (`pnpm docs:generate`), refresh the README
where relevant, and add a `CHANGELOG.md` line. The canonical "how we work" flow
lives in the repo-local (gitignored) `CLAUDE.md`.

---

### Suggested order

~~A1~~ → ~~A2~~ → ~~A3~~ (done — real metrics + cost ledger) → **A4 next** → A5, then
B1 (rework-from-phase is high day-to-day value), C1, D1 (design), B2, A6, E1.
Adjust as priorities shift.
