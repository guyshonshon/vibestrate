# Changelog

Concise, newest-first log of every change. One short line per change.
`Unreleased` accrues until the next `pnpm release`, then it's renamed to the
version. Update it in the same commit as the change it describes.

## Unreleased

- Fix: guide runs showed a contradictory phase (rail said "Review" while the
  crew showed a running "challenger"). The status rail now follows the guide's
  actual steps, "challenger"/"critic" slots classify as Reviewer (not
  Executor), and the run page's stray section numbering (1·/2·/…) is gone.
- Change: run detail right rail shows **live run-level metrics** that
  accumulate as steps finish (tokens, cost, tool calls, provider calls) instead
  of the running agent's not-yet-resolved "—". The status hero gained a live
  "Now <step> · <agent>" line so it's clear what's happening.
- Change: Mission Control now visibly changes the instant you send a brief — an
  optimistic "Starting run" card appears immediately (a dashboard run is spawned
  detached and takes ~1s to register) and the live-runs view moved to the top
  (was a small toast + a section far below the fold). The composer stays usable
  while runs are live, so you can launch more in parallel.
- Add: run detail **Steps** inspector (now the default Inspect tab) — one card
  per agent step from runtime metrics: stage/agent, provider+model, pass/fail
  (exit code), duration, tokens (in→out), cost, tool calls, files touched
  (+/−), and review/verification + validation outcomes.
