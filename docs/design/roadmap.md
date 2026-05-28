# Roadmap (prioritized)

Consolidated from the scratch `TODO_NEW*.md` notes + the recent design threads,
deduped and ordered. Each epic is roughly independent; phases within an epic are
sequential. This is the "what's next + why now" view; `docs/TODO.md` tracks the
fine-grained shipped/backlog checklist.

---

## Epic A — Provider structured output + real token/cost control  ← active

The keystone: a provider's output becomes **structured** so vibestrate gets live
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
- **A4 — Metrics dashboard. ✓ done.** Total-tokens KPI (+Δ vs prior window),
  median run duration alongside the average, per-model table
  (model/calls/tokens/cost), tokens-by-role bar. `/api/metrics/overview` kept
  backward-compatible (fields added: `perModel`, `tokensByRole`,
  `totals.{tokens,tokensDelta,medianDurationSeconds}`).
- **A5 — Daily spend cap (configurable policy + action). ✓ done.** A `budget`
  config block (`spendCapDailyUsd`, `capAction`, `warnThresholdPct`,
  `fallbackProvider`) enforced in the orchestrator before each agent turn:
  warn event at the threshold, then at the cap apply `capAction` —
  **stop** (block the run), **downgrade-model** (switch to the cheaper
  fallback/effortMap.low and continue), or **reduce-effort** (drop a notch).
  Configurable via the **CLI** (`vibestrate budget set/show/off`) and the **UI**
  (Metrics page control + `/api/budget`). Uses the A3 cost ledger. Tested.
- **A6 — (optional) Webhooks.** POST on approve / merge / cap-hit, via the
  existing `src/notifications/` system.
- **A7 — Real metrics for Codex / Gemini / Ollama** (structured adapters, like
  Claude). Tracked in **GitHub issue #5** — until then these show estimated
  tokens (labelled `est.`) and no cost.

## Epic S — Hard policy enforcement + run assurance  ← core safety pillar

Vibestrate must not become prompt automation with nice UI. Its durable value is hard
gates: policy enforcement, approval boundaries, rollback, validation evidence,
and an honest final assurance artifact. Full design:
[`policy-enforcement-assurance.md`](./policy-enforcement-assurance.md).
Tracked in **GitHub issue #7**.

- **S0 — Action Broker foundation.** Add the Vibestrate-owned boundary that all real
  effects must cross: provider spawn, command run, file patch/write,
  terminal create, suggestion/bundle apply, and run completion. Do this early
  so policy is one core path, not scattered checks added later.
- **S1 — Language cleanup.** Stop calling prompt boundaries enforcement.
  Reserve "policy enforcement" for code-enforced gates. Docs/UI should say
  "instructions" when a rule is only injected into the prompt.
- **S2 — Policy engine V2.** Expand policies beyond suggestion/bundle patch
  apply: `run.preflight`, `provider.spawn`, `agent.turn.diff`,
  `suggestion.apply`, `bundle.apply`, `terminal.create`, `run.complete`.
  Effects: `deny`, `require_approval`.
- **S3 — Post-turn diff gate.** Snapshot before every write-capable role,
  run the provider, diff after the turn, evaluate policies, then accept,
  request approval, or rollback and block.
- **S4 — Strict apply-only mode.** Optional high-assurance mode where agents
  propose patches/structured file edits and Vibestrate applies them through the
  policy gateway. No direct writes accepted.
- **S5 — Run Assurance artifact.** Generate
  `.vibestrate/runs/<runId>/assurance.json` with discrete verdicts:
  `blocked`, `unsafe`, `unverified`, `partially_verified`, `verified`.
  No fake confidence percentage.
- **S6 — OS sandbox path.** Tie into the Docker/sandbox execution backend so
  forbidden-path guarantees become process-level guarantees, not only
  accepted-diff guarantees.

## Epic B — Run control & rework

