# Changelog

## 0.3.1

- **Profiles are now complete and reusable.** A profile (provider + model +
  power + budget) is a preset your crew's roles run on - keep several per
  provider (`claude`, `claude-cheap`). Create, duplicate, and delete them from
  the dashboard or `vibe profiles`; the page groups by provider and shows which
  roles use each, and deleting one that's in use is guarded. Previously you could
  only edit existing profiles by hand-editing `project.yml`.

## 0.3.0

- **First-run onboarding.** Open the dashboard on a fresh project and you land on
  a real setup screen instead of a half-broken dashboard: initialize in place
  (parity with `vibe init`), see your detected providers, and step in. The shell
  gets the same gate. Built to the brand - the wordmark, hard-edged slabs, violet
  as the single active signal.

## 0.2.0

The release that turns Vibestrate from a provider launcher into a real
orchestration tool: a new core model, code-enforced safety, a planning board,
and a rebuilt interactive shell.

### Breaking

- **New core model.** Everything is now `Task + Flow + Crew = Run`, with a clean
vocabulary - Flow, Step, Seat, Crew, Role, Profile, Provider - and a single
runner behind every run. The web dashboard and the TUI were rewired to match;
the old `roles` / `slots` / `effortMap` config is gone.

### Safety

- **The Action Broker.** Every real effect - provider spawns, file writes and
patches, commands, run completion - crosses one audited, fail-closed boundary
with a per-run evidence log.
- **Code-enforced policies.** `.vibestrate/policies/*.yml` gate broker effects
with `deny` / `require_approval`, matched by provider, command, path, or run
status - not prompt suggestions, real gates.
- **Diff gate + apply-only mode.** Each write turn is snapshotted and checked for
secret/path safety; it can pause for human approval or roll back. In apply-only
mode, write agents propose a diff that Vibestrate applies through the gate.
- **Run Assurance.** Every run ends with an honest verdict - blocked / unsafe /
unverified / partially verified / verified - derived from evidence, with no
fake confidence scores.

### Planning

- **Planning board.** A card board (Planned → In-progress → Needs testing →
Completed) with in-card checklists, an AI "Enhance" that decomposes a card into
items, promote-item-to-card, and a suggest-next ranker.
- **Pick-up execution.** Run a card's checklist item by item in one worktree,
continuous or step-by-step, with per-item commits and forward-carried context.

### Interactive shell

- **Rebuilt `vibe` TUI.** Three-region layout, violet theme, a status bar with a
persistent command prompt, scrollable output with an in-terminal docs browser,
and workflow-ordered navigation.
- **Flow page.** List built-in and project flows, inspect one, fork a built-in
into your project, and install flows from the hub.

### Providers & context

- **Non-CLI providers.** Cloud (`http-api`: Anthropic / OpenAI) and local-server
(`localhost-proxy`: Ollama / LM Studio / vLLM) providers with real token
metrics, plus an advanced provider-setup UI at full parity with the CLI.
- **Context sources.** Attach files or URLs to a task or run; materialized once
and injected into every agent prompt, secret-guarded.

### Scale & integration

- **Multi-project navigator.** Open and close independent per-project dashboards
from one place, with a read-only cross-project overview.
- **Integration & hub.** Preview and merge parallel run branches into a fresh
branch; install community flows and skills from a static hub.

### Observability & API

- **Opt-in telemetry.** Export a run as an OpenTelemetry / Langfuse trace;
webhooks for approvals, merges, and spend-cap hits.
- **Hardened API.** Versioned `/api/v1`, optional bearer-token auth, single-flow
import / export.

### Also

- **Rewind** a run to review / verify / fix from durable per-phase snapshots.
- **`vibe run -i`** picks Flow and Crew inline.
- Tooling: Vite 8, Vitest 4.

## 0.1.1

- Fix: global/symlinked `vibestrate` bin was inert - entrypoint check now compares
realpaths; added `tests/cli-bin-entrypoint.test.ts` regression guard.

## 0.1.0

- Add: first npm release as `vibestrate` (binary stays `vibestrate`).
- Add: out-of-the-box presets for all 11 providers + "log in outside Vibestrate"
prompts; `doctor --fix` auto-applies any detected provider.
- Add: Gemini, Qwen Code, Crush, Goose, Cursor, Amp providers.
- Add: documentation system - handwritten content + source-aware generated
reference (`pnpm docs:generate`), rendered at vibestrate.com/docs.
- Change: CLI version single-sourced from `package.json`.
- Add: CI + tag-release GitHub workflows (OIDC trusted publishing); lean
publish tarball (sourcemaps stripped); pinned `ws` (security advisory).
- Add: README rewrite (ASCII banner, real badges), CONTRIBUTING, SECURITY,
MAINTAINING, issue/PR templates.