- Change: run detail surfaces the **changed-files list beside live execution**
  (was buried under Inspect → Artifacts and showed only totals); click a file
  to open it in the worktree view. Section labels normalized (dropped the
  inconsistent "3 ·"/"5 ·" numbering; live panel labelled "raw provider CLI
  output").
- Fix: changed-files diff showed **+0** for brand-new files — `git diff
  --numstat HEAD` omits untracked files. `getDiffSnapshot` now counts an
  untracked file's added lines (via `--no-index`), so a newly-created file
  reports its real line count in the run's changed-files summary.
- Add: **Install** flow on the Providers page for the 5 popular providers —
  a guided wizard with the exact install + login commands (copy-able) and a
  re-check. Nothing is spawned by the browser; install/login happen locally in
  the user's terminal. Added install hints for Claude Code / Codex / Aider and
  exposed `installHint` through the providers API.
- Fix: flow editor's **Dry-run preview** was a dead button — now resolves the
  guide into the snapshot a run would create (provider per slot, enabled
  steps, approval gates) in a modal; no run starts.
- Change: unify Flows + Guides into a single **Guides** nav entry. The flow
  editor is reached from the Guides catalog (breadcrumb → Guides); its
  redundant catalog grid is replaced by a compact guide switcher, and the
  verbose copy is trimmed across both.
- Add: dedicated **Guides** page in Mission Control (nav entry + `#/guides`) —
  lists built-in + project guides, expands each to show its flow (slots,
  ordered steps, approval gates), forks a builtin into the project, deletes a
  project guide, or opens one in the Flow Builder. Over `/api/guides` only.
  Groundwork for the Guides Hub. Docs + route test updated.
- Change: decouple UI ⇄ CLI — the dashboard no longer spawns the `amaco`
  binary to start/retry runs. New shared core run launcher
  (`core/run-launcher.ts`, `runFromSpec`) + a detached core entry
  (`core/run-entry.js`, second build output) the server spawns with a JSON
  spec. Both CLI and dashboard now reach a run only through core; runs stay
  detached (survive closing the dashboard). Tests + tsup multi-entry.
- Change: README hero — centered Amaco logo + ASCII wordmark as a transparent
  image (no code-block background); dropped the redundant plain-text title and
  the footer "made for the love of building" line. Logo added to
  `.github/assets/` for use as the GitHub social preview.
- Add: codebase annotations — pin notes to a file / line / range from the
  Codebase page; "visible to agents" (default on, optional) injects open notes
  into every agent prompt as a `# Human Annotations` section so the crew
  acknowledges them. Stored in `.amaco/annotations.json` (never in source);
  path-guarded + secret-scanned. New core service, `/api/annotations` routes,
  prompt-builder section, docs page, and a redesigned Codebase page (glass
  sidebar + annotations panel).
- Add: hand-off prompt for claude.ai/design to design the Guides Hub UI
  (`docs/design/guides-hub-ui-design-prompt.md`) — matches the Mission
  Control design tokens (ink/fog/violet, Bricolage display, glass).
- Change: providers split into a **popular** tier (claude, gemini, codex,
  ollama, aider) that's auto-configured out of the box, and an **optional**
  tier (opencode, qwen, crush, goose, cursor, amp) that's detected but
  opt-in — never auto-bound (`doctor --fix` won't apply it). Providers page
  groups Popular vs Optional.
- Fix: app logo — removed the off-hue anti-aliased edge fringe (read as a
  faint border) for a clean edge on light and dark surfaces.
- Change: dashboard typography — Bricolage Grotesque Variable for big
  titles/headers (`.text-display`); minimized the page heros (Agents,
  Metrics, Flow Builder, Providers) for a denser, less marketing-y feel.
- Add: Guide versioning in the hub design — semver per release, Docker-style
  `name` / `name:1.2.0` / `name:1` refs, `latest` = highest stable (auto),
  immutable versions; pinned installs + `update` / `outdated`.
- Add: Guides Hub design doc (`docs/design/guides-hub.md`, #3) — phased plan
  (git-backed index → Cloudflare `amaco-hub` service) with API, rules, metrics.
- Chore: stop tracking `CLAUDE.md` (local agent protocol) and scheduler
  runtime state (`lock`, `state.json`, `*.ndjson`); gitignore them plus a
  stray `logo-text.png`. CLAUDE.md references trimmed from public docs.
- Add: Guide editor — fork a builtin/fixture guide into the project, edit
  steps + slots wholesale (`replaceSteps` / `replaceSlots`), and delete
  project guides, from the Flow Builder (server routes + patch logic + UI).
- Fix: guide discovery — a project guide now *shadows* a builtin of the same
  id (enables fork-to-customize) instead of erroring; only project-vs-project
  id clashes are rejected.
- Add: Providers page in Mission Control (#4) — detect / apply-preset /
  set-default / safe-test + "log in outside Amaco" prompts; TopBar nav entry
  and CLI-hints. Browser never spawns commands.
- Change: providers server route uses the generic preset registry (all 11
  providers) and exposes each provider's `loginCommand`; the test endpoint
  forwards `needsLogin`.
- Add: roadmap issues — Docker backend (#1), multi-container fan-out (#2),
  Guides Hub (#3), Providers UI in Mission Control (#4).
- Add: `CHANGELOG.md` + a rule to update it on every change.

## 0.1.1

- Fix: global/symlinked `amaco` bin was inert — entrypoint check now compares
  realpaths; added `tests/cli-bin-entrypoint.test.ts` regression guard.

## 0.1.0

- Add: first npm release as `amaco-os` (binary stays `amaco`).
- Add: out-of-the-box presets for all 11 providers + "log in outside Amaco"
  prompts; `doctor --fix` auto-applies any detected provider.
- Add: Gemini, Qwen Code, Crush, Goose, Cursor, Amp providers.
- Add: documentation system — handwritten content + source-aware generated
  reference (`pnpm docs:generate`), rendered at amaco.shonshon.com/docs.
- Change: CLI version single-sourced from `package.json`.
- Add: CI + tag-release GitHub workflows (OIDC trusted publishing); lean
  publish tarball (sourcemaps stripped); pinned `ws` (security advisory).
- Add: README rewrite (ASCII banner, real badges), CONTRIBUTING, SECURITY,
  MAINTAINING, issue/PR templates.
