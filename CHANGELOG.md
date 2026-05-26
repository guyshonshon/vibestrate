# Changelog

Concise, newest-first log of every change. One short line per change.
`Unreleased` accrues until the next `pnpm release`, then it's renamed to the
version. See `CLAUDE.md` § 10.

## Unreleased

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
- Add: `CHANGELOG.md` + CLAUDE.md § 10 rule to maintain it every change.

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
