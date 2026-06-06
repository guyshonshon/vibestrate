# Changelog

## 0.7.14

- **Runs ride out provider hiccups instead of dying.** A recoverable provider
  failure - a rate limit (429/quota) or a transient blip (5xx, "server
  temporarily unavailable", overloaded, timeout) - is now auto-retried with
  backoff before the turn's outcome is final, so an overnight run survives a
  momentary outage. Rate limits honor a `Retry-After` hint; transient errors back
  off exponentially. Hard failures (bad flag, auth, empty output) are *not*
  retried - retrying won't help. Context is preserved across a retry (the same
  prompt is re-sent). On by default; tune `resilience` in config (`maxRetries`,
  delays, and extra detection `patterns` for your provider's exact error wording).
  The backoff wait is interruptible - a user abort still stops instantly.

## 0.7.13

- **Budget ceilings that actually bind - safe to leave a run unattended.** The
  daily dollar cap is unreliable for local CLI providers (their token cost is
  often unmeasured), so it could silently never trigger overnight. New count/time
  ceilings bind regardless of measured cost: `maxTurnsPerRun`,
  `maxWallClockMinPerRun`, `maxTurnsPerDay`, `maxWallClockMinPerDay`. They're
  checked before every agent turn; hitting one stops the run (blocked), logs a
  `budget.limit` event, and notifies you. All off by default. Set them with
  `vibe budget set --max-turns-run 40 --max-time-day 120` (use `off` to clear),
  `PATCH /api/budget`, or the dashboard's Budget control. This is the first slice
  of the unattended-resilience plan; provider rate-limit/transient retries (ride
  out a 429 or a "server temporarily unavailable" instead of failing) come next.

- **A failed turn fails the run, honestly.** A model turn used to be accepted
  even when its provider exited non-zero (an invocation failure) or returned
  nothing - the empty/suspect output just flowed downstream, and a run could even
  reach `merge_ready` on the back of it. Now a non-zero provider exit or an empty
  response is a real failure: the run stops with the failing step named, instead
  of silently continuing. The graph escape hatches still apply - `retries: N`
  re-tries a flaky turn first, and a `continueOnError` step records the failure
  and continues with reduced coverage. Control signals (abort, approval rejection,
  spend cap) are never retried.

- **Run assurance is honest about tolerated failures.** When a graph flow runs a
  best-effort step (`continueOnError`, e.g. a review-panel lens) and that step
  fails but is tolerated, the run can still finish - but that step gave no
  scrutiny. The assurance verdict now reflects that: a tolerated step failure
  holds the verdict at `partially_verified` (never `verified`), adds a
  `steps_failed_tolerated` cap, and is counted as `coverage.toleratedStepFailures`.
  Surfaced in `vibe assurance` and the run-detail badge. This keeps degraded
  coverage from masquerading as a fully verified run.

- **Retries for flaky steps.** A graph-flow step can now declare `retries: N`
  (up to 5): if its turn fails or errors out, it's re-run up to N more times
  before the outcome counts - so a transient provider hiccup is recovered instead
  of recorded as a failure. Retries run before continue-past-failure decides, so
  the two compose: retry first, then tolerate or stop. A user abort, an approval
  rejection, and the spend cap are never retried, and every attempt is a real
  provider call (its cost shows up in the metrics). Each retry is on the record
  as a `flow.step.retried` event.

## 0.7.9

- **Resilient review panels (continue-past-failure).** One flaky reviewer no
  longer sinks the whole panel. A graph-flow step can be marked **best-effort**
  (`continueOnError`): if its provider fails or errors out, that step is recorded
  as `failed` (with an event and a line in the run brief) and the run carries on -
  the arbiter still renders a verdict from the surviving lenses, and is told which
  lens is missing. The built-in late review panel now runs its three reviewers
  this way. A user abort, an approval rejection, the spend cap, and required
  (non-best-effort) steps all still stop the run as before; the fan-out also no
  longer cancels in-flight siblings when one fails.

- **Structured handoffs between builder phases.** A step can now hand its work to
  the next as named JSON instead of free-form prose, so the through-line is
  machine-checkable: a structured plan (ordered steps, files, assumptions, open
  questions, risks), a design (decisions with rationale, components, interfaces),
  and an execution report (per-step status mapped back to the plan, files
  changed, follow-ups). These join the review-side contracts that already
  existed. They are **opt-in by output token** (`plan-handoff` /
  `architecture-handoff` / `execution-handoff`), so existing flows are unchanged;
  the built-in **late review panel** adopts them first and now reviews against a
  deterministic packet. Adoption is never fail-hard - a provider that emits
  imperfect JSON keeps its raw output and the run continues, with a parse event
  recorded for visibility.

## 0.7.7

- **Fix any provider entirely in the dashboard - no trip to the CLI.** The
  Providers editor gained an **Advanced - raw YAML** mode: flip the YAML block
  to editable and set anything the form doesn't surface - environment variables,
  claude-code `settings` (output format, max turns, permission mode, ...),
  `extraArgs`, custom headers. It's parsed and validated on save, seeded from the
  provider's real config so nothing is dropped. The form stays the easy path;
  the YAML is the escape hatch. (Authentication still shows a login command to
  run in your own terminal - Vibestrate never logs you in for you.)

## 0.7.6

- **The queue lives on the Runs page now.** The standalone Queue tab is gone -
  queued and running work, plus scheduler state (policy, concurrency), sit
  together at the top of Runs, on both the dashboard and the terminal shell.
  One place to see what's waiting and what's in flight. Old `#/queue` links
  redirect to Runs; scheduler controls stay on the shell command palette and
  the `vibe queue` CLI.

## 0.7.5

- **Graph flows can resume mid-run now.** Resuming from a stage
  (`vibe run --flow <graph-flow> --resume-from <runId> --resume-stage <stage>`)
  used to be refused for DAG flows like `panel-review` - you had to rerun from
  the top. Now it works the same as linear flows: the upstream prefix is seeded
  (marked skipped, its artifacts copied from the source run), and the frontier
  scheduler treats already-completed and seeded steps as done, so it only
  advances the remaining fan-out and join. Rerun just the review panel without
  re-planning and re-implementing.

## 0.7.4

- **Reorder and lock providers, right on the page.** The Providers list now
  takes a drag: grab a row by its handle to reorder it - with a clean little
  drag preview instead of the browser's clumsy element snapshot - and click the
  padlock to lock a row out of the shuffle (a satisfying open/close animation
  included). It's a personal view preference kept in your browser; it doesn't
  touch project config or how a run picks a provider (that's still the profile's
  job).
- **Quieter copy.** Trimmed two subtitles that read as generic "AI" boilerplate,
  and the Crew page no longer prints a role's raw id under its name when the id
  is just the lowercased label ("Fixer" over "fixer"); it shows only when the id
  actually adds something, like "executor" under "Backend Implementer".

## 0.7.3

- **The DAG now reads the same in the terminal shell.** The Ink TUI Flow page
  detail renders graph flows as the same top-down graph you get on the web:
  steps in dependency layers, a concurrent fan-out boxed as `parallel ×N`, and
  the arbiter join below it - so `panel-review`'s three reviewers and their
  verdict are legible without leaving the shell. The layering is now one
  dependency-free module shared by the dashboard, `vibe flows show`, and the
  shell, so the three surfaces can't drift. Closes the UI⇄CLI⇄shell parity gap
  opened in 0.7.2.

## 0.7.2

- **The review panel is now visible, not just running.** Graph flows render as a
  top-down **graph** in the dashboard: steps sit in dependency layers, and steps
  that run concurrently (a review panel's fan-out) are drawn side by side in a
  dashed "parallel" box, with the arbiter join below them. It shows on the Flow
  Builder (the flow's shape) and on Run detail (live, tinted by each step's
  status), so you can watch the three reviewers light up at once and converge.
  `vibe flows show` gained the same: a `needs` annotation per step and a
  "Parallel groups" section. UI⇄CLI parity for seeing the DAG.

## 0.7.1

- **Vibestrate credits the commits it makes.** When Vibestrate authors or assists
  a commit - per-item pick-up commits, integrator merges - it now stamps a
  `Co-authored-by: Vibestrate <noreply@vibestrate.com>` trailer. On by default,
  opt out with `commits.coAuthor: false` (or override the name/email); shown in
  `vibe config view` and the dashboard Config page.

## 0.7.0

- **Workflows can now fan out a late review panel - the first parallel flow.**
  Flows gained a real dependency graph (DAG): a step can declare `needs`, and
  steps that share the same dependencies run **concurrently**. The new built-in
  **`panel-review`** flow puts it to work - after plan -> architect -> implement
  -> validate, three read-only reviewers inspect the same real diff from distinct
  lenses (correctness, tests, security/risk) **at the same time**, then an
  arbiter reads all three findings and renders one verdict. The orchestrator can
  select it when a task warrants heavier review (security-sensitive, broad or
  architectural, low validation confidence, or you ask for it).
  - **Read-only by construction.** Every step in a parallel group is
    hard-enforced read-only at resolve time - a panel of writers is refused
    before the run starts, so the one-writer-per-worktree invariant holds. The
    linear path is byte-for-byte unchanged; only a flow that opts in (declares
    `needs`) uses the new frontier scheduler.
  - **Honest about cost.** A fan-out warning (printed by `vibe run`, returned by
    `POST /api/runs`) says how many agents run in parallel and that each is an
    opaque box that may itself parallelize - so real spend can exceed the
    estimate; the run's event stream shows each fan-out wave.
  - **Real wall-clock timeout.** A profile's `timeoutMs` is now wired end to end:
    an overrunning turn has its **whole process group** tree-killed (not just the
    direct child), so an internally-fanned-out turn can't hang unbounded. It was
    advisory/dead in the spawn path before, like the old per-profile `budget`.

  First DAG slice (Slice 4; custom-workflow-dags.md Phase A+B). Write-parallelism
  and checklist-DAGs stay deferred and on paper.

## 0.6.0

- **The orchestrator now carries a run brief between steps.** As a flow runs, the
  orchestrator maintains a compact "story so far" - the chosen flow and why, each
  step's outcome and decision, validation status, and open risks - and injects it
  into every role's prompt (a **Run brief** section, after the prior artifacts) so
  the crew builds on each other instead of re-reading the full history. It's
  **deterministic** (no extra model call - assembled from facts the orchestrator
  already has), budget-bounded (oldest entries fold to one line when it grows),
  and written to `flows/run-brief.md` on the run so you can read it too. Additive:
  normal runs are unchanged except for the new bounded section + artifact. Third
  slice of the responsible orchestrator.

## 0.5.3

- **Orchestrator selection now recommends a crew + posture, and shows its
  reasoning on run detail.** With `--select`, the orchestrator can also pick a
  **crew** (when the project has more than one; applied only if you didn't pass
  `--crew`, and validated) and flag an execution **posture** (sandbox / approval)
  as advice. Selected runs get a **Flow & why** card on the run-detail page -
  flow, confidence, reasons, and risks - read from the run's `selection.json`.
  Completes Slice 2. (Per-step profile auto-selection and applying the sandbox
  posture stay deferred - the latter needs the OS-sandbox backend.)

## 0.5.2

- **Consult page in the shell.** The interactive shell gains a **Consult** page:
  ask from the command prompt (`consult "..."`, with autocomplete + rendered
  output), and review the VIBESTRATE.md proposals it produces right there -
  `↑↓` to move, `a` to apply, `x` to reject, `r` to refresh. Full UI/CLI/shell
  parity for the consult surface.

## 0.5.1

- **Apply VIBESTRATE.md proposals (the write path).** A consult that proposes a
  manual update now saves it as a reviewable proposal; a human applies it
  explicitly - `vibe vibestrate apply <id>` or the **Apply** button on the consult
  card - which appends the reviewed text to `VIBESTRATE.md` through a guarded
  writer: Action Broker `file.write`, path-guarded to the project root, and
  **refused** if the content carries secret-shaped tokens (a manual is committed,
  so a leak there is the worst case). Never auto-applied.
- **Manage the manual:** `vibe vibestrate init | show | proposals [--all] |
  proposals show <id> | apply <id> | reject <id>`, plus `GET /api/vibestrate`,
  `POST /api/vibestrate/init`, `GET /api/vibestrate/proposals`, and
  `POST /api/vibestrate/proposals/:id/apply|reject`. Completes Slice 1.

## 0.5.0

- **The active Flow is always resolved and always shown.** Every run now prints
  `Flow: <name> · <source>` before it starts, so which workflow you're running is
  never hidden. Sources: `forced` (`--flow`), `default` (your session/default
  flow), `selected` (orchestrator), or the built-in default.
- **Set a default/session Flow.** `vibe flows use <id>` makes a Flow the default
  for every run that doesn't pass `--flow` (stored as `defaultFlow` in config);
  `vibe flows use --clear` removes it. Always applied, always shown.
- **Orchestrator workflow selection (opt-in).** `vibe run "..." --select` lets the
  responsible orchestrator pick the Flow for the task - it reads the task + each
  Flow's new `capabilities` metadata, prefers the lowest-cost flow that fits, and
  states a confidence + reasons + risks (read-only, broker-gated; records
  `selection.json` + a `workflow.selected` event on the run). Off by default, so a
  plain run costs nothing extra and behaves exactly as before.
- **Flows declare `capabilities`** (taskKinds / strengths / costClass / requires)
  - small selection metadata the orchestrator uses to choose well. Additive and
  back-compat; the built-ins ship with sensible values.
- Second slice of the **responsible orchestrator**
  (`docs/design/responsible-orchestrator.md`).

## 0.4.0

- **Consult - ask the project orchestrator (read-only).** A new project-aware
  advisor you can ask anything: `vibe consult "should this use a heavier
  review?"`, a **Consult** button in the dashboard top bar, and `POST
  /api/consult`. It answers **only** from controlled project context -
  `VIBESTRATE.md`, your config (providers/profiles/crews/policies), recent run
  outcomes + validation evidence, agent-visible annotations, and optionally a
  `--task`, `--run`, or `--file`. It is read-only (broker-gated through the
  assist path, no worktree, no writes; audited under `runs/consult/`) and
  **honest about its limits**: every answer states a confidence and lists the
  caveats it could not verify, rather than presenting model confidence as fact.
  It recommends actions and can *propose* a VIBESTRATE.md improvement, but
  proposals are shown, not applied.
- **`VIBESTRATE.md` - the orchestrator's operating manual.** A new, committed,
  root-level manual the orchestrator reads (project model, dev commands,
  orchestration preferences, risk rules). Distinct from `.vibestrate/rules.md`,
  with explicit precedence: Policy (code-enforced) > VIBESTRATE.md (advisory) >
  rules.md. Loaded read-only - path-guarded, secret-redacted, bounded.
- First slice of the **responsible orchestrator** (design:
  `docs/design/responsible-orchestrator.md`). Next: workflow selection and the
  run brief.

## 0.3.19

- **Removed the dead per-profile `budget` knob.** A Profile used to carry a
  coarse `budget` (low/medium/high), but it was never read at runtime - it
  changed no flag, no request body, nothing - so it violated the rule that a
  knob is only exposed when it's wired to a real effect. It's gone from the
  schema, every editor (web/CLI/shell), the API, and the capability catalog.
  Spend is controlled where it actually bites: a per-turn output cap
  (`maxTokens`) and the real project-level **daily cap** (`config.budget` /
  `vibe budget`), both unchanged. Old `project.yml` files that still list
  `budget:` on a profile keep loading - the legacy key is silently dropped, not
  rejected.

## 0.3.18

- **Concepts docs reorganized around Task, Flow, and Crew.** The flat Concepts
  list is now grouped the way the model actually nests: **Task** (Task, Run
  state), **Flow** (Flow, Seat, Workflow), **Crew** (Crew, Role, Profile,
  Provider), **Runtime & safety**, and a new **Configuration** group. The
  **Crew**, **Seat**, and **Profile** pages - previously written but never
  rendered on the web - are now live, and cross-page `[[wiki-links]]` resolve to
  real links.
- **New "Configuration & settings" page.** What lives in `project.yml`
  (providers, profiles, crews, flows, policies, validation commands), what sits
  beside it (rules, skills, role prompts), how to view it (`vibe config view`,
  the Config dashboard + shell pages), the UI/CLI-parity rule, and how secrets
  stay out of config.
- **Concept pages now read like prose.** Dropped the "Professional explanation /
  Simple explanation" split across Task, Workflow, Run state, Safety, Provider,
  Worktree, and Skill - each page now opens with the plain idea and deepens from
  there. The Task page also explains how the orchestrator turns a task into a run
  and how far a task's wording reaches into the result (it shapes *what* gets
  built, but the Crew/Profile - not the task - picks the model).
- **Flow concept page gains a hub -> seats -> crew diagram.**

## 0.3.17

- **New "big picture" onboarding page.** Getting Started now opens with a single
  short read that makes the whole mental model click - Task, Flow, Crew, Seat,
  Role, Profile, Provider - told as one plain-language story (you direct a small
  production: the Flow is the script, Seats are the parts to cast, your Crew is
  the cast, a Profile is how much star power you pay for). Includes simple
  diagrams of the seat -> role -> profile -> provider chain, the
  premium-builder / cheap-validator move spelled out, and a one-card cheat
  sheet. Linked first from the docs Overview and the Getting Started nav.

## 0.3.16

- **Terminal-style line editing in the shell prompt.** The command prompt now
  moves like your shell: **Option+←/→** jump by word, **Ctrl+→** (or End /
  Ctrl+E) goes to the end of the line and **Ctrl+←** (or Home / Ctrl+A) to the
  start, ←/→ move a character, and edits land at the cursor - not just the end.
  (Replaces `ink-text-input` with a small controlled input we own; Up/Down,
  Tab, and Esc still drive history, completion, and navigation.)

## 0.3.15

- **Prompt autocomplete now completes values, not just commands and flags.**
  After a value-taking flag, the ghost list fills in the right values: static
  enums (`--effort low|medium|high`, `--priority`, `--flow-context`,
  `--checklist`) and **live ids from your project** for `--crew`, `--flow`,
  `--profile`, `--task` (the `--effort=hi` inline form works too). Id-typed
  positionals complete the same way - `replay ` offers your run ids, `tasks
  show ` your task ids, `flows show ` your flow ids - resolved from the command
  itself, while free-text arguments (a `run "…"` description, a task title)
  are correctly left alone.

## 0.3.14

- **The shell prompt autocompletes.** As you type a `vibe …` command, a ghost
  list opens under the prompt with the commands, subcommands, and flags that
  fit - walked from the real CLI tree at launch, so it never drifts from what
  the binary actually accepts. A word completes subcommands (`config ` ->
  view / show / get / set / validate); a dash completes flags (`config show -`
  -> `--json`). Tab accepts, arrows move, Esc dismisses; history still rides
  the arrows while the prompt is empty.
- **Verbose command output stops looking broken in the shell.** When a prompt
  command finishes with many lines or wide YAML / tables (e.g. `config show`,
  `status`), the shell now auto-opens the full-width readable view instead of
  mangling it in the narrow output column - press `O` or `Esc` to collapse.

## 0.3.13

- **A readable Config view, not a raw YAML dump.** `vibe config view` groups the
  resolved project config (providers, profiles, crew, git, workflow, validation,
  budget, policies, scheduler, editor, and more) into labelled sections and, for
  each one, points at where it's editable - a dashboard page (Providers /
  Profiles / Crew / Settings) when there's a live editor, or the exact
  `vibe config set` path when there isn't. `--json` emits the structured view.
  The same surface lands in the dashboard as a **Config** page (under **More**,
  each live section deep-links to its editor) and in the shell as a **Config**
  page - full UI/CLI parity. `vibe config show` still prints the raw YAML when you
  want it; the in-shell command palette keeps both ("Go to Config" and "Show raw
  config").

## 0.3.12

- **Effort that won't take effect is now loud, not silent.** If a profile sets an
  effort level the provider would ignore - one outside its real levels, or a
  provider with no effort knob at all - the run now warns (progress + a
  `provider.effort_ignored` event) instead of quietly sending a value the CLI
  drops. Closes the last "advisory dial" gap; verified against claude 2.1.160,
  whose `-p` (headless) mode honors `--effort low/medium/high/xhigh/max` but
  silently defaults on an unknown value.

## 0.3.11

- **Auto-fill the catalog from `--help`.** `vibe provider refresh` probes your
  configured CLI providers' `--help`, parses their model/effort knobs, and writes
  them into the overlay for review - so you don't have to hand-author every
  entry. It's local only (runs the provider's own `--help`, no network, no API
  keys) and gap-fills: it never overrides a built-in spec or your hand-authored
  entries unless `--force`. `--dry-run` previews. Same action in the UI: a
  "Refresh from providers" button on the Providers page, and `r` on the shell
  Profiles page. (Probing cloud `/models` is intentionally out - that would mean
  egress with your key.)

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