- **B1 — Re-run with changes + rewind.**
  - ✓ **Re-run with changes** (done): a terminal run has a "Re-run with changes"
    action → re-submit the task with adjusted settings (uncheck read-only so the
    executor can write, change effort/provider; preserves the flow). Directly
    fixes the read-only→write case. Re-runs from scratch (new worktree).
  - ~~**Rewind to a stage** (phase 1, done)~~: fork a fresh run that resumes at
    **architecting** (reuse plan) or **executing** (reuse plan + architecture)
    instead of from scratch. The orchestrator seeds upstream artifacts from the
    source run, skips earlier stages, and uses a fresh worktree off main (valid
    because both stages regenerate the downstream code). New runId +
    `state.resumedFrom` lineage; original untouched. UI "Start from" selector +
    `vibestrate run --resume-from <runId> [--resume-stage …]`. Permission/effort/
    provider overrides ride the existing re-run controls.
  - ☐ **Rewind phase 2** — resume at **review / verify / fix** (which need the
    executor's code present). Requires per-phase **worktree snapshots**
    (commit/tag each phase) so the worktree can be restored to a mid-run state;
    the current capture only keeps the final worktree. This is the remaining
    half of "true rewind reusing captured context".
- **B2 — Run navigation + "blocked" UX. ✓ done.** A global run quick-switcher
  (Cmd/Ctrl-K or `g r`) filters recent runs by task/runId/status and jumps
  straight to one — no "all runs" detour. Terminal non-success runs show a
  "what happened / what to do" banner naming the cause (spend cap / rejected
  approval / review BLOCKED / verification / raw error) with the right next
  actions; `blocked`/`aborted` runs stop showing a live pulse + timer.

## Epic C — Flows intelligence

- **C1 — Task complexity vs flow complexity.** Estimate a task's complexity
  (mirror the existing effort heuristic), give flows a target complexity, and
  warn when a heavy multi-phase flow is overkill for a trivial task
  ("this flow might be too much — try a simpler one").

## Epic D — Naming & model unification (design first)

- **D1 — Agents vs Providers.**
  - ~~**Legibility pass** (done): they are *not* one concept — an agent is a
    role, a provider is the CLI it runs on (many roles → one provider). The
    Agents page now leads with a **Roles** panel (role → provider + permissions
    + skills) alongside the provider list, with an explainer; new read-only
    `GET /api/agents/roles`. This removes the "aren't these the same?"
    confusion without a rename.~~
  - **Vocabulary decision:** keep **Provider** (rejected "Engine"); **Role** is
    an acceptable user-facing label for an agent.
  - ~~**Agent→Role rename + page merge** (done): clean rename (no back-compat,
    pre-release) of `agents:`→`roles:`, `.vibestrate/agents/`→`.vibestrate/roles/`,
    `agentId`→`roleId`, `agent.*` events→`role.*`, and ~60 code identifiers;
    mislabeled provider-fleet data corrected to Provider. Dashboard Agents +
    Providers merged into one **Crew** page (`#/crew`). Canonical terms in
    `docs/design/vocabulary.md`.~~ Remaining: the **TUI shell** still uses the
    `agents` page id (web-only rename for now); Crew / Flow-vs-Flow / Task-vs-
    Run / Orchestrator-vs-Supervisor wording is documented but not enforced.
- **D2 — Default flow (unify roles + flows).** No separate "default roles": the
  fixed plan→build→verify workflow becomes the built-in **default flow**, roles
  are seats inside a flow, and "Guide" is renamed to **Flow**. Resolves the
  role/slot duplication. Design in
  [`flows-unification.md`](./flows-unification.md).
  - ~~**Phase A-1** (done): Guide → Flow rename across code / config-paths /
    API / UI / CLI / docs. Catalog is now **Flows** (`#/flows`), builder
    `#/flow`. No back-compat (pre-release).~~
  - ~~**Phase A-2** (done): the default workflow shows as the built-in
    **Default flow** on the Flows page (display card); Crew framed as "the
    roles of the Default flow". Still runs via `run()` under the hood.~~
  - ☐ **Phase B**: unify the two orchestrator runners (`run()` +
    `runFlowSequence()`) so the default workflow executes as an actual flow.
    Highest-risk core change; checkpoint before starting.

## Epic E — Platform

- **E1 — Windows support.** Audit what breaks on Windows (path handling,
  detached spawns, signals, worktrees) and decide supported scope.
- **E2 — Homebrew install.** Stand up a `guyshonshon/homebrew-vibestrate` tap with a
  `Formula/vibestrate.rb` (depends_on node; installs the published npm tarball,
  pinned version + sha256) so `brew install guyshonshon/vibestrate/vibestrate` works.
  npm + the `curl | sh` installer cover macOS/Linux today; brew is a
  nice-to-have. (Deferred — user opted to skip for now.)

## Cross-cutting — Docs discipline

On every user-facing change: update the handwritten docs (`docs/content/`),
regenerate the source-aware reference (`pnpm docs:generate`), refresh the README
where relevant, and add a `CHANGELOG.md` line. The canonical "how we work" flow
lives in the repo-local (gitignored) `CLAUDE.md`.

---

### Suggested order

~~A1~~ → ~~A2~~ → ~~A3~~ → ~~A4~~ → ~~A5~~ (**Epic A complete** — structured
output, real metrics/cost, dashboard, spend cap) → ~~B1 (rewind phase 1)~~ →
~~B2 (run nav + blocked UX)~~ → **Epic S** (hard policy enforcement + run
assurance) → then **D1** (Agents vs Providers — design the vocabulary; the
dashboard's split Agents/Providers pages confuse users), C1, rewind phase 2
(per-phase worktree snapshots), A6, E1.
Adjust as priorities shift.
