# Changelog

## 0.3.10

- **Bring your own provider knobs.** A new `.vibestrate/providers-catalog.yml`
  overlay lets you declare the real models, effort levels, and how to apply them
  for a provider Vibestrate doesn't ship a spec for - your own CLI, a custom
  model. It is merged over the built-in catalog (your entry wins, per field) and
  feeds the actual spawn and every editor (web / shell / CLI) from one source, so
  a custom effort genuinely reaches the command line, not just the UI. Same rule
  as always: a knob only exists where it maps to a real flag/field.
- **See the catalog anywhere.** `vibe provider catalog` shows the merged catalog
  and where each entry came from (built-in vs your overlay); `--json` for scripts.
  The dashboard Providers page shows the same as a "Capability catalog" panel, and
  the shell Profiles page flags when an overlay is active and each provider's
  source - so the catalog view has full UI/CLI parity.

## 0.3.9

- **Effort now reaches HTTP providers too, not just CLIs.** A profile's effort on
  an OpenAI (or OpenAI-compatible) provider is sent as `reasoning_effort` in the
  request body - so the knob is real end to end, the same way claude `--effort`
  and codex `model_reasoning_effort` already were. One declarative apply layer is
  the single source for both what gets sent and the levels the editors show.
- **Your own HTTP providers surface real knobs.** Capabilities are now api-aware:
  a provider you configured (any id) pointing at OpenAI shows OpenAI's effort
  levels in the Profile editor; an Anthropic one correctly shows none (its
  thinking is a numeric budget, not an effort level). No advisory dials.

## 0.3.8

- **Profiles are now complete on every surface.** The shell gets a real `[4]
  Profiles` page - browse presets and edit them with the keyboard (`e/E` cycle
  effort through the provider's real levels, `m/M` model, `n` new, `d`
  duplicate, `x` delete), driven by the same core that powers the web and CLI.
  Web, CLI, and shell now all do the full create/edit/duplicate/delete loop, so
  there's no surface where you're told to go hand-edit `project.yml`. The Crew
  page shows each role's model/effort and points at Profiles.
- **First TUI render test.** The Profiles page is mounted for real and a
  keypress is proven to change config (effort medium -> high), establishing
  `ink-testing-library` as the shell's render harness.

## 0.3.7

- **Consolidation pass.** Only real knobs: the `budget` field (never applied to a
  run) is no longer an editor dial, matching how model/effort are shown only
  where wired. Refreshed the generated CLI reference and corrected the Profile
  docs to reality. No behavior change beyond hiding the advisory budget input.

## 0.3.6

- **Failure is loud on a bad exit too.** A provider that exits non-zero (e.g. a
  CLI rejecting a flag) now raises the `provider.failed` notification, not just
  thrown errors. End-to-end tests prove a profile's effort/model reach the real
  spawn and that a failed run notifies.

## 0.3.5

- **Effort and model actually take effect now - and only when they're real.** A
  profile's model/effort is applied to the spawn (claude `--model`/`--effort`,
  codex `--model` + `-c model_reasoning_effort`), and a knob is shown only where
  it maps to a real, doc-verified CLI flag. So Gemini (whose reasoning is a
  numeric thinking budget, not a CLI flag) shows no effort, and Ollama shows no
  model - no advisory dials that do nothing. Effort levels are the real ones
  (claude low..max, codex minimal..xhigh).
- **Failed runs are loud.** A failed provider invocation now raises a
  notification (with the role + phase), instead of only landing in the event log.

## 0.3.4

- **Effort is a real ladder, not a text box.** Profiles show effort as a
  Faster -> Smarter scale (`low / medium / high / xhigh / max`, plus `ultracode`
  = xhigh + workflows for Claude), driven per provider by the capability catalog
  (codex: `minimal..high`). The field is labeled "Effort", and Claude ships at
  `medium` by default. (Runtime wiring so effort actually changes the spawn is
  planned next - today it's the selection surface.)

## 0.3.3

- **Provider-aware profiles.** Picking a provider now drives the Model and Effort
  fields from that provider's real options (a capability catalog) - dropdowns you
  select from, with a "Custom…" escape for anything not listed - instead of blank
  text boxes. In both the Profiles page and the Crew inline create.
- **Brand:** the dashboard TopBar uses the real Vibestrate wordmark.

## 0.3.2

- **Create a profile inline from Crew.** A role's profile picker gains "+ New" -
  mint a preset (provider, model, power, budget) and assign it to the role in one
  step, without leaving the Crew page.

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

