# Changelog

Concise, newest-first log of every change. One short line per change.
`Unreleased` accrues until the next `pnpm release`, then it's renamed to the
version. Update it in the same commit as the change it describes.

## Unreleased

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
