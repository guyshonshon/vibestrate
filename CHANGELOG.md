# Changelog

## 0.36.0

- **Preferences and policies are now one project-level surface, enforced by
  whichever supervisor is active.** A rule like "use a hyphen, not an em-dash" is a
  property of the *project*, so it no longer lives on a single supervisor where
  switching supervisor silently dropped it. Every rule is now a **project policy**
  with a **tier**: `advise` (the reviewer checks it; rides the normal review and fix
  loop) or `block` (a deterministic matcher that caps the merge, even on an approved
  review). Manage them with `vibe policies add|list|remove|confirm|reject` or the new
  **Project policies** section on the dashboard Policies page - which can author a
  block's matcher, closing the gap where the hard tier had no UI. The supervisor keeps
  only its judgment (review lenses + posture); it carries the project's rules into the
  review but does not own them. The hard security gates (secret-leak refusal, the
  Action Broker's deny rules, the `.vibestrate/policies/*.yml` engine) are unchanged,
  still fail-closed, and visibly distinct from the soft tiers. Still optional: a plain
  run needs zero policies.
- **Migration:** rules previously stored as `personas.<id>.preferences` move to the
  top-level `projectPolicies` surface. Run `vibe policies migrate` once; until you do,
  an old config fails to load with a message pointing at the command. Design note:
  `docs/design/policy-consolidation.md`.

## 0.35.0

- **A preference can now hard-block a merge, not just advise (preference gates
  M2).** Mark a rule as a block with a pattern - `vibe preferences add
  <supervisor> no-em-dash "do not use em-dash characters" --block --pattern "—"` -
  and if the run's diff contains a match, the run lands `blocked` with the reason
  surfaced, **even if the reviewer approved**. The block is deterministic (a
  regex, not a model verdict, so it can't false-positive-storm your merges or
  clobber the correctness review), scans from the run's fork point (so changes a
  flow commits mid-run are caught), skips secret files, and fails closed if it
  can't read the diff. Block rules are owner-only - the supervisor can propose an
  advise rule, never a hard gate. Still optional: a plain run has no blocks.

## 0.34.0

- **Tell the supervisor a rule in a consult, confirm it once (preference gates
  M1.5).** When you tell the supervisor something durable in a consult - "stop
  using em-dashes", "no eyebrow labels" - it can now propose that as a preference.
  The proposal lands *pending*: it does nothing until you confirm it, so a model
  can never quietly add a rule the reviewer enforces. Confirm or reject it with
  `vibe preferences confirm|reject <supervisor> <id>`, or from the Supervisors
  page, where pending proposals show up with Confirm / Reject next to the rules
  already active. Still optional end to end - a plain run carries none of it.

## 0.33.0

- **Teach a supervisor a preference without touching YAML (preference gates
  M1).** `vibe preferences add <supervisor> "use a hyphen, not an em-dash"` and
  it is live on the next review - or do it from the Supervisors page, where each
  card now has a one-line add field and a remove for the rules it checks. An
  owner add is trusted on creation, so there is no confirm step to wade through.
  Adding a preference to a built-in supervisor materializes a faithful project
  copy (its review lenses and posture are preserved, not wiped). All of this
  stays optional by design: a plain `vibe run` needs zero preferences, zero
  policies, zero gates - the depth is there when you want it, never on the path
  to a simple prompt.

## 0.32.0

- **Preference gates (M0): teach a supervisor a rule, the reviewer checks for
  it.** A supervisor can now carry `preferences` - stated rules like "use a
  hyphen, not an em-dash" or "no eyebrow labels" that are real but not worth a
  lint rule. On a review turn the reviewer is told to check the change against
  each and name the fix, and a flag rides the normal review-and-fix loop. It is
  advisory (never a separate merge gate in this slice), a preference is injected
  only after you confirm it (unconfirmed entries are inert), and the reviewer is
  handed the exact diff - not a summary - so it can actually see a line-level
  violation. Design note and the deferred `block`/capture milestones:
  `docs/design/preference-gates.md` (adversarially reviewed before build).

## 0.31.2

- **Step-colour legend on the Flows page.** The Build / Review / Check / Gate
  legend now also sits in the Flows catalog header, so the colours on each flow
  card's step-meter are recognizable there, not just in the builder. (Extracted
  to one shared `StepKindLegend` so both pages stay in sync.)

## 0.31.1

- **Step colours now mean something - consistently.** Steps are coloured by what
  they do, not one arbitrary hue per kind: violet = Build (agent / response),
  blue = Review (review / summary), green = Check (validation), amber = Gate
  (approval). The step list and the bar-meter now share one colour map (they
  previously disagreed - a review was blue in the list but violet in the meter),
  and a small legend in the builder explains it.

## 0.31.0

- **Prompt composition moved to Dry-run.** The "how the prompt is composed"
  visual is no longer in the step config - it now lives in the Dry-run preview,
  where the flow is resolved, so each step shows the *real* role filling its seat.
  Open any seated step in the dry-run to see its layered prompt (role, task, step
  context, prior outputs, instructions, review lens) flowing into the final
  prompt. The Instructions field keeps just the box, a counter, and a pointer to
  the dry-run.

## 0.30.9

- **See how a step's prompt is composed.** The Instructions field now shows a
  visual stack of the layers that blend into the prompt the agent receives -
  role, your task, step context, the prior outputs it reads, skills, your
  instructions (folded in live), and the review lens - flowing down into the
  final prompt. Deterministic layers show real values; run-time layers are
  dashed and marked, with a pointer to the exact `flows/<step>/prompt.md`.
  Replaces the old one-line "injected into this step's prompt" caption.

## 0.30.8

- **"Optional" shows on the step, live.** Marking a step optional in the
  inspector now tags it in the step list immediately (not only after a save) -
  the rows reflect in-progress edits, not just the saved flow.
- **Dropped the redundant "Editable" chip.** A project flow no longer wears an
  "Editable" label; only read-only builtins carry the "fork to edit" note.

## 0.30.7

- **Per-step instructions, with the prompt explained.** Each turn step in the
  Flow Builder now has an Instructions box (the free-form text injected into that
  step's prompt), plus a panel that spells out how the complete prompt is
  assembled at run time - auto context, your instructions, the review lens, then
  the run brief and earlier outputs - and where to read the exact text
  (`flows/<step>/prompt.md` in each run). The field is wired end-to-end through
  the flow patch API.
- **Order sanity warnings.** The builder now flags a step that has nothing to act
  on - a review, response, summary, or approval gate placed before any
  agent-turn produces work - with an amber marker on the step and a note in the
  inspector. It only warns; it never blocks (a multi-reviewer panel *after* the
  build is still fine).

## 0.30.6

- **Tidier Flow Builder header.** A read-only flow's "fork to edit" note now sits
  inline next to the flow name instead of on its own row, freeing vertical space.
- **Drag-only step reorder.** With drag-to-reorder in place, the per-step up/down
  arrows are gone - drag the grip handle to move a step.
- **Themed confirm dialogs.** Deleting a flow or restoring it to the last saved
  state now asks through an in-app themed dialog (portaled, so it centers
  correctly) instead of the browser's native prompt.

## 0.30.5

- **Undo / redo / restore in the Flow Builder.** The editor toolbar gained an
  edit history: step a change back or forward, or restore the whole flow to its
  last saved state. Every draft edit (rename, kind, seat, skills, approval,
  add / remove / drag-reorder a step, loop) is captured; nothing touches disk
  until you Save.
- **Approval gates explain themselves.** The step inspector now spells out what
  happens at a gate - the run pauses (no agent), a person sees your reason and
  message, the risk level and the prior step's output, reviews the run's diff so
  far, then Approves to continue or Rejects to stop. They sign off on the work
  up to that point, not every line in an editor.
- **Sensible config order.** The step inspector follows the order you actually
  think in - name, kind, seat, skills, then the modifiers (approval gate, then
  optional) - instead of "optional" sitting oddly in the middle.

## 0.30.4

- **Docs are one click from the controls.** The Flow Builder's config labels
  (Kind, Seat, Approval gate, Skills, Loop) now carry a "?" that opens the
  matching docs page, so you don't have to leave to find what a setting means.
- **Step kinds got an icon and a clearer "based on".** Each kind's description
  now leads with an icon, and the review-turn blurb spells out what it acts on -
  the seat you bind below, filled by your crew at run time - which was the part
  that wasn't obvious.

## 0.30.3

- **Step kinds explain themselves.** The Flow Builder's "Kind" picker was six
  unlabelled tokens (`agent-turn`, `review-turn`, ...) with no hint at what each
  does. It now shows, for the selected kind, a plain-language description and the
  run phase it drives (e.g. review-turn -> "reviewing"), and every option carries
  the same explanation on hover - so it's clear what each turn does and how they
  differ. (Sourced from the flow docs + the orchestrator's own kind-to-status
  mapping.)

## 0.30.2

- **Readable YAML in the Flow Builder.** The raw-YAML editor used CodeMirror's
  default theme, which rendered keys in a dark blue that was unreadable on the
  coal ground. It now uses the dashboard palette - violet keys, emerald strings,
  amber scalars, muted comments - and the colours are theme tokens, so the
  editor stays legible in both light and dark (the panel itself flips).
- **Drag-and-drop step reordering.** Reorder a flow's steps by dragging them
  with the new grip handle - the dragged row dims to a ghost and a violet
  insertion line shows where it will land. The up / down arrows stay for
  keyboard / precision moves; both routes save through the same path.
- **Bigger fact tiles.** The Flow Builder header's stat tiles (steps, seats,
  version, source) are larger and read as real cards, not cramped chips.

## 0.30.1

- **Flow Builder header is fully contained.** The flow's facts (steps, seats,
  version, source) now read as framed stat tiles instead of a grey
  `2 steps · 2 seats · v1` line; the "read-only - fork to edit" note is a
  contained amber callout with a lock, not a sentence trailing off the title;
  and the flow actions (dry-run, fork/delete, edit-as-YAML, save, set-default)
  sit in one carded toolbar instead of buttons stranded at the far right. The
  duplicate state chips and meta on the editor / YAML cards were removed so the
  flow's state lives in exactly one place.

## 0.30.0

- **New-run and the Flow Builder join the new look.** The two remaining
  Phase 3 surfaces are redesigned onto the coal/chalk/violet foundation, so
  composing a run and editing a flow now read the same as Mission Control and
  the Flows catalog.
  - **New run** is the page-scale sibling of the dashboard composer: flow and
    crew are picked as tiles carrying the signature step-meter, the run-mode and
    tuning controls are labelled segments, and the launch button states its own
    blocker ("Add a task brief to start") instead of a separate readiness line.
    The live `vibe run` command mirror, the selected flow's inputs, the inline
    "ask the supervisor" rail and the metrics / recent-runs quick-looks all
    moved onto the same framed cards.
  - **Flow Builder** dropped its old slab surfaces, eyebrow kickers and grey
    meta for contained cards, sentence-case violet section labels and the shared
    input styling - the step list, inspector, loop / policy / preview cards and
    the raw-YAML editor all match now. Behaviour is unchanged; this is a re-skin.

## 0.29.5

- **One flow card everywhere.** The community-hub flows now render through the
  same `FlowCard` as the local catalog - icon, step-meter, description, framed
  stat tiles and a contained action - so a flow looks the same whether it's
  yours or pulled from the hub. (Hub rows expose only a step count, so their
  meter shows shape in neutral grey rather than the per-step colours local
  flows carry.)
- **Publish a flow is always available.** The publish form no longer hides
  behind expanding the hub browser - it sits on the Flows page regardless.

## 0.29.1

- **Flow cards read as data, not grey text.** The faint "8 steps · 6 seats · v1"
  line is gone - a flow's facts now sit in compact framed stat tiles (bold value
  over a violet unit: steps, seats, gates, version). The "Pull a flow" hub
  section gained the same contained framed header as "All flows".

## 0.29.0

- **One shell for the whole app.** Mission Control's left sidebar is now the
  single navigation chrome every page renders inside - the horizontal top bar
  is retired. Flows, Crew, Metrics and the rest no longer wear different chrome
  from the dashboard; you get the same brand block, run counts, New-run button
  and utility controls everywhere. Mission Control and every other page now
  share one sidebar implementation rather than two look-alikes.
- **Flows header is contained and matches Mission Control.** The page title is
  now the same weight and size as "Mission control", and the "All flows"
  blurb plus the New flow / Import actions sit in a single framed header block
  instead of floating loose on the canvas.

## 0.28.6

- **The flow hub matches the catalog now.** The community-flow marketplace and
  its publish form moved onto the same card and form styling as the rest of the
  Flows page - no more separate solid-block cards or grey uppercase labels.

## 0.28.5

- **Flow cards now read like the rest of the app.** Stripped to Mission Control's
  shape - the flow icon, the name, the step-meter, one line of stats - with the
  category tags removed (the default flow just gets a green mark). The actions
  moved into a real button plus an overflow menu instead of a wrapping row of
  text links.

## 0.28.4

- **The Flows catalog matches the rest of the app now.** The flow cards were a
  separate look - solid color blocks, a big display heading, white cards that
  clashed in dark mode. They're rebuilt on Mission Control's own flow card, with
  the same colored step-meter that shows each flow's makeup at a glance (review,
  validation, gates). Categories read by color (default green, built-in violet,
  project blue) instead of faint grey, and the descriptions no longer cut off
  mid-word.

## 0.28.3

- **The All-runs page is on the new look.** The runs table now shows the same
  status badge as the rest of the app, and the "integrate merge-ready runs" panel
  reads as a tidy list of selectable runs with its safety flags ("never main",
  "never push") called out, instead of a run-on header and a flat checklist.

## 0.28.2

- **Review findings read as a list of findings, not a run-on line.** Each
  finding is now its own framed row with a tinted severity tag, the title, the
  file, and the detail underneath, matching the rest of the run screen. (The
  other run-page panels - steps, the live timeline, live metrics, startup - were
  audited and already carried real structure, so they were left as-is.)

## 0.28.1

- **The run screen's panels are properly structured, not just re-skinned.** The
  supervisor, brief, run-assurance, and workspace blocks were carrying loose
  labels and dot-separated text floating with no real grouping. They now use the
  same framed-row idiom as Mission Control: the assurance verdict reads as a grid
  of gate cells (policy / validation / review / verification, each tinted by its
  own status), the brief's meta is a row of labeled stats, the supervisor's
  decision feed is a list of framed rows, and the workspace shows an icon-tile
  identity with the path in its own field. No data was removed - everything that
  was there is still there, just legible.

## 0.28.0

- **The new look now reaches every page.** The app's shared shell - the top
  navigation bar, the page canvas, and the common building blocks (buttons,
  dropdowns, chips, the phase rail) - moved onto the coal/chalk foundation. The
  background is now the softer coal tone instead of near-black, and every button
  and dropdown across the app picks up the rounded, violet-accented styling, in
  both dark and light. Pages whose bodies haven't been individually redesigned
  yet keep their current layout but immediately inherit the new chrome, so the
  whole app reads as one piece while the per-page passes continue.

## 0.27.0

- **The run screen is redesigned onto the new coal/chalk foundation.** Every
  surface on the run-detail page now matches the Mission Control look: rounded
  cards instead of square slabs, the violet single-hue accent, dense informative
  rows, and one status badge that reads the same everywhere. The header, the
  brief and flow rail, the live timeline, the step inspector, the supervisor and
  review panels, the run switcher, and the scheduler queue all came across, in
  both dark and light themes. Along the way the page shed its leftover eyebrow
  kickers, a stray pulsing dot on the live timeline, and the old outlined "pill"
  chips. We also removed six dead run panels the earlier redesign had already
  orphaned (keeping the two review-suggestion panels intact for a future rewire).

## 0.26.9

- **Resuming a checklist run keeps its context, and refuses a changed checklist.**
  When you resume an aborted `pickup` / `pickup-review` run, the still-pending
  items now see the items the earlier run already finished - carried forward as an
  "already done, do not redo" ledger - instead of starting blind, so the run stays
  coherent across the resume and the final review sees the whole checklist. And if
  the task's checklist was edited between the original run and the resume (items
  added, removed, or reordered), the resume is refused with a clear message rather
  than silently skipping or re-running the wrong item. (Skipping the
  already-committed items on resume already worked; this fills the two gaps a
  design review found around it.)

## 0.26.8

- **Supervisors viewer on the dashboard.** A new read-only Supervisors page (under
  More) shows the full catalog of supervisor personas - the orchestrator's judgment
  postures - with what each one aims the reviewers at (its review lenses), the flow
  it favors for risky work, the reviewer profile and safety posture it suggests, the
  spec-up CTO posture it injects, and which persona is the project default. It
  mirrors `vibe supervisor list` and the run composer's selector. Personas are still
  authored in `project.yml`; this is a viewer, not an editor. Under the hood the CLI,
  the `/api/personas` endpoint, and this page now share one persona-catalog builder,
  so the three surfaces can't drift.

## 0.26.7

- **The Flow Builder's YAML view is a real code editor with a live preview.** The
  raw-YAML escape hatch was a plain textarea; it's now a CodeMirror editor (syntax
  highlighting, line numbers, bracket matching) shown side by side with a live
  graph preview that re-renders as you type, so you can see the flow's shape while
  editing its source. YAML stays the single source of truth in this view and the
  preview is read-only, so the form and the source can't silently diverge. The
  editor is lazy-loaded - it adds nothing to the initial dashboard load and is
  fetched only when you open the YAML view.

## 0.26.6

- **Status dots are static again.** Removed the pulsing animation from three live
  indicators - the running-step dot on a flow graph, the terminal's streaming
  dot, and the workspace's "N live" dot - so a status dot signals state by color,
  not motion. (The dashboard's loading-skeleton shimmer is unchanged.)

## 0.26.5

- **A run's audit tree is now in the interactive shell.** The Runs inspector
  gained an **Audit** tab (press `u`) that shows the same per-step "what
  happened" tree as `vibe audit` - each step's status and stage, its retries and
  whether it fell back to a backup profile, the review/verification decision, the
  run totals (turns, retries, fallbacks, cost), and the run-level control events
  (budget caps, pauses). It's derived live for the selected run only, so opening
  it never slows the run list. The web dashboard already showed this on the run's
  tree; the shell is now at parity.

## 0.26.4

- **The interactive shell's tab bar fits narrow terminals.** Below ~80 columns the
  numbered page nav used to wrap onto several rows; it now collapses to a single
  row of numeric hotkeys with only the current page labelled, so the header stays
  one line at any width. Wider terminals are unchanged.

## 0.26.3

- **`vibe assurance` and `vibe audit` accept a run's name, not just its id.** Both
  commands resolve their argument by run id first, then fall back to the run's
  display name (the one you set with `vibe rename`), so you can paste the readable
  name instead of hunting for the id. An exact name wins over a case-insensitive
  match, and an ambiguous name is refused with the matching ids rather than
  guessing one.

## 0.26.2

- **Configured custom CLI providers now show on the Providers dashboard.** If you
  hand-wired a provider with an id Vibestrate doesn't detect (a custom `mycli`),
  it was saved to `project.yml` but never appeared on the Providers page - only
  known CLIs and HTTP / local-server providers were listed. It now shows in the
  Optional section, configured and manageable like any other, next to the
  existing "Custom CLI" add button.
- **Fixed a cross-tenant leak in the provider-list cache.** The dashboard's
  provider list was cached in one process-global slot, so when a single process
  served more than one project (the multi-project navigator's isolated tenants),
  one project could briefly be shown another's provider list. The cache is now
  keyed per project. No effect on a normal single-project run.

## 0.26.1

- **Patch-apply survives line-ending mismatches.** When an applied suggestion's
  diff used different line endings than the file it targets - real on Windows
  repos under `core.autocrlf=false` - `git apply` would reject a perfectly valid
  edit. Apply now normalizes the patch's line terminators to the target file's
  on a `git apply --check` failure, re-checks, and only then applies, so the edit
  lands with consistent endings instead of being refused. Strict apply is
  preserved (never `--ignore-whitespace`, which would have written a mixed-ending
  file), line content is never rewritten, and a patch that still does not match
  is refused cleanly rather than corrupting the file. Covers single-suggestion
  apply, revert, and bundle apply.

## 0.26.0

- **Native Windows support (full core loop).** Vibestrate now runs natively on
  Windows - PowerShell or cmd, no WSL required - for the whole core loop:
  install, configure providers, run agent orchestrations, review diffs, and
  merge. A `windows-latest` GitHub Actions job runs the full suite (typecheck,
  build, test) on every push as a separate, non-required pipeline - so the build
  never waits on or depends on the slower Windows runner - so this is verified
  rather than aspirational, and real npm provider shims (`claude.cmd`,
  `codex.cmd`, `gemini.cmd`) are proven to spawn. A new `src/platform/` seam centralizes the platform-specific bits:
  process-tree kills go through `taskkill /T /F` on Windows (a process-group
  signal on POSIX), artifact keys are POSIX-normalized so they stay stable across
  platforms, and `vibe doctor` now points at the usual Windows "command not
  recognized" causes (stale PATH, PowerShell execution policy). The one carve-out
  is the in-app integrated terminal tab, which stays WSL-only; everything else
  works natively. There's a new Windows page in the docs. (Docker isolation on
  Windows is future work; native execution is the supported path.)

## 0.25.1

- **Per-item review lenses are now configurable (Shape B follow-up).** The per-item review panel shipped in 0.25.0 with a fixed correctness + security-risk pair; you can now choose which lenses review each checklist item. Set `checklistReview.lenses` on a flow, or `checklistReviewLenses` on a crew (precedence: crew > flow > default). Each selected lens from the closed vocabulary (correctness, tests, security-risk, authz, secrets, injection, ux-ia, accessibility, visual-consistency, performance) becomes one read-only reviewer per item, and the arbiter weighs them all. A `security`-minded crew can aim every per-item panel at secrets + injection without touching the flow. Wired at flow-resolution time, so the live run, the dashboard, and the CLI all see the configured reviewers.

## 0.25.0

- **Per-item review (checklist Shape B).** The new `pickup-review` flow reviews each checklist item on its own: after the item is written, a panel (correctness + security-risk) and an arbiter review THAT item's diff, and a bounded per-item fix loop runs before the item commits. Each item gets its own arbitration ledger, so findings and verdicts never collide across items. If an item's fix loop ends with the reviewer still requesting changes, the run continues but cannot be marked merge-ready (the gap is surfaced per item) - it never silently passes and never hard-aborts. Per-item diff scoping is automatic (HEAD-relative snapshot + commit-per-item), so no extra diff-base machinery is needed. New surfaces: `GET /api/runs/:id/checklist-verdicts`, a dashboard verdict panel, and `vibe assurance` / `vibe audit` per-item lanes. Deferred: session reuse, suggestion ingest, extra panels, auto-selection, and configurable lens selection (`checklistReview.lenses` is a forward schema surface - not yet wired into reviewer assignment).

## 0.24.1

- **Publish hardening (post-review).** Three fixes from an adversarial review of
  the 0.24.0 publish path: (1) the token-bearing publish POST now uses
  `redirect: "manual"` and refuses any 3xx - the origin pin only validated the
  original URL, so a redirect was the one path that could have re-issued the
  request off-origin; (2) a URL with embedded credentials (`scheme://user:pass@host`)
  and a JWT are now hard *refusals*, not warnings - both are literal secrets and
  publish is irreversible; (3) honest wording below about exactly what the secret
  scan catches. No behavior change for a clean flow.

## 0.24.0

- **Flows Hub: publish.** `vibe flows hub publish` and a dashboard form push a project Flow to the public registry. GitHub-token auth via `VIBESTRATE_HUB_TOKEN` (env-ref only, never inline); the token is pinned to the hub origin and never sent elsewhere (it does not follow redirects). The publish refuses a flow whose content matches a known secret shape (AWS / GitHub / Slack / Stripe / Google / Anthropic / OpenAI keys, PEM private-key blocks, JWTs, and `user:pass@host` URLs) - it is a high-precision scan, not a guarantee, so a generic or unprefixed secret can still slip through; review the flow before you publish. Home-dir and identity leaks surface as warnings before the irreversible publish. Versions are immutable - a re-publish of identical content at the same version is idempotent (409); new content requires a new semver. The dashboard route is fail-closed: it requires `VIBESTRATE_API_TOKEN` plus an explicit `confirm: "publish"` literal in the request body. The `--handle` must match the authenticated GitHub login; the server enforces this.

## 0.23.1

- **Posture auto-apply has dashboard switches now.** The two opt-in posture
  flags (`autoApplySandbox` / `autoApplyApproval`) shipped editable from the CLI
  and the raw-YAML config; they now also have proper on/off toggles in the
  dashboard's Advanced - Safety panel, with plain-language hints and a live
  preview of what a run will do. UI and CLI are at parity.

## 0.23.0

- **A suggested safety posture can now actually take effect.** When the
  supervisor (or a persona) flags a run as wanting a sandbox or an approval gate,
  that suggestion was previously advisory only. Two new opt-in switches let it
  apply automatically: `posture.autoApplySandbox` runs that task OS-sandboxed, and
  `posture.autoApplyApproval` makes each change wait for your approval. Both
  default off (a behavior change is never silent), an explicit `--permission-mode`
  always wins, the approval gate is suppressed for `--unattended` runs so they
  never stall, and a provider that can't sandbox (claude) degrades honestly
  per-seat instead of pretending. What was applied is surfaced at run start.

## 0.22.0

- **Edit the spec before you build it.** A spec-up run's drafts - scope,
  specification, architecture, and risks - are now editable in place on the run
  screen (and from the CLI with `vibe spec-up edit`) before you approve the build,
  so the build builds from *your* corrected spec, not only the AI's first draft.
  Edits are locked once a build is approved (the spec it built from is frozen), and
  the write is heavily guarded: it only touches that run's own draft files, refuses
  to save anything that looks like a secret, and is symlink/hardlink-safe. The
  dashboard route requires an API token, matching the merge-to-main route.

## 0.21.0

- **Notifications are local-only now.** The external notification gateways (Slack,
  Telegram, Discord, generic webhook, and the WhatsApp placeholder) are gone -
  Vibestrate delivers notifications only to the in-app feed and the CLI, with no
  outbound network calls from the notification path. This keeps the tool's
  no-external-comms posture honest. Your existing notification history is preserved
  across the upgrade.

## 0.20.0

- **Supervisors now shape the spec-up phase, not just the build.** A supervisor
  can carry a `specUpPosture` - a CTO lens applied to the planning agents while
  they scope the work, write the spec, and design the architecture. The built-in
  `security` supervisor brings an authorization / secrets / attack-surface lens to
  spec-up; the default supervisor stays neutral, so plain spec-up runs are
  unchanged. The posture follows the whole spec-up chain (intake -> spec -> roadmap),
  not just the first question, and which supervisor aimed it is recorded on the run.

## 0.19.0

- **Supervisors now aim the reviewers, not just label them.** A supervisor's
  review lenses used to be descriptive text shown in the UI. They now actually
  steer the independent reviewers: the `security` supervisor points them at
  authorization, secrets, and injection; the default `staff-engineer` at
  correctness, tests, and security risk. Switch supervisor and the reviewers
  scrutinise the same diff differently - and which lenses ran is recorded on the
  run. Lenses come from a fixed vocabulary, so a project persona can't smuggle
  free-form instructions into a reviewer's prompt, and the binding arbiter is
  never aimed (only the lensed reviewers).
- **A supervisor can suggest a heavier posture for risky work.** A new
  `prefersPosture` field lets a supervisor nudge a risk-tagged run toward a
  sandbox or approval posture (the `security` supervisor suggests sandbox). It's
  advisory - a suggestion surfaced to you, never a gate and never a downgrade -
  and the default supervisor stays neutral, so plain runs are unchanged.

## 0.18.1

- **Git tree: resolved merges keep your whole file and its line endings.**
  Applying a supervisor-resolved conflict now reconstructs the entire file with
  every non-conflicting line preserved, and keeps a CRLF file CRLF instead of
  silently rewriting it to LF. Also removes a fallback that could have written
  only the resolved regions.

## 0.18.0

- **Interactive git tree + supervisor-assisted merge.** A new dashboard surface
  draws your branches and commits as an explorable graph. Pick any source and any
  target, see the *predicted* merge and its conflicts **before** anything is
  applied, apply on an explicit click, and undo a merge with one click. It is the
  any-node-to-any-node evolution of the merge advisor, not a separate tool.
- **The supervisor proposes conflict resolutions.** On a conflict, your local
  provider proposes a merged version of each conflict region to review and edit -
  and it is secret-safe: a secret-shaped file is refused outright (never sent to a
  provider), and conflict bodies are redacted before they leave your machine.
- **Reversible and gated, like everything else.** Every merge is human-clicked,
  passes the Action Broker (`git.merge`), runs `--no-ff` locally, never pushes,
  and records the pre-merge sha so Undo is a guarded reset. Undo refuses once the
  merge is built upon or has reached an upstream. Dashboard merges require
  `VIBESTRATE_API_TOKEN` (a tokenless local API is reachable by any process). The
  interactive canvas is UI-only by design; the underlying operations are plain git.

## 0.17.0

- **"Shape" is now "Spec-up".** The planning phase that turns a vague brief into a
  scoped spec, an architecture, the risks, and a reviewable roadmap got a clearer
  name. This is a full rename - the `vibe spec-up` command (and its `start` /
  `questions` / `answer` / `simplify` / `suggest` / `approve` / `build` /
  `roadmap` subcommands), the `/api/spec-up/*` routes, the flow ids
  (`spec-up-intake` / `spec-up` / `spec-up-roadmap`), the `adaptiveSpecUp` config
  key, the dashboard labels, and the docs all moved together. Nothing about the
  behaviour changed.
- **Heads-up for in-flight runs:** the rename touches persisted state - the run
  loop-guard flag (`shaped` -> `specUpPhase`), the selection source
  (`"shaped"` -> `"spec-up"`), and the on-disk sidecars (`spec-up-*.json`). Runs
  started before this version won't resume; finished runs are unaffected.

## 0.16.0

- **Start the planning phase from the dashboard.** The intake that gathers
  specifications before a build used to be launchable only from the CLI. The
  compose page now has a **Plan first** action that kicks it off, and a run that's
  waiting on your answers is surfaced honestly - labelled, findable, and it opens
  straight to the questions - instead of being mistaken for a blocked or failed
  run.
- **Generate roadmap proposals from the dashboard.** The proposals page gained a
  Generate action (run the planner on a goal) and now labels each proposal's
  origin, from a spec run vs an ad-hoc plan, so the one proposals inbox shows
  where each draft came from.
- **Cleaner gap-questions screen.** The scoping screen was redesigned to a calmer
  borderless layout with clearer hierarchy between the area menu, the question
  list, and each answer.
- **Fixes:** the screen-aware consult orb no longer errors with "Unrecognized key
  viewContext"; per-question Simplify/Suggest no longer attach to the wrong
  question when the planner reuses an id; read-only runs (like a spec intake) no
  longer inflate provider success rates or show up as bogus merge candidates; and
  a run that paused to ask you questions is recognised as awaiting your input
  rather than blocked, and stops re-showing its form once answered.

## 0.15.2

- **`workflow.maxReviewLoops` now actually does something - as an opt-in global
  ceiling.** It used to be settable and shown but inert (the real budget is each
  flow's own loop, 3 in the built-ins). Now: leave it unset (the new default) and
  every flow keeps its own budget; set it to N and it caps every flow at N rounds
  (a per-crew `maxReviewLoops` still takes precedence). **Heads-up for existing
  projects:** if your `.vibestrate/project.yml` still carries the old
  `workflow.maxReviewLoops: 2`, it was previously ignored (you were getting 3) and
  is now enforced as a 2-round ceiling - delete the line to keep the per-flow
  budget. New projects omit it by default.

## 0.15.1

- **Every AI advisor prompt is now secret-redacted by default.** The consult orb,
  the per-question Simplify/Suggest helpers, and the other read-only assist paths
  all run their assembled prompt through the same secret scrubber before it
  reaches a provider - so a token you happened to type or paste never crosses to
  the model, on any of those paths, not just the ones that already scrubbed their
  own input.
- Hardened the deep-questioning chain with an end-to-end test covering the whole
  loop: round increments, the four-round cap, cross-round answer accumulation, the
  "proceed" escape, and the chosen build flow surviving every round.

## 0.15.0

- **Shaping now goes deep, in rounds, until the work is actually scoped.** The
  intake used to ask one batch of questions and stop. Now it loops: you answer a
  round, and the CTO reads your answers and asks the follow-ups that are still
  genuinely open - drilling into what you just decided - up to four rounds, with
  a **"Proceed to spec"** escape on every round so you're never trapped. Questions
  are grouped by area (scope, users, data, constraints, success, integrations) so
  you can see coverage fill in. The round counter and the cap are server-owned -
  the model can't run the loop forever, and a request can't skip the cap.
- **Two helpers on every question.** **Simplify** re-explains a question in plain
  language and tells you what it actually changes in the build (with an optional
  no-jargon analogy for non-developers). **Suggest** drafts an answer grounded in
  what you've already decided, with a one-line "why" - but it's a *draft you edit*,
  never auto-submitted, and a guard warns before you submit answers you haven't
  reviewed. There's a "Suggest all remaining" for a whole round. Both run on the
  same read-only assist engine as consult.
- **The consult orb now knows what screen you're on.** On the shape screen it's
  handed a live snapshot of the questions and your answers, so when you ask "what
  should I put for auth?" it already has the context. The snapshot is redacted
  before it ever reaches the model.

## 0.14.0

- **Acceptance criteria are now a real gate, not just a note.** A roadmap card's
  acceptance criteria used to be written down and then ignored at run time. Now
  they actually gate "done": the criteria are carried into the run so the agent
  builds to them, and the **verifier must confirm each one** - if a criterion
  isn't met (or can only be judged by a human), the run doesn't pass on its own.
  That's the honest, always-on half (an LLM judging prose against the artifacts).
- **And a machine half when you want it.** A card can carry
  `acceptanceCommands` - shell commands that must pass for the card to be done.
  They run as an extra validation pass on the card's run, so a failing acceptance
  check blocks merge-readiness the same way a failing test does. You author them
  (they're not generated by the model), so they carry the same trust as your
  project's validate commands. Together with the container backend and permission
  modes, a card can now build in a sandbox, under a chosen policy, and be checked
  against its own definition of done.

## 0.13.0

- **accept-edits now actually holds and resumes.** The accept-edits mode used to
  auto-apply your changes and then just block the run; now it genuinely **pauses
  for your sign-off** at the finish line and **resumes to merge-ready when you
  approve** (reject it, or let an unattended timeout lapse, and it blocks). The
  permission mode a run ran under is now recorded on the run so reports reflect
  the policy that was actually enforced, not the one requested. The dashboard
  launch form gains the full permission-mode picker (read-only / ask /
  accept-edits / auto), matching the CLI and API.
- **A policy-load failure now fail-closes the merge too.** Extends the 0.12.0
  fail-closed fix: if the action policy can't be read, the merge-to-main is also
  refused (not just writes and run completion) - it's the most irreversible
  effect and only ever human-initiated, so a refusal just means retry once policy
  loads.

## 0.12.0

- **Permission modes - pick how much rope a run gets.** A run now takes a
  `--permission-mode`: **read-only** (no writes at all), **ask** (a human
  approves every change before it's kept), **accept-edits** (changes auto-apply,
  but you sign off before the run completes), or **auto** (fully hands-off, the
  default). The mode is enforced by Vibestrate, the same way for every provider -
  it's not a per-model flag. Set it per run (`--permission-mode`, the API, the
  dashboard) or as a project default (`policies.defaultPermissionMode`);
  `--read-only` is now an alias for read-only mode.
- **Two fail-open holes in the safety gate, closed.** Both are the kind of bug
  that's invisible until it bites: (1) if the action-policy file couldn't be read
  at all, the broker used to wave every effect through - now it **refuses writes
  and run completion** (while still letting a run start, so a transient disk hiccup
  can't brick everything). (2) If Vibestrate couldn't snapshot the worktree before
  a write turn, it used to silently skip the diff check and keep the writes anyway
  - now that turn is **refused outright**, because a change it can't gate or roll
  back shouldn't land. Default behavior is unchanged for healthy runs.

## 0.11.0

- **Run inside a disposable container (opt-in).** Set `execution.backend: docker`
  and each agent turn runs inside a throwaway Docker container instead of on your
  host - model-agnostic isolation that a provider's own sandbox can't give (that
  only confines its own process, not other providers or a multi-agent run). The
  container mounts exactly two things: the run's git worktree (read-write, so your
  diff still flows back) and the codex credential (read-only, when present);
  nothing else - no Docker socket, no home dir, no SSH/AWS keys. The container's
  environment is built from a fixed provider-auth allowlist, so host secrets like
  `AWS_*`/`GITHUB_TOKEN` never cross the wall. It's **fail-closed**: if Docker
  isn't running the run refuses with a "start Docker" message rather than quietly
  running unsandboxed (opt into host fallback with
  `execution.container.onUnavailable: degrade`). Off by default; the image you
  point it at must carry the provider CLI. Honest about its limits: network egress
  is open, so it is not a safe box for genuinely untrusted code yet (a warning
  says so on every container run). Validated against a live daemon - a write lands
  in the worktree, a write outside it never reaches the host.

## 0.10.0

- **A flow phase can carry its own skills.** A flow step now takes a `skills`
  list - domain knowledge (a "WhatsApp integration" rulebook, a house style
  guide) bound to the phase that needs it. The agent on that step gets those
  skills injected into its prompt, merged with the run-level skills, and scoped
  to that turn only - the next step starts clean. Authorable in the flow YAML, on
  the web flow builder (a per-step skills picker), and visible in
  `vibe flows show`; it works on linear and graph/parallel flows alike. This is
  the de-Recipe answer: knowledge rides the flow, with no new top-level concept
  to learn.

## 0.9.0

- **Shape now enriches the flow you picked - it no longer replaces it.** This is
  the model correction. Before, an under-specified brief ("build a mini
  ecommerce store") got silently rerouted into a standalone Shape flow that
  *discarded* whatever flow you chose. Now "needs shaping" is an orthogonal
  signal: pick Express (or any flow), and a plan-worthy brief is shaped first (a
  read-only intake derives the scope/spec/architecture/risks), then **your flow
  builds from that approved spec**, seeded as run context. A well-specified task
  skips shaping and runs straight away. Selecting a flow is honored, never
  overwritten; `adaptiveShape: off` turns the whole thing off.
- **"Approve & build" closes the loop.** A shaped draft now has a primary
  action: approve it and the chosen flow runs against the derived spec (the spec
  is concatenated from the shape run's scope/spec/architecture/risks and handed
  over as a file context source - secret-redacted, never re-derived from the
  bare task). "Generate roadmap" stays as the alternative path. Reachable from
  the run page, `vibe shape build <runId>`, and `POST /api/shape/build` - same
  behavior on every surface.
- **A successful read-only intake reads as success, not "blocked".** A read-only
  enrichment phase has no reviewer and nothing to approve, so it now lands
  merge-ready when it completes instead of showing a misleading blocked verdict.
- **Read-only really means read-only, on every launch path.** The no-write
  safety clamp (a flow that emits no diff can never run write-capable) moved into
  the core so the direct `vibe run` path inherits it too, not just the dashboard
  launcher.

## 0.8.0

- **A live node-tree of what the supervisor and agents are doing.** The run
  detail page gains a "Tree" tab: the flow is the supervisor root, each step is
  a node grouped by phase (planning / architecting / executing / reviewing /
  verifying) and indented by its dependencies, and the inside-the-turn agent
  activity (tool calls and sub-agent spawns, or an honest "opaque" marker when
  the provider streamed nothing) hangs off each node. Per-node telemetry -
  tokens, tool calls, elapsed, cost - reads in aligned columns, and the
  supervisor's own decisions ride a lane on the root. It refreshes on the run
  page's existing poll (every couple of seconds), built on the run-audit
  derivation that already existed but was unused.
- **A run can plan itself first, like a CTO.** When you start a run, the
  supervisor reads the brief: a targeted change executes as before, but a
  plan-worthy greenfield/system brief ("build a mini ecommerce store") is routed
  into the read-only Shape chain - it asks you the gap questions (sign-in,
  payments, scale, data), then drafts a scope, a spec, an architecture with a
  provisioning checklist (env var NAMES only, never values), a risks register,
  and a dependency-aware roadmap of board cards. This is a run outcome, not a
  separate screen: the gap-questions appear right in the run view. The trigger
  biases hard to execute, only fires on a clear build-a-system reading, and is
  fully overridable (`--flow` forces either way; `adaptiveShape: off` disables).
- **It runs as a chain of short read-only runs, not one held-open process.**
  intake (asks the questions) -> you answer in the run -> shape (drafts the
  spec/architecture/risks) -> you approve -> roadmap (cards). Each link is a
  fresh run glued by Rewind, so it survives a reboot and never depends on
  durable pause (which does not exist yet). Submitting launches the next run
  only through the same gated launcher the dashboard uses - the browser never
  spawns a command, and answers ride as a secret-redacted context file.
- **Roadmap cards gained acceptance criteria and an estimate.** The synthesis
  emits "done when..." prose and a rough size per card, threaded through the
  proposal review and accept path, and shown on the card.
- **Editable roadmap dependencies.** A card's "Blocked by" list is now editable -
  add or remove a blocker right on the card. The edit is guarded server-side: a
  change that would create a cycle (or a self/unknown dependency) is refused with
  a clear message, so the roadmap always stays a DAG.
- **Review the shape draft in the run.** A completed shape run shows its scope,
  spec, architecture, and risks as collapsible sections to read through before
  you approve and synthesize the roadmap.

## 0.7.127

- **The dashboard's run composer is now the "new run" card.** Mission Control's
  home composer was a one-off layout (a step-by-step allocation table); it's
  replaced by the same flat, card-based surface as the full New-run page -
  pick a flow and a crew as cards, set run mode / tuning / supervisor with
  designed toggles, and start. The card is self-contained (it loads its own
  flows, crews, and personas and starts the run itself), so the dashboard no
  longer carries a separate composer data feed. The dedicated `#/compose` page
  keeps the extras the card drops: the steps breakdown, the working-context
  rail, and the metrics quick-look.

## 0.7.126

- **The whole dashboard now speaks one design language.** Every page - Crew,
  Profiles, Metrics, Codebase, Run detail, Consult, Flow Builder, Providers,
  Merge, Git, Ledger, Config, Workspace, Runs, Proposals, Settings, and the
  task pages - is full-width, flat, and high-contrast: solid square slabs, no
  glassmorphism or glow, brighter text (the old light-grey-on-dark was hard on
  the eye). The Crew catalog uses the same colored cards as Flows (the default
  crew is the green hero), and the crew page now explains seat coverage (each
  seat shows which role fills it) instead of a wall of chips.
- **New dropdowns everywhere.** The native browser `<select>` (ugly and
  un-styleable) is replaced by a custom flat dropdown across the app -
  keyboard-navigable, with the option you're on checked and a secondary hint
  (e.g. the model) on each row.

## 0.7.125

- **Remove a task from the Board (and the CLI).** Cards now have a trash action
  next to rename: it asks once, then permanently removes the card and its
  comments. Same on the CLI: `vibe tasks delete <id>` (interactive confirm, or
  `--yes`). It refuses while a run is still live - and that guard is now real:
  it was keyed on a field that's only set for an instant at run completion, so a
  genuinely-running task could have been deleted out from under its process;
  it now checks the actual run state and the scheduler queue. Your runs,
  transcripts, and git worktree are left untouched (the worktree path is
  reported so you know it's still there).

## 0.7.124

- **Board, brought into the flat slab look.** The task kanban dropped its
  glassmorphism for the same solid, square language as Flows and the marketing
  site: columns are flat slabs with hairline borders, task cards are square with
  a flat hover (no glow), and the priority / status / skill labels lost their
  pills for flat tinted mono text. Role avatars are solid-tone squares (no
  gradients), the roadmap rail and the add-task / add-roadmap forms are flat and
  square, and the header actions reuse the shared flat button. Density is
  unchanged - it's the same compact board, just quieter. An independent review
  caught one bug before merge: the "needs testing" column's amber warning border
  was being silently overridden by the slab's own border, so it now forces the
  amber through.

## 0.7.123

- **No more "slug" kickers; section labels you can actually read.** The faint
  uppercase eyebrow that echoed the page name above each title is gone
  (Runs, Board, Proposals, Git, Workspace, Metrics, Providers, Codebase,
  Mission Control) - the heading carries the page now. The eyebrow style that
  remains on genuine section labels (Daily spend cap, Changed files, Recent
  commits, Inspector...) dropped the uppercase + wide tracking and brightened,
  so a panel's label is legible instead of a grey whisper.

## 0.7.122

- **Flows page, rebuilt to the real vibestrate.com look.** Full-width now, and
  your local flows + the community hub share one card design: solid card slabs
  with big display names, a hairline-divided meta strip (steps / seats / gates /
  version), and a hover that shifts color and reveals the actions. The
  runs-by-default flow is a green card; the rest alternate violet and white. The
  hub ("Pull a flow") is collapsed by default, labeled as downloaded over the
  internet, shows install counts, and only hits the network when you open it.
  "Fork" is now the clearer "Customize."
- **No more pill labels.** The shared label component dropped its rounded
  pill (border + fill) for flat tinted text, app-wide - matching the marketing
  site's own label treatment.

## 0.7.121

- **The Flows page joined the flat slab design (P6).** The flow catalog had
  been missed by the slab migration - it styled its cards directly with
  translucent, rounded surfaces instead of the `.glass` class the migration
  swept - so it still read as the old era. Its flow cards, import panel, hub
  cards, inputs, alerts, and chips are now flat, solid, square slabs, matching
  the rest of the dashboard.

## 0.7.120

- **Fixed: the Profiles screen was broken.** A rename refactor had pointed the
  Profiles API calls at `/api/paramss` instead of `/api/profiles`, so loading,
  creating, editing, duplicating, and deleting Profiles all 404'd - and the
  Crew and Mission screens silently fell back to an empty profile list. The
  endpoints are corrected; Profiles work again. (Found in a dashboard-wide QA
  pass, which otherwise confirmed the slab + flat-button migrations are
  regression-free.)

## 0.7.119

- **Buttons match the slab language.** Action buttons dropped their violet
  gradient + glow for a flat solid fill and square corners: solid violet for a
  primary action, solid emerald reserved for approve/ship/go. The shared
  `Button` is now flat + square at the source, so every consumer follows. Also
  flattened the gradient icon-badges and the legacy composer's glass panels to
  slab, kept the user avatar distinct with a flat sky ring, and removed the
  now-unused bevelled-violet / top-rim glow CSS. The dashboard reads as one
  flat, solid surface end to end - no gradients or glow left on a component.

## 0.7.118

- **Effort is gone - it was never real.** The run/task-level "effort" dial
  (the compose control, `vibe run --effort`, `vibe tasks add --effort`, the
  roadmap-task field) was recorded and displayed but never reached a provider:
  agents always ran at their Profile's `power`. So it's removed end-to-end.
  Effort lives where it actually works - on a [Profile](/docs/concepts/profile),
  picked per crew role.
- **Run mode now explains itself.** Toggling Read-only or Unattended on the
  compose page shows what it actually does: Read-only is *enforced* and
  overrides the crew's write/execute permissions (every role plans only;
  apply, validate, and revert are refused), and Unattended means the run never
  pauses for you (gates auto-resolve, budget limits end it).
- **Flow detail, decluttered.** The pinned flow shows a compact summary in the
  right rail; the full step/seat breakdown moved into a "Steps & seats"
  disclosure under the flow picker, so the rail stays scannable.
- **Less glow.** Removed leftover decorative glow (the hover orb on run cards,
  the brand-mark halo, gradient accent lines) so surfaces stay flat and solid.

## 0.7.117

- **The whole dashboard is one surface now.** Finished the drift off
  glassmorphism that the compose page started: every panel, table, and modal -
  Runs, Metrics, Git, Flows, Crew, Providers, Config, Board, Workspace, Consult,
  Proposals, Profiles - now uses the solid `slab` surface (square corners, a 1px
  hairline, a solid ground, no backdrop blur), so the dashboard reads as one
  designed site instead of two eras stitched together. `.glass` is gone from the
  codebase. The only surfaces that stay translucent are the ones that should
  float: the cmd-k run switcher, popover menus, and the notifications drawer.

## 0.7.116

- **Flow inputs are back on the compose page.** A flow can declare typed
  `params:` (its required inputs); the new run page now renders an **Inputs**
  section when the selected flow has them - prefilled from the project profile,
  with a Generate affordance for generatable params, enum/boolean/secret-aware
  controls. Required inputs gate Start (it tells you which to fill), and they're
  passed to the run. This was missing in the rebuilt page (a regression from the
  old composer). Also: the inline "ask the supervisor" now includes the current
  Task brief in its context, so it can judge whether settings (e.g. Effort) fit.

## 0.7.115

- **Run-command mirror moved to the header.** The live `vibe run ...` command now
  sits top-right beside the title (truncated, full command on hover, copyable),
  not a full-width bar below the header.

## 0.7.114

- **Compose page: context-aware consult, a live command mirror, and de-conflicted
  chrome.** "Ask the supervisor" now tells the consult *where it's standing* (the
  compose surface + its controls + your current selections), so it can answer
  page questions like "what does tuning do" instead of pleading no-context; the
  answer is formatted (a colored confidence badge + recommended actions), not a
  flat text dump. The static `vibe run` label is replaced by a live command bar -
  the exact `vibe run "..." --flow ... --supervisor ...` for the current
  composition, copyable (CLI = TUI = UI, made visible). And the floating CLI
  launcher moved to the bottom-left with real presence (a labeled pill, hideable
  with a restore nub) so it no longer overlaps the consult orb at bottom-right.

## 0.7.113

- **Compose page reworked into a real task command center.** Roadmap pickup now
  lives with the brief (it's a task source, not a sidebar afterthought). "Ask the
  supervisor" is inline (a read-only consult right on the page, no window-switch).
  Crew gets deeper card selection like Flow (roles + profiles at a glance). Added
  a metrics quick-look (today's spend, active, queue). Configuration is redesigned
  into clean labeled rows with designed controls - the effort ladder (EffortScale)
  and supervisor/crew as pills/cards instead of native dropdowns that didn't blend.

## 0.7.112

- **Run page now matches the marketing site's component language.** It was in the
  right tokens but the wrong component vocabulary (rounded, heavy-shadow,
  violet-tinted panels). Reworked to the docs' actual components, ported 1:1:
  square corners (no radius), flat ink surfaces with a 1px hairline, and the
  `.brand-card` left-accent that turns violet on hover/active (the marketing's
  real card, from `.docs-cards`). Flow boxes, the flow-detail callout, the config
  panel, and the rail cards all use it. Reads as the same site now, not a generic
  rounded-card app.

## 0.7.111

- **The run page is now a task command center.** Full-width, two-column: compose
  on the left (brief, a 4-up flow grid with per-flow shape glyphs, a strong
  grouped Configuration panel - run mode / tuning / crew / supervisor, Start), a
  contextual right rail on the right (the selected flow's actual step sequence,
  plus the utilities you reach for to compose efficiently: pick up from the
  roadmap, ask the orchestrator / consult, recent runs). The flat black gets a
  twist: a grain texture over the ground, layered planes with real depth, a
  violet wordmark highlight-box on the title, and violet only as the active
  signal. Verified in-browser.

## 0.7.110

- **The new run page, redesigned with real craft.** The first cut was a flat,
  generic form; this is a rebuild to the brand's design bar (Linear/Vercel
  restraint in Vibestrate's language): the brief is a single raised focal plane,
  flows are a scannable list with a per-flow shape glyph (steps at a glance)
  instead of an identical card grid, configuration is grouped with hairline
  dividers, type hierarchy is Bricolage / Geist / mono, violet appears only as
  the active signal, and emerald is reserved for the one Start action. No glass,
  no gradients. Verified in-browser.

## 0.7.109

- **A dedicated run page (`#/compose`), in the new design language.** Composing a
  run is no longer a cramped panel: a full page built natively in the solid-scene
  aesthetic (no glass) - brief, a flow quick-look (steps/seats at a glance), crew,
  the full control surface (effort, concise, read-only, unattended, auto-pick
  flow, supervisor) all visible, and an empty brief proposes starts from your
  roadmap (pick one and it runs grounded on that card). Emerald for the single
  "Start run" action; mono only for technical bits. Reachable from Mission
  Control ("Open the full run page"). The older composer stays for now; advanced
  authoring (per-step profiles, presets) hasn't moved yet.

## 0.7.108

- **The dashboard now wears the brand.** Imported the design foundation from the
  marketing site so product and site read as one: the real brand fonts are loaded
  (Geist for body, Bricolage Grotesque for display, Space Grotesk for the
  wordmark, JetBrains/Geist Mono for terminal text) - previously the UI referenced
  these by name but never loaded them and silently fell back to system fonts.
  Added the emerald "approve/done" accent, the `[data-scene]` solid-surface token
  system, and a `.slab` primitive - the move off glassmorphism toward the
  marketing site's solid, hard-edged, high-contrast language. Additive so far
  (existing screens keep working); the screen-by-screen migration off `.glass`
  comes next.

## 0.7.107

- **More of the run control surface in the dashboard.** The composer now exposes
  effort (auto/low/medium/high), a concise toggle, and force-flow-selection
  ("auto-pick flow") alongside the existing read-only / unattended / persona
  controls - closing part of the CLI/UI parity gap (the server already accepted
  these; the UI just didn't offer them). More controls (continuous/step checklist,
  context sources) and a dedicated run page come next.

## 0.7.106

- **Consult answers are now referenceable.** The computed "Project state" items
  (recent activity, open intents, mentioned-never-worked, suggested next steps)
  are clickable - each links to the run or roadmap card it came from, instead of
  being a dead, truncated string. Full titles (no more lossy "Create a file …"),
  and higher-contrast, linked text. The model prompt is unchanged (it still gets
  the same plain-text rendering); only the structured output the UI renders gained
  the references.

## 0.7.105

- **A roadmap card now actually grounds its run.** When a run is bound to a card
  (`vibe run --task <id>` / picking a card), the card's description and open
  checklist are injected into the planner's task brief - not just on the `pickup`
  flow, but on every flow. Before, only the bare task string reached the planner
  and the card's intent was dropped, so it guessed. Bounded + secret-redacted; a
  title-only card adds nothing rather than fabricating grounding.

## 0.7.104

- **Param env-var collisions now fail loud.** If a flow declares two params that
  map to the same `VIBESTRATE_PARAM_*` env var (e.g. `colorTokens` and
  `color_tokens`), Vibestrate refuses to resolve the flow with a clear error
  naming both - instead of silently leaving one un-seedable from the environment.
  A consolidation/QA pass on the durable-param-memory work (0.7.102-0.7.103):
  `vibe params` and methodology guidance verified end-to-end against the built
  binary; full suite green.

## 0.7.103

- **Project methodology guides the planner.** Set `vibe params set methodology=tdd`
  (or `bdd` / `incremental`) and the planner now receives that methodology's
  concrete planning guidance - so plans actually follow your way of working (TDD
  plans test-first, BDD plans as Given-When-Then behaviors, incremental plans the
  smallest safe slices). It's bounded (just the one chosen methodology's block,
  planner turn only, so no context bloat) and built on the durable param memory
  from 0.7.102 - methodology is just a recognized project-global param. An
  unrecognized value is ignored with a clear run event rather than breaking the
  run, and the orchestrator never sets your methodology for you.

## 0.7.102

- **Durable param memory (`vibe params`).** Fill your project's data once and
  every run reuses it. A flow declares typed `params:` (name, niche, brand color,
  ...); Vibestrate now persists the answers in `.vibestrate/project-params.json`
  and seeds them at run start, so you stop re-typing them. Precedence is
  predictable: an explicit `--param` wins, then a `VIBESTRATE_PARAM_*` env var
  (the clean CI path - no interactive step, never hangs unattended), then the
  stored params, then the flow default. The Composer prefills its parameter form,
  the CLI prompt only asks for what's genuinely unfilled, and a new **Project
  parameters** panel on the Settings page (plus `vibe params get/set/list/unset`)
  lets you edit stored values directly. It's model-independent - Vibestrate owns
  the questions and the form; a provider is only an optional helper. For a
  `generate`-enabled param you can press **Generate** (or `vibe params generate`)
  to have a provider draft a value you review before keeping - never
  auto-applied. Safe by construction: values are stored per-flow by default (an
  opt-in `shared: true` makes one project-global), a secret param stores an
  `env:NAME` reference (never the raw secret, and a run fails fast if that env var
  is unset), and writes go through the project write-mutex.
- **`vibe profile` is now the Role-preset command** (was `vibe profiles`),
  freeing the clearer `vibe params` name for the durable param memory above.

## 0.7.101

- **Durable project memory.** Vibestrate now keeps a living, auto-derived project
  state at `.vibestrate/STATE.md` - what's shipped, what's in flight, what's
  blocked (with a `vibe run --resume-from <id>` hint), and the decisions made -
  carried across runs and sessions. A new run's planner is grounded in it (so it
  avoids redoing shipped work and respects prior decisions), while reviewers and
  verifiers stay in a clean room. It's derived from the continuity ledger, so
  it's regenerable and never hand-maintained; open items untouched for a while
  are marked `(unconfirmed)` so stale state can't mislead a plan. Concurrent runs
  write it safely (a new cross-process lock), and it's secret-redacted. The
  global store stays lean per turn - each agent only gets its role-appropriate
  slice, under the usual context budget.

## 0.7.100

- **CSRF hardening on the local dashboard server.** State-changing API requests
  (start/abort runs, prune snapshots, etc.) now reject cross-site browser
  requests via the `Sec-Fetch-Site` fetch-metadata header, and a malformed
  `Origin` is refused instead of waved through. Non-browser clients (the CLI uses
  the core directly, plus your own scripts) are unaffected. Defense-in-depth: the
  snapshot-prune endpoint no longer acts on an empty body - it requires an
  explicit scope - so an empty/strayed POST can never trigger a deletion.

## 0.7.99

- **Prune rewind snapshots on demand.** A new explicit cleanup for the
  `.git` ref clutter that rewind snapshots accumulate - reclaim refs for runs
  whose directory is gone (orphans), trim to the N most-recent runs, or drop one
  run's snapshots. Three ways: `vibe runs prune` (with `--keep N` / `--orphans` /
  `--run <id>` / `--dry-run`), `POST /api/runs/snapshots/prune`, and a "Prune
  snapshots" button on the Runs page. It always shows the plan and asks before
  deleting - and, like everything else, never purges on its own (it's fail-closed
  against an empty run-set so "prune orphans" can never collapse into "delete
  everything"). Only refs are removed; runs' artifacts and branches are untouched.

## 0.7.98

Rewind hardening - the destructive-restore blast radius is now fully bounded
(closes ISSUE-001), plus a flow-schema hardening (ISSUE-003).

- **A half-restored rewind can't pass as verified.** If restoring a run's code
  snapshot fails or is refused, Run Assurance now marks the run `unsafe` (cap
  `restore_failed`) instead of letting it read `verified` - the worktree isn't
  trusted, just like a failed rollback.
- **See what a rewind will overwrite before it runs.** A new restore preview /
  dry-run lists exactly which files the restore would add, overwrite, or remove.
  Available three ways: `vibe run --resume-from <id> --resume-stage reviewing
  --preview`, `GET /api/runs/:id/restore-preview`, and a live panel in the
  dashboard's rewind modal - which now also lets you rewind to review/fix/verify
  from the UI (previously CLI-only).
- **A stronger restore guard.** The destructive restore now positively verifies
  its target is inside the configured worktree dir AND a real git worktree root
  (not just "not the project root"), each path symlink-normalized so a legit
  rewind is never falsely refused.
- **Snapshot housekeeping.** When you opt into `git.snapshotRetentionRuns`,
  Vibestrate also reclaims snapshot refs left behind by runs whose directory is
  gone - fail-closed so it can never wipe a live run's snapshots. And the `.git`
  footprint shrinks: one snapshot ref per run (chained commits) instead of one
  per phase. (Still never purges anything when retention is off.)
- **Flow schema hardening.** The `skipWhen` constraints (review-turn-only,
  linear-only, no checklist, no loop body) are now re-asserted on the resolved
  flow snapshot, not just the authored definition - defense-in-depth against a
  hand-crafted snapshot.

## 0.7.97

- **The one-line installer works again.** The documented
  `curl -fsSL .../main/scripts/install.sh | sh` pointed at `scripts/`, which is
  gitignored and never published - so it returned a 404. The installer actually
  ships at the repo root; the README, install docs, and the script's own header
  now point there (`.../main/install.sh`). The npm fallback
  (`npm install -g vibestrate`) was always fine.

## 0.7.96

- **Live budget in the shell header.** The top "where am I" line now carries a
  spend chip - `budget $2.30 / $10.00` - tracking today's spend against your
  daily cap (`budget.spendCapDailyUsd`). It stays gray under the warn threshold,
  turns yellow past it, and red once exceeded; with no cap configured it shows
  today's spend only, and nothing at all when that's still $0. Alongside it, a
  `⏳ N approvals` chip surfaces (only when present) so a decision you owe is
  visible from any page. The cost scan runs on its own slow poll, so the live
  view stays snappy.

## 0.7.95

- **Retried Claude turns no longer collide on their session id.** When a
  resilience retry re-ran a Claude turn (a rate-limit/transient backoff, a
  usage-limit wait, or a human-approved fresh round after retries were
  exhausted), it re-sent the same `--session-id` the first attempt had already
  opened, so Claude rejected it with "Session ID ... is already in use." Retries
  now re-mint a fresh session id once the original was issued; since an opened
  turn re-sends its full context, the fresh session is identical in effect and
  the run rides the failure out instead of dying on it. (Closes ISSUE-002 part B
  - part A, the nested-session env leak, shipped in 0.7.94.)

## 0.7.94

- **Spawned agents no longer inherit the host's Claude Code session.** If you run
  Vibestrate from inside a Claude Code session, child `claude` agents used to
  inherit the host's `CLAUDE_CODE_*` environment and collide on session ids
  ("Session ID … is already in use"). Vibestrate now strips that identity from
  every process it spawns, so nested runs behave like top-level ones. (A related
  re-open-on-retry edge is logged as ISSUE-002.)

## 0.7.93

- **Leaner agent prompts.** When summarizing a handoff artifact would cost more
  than just including it - the "Summary for X" wrapper out-weighing the saving on
  a small artifact - Vibestrate now embeds the full artifact instead. Tokens only
  go down, and nothing gets clipped.
- **Clean-room seats.** A flow step can set `cleanRoom: true` so that seat drops
  the producer's run narrative (the run brief and project ledger) while keeping
  ground truth - your attached specs, pinned annotations, and the step's declared
  inputs. Useful for a reviewer or verifier you want judging the artifact without
  anchoring to how the earlier steps framed things. (A controlled eval settled the
  boundary: hiding the spec from a reviewer made it miss violations; hiding only
  the brief cost nothing.) Opt-in per step; off by default, so existing flows are
  unchanged.

## 0.7.92

- **Abort a run from anywhere in the shell.** The command palette's "Abort run"
  (and pause/resume) now target the single in-flight run when you haven't
  selected one on the Runs page - so you can press `:` and abort the task you
  just launched without navigating there first. The Runs-page `a` key and
  `vibe abort <runId>` are unchanged.

## 0.7.91

- **Short, friendly run ids.** New runs get a docker-style `adjective-noun` id
  (e.g. `bold-lovelace`) instead of the long `YYYYMMDD-HHMMSS-<full-task-slug>`.
  Ids are unique (checked against existing runs, with a short-suffix fallback)
  and serve as the run's directory / branch / display handle; the run's task is
  still its human label. Run lists now order by start time rather than the id
  string, so ordering stays correct with the new ids (and legacy long-id runs
  still sort right).

## 0.7.90

- **Shell dividers fit any terminal width.** The horizontal rule was a hardcoded
  dash count derived from the reported terminal size, so it could over- or
  under-fill the panel (ragged or wrapping onto the next row) on a narrow,
  resized, or different emulator. It now self-fits to the panel's actual width.
  Verified across a 40-120 column PTY matrix.

## 0.7.89

- **Shell: no more flicker as you type, plus a header that fits narrow windows.**
  The full-screen (alternate-screen) shell from 0.7.86 fought some terminals - it
  left blank space and didn't re-fill on resize - so the shell is back to a
  normal inline render. The real fix for "the screen jumps as I type a command"
  now lives where it belongs: the completion list sits in a **constant-height
  strip** reserved the whole time the prompt is focused, so candidates fill in
  and clear without ever reflowing the layout (it only appears/vanishes on
  focus/blur). The header's status (project / branch / activity) now truncates
  instead of wrapping onto the divider on a narrow terminal.

## 0.7.88

- **More crew presets + per-crew tuning.** On top of `fast` / `thorough`,
  `vibe crew presets add` now offers **`cheap`** (the provider's cheapest model
  at low effort) and **`local`** (runs on a non-cloud provider). `fast` and
  `thorough` also set a per-crew **review-loop** count (1 and 3): a crew can now
  do fewer or more review cycles than the global default without touching
  `workflow` config. The dashboard Crew page and `vibe crew presets` now show,
  per preset, whether it applies to your setup and exactly what it would do
  (provider, model, effort, review loops) - or why it can't.
- The provider catalog gained a curated **cheapest-model** designation (claude,
  Gemini, OpenAI, Anthropic) - a relative, hand-maintained hint, not live
  pricing (the local-first, no-egress posture is unchanged) - which is what
  drives the `cheap` preset.

## 0.7.87

- **Crew presets.** Two ready-made crews you can install instead of hand-writing
  one: `vibe crew presets add fast` puts every role on your provider's **lowest**
  effort (quick, cheap), and `thorough` uses the **highest** (for risky work).
  Same roster as your default crew, so a Flow's seats stay covered; built on your
  default crew's provider and added to `project.yml` without overwriting anything.
  `vibe crew presets` lists them and the dashboard Crew page has a one-click
  **Add**. Presets need a provider with effort control (claude, codex) - on one
  without, the install refuses rather than create two identical crews.

## 0.7.86

- **The interactive shell (`vibe`) is now a real full-screen app.** It renders in
  the terminal's alternate screen buffer (like `vim` / `htop`): a fixed canvas
  that no longer grows or scrolls as you type, and your terminal is restored when
  you quit. The command prompt now sits above the body, so when the autocomplete
  list opens it shrinks the page below - the line you're typing on never moves.
- **`config set` / `config get` autocomplete now shows each key's current value
  and what it does.** The list reads every settable key straight from the schema,
  shows its current value inline (`git.mainBranch = main`), and prints a one-line
  description of the highlighted key beneath the list - no more memorizing keys or
  hunting for their state. The descriptions come from one source (the schema), so
  the shell, the docs, and the generated reference never drift.

## 0.7.82

- **`vibe consult` no longer looks frozen while it thinks.** The command made a
  multi-second provider call with zero output, so it read as hung until the
  answer appeared. It now shows a live "Consulting" spinner with elapsed seconds
  (a single static line when output isn't a terminal, e.g. piped or `--json`).
  The spinner writes to stderr, so stdout stays clean for `--json` and pipes.
  Same fix applied to `vibe integrate analyze` (the other long provider call).

## 0.7.81

- **Consult tells you when rewind snapshots are piling up - and never cleans up
  behind your back.** Ask `vibe consult` (or the dashboard / shell) anything, and
  once your repo has rewind snapshots from more than ~25 runs, a **Housekeeping**
  tip appears: it names the count, explains the `.git` growth, and points at the
  opt-in `git.snapshotRetentionRuns` setting (settable in the UI or CLI) to keep
  only the most recent few. It's a suggestion, never an action - Vibestrate won't
  delete your snapshots on its own, and the tip disappears once you've turned
  retention on. Surfaces across all three consult surfaces (web, shell, CLI).

## 0.7.80

- **`vibe vibestrate` is now `vibe guide`.** The command that manages
  `VIBESTRATE.md` (the agent's operating guide for the project) and consult's
  proposals was awkwardly named after the file. It's now `vibe guide
  show | init | proposals | apply <id> | reject <id>`. Clean rename, no alias -
  the old subcommand name is gone. (The `vibestrate` *binary* alias for the `vibe`
  CLI is unchanged.)

## 0.7.79

- **Opt-in cleanup for rewind snapshots (the tool never purges on its own).**
  Every run writes durable git refs so it can be rewound to review/fix/verify;
  over a long-lived repo those accumulate. New `git.snapshotRetentionRuns`
  (default **0 = never prune**) lets *you* turn on a retention automation: set it
  to N and run-start keeps the N most-recent runs' snapshots and prunes older
  ones (refs only - branches, worktrees, and artifacts are untouched, recent runs
  stay resumable, and git's reflog keeps the objects through its gc grace). It is
  deliberately off by default: Vibestrate does not delete your data behind your
  back - cleanup is something you opt into. (A consult tip that surfaces snapshot
  growth and offers to purge or enable this is the planned next step.)

## 0.7.78

- **"Flow & why" - see the full reasoning behind a run's flow.** The Supervisor
  panel already showed a one-line story ("chose express - strict prose only");
  now a **why** toggle expands it to the complete record the orchestrator kept:
  every selection reason, the recorded risks, a non-default posture
  (sandbox-suggested / approval-suggested), any advisory, and a persona upgrade
  (from → to, with the signals that matched). Read-only and degrades gracefully -
  default/forced runs that carry no real selection reasoning just keep the one
  line, no empty panel. (This is the dashboard "Flow & why" surface; the separate
  crew/profile/posture *auto-selection* backend remains a future slice.)

## 0.7.77

- **Merge advisor notices when a run didn't get the isolation it asked for.** If
  a run's assurance posture is `partial` - confinement was requested
  (`execution.isolation` / `hardenReadOnlySeats`) but a turn ran on a provider
  that couldn't honor it - the merge advisor now raises an `isolation_incomplete`
  **caution** (never a warning, never changes the recommendation). It fires only
  on `partial`, so the default `none` baseline stays silent and there's no noise
  on ordinary merges. Surfaces wherever advisor flags already do: `vibe integrate
  analyze`, the Merge page, and the API.

## 0.7.76

- **Run assurance now shows how confined the run actually was.** The
  `assurance.json` artifact gained an **isolation posture** - `sandboxed` (a real
  OS sandbox ran, codex), `hardened` (claude `--permission-mode plan`), `partial`
  (a sandbox was requested for a turn that ran unconfined), or `none` (the
  default: worktree + diff gate only). It's derived from per-turn provider
  **evidence** (the `provider.sandboxed` / `provider.hardened` /
  `provider.sandbox_unavailable` events), not from config, so it reflects what
  actually ran - a turn that fell back to an unsandboxed provider can't be
  reported as confined. It's **informational and never changes the verdict**
  ("none" is the intended baseline, not a gap), and surfaces in `vibe assurance`,
  the run-detail badge, the engagement feed, and `GET /api/runs/:id/assurance` -
  so after an opted-in `execution.isolation` or `hardenReadOnlySeats` run you can
  confirm the confinement you asked for is the confinement you got.

## 0.7.75

- **Harden read-only seats (opt-in).** A new `policies.hardenReadOnlySeats`
  toggle (off by default) runs read-only **claude** seats - planner, architect,
  reviewer, verifier, and investigation runs - under `--permission-mode plan`, so
  the claude CLI itself refuses writes (the agent won't even attempt them)
  instead of relying on its headless default. It's the claude-side counterpart to
  the OS sandbox: codex read-only seats get real OS confinement via
  `execution.isolation: sandboxed`; this is claude's lever. Off by default because
  a headless smoke confirmed plan mode doesn't distort a read-only review but can
  add an "awaiting approval" framing to an action-shaped prompt - turn it on for
  the stronger, explicit no-write guarantee. Write-capable turns and an explicit
  `permissionMode` both still take precedence. Editable from both surfaces (`vibe
  policies config --harden-read-only true` or the dashboard's Advanced - Safety
  behavior panel, with a live preview).

## 0.7.74

- **Optional OS sandbox for a run's agents (off by default).** A new
  `execution.isolation` setting (`off | sandboxed`) lets you confine what an
  agent's own shell tools can touch at the operating-system level - not just
  audit it after the fact. With `sandboxed`, each turn runs under the provider's
  native OS sandbox, scaled to the seat: a write-capable seat gets writes
  confined to the worktree, a read-only seat gets read-only. Today this is real
  for **codex** (`codex exec --sandbox`, Apple Seatbelt on macOS / Landlock on
  Linux - a write outside the worktree is refused by the OS). A provider without
  a real sandbox flag (e.g. claude, which has only `--permission-mode`) **warns
  once and runs unsandboxed** rather than pretending - the worktree and post-turn
  diff gate still apply, and the run records only the sandbox that was actually
  enforced, so nothing over-claims. It's off by default on purpose: the worktree,
  the diff gate, and human-review-before-merge already bound a supervised local
  run, so confinement is a deliberate choice for an untrusted task or an
  unattended run. Set it with `vibe config set execution.isolation sandboxed` or
  the dashboard config editor; runs emit `provider.sandboxed` /
  `provider.sandbox_unavailable` events so the posture is auditable.

## 0.7.73

- **Duplicate and conflicting tasks get flagged, never silently dropped.** When
  a run starts, its task is compared against the project ledger; if it looks
  like a duplicate of open or shipped work - or a reversal of a "decided
  against" decision - Vibestrate records a **flag** that links the two (it never
  removes or edits the originals) and warns the planner so the supervisor can
  call it out before proceeding. Flags show in a "Flagged - needs
  investigation" section on the Ledger page (with the link to the related
  item) and in `vibe ledger`. Matching is deterministic and conservative
  (one flag per relation, cross-run deduped so a recurring task can't pile up
  flags); resolve them by hand.

## 0.7.72

- **A new run now starts knowing where the project stands.** The continuity
  ledger (what shipped, what's open, what was decided) is injected into the
  planner's prompt at the start of a run, framed as read-only context - so a
  fresh run picks up the thread instead of rediscovering it. It's bounded
  (top-5 per section, details clipped), secret-redacted, and goes to the
  planner turn only (resumed runs and later turns aren't re-sent it). This is
  the piece that makes the ledger actually carry context across runs, not just
  record it.

## 0.7.71

- **The project ledger has a dashboard page now.** Under **More → Ledger**,
  a read-only view of where the project stands - recently shipped, open
  intents, follow-ups left behind, mentioned-but-never-done, and decisions on
  record - folded from the continuity ledger that's machine-written when runs
  reach merge-ready. Each entry links to its source run. Same data as
  `vibe ledger`; the dashboard surface the ledger was missing.

## 0.7.70

- **The Providers page now shows which profiles run on each provider.** Each
  configured provider lists the profiles bound to it ("Used by `fast`, `deep`
  profiles."), so the provider→profile reverse map is visible at a glance, not
  just inside the per-provider editor.

## 0.7.69

- **The Crew page is now a hub, not a one-pager.** It opens on a list of your
  crews - each a card with its role count, seat-coverage at a glance, and
  "Configure" / "Set as default" - and you click into a crew to get its
  dedicated configuration page (roles, profiles, seats), with a back link to
  the list. Two clean stages instead of one long scroll with a dropdown.
  Deep-linkable: `#/crew` is the hub, `#/crew/<id>` a crew's config.

## 0.7.68

- **Switch the active crew from the dashboard or the CLI.** The Crew page now has
  a "Set as default" button (next to the crew selector) that persists your
  choice as the project's `defaultCrew` - runs without `--crew` use it. New
  `vibe crew` command for parity: `vibe crew list` (the default is marked),
  `vibe crew show [id]` (roles, profiles, seats), and `vibe crew use <id>` to
  switch. The write goes through the same validated config path as everything
  else (an unknown crew is refused, never half-written). The Providers page -
  previously reachable only by typing the URL - now has a proper nav entry under
  **More**.

## 0.7.67

- **Models auto-detect at run start - a "Preparing models" stage.** Every run now
  refreshes each codex provider's real model/effort catalog from its offline
  bundled list (`codex debug models --bundled`, ~200ms, no network) as a startup
  stage, so the pickers and the run itself stay on real models without you ever
  running `vibe provider refresh`. It's best-effort - a missing binary or slow
  spawn never blocks or fails a run - and only rewrites when something actually
  changed. Detection now lives in one machine-managed layer
  (`.vibestrate/providers-detected.json`) shared by both the run-start auto-detect
  and the explicit refresh, so they never shadow each other; a hand-authored
  `providers-catalog.yml` entry still wins on top. (Fixes a flaw in 0.7.66 where
  running `vibe provider refresh` once could pin the model list and go stale
  again.)

## 0.7.66

- **Model/effort options are detected from your real CLI now, not guessed.** The
  pickers used a hardcoded per-provider list that went stale - codex still
  offered `gpt-5.1` long after it was gone, so picking it failed at run time.
  `vibe provider refresh` (and the Providers page "Refresh from providers"
  button) now reads codex's own catalog via `codex debug models` and writes the
  real models + reasoning efforts into your provider overlay, reporting exactly
  what changed (`+gpt-5.5 -gpt-5.1`). It refreshes stale built-in lists, still
  yields to anything you hand-authored, and falls back to the offline
  `--bundled` catalog when the live one is unreachable. A failed probe keeps
  your last-known-good list and shows the real reason (e.g. "codex login")
  instead of silently emptying the picker. Honest limit: only codex exposes a
  models command today - claude/gemini keep curated suggestions, and an
  occasional auto-refresh + "new model" notification is the next step. Design:
  `docs/design/provider-capability-detection.md`.

## 0.7.65

- **Consult is now a floating orb, not a top-bar button.** A glowing orb rests
  at the bottom-right of every screen; click it to open a large chat panel and
  ask the project orchestrator from anywhere. While it is thinking, the orb
  takes center stage and morphs - a physical, majestic "AI is working"
  animation (pure CSS, respects reduced-motion). The old top-right Consult
  button is gone; the full-page Consult route still exists for task-scoped
  deep links, and both surfaces share one answer renderer. Provider failures
  now show the real reason inline (see 0.7.64); for codex, model/effort options
  are detected from your actual CLI (see 0.7.66).

## 0.7.64

- **Consult/assist errors now tell you the real reason.** When a provider CLI
  fails (codex, gemini, ...), the message used to read only "the provider
  exited with code 1". It now leads with the provider's own error - redacted -
  so you see WHY ("unknown model 'gpt-5.1'", "run `codex login`", a rejected
  flag) plus exactly which provider/model/effort ran. When a failed CLI prints
  nothing, the message points you at `vibe provider test`. (Model/effort
  options in the consult box are curated per-provider suggestions, not probed
  from your install - so a value your CLI doesn't accept now fails loudly with
  its real reason instead of a bare exit code.)

## 0.7.63

- **"Analyze deeper" reads the actual diff before you merge.** The optional
  final step in the merge advisor: `vibe integrate analyze <runId>` (or the
  Analyze deeper button on the Merge page) sends the run's diff vs main to a
  local provider and gets back a semantic-risk narrative - concurrency
  hazards, error-handling gaps, missing tests, security-sensitive edits - that
  a textual conflict check and pass/fail check-lanes can't see. It is advisory
  prose, explicitly never a merge verdict, and it never changes the
  deterministic recommendation or flags computed before it. The diff is
  byte-capped and runs through the existing redaction rules first (secret-like
  files suppressed to path-only, secret-shaped tokens removed), the spawn is
  broker-gated like consult, and the result is cached as markdown under the
  run. T13 (merge advisor) is now complete.

## 0.7.62

- **Merge-advisor thresholds are yours to set.** New `merge.advisor` config
  section: `vibe config set merge.advisor.suggestIntegrationBranchWhen.
  filesTouched 40` (plus `protectedPaths` and `behindMain`) tunes when the
  advisor suggests staging on an integration branch instead of finishing
  straight to main. Suggestion-only by design - crossing a threshold changes
  the advice, never blocks an action - and it shows up in `vibe config view`
  and the dashboard Config page like every other section.

## 0.7.61

- **The Merge window is on the dashboard now.** A dedicated Merge page lists
  every merge-ready run with its check lanes and branch drift at a glance
  (cheap, no git churn per visit), and opening a run computes the full
  advice: risk flags first, the dry-run conflict report, the recommendation,
  and the predicted commit shape - then the same explicit integrate /
  merge-to-main actions as always, gates unchanged. The Runs page links over,
  and the page's CLI-parity hint maps every control to its `vibe integrate`
  command.

## 0.7.60

- **A merge advisor that tells you the truth before you merge.** New
  `vibe integrate advise [runIds...]` (and `POST /api/integration/advice`):
  read-only, deterministic advice per merge-ready run - risk flags first (did
  any check actually run? does the change touch protected files? does it still
  apply cleanly?), then the branch topology, the dry-run conflict report, and a
  recommendation: finish now, stage on an integration branch, or resolve
  conflicts first. The advice is computed by code from git facts plus the
  honest assurance lanes - no model output anywhere in it - and a "verified"
  run where nothing actually needed checking says exactly that instead of
  reading as a green light. It also predicts the commit shape: finish
  fast-forwards main onto the integration branch when main hasn't moved
  (verified by test, not assumed). Merging itself is unchanged: explicit,
  human-confirmed, local-only, never pushed. Design:
  `docs/design/merge-advisor.md`.

## 0.7.59

- **Flows can take parameters now.** A Flow can declare typed `params:` (string /
  number / boolean / enum / path) that the caller fills at run start, so one Flow
  covers many variations instead of cramming everything into the task text.
  Reference them in step instructions with `{{params.name}}`. Fill them three
  ways, all in parity: `vibe run --flow scaffold --param projectName=Acme`, an
  interactive prompt for missing required params on a TTY, or the form the
  dashboard renders when you pick a param-declaring Flow. A `secret: true` param
  is recorded redacted and is never inlined into a prompt (Vibestrate doesn't
  feed secrets to agents). Ships with a runnable `scaffold` example Flow.

## 0.7.58

- **Consult now leads with computed facts, not whatever the model volunteered.**
  Ask the project consult and it shows a deterministic "Project state" block -
  recent activity, open intents, what was mentioned but never worked on, and
  suggested next steps - computed in code from the ledger (T9) + roadmap + run
  history. Same project state, same sections every time; the model only narrates
  and ranks them, and is told not to contradict or invent them. Shown in
  `vibe consult` and on the dashboard Consult page.

## 0.7.57

- **A project continuity ledger so a new session knows where you left off.** When
  a run reaches merge-ready, Vibestrate now records it in an append-only project
  ledger under `.vibestrate/` - machine-written, human-editable. `vibe ledger`
  prints a deterministic "here's where the project stands" brief (recently
  shipped, open intents, follow-ups, decisions including decided-against), and
  `GET /api/ledger` exposes the same. This is the foundation for stitching
  context *across* runs (a finished run can't be "continued" in place - the
  ledger is what carries the story forward). Write-back is idempotent (a re-run
  or re-derive never double-records). Design: `docs/design/project-ledger.md`.

## 0.7.56

- **The shell input + `vibe config set` got a lot less fiddly.** The prompt now
  does readline-style edits - Ctrl+W and Alt/Option+Backspace delete the
  previous word, Ctrl+U clears to the line start, Ctrl+K to the end. `vibe config
  set --help` and the new `vibe config keys [filter]` enumerate every settable
  key with its type, allowed values, and default straight from the schema (no
  hand-maintained list to drift), and shell completion now suggests those keys
  after `config set`. Setting an unknown key - the classic `config set provider
  claude` - now fails fast with "not a known config key. Did you mean:
  providers?" instead of silently writing a broken config. The completion list
  also stops letting one long candidate truncate the others.

## 0.7.55

- **Starting a run shows staged progress instead of a blank screen.** The setup a
  run does before the first agent turn - creating the git worktree, linking the
  environment, materializing context, spawning the provider - now emits staged
  events and renders as a live checklist on the dashboard run detail and in the
  TUI inspector. If setup fails (a bad worktree, say), you see the failed stage
  and its error instead of a run that just sits there blank.

## 0.7.54

- **Runs have readable names now, not just timestamps.** Every run gets a
  friendly display name derived from its task (the run ID stays the stable
  identifier underneath). Rename one from the CLI (`vibe rename <runId> a better
  name`), inline on the dashboard run header (the pencil), or via the API - and
  it shows in the run lists, the TUI, and `vibe status`.

## 0.7.53

- **Releases now verify the published artifact, not just the source tree.** A new
  `scripts/verify-pack.sh` packs the real tarball, installs it into a clean-room
  project from a fresh `node_modules`, asserts the file manifest (required files
  present; no sourcemaps, `node_modules`, `.env`, or test files), and smoke-runs
  the installed bin (`vibe --version`/`--help`, the `vibestrate` alias, and
  `vibe init`). It catches a bad `files` whitelist, a missing runtime dependency
  the monorepo was masking, or a broken ESM/shebang resolution - the failure
  classes a typecheck/build/test gate can't see. Wired into `scripts/release.sh`
  (before the version bump) and the release workflow (before `npm publish`).

## 0.7.52

- **`vibe doctor` now warns when your Claude Code hooks will leak into runs.**
  The `claude-code` provider runs your own `claude` CLI, which (unless `safeMode`
  is on) loads your `~/.claude` and project `.claude` hooks inside every turn - a
  personal `UserPromptSubmit` "supervisor" hook then injects into prompts and can
  skew reviewer verdicts. Doctor now detects those hooks and tells you they'll
  fire, with the one-line fix (`settings.safeMode: true` to isolate, or remove
  the hooks). It reports only the hook event names and the settings file, never
  the hook commands. We still don't isolate by default on purpose - your
  environment is legitimate context - so this is a heads-up, not a block.

## 0.7.51

- **The run file viewer now shows the run's own copy of a file.** Opening a file
  that a run created in its worktree used to 404 ("the resource no longer
  exists"), and opening a file the run *modified* silently showed the stale
  pre-run version from the project root. Root cause: the path guard always
  resolved a relative path to the first allowed root, and the project root (which
  geometrically contains the nested worktree) always won. The run viewer now
  resolves worktree-first and prefers the root where the file actually exists, so
  new and modified files both show the run's version. Filenames with spaces open
  correctly, and once a worktree is cleaned up the viewer says so ("preserved in
  the run's diff and patch bundle") instead of a bare 404.
- **"Where is the work?" now has an answer.** A new Workspace surface shows each
  run's isolated git worktree and branch - on the dashboard run detail, in the
  TUI inspector, and via `vibe path <runId>` (with `--cd` to print just the path
  for `cd "$(vibe path <id> --cd)"`).

## 0.7.50

- **"Nothing to verify" no longer reads as a half-failure.** A docs-only change
  with no validation commands, no review needed, and no verify step used to get
  stamped `partially_verified` - the same yellow verdict as a run that genuinely
  skipped checks. That trained people to ignore the verdict. Now each
  check (validation, review, verification) is reported as passed, failed, or
  *not applicable*, and a run where every applicable check passed - or where
  nothing needed checking - reads `verified` with an honest summary ("no checks
  were required for this change"). Genuinely-missing checks still cap the
  verdict; they're just no longer confused with checks that were never required.
  The assurance artifact gains a `notes` list (informational context, separate
  from verdict-capping `caps`) and an `anyRealCheckPassed` flag so a
  genuinely-checked run is always distinguishable from a "nothing to check" one.
- **The Inspect panel stops drowning you in plumbing.** The artifact list now
  hides the engine's own bookkeeping by default (the resolved-flow record,
  selection + participant records, context packets, prompt copies) and keeps the
  things you actually read - outputs, reports, decisions, findings, validation
  results, diffs. Step groups collapse, and the "show internals" toggle is
  remembered per browser.

## 0.7.49

- **A dead run now tells you why - and tries to save itself first.** Born from
  a real incident: a Claude usage limit killed a step, and everything
  downstream reported "provider exited 1" plus noise caps. Now the classified
  failure and a redacted excerpt of the provider's actual error ride the
  give-up all the way through: the step error, the event log (new
  `provider.retries_exhausted`; usage-limit give-ups carry the message), the
  Supervisor feed, and Run Assurance - whose blocked verdict now leads with
  the root cause ("Cause at 'implement': usage-limit: This model is being
  rate limited...") via a new `blockers` field, and drops the
  trivially-implied missing-caps noise. Claude Code's "being rate limited...
  switch over?" prompt is now correctly detected as a usage-window quota, so
  it fails fast toward a fallback instead of burning five useless retries.
- **The supervisor can now reseat a limited provider - within the run's trust
  set.** `resilience.autoFallback` (default `crew`): when retries run out and
  no explicit `fallbackProfile` is set, the turn re-runs once on a profile
  already seated in this run's flow on a different provider - same prompt and
  artifacts (context preserved by construction), same per-turn permissions,
  recorded as a `provider.fallback` event and visible in the Supervisor feed.
  No provider outside the run ever sees its context; `any` widens candidates
  to all configured profiles, `off` disables. Applies to usage-limit give-ups
  too - "stop" means "don't wait hours", not "don't use a model the run
  already trusts".

## 0.7.48

- **The Supervisor is now visible - and it saves you money.** The run screen
  reads top-down the way the system actually works: the Supervisor first
  (who is judging, the flow-selection story in one sentence, a live feed of
  every judgment and enforcement, the arbitration verdict, and any approval
  waiting on you - approve or reject right there), then your brief, the
  flow map, and the crew at work. The supervisor's decision ledger had been
  computed since the personas slice but rendered nowhere. New cost lever:
  a persona can pin review seats to a cheaper or different-vendor Profile
  (`reviewerProfile`) - in the verification run the review cost $0.04 on
  haiku while every other seat ran opus, and assurance honestly flipped to
  cross-model independence. The arbiter and writer seats are never pinned
  (the binding verdict keeps the crew's chosen model), explicit overrides
  always win, the pin is itself a recorded supervisor decision, and the run
  composer previews the exact profiles the run will use.
- **Quieter inspection, untouched flexibility.** The artifacts tab groups by
  step and hides the plumbing (context packets, prompts, diff snapshots)
  behind one toggle. And a deliberate decision on instruction isolation:
  runs keep loading your own Claude environment (CLAUDE.md, hooks, memory) -
  the model you tuned is the model that works your runs. For hermetic turns,
  `settings.safeMode: true` on a claude-code provider disables personal
  customizations while auth keeps working.

## 0.7.47

- **Run commits are clean now - a run's reviewer proved they weren't.** The
  worktree environment links shipped in 0.7.46 had a subtle git trap: a
  dir-only ignore pattern (`node_modules/`) does not match a *symlink*, so
  the run's own diff capture staged the link and the reviewer rightly
  refused to approve a change set carrying `node_modules`. Three layers fix
  it for good: linked paths are registered in git's local exclude file
  (never committed, shared by all worktrees, written per-link under a lock,
  atomically, and removed again on rollback - the user-owned file never
  accumulates); every link is verified against git's actual ignore answer
  after creation and removed if git would still see it; and both staging
  boundaries (commits and snapshot/diff capture) now refuse any newly
  staged symlink that resolves outside the worktree. Adversarially reviewed
  twice on the way in; proven by an end-to-end run whose staged set was
  exactly the one file it created, finishing merge-ready.

## 0.7.46

- **You can finally watch your crew work.** The first real dashboard run
  exposed a chain of breakage and this release fixes all of it, root cause
  by root cause. Claude providers now stream by default (`stream-json` with
  partial messages), so the run screen's new **Live timeline** - one row per
  step with the seated role, ticking elapsed time, and a live tail of what
  the model is producing right now - replaces the old run graph and seat
  board, with the full per-seat transcript (text, thinking, tool calls) one
  click away. Submitting a run takes you straight to its screen. Changed
  files open inline, diff or full contents, read from the run's worktree.
  Review findings open instead of 404ing (stamped artifact paths resolved
  with a double prefix), and a blocked run no longer claims a fix loop ran
  when none did.
- **Worktrees now come with their environment - and validation stops
  lying.** A fresh worktree had no `node_modules`, so validation failed with
  "command not found" in milliseconds, the reviewer was told "validation
  failed 0/3", and a correct one-line change got blocked. Worktrees now
  link the project's gitignored env dirs (lockfile-guarded for JS,
  gitignore-guarded against ever committing a link; `git.linkEnvironment:
  off` opts out), so validation really runs. When a toolchain still isn't
  there, commands report a distinct `environment` status - amber, not red -
  that never blocks a run, caps assurance honestly at partially verified,
  and tells the reviewer in plain words that nothing was validated and
  nothing failed. Both core slices were adversarially reviewed pre-merge;
  the reviewer's catches (a stream-parse throw that could brick runs on odd
  claude binaries, an env regex that real test output could trigger, an
  un-ignored symlink that could ride a commit to main) were all fixed
  before merge, and an end-to-end real run caught two more.

## 0.7.45

- **The dashboard says less and means more.** A clarity pass over the four
  busiest screens, done against rendered pages, not blind: tables now lead
  with the task you ran, demoting the 60-character run id to a short
  timestamp (full id on hover); statuses, roles, and headings that repeated
  themselves on one screen now appear once; flow step labels stopped
  truncating. Two honesty fixes landed on the way: Mission Control's recent
  runs called a merge-ready run "Merged" (nothing had been merged - it now
  says "Merge ready"), and a finished run's elapsed time no longer keeps
  counting wall-clock time forever. The flow builder's "Use this flow"
  button, which only navigated away, is now "Use as default" and actually
  sets the project default - or tells you it already is.

## 0.7.44

- **Guided merge-to-main: the last step of integration, with a human at the
  wheel.** `vibe integrate finish <branch>` (typed `merge-to-main`
  confirmation) merges a complete, clean integration branch into main -
  locally, never pushed. It refuses partial integrations (apply stopped at a
  conflict), a branch whose tip changed since you reviewed it (recorded at
  apply time), dirty trees, conflicts (aborted cleanly), and it never moves
  your HEAD (you must already be on main). The merge crosses the Action
  Broker as a new `git.merge` effect kind - policies can deny or demand
  approval, and every attempt (including refused ones) is evidence-logged.
  The dashboard button is fail-closed: it requires `VIBESTRATE_API_TOKEN`,
  because a tokenless local API is reachable by any local process.
  Adversarially reviewed pre-merge; the no-automated-caller rule is a tested
  invariant. Auto-merge and auto-push remain impossible.

## 0.7.43

- **Vibestrate can now create the git repository it needs - carefully.** In a
  non-git folder, `vibe init` offers to initialize one (interactive confirm,
  or the explicit `--git-init`; a generic `--yes` never implies it), and the
  web onboarding gained the same one-click step instead of telling you to run
  `git init` yourself. The initial commit is guarded, hard: a starter
  `.gitignore` first, then every file that would be staged - including inside
  untracked directories and quoted paths - is scanned for secret-like names
  (`.env*`, keys, `credentials*`, `.npmrc`, `.netrc`, and more); any hit
  means the repo is initialized *without* a commit and you're told why. The
  commit stages only the vetted file list, never `git add -A`, so a scanner
  miss can't leak. Adversarially reviewed pre-merge: the review caught (and
  we fixed + test) an untracked-directory bypass that would have committed a
  `secrets/id_rsa`.

## 0.7.42

- **Control Center: watch a run the way you'd watch a team.** Run detail
  gained a seat board - one card per flow step showing the seated role, its
  profile/provider, live state (the working seat pulses), and its token
  rollup; parallel review panels render as one row of sibling cards.
  Selecting a card opens that seat's pane: the exact prompt it received
  (fetchable mid-run, redacted record copy), its live transcript while
  working, and its response artifact when done. Selection follows the active
  seat automatically until you pin one. The shell run view gained the same
  strip in miniature (`seats plan ok · implement > · review`). All read-only,
  derived from evidence the run already records.

## 0.7.41

- **The Flows Hub is browsable from the dashboard.** The web Flows page gained
  a Hub section: search the live hub (debounced, errors shown verbatim),
  result cards with description / author / steps / tags / diagnosis and an
  honest "hub-curated" badge, and one-click install by ref - through the same
  validated, secret-guarded import writer as everything else, with an
  overwrite confirm when the id already exists locally and an explicit
  disclosure that a hub flow is executable configuration. Hub browse/install
  now exists on all three surfaces (web, shell, CLI).

## 0.7.40

- **Trivial tasks now size themselves: "make a test.txt" runs one turn, not
  six.** When a run has no `--flow`, no `--select`, and no `defaultFlow`, a
  conservative structural classifier (zero model calls) routes
  obviously-trivial tasks - short, naming only prose files - to the
  diff-floored `express` flow. The sizing is honest and bounded: its only
  possible target is `express` (whose review is decided by the actual diff,
  so a "trivial" task that edits code still gets reviewed), the supervisor
  persona's risk upgrade runs after it and beats it, every sized run is
  recorded (`selection.json`, `workflow.selected` event, a "sized" card on
  run detail, the CLI flow line), and `flowSizing: off` restores the old
  behavior exactly. Opt-in `assisted` mode adds one cheap gray-zone model
  call. The A1 slice - proportional orchestration (A2+A3+A1) is complete.

## 0.7.39

- **The live panel finally shows the model working - and it shows it for every
  run.** Two real fixes behind "true CLI output is not showing": (1) flow runs
  write their streams *nested* (`streams/flows/<step>/...`) and the stream
  lister only read the top level, so the live panel listed nothing for any
  flow run - i.e. for every run; now recursive (with path-guarded names).
  (2) The live filter only ever emitted the assistant's visible text, so the
  panel sat silent through long tool-using stretches; the claude stream now
  produces a typed transcript - assistant text, tool calls ("Read ·
  src/core/x.ts"), sub-agent spawns, and thinking (folded behind a toggle) -
  rendered in a new Transcript view with the raw stream one tab away.
- **Secrets are now scrubbed at the capture seams.** Stream chunks, prompt
  artifacts, and response artifacts were persisted unredacted; high-precision
  token shapes (AWS/GitHub/Slack/Stripe/Google/Anthropic keys, PEM blocks)
  are now redacted before anything is written - the live tail, the SSE
  stream, artifact viewers, and later steps' context all inherit it. What the
  agent is *sent* is untouched; only the persisted record copies are scrubbed.

## 0.7.38

- **The `express` flow: one implementer turn, honestly guarded.** For small,
  low-risk tasks (`vibe run --flow express`): a single implementer turn,
  change-scoped validation (0.7.33), and a review step that is decided by the
  **actual diff** - if every changed file is strict prose (`.md`/`.txt`/`.rst`)
  and touches no protected path, the review is skipped on recorded evidence;
  one code file, protected path, or any uncertainty and a real review turn
  runs. A skipped review is never laundered: the run's assurance reports
  `review: skipped_inert_diff`, caps at `partially_verified`, and the
  merge-readiness rule is a tested invariant (a review that ran and objected
  always wins; evidence never substitutes for validation or verification).
  Adversarially reviewed before merge; a gate-free "solo" variant was
  rejected outright. The A3 slice of
  `docs/design/proportional-orchestration.md`.

## 0.7.37

- **Protected paths: a deterministic floor under every "do less checking"
  decision.** A built-in glob set (auth/payments/migrations, CI workflows,
  lockfiles, `.env*`, `.vibestrate/`) plus your own `policies.protectedPaths`
  (additive - user globs extend protection, never shrink it; opting out of a
  built-in requires the explicit `policies.unprotectedPaths`). First consumer:
  validation scoping - a protected file is never "inert", so a changed
  workflow `.yml` or a protected `.md` validates in full even though its
  extension looks harmless. This is the A2 slice of
  `docs/design/proportional-orchestration.md` and the prerequisite for the
  upcoming `express` flow + flow sizer. Visible in `vibe config view` and the
  Config page.

## 0.7.36

- **The Flows Hub is live - search and install community flows from the real
  API.** The long-stranded hub branch landed: `vibe flows hub list|install`,
  the shell's hub browser (`h` on the Flows page), and `GET/POST
  /api/flows/hub*` now talk to `vibestrate.com/api/hub` (search with
  q/tag/author, ref-based pull, checksum-checked install through the existing
  validated + secret-guarded import writer). The client was aligned to the
  live contract and smoke-tested against production (opt-in
  `VIBESTRATE_HUB_LIVE=1` suite). Honesty rules baked in: curated flows show
  as "hub-curated" (a curation claim, not an integrity guarantee), the
  checksum is labeled transport-integrity only, and install reminds you a hub
  flow is executable configuration. The old static-index hub client is gone.
- **Seat coverage everywhere.** `vibe flows show` and the shell Flow page now
  show per-seat coverage against your crew (filled / gap / ambiguous, with
  the resolving role), powered by a shared `computeFlowSeatCoverage` helper -
  so "can my crew run this flow?" is answered before you launch.

## 0.7.35

- **A run blocked by review is now actionable from the page it blocks on.** The
  run-assurance panel and the outcome banner gained **See review** - the
  reviewer's verdict and findings, parsed from the review artifact (structured
  findings block when present, full reviewer output otherwise) - and **Re-run
  with fixes**, which opens the re-run dialog pre-set to reuse the run's plan +
  architecture and re-implement. A `CHANGES_REQUESTED` verdict also gets its own
  honest outcome banner (it previously fell through to a generic "Run blocked").
  The shell run view shows the parsed finding headlines under its `review` line.
  One shared, dependency-free parser (`flows/runtime/review-findings.ts`) feeds
  web + shell and is the same source the runtime's decision-line enforcement
  imports - display and enforcement can't drift. First slice (P1) of
  `docs/design/run-experience-and-usability-batch.md`.

## 0.7.34

- **Unattended runs no longer hang forever at an approval gate.** A run launched
  `--unattended` that hit any approval gate used to wait on a human who was never
  coming - wedging a scheduler worker and showing as "in flight" indefinitely. It
  now bounds the wait (`policies.unattendedApprovalTimeoutMs`, default block
  promptly): the gate `expires` and the run stops honestly as `blocked`, ready to
  re-launch when you decide. Attended runs are unchanged (they wait for you, a
  human is there). This only bounds the wait - it never auto-approves, and every
  gate, `forbidAutoMerge`, and `forbidAutoPush` are untouched. First slice of
  `docs/design/always-on-execution.md`.

## 0.7.33

- **Validation is proportional to the change: a docs edit no longer runs your test
  suite.** When a run's entire diff is only provably-inert files (`.md`/`.txt`/
  `.rst`, images, fonts), Vibestrate now skips the configured `commands.validate`
  (typecheck/test/lint) and records why (`validation.scoped` event) - so writing a
  `.txt` no longer waits on `pnpm test`. The decision reads the *actual changed
  files*, never the task text, and is fail-safe: it is an inert *allowlist*, so any
  code, `.json`/`.yaml`/`.sql`/config, unknown extension, or extension-less file
  makes the whole run validate as before. One non-inert file validates everything.
  Toggle with `commands.scopeValidationByChange` (default on). First slice of
  `docs/design/proportional-orchestration.md` (the orchestrator sizing the work);
  the flow-sizing half is deferred behind a diff-aware protected-path floor.

## 0.7.32

- **`code_write` seats can actually write now.** A write-capable seat
  (`permissions: code_write`) running on a `claude-code` provider was silently
  blocked: the seat's permission governed Vibestrate's own broker but never
  reached the claude CLI, so the headless `claude -p` ran in its default
  ask-for-approval mode and denied every file write. Vibestrate now derives the
  CLI permission mode from the turn's resolved write capability and injects
  `--permission-mode acceptEdits` for write-capable seats - so the executor can
  apply its edits in the worktree. Read-only seats, investigation runs, and
  strict-apply-only runs resolve to no write capability and get no grant; an
  explicit `settings.permissionMode` always wins. The grant is claude-specific,
  so it applies to `claude-code` providers only (a generic `cli` provider is left
  untouched). If you hand-wrote a `type: cli` claude provider, switch it to
  `type: claude-code` to get this. See `docs/design/provider-permission-mode.md`.

## 0.7.31

- **A second supervisor persona: `security`.** Pick it with `--supervisor security`
  or in the composer, and a risk-tagged task is upgraded to a new built-in
  **`security-review`** panel - the `panel-review` shape aimed through three
  read-only security lenses (authn/authz, secrets & exposure, injection & web-
  request safety) with an arbiter join. So switching persona genuinely changes
  *which review runs*: `staff-engineer` → `panel-review` (correctness/tests/risk),
  `security` → `security-review` - reusing the shipped upgrade, no dynamic flow
  rewriting. Honest framing: it is three LLM reviewers over the diff (capped at
  `partially_verified`, never a SAST/secret/dependency scanner), and the arbiter
  is told to say so when a class needs tooling it can't run.

## 0.7.30

- **Supervisor personas: the orchestrator gets a judgment posture (slice 1).** A
  persona is the orchestrator's advisory supervisor character - it ships one
  built-in **`staff-engineer`** (correctness/risk/blast-radius) out of the box, no
  config required, and you can pick it per run (`vibe run --supervisor <id>`, a
  Supervisor selector in the composer, `persona` on `POST /api/runs`) or set
  `defaultPersona` in config. `vibe supervisor list` + `GET /api/personas` show
  the catalog. The active persona is shown like the Flow line and recorded
  (`persona.selected` event).
- **It changes behavior, not just tone (the teeth).** On the normal (non-`--select`)
  path, if a task matches the persona's `riskSignals` (auth, payment, migration,
  secrets, ...), the persona deterministically **upgrades** the flow to its
  preferred review flow (`panel-review`) and logs why (`persona.upgraded` + a
  `supervisor-upgraded` selection). Upgrade-only: it can add review, never remove
  it, and never overrides an explicit `--flow`.
- **Honest, model-agnostic supervision.** Personas are advisory - pinned below
  every code-enforced gate (policy/diff/validation/approval/budget), with no
  evidence-weighting knob and no ability to raise confidence. The run-assurance
  badge now records the persona + an honest `independence` label: `cross-model`
  only when >=2 distinct models actually ran, else `single-profile` (a same-model
  self-check that can only lower confidence). Design:
  [`design/orchestrator-personas.md`](./docs/design/orchestrator-personas.md).

## 0.7.29

- **Flow Builder: edit a flow's raw YAML, see its architecture.** The Flow
  Builder gained an "Edit as YAML" toggle - flip between the structured editor +
  architecture graph and the flow's raw YAML source, then save. Handy now that
  flows carry richer shapes (parallel fan-out, per-item bands) that read clearest
  as YAML. Saving goes through the existing import writer, so it gets the full
  schema validation plus the secret / size / control-char guards and an atomic,
  path-guarded write - no new write path. Built-in flows stay view-only (fork to
  a project flow to edit); the toggle is blocked while you have unsaved structured
  edits (so the two editors can't diverge), and a save whose YAML `id` doesn't
  match the flow you're editing is refused (use Import to create a new flow).

## 0.7.28

- **Checklist DAGs: parallel agents on every checklist item (Phase D, "Shape A").**
  A Flow can now put a dependency graph *inside* the per-item band, so a pick-up
  run executes each checklist item as a mini-DAG instead of a straight line. The
  new built-in **`pickup-analysis`** flow does exactly this: for each item, two
  read-only analysts (risk/impact + test-surface) study it **in parallel**, then
  the implementer writes the item informed by both - "think in parallel, then
  build" - committing per item, once per item, in one worktree. The analysts are
  read-only (one writer per worktree, hard-enforced at resolve time) and
  best-effort (one failing lens doesn't sink the item). A read-only or instant
  (N=1) run still fans the analysts out through the scheduler.
- **The graph view now shows the band.** The Flow Builder graph, `vibe flows
  show`, and the Ink TUI flow page all zone a checklist + graph flow into
  prelude -> **per-item band (repeats)** -> postlude, so the parallel fan-out
  *and* the per-item repetition are legible at a glance (a flat layout hid both).
- **Guardrails:** the DAG must stay confined to the band (prelude/postlude stay
  linear) - enforced in the schema and the resolver. Mid-band resume is refused
  with a clear message. Per-item *review* panels ("Shape B") are deliberately
  deferred (they need a per-item arbitration ledger first). Design:
  [`design/custom-workflow-dags.md`](./docs/design/custom-workflow-dags.md).

## 0.7.27

- **Consult: choose the actual provider + model + effort (and it finally takes
  effect).** The Consult page's model control is now a real, separate selector -
  pick a **provider**, then its **model** and **effort** straight from each
  provider's capability catalog (so you see `opus` / `sonnet` etc., not a profile
  alias), or leave it on "Default · planner". Selections are catalog-validated
  (only what a provider actually supports) and the result footer reports exactly
  what answered (`provider/model · effort`). CLI parity: `vibe consult --provider
  <id> --model <id> --effort <level>`.
- **Fix: the assist primitive ignored the chosen model/effort.** `runAssist`
  (which powers consult, enhance, and suggest) spawned the provider with only its
  id - it dropped the resolved `model`, `effort`, `maxTokens`, and the capability
  catalog, so picking a profile only ever changed the *provider*, never the model.
  It now threads those through to the spawn (via `provider-apply`), so a profile's
  model/effort - and the new ad-hoc selection - actually apply. (`POST
  /api/consult` accepts `providerId` / `model` / `effort`.)

## 0.7.26

- **Consult: pick the model, and see which one answered.** The Consult page now
  has a **Profile** selector next to the composer - leave it on "Default · planner"
  (the cheap read-only planner) or choose any configured profile to answer the
  inquiry with (it flags a profile whose provider isn't set up, and remembers your
  last pick). The result footer says exactly which profile/model produced the
  answer. Parity on the CLI: `vibe consult "..." --profile <id>`, with an
  "Answered by" line in the output. (`POST /api/consult` now accepts `profileId`.)

## 0.7.25

- **The run graph now shows where the orchestrator engaged.** Beside the run's
  DAG sits an **Orchestrator engaged** lane: an ordered, classified list of the
  moments the supervisor actually did something - selected the flow (with
  confidence + risks), fanned out a review panel, fell back to a backup model,
  paused for approval, hit a budget ceiling, rolled a turn back at the diff gate,
  or returned a review/verification verdict. Each entry is tagged **judgment**
  (model-made, advisory) vs **enforced** (a code gate that fired) vs **flow**
  (executing the chosen shape) - the honesty boundary from the responsible-
  orchestrator design, made visible: a model verdict never reads as a hard
  guarantee. Hovering a lane row highlights the step it touched, and vice versa.
  It works **live** (derived from the append-only event log as the run executes)
  and after, via `GET /api/runs/:id/engagement`.
- **Every graph node now says which part of the flow it is, and who ran it.** The
  compact node face carries the flow phase (planning / executing / reviewing / ...)
  and the crew role; the hover popover adds the **profile** and the **token
  rollup** (in -> out) alongside the existing provider / model / cost / duration.
  Surfaced identically in `vibe audit` (new classified "Orchestrator engaged"
  section + per-step phase / role / profile / tokens) for full CLI parity.
- **The run detail page is a movable / resizable dashboard.** Run graph, Live
  metrics, Live execution, and Changed files are panels on a react-grid-layout
  board (the same proven setup used elsewhere): hit **Edit layout** and you can
  drag any panel by its grip, resize it from the corner, swap its width/height, or
  hide it (and re-add hidden panels) - with a live dashed drop placeholder and the
  other panels reflowing around it. In view mode the panels are plain interactive
  cards at your saved positions. The arrangement persists per-browser with a Reset.
  The default fills the width (no more dead space beside a half-empty CLI panel).
- **The run graph is a real top-down tree now, and the redundant Step timeline
  is gone.** Compact nodes are joined by drawn edge lines: serial steps form a
  centered vertical spine, and a parallel wave visibly branches out from its parent
  and rejoins at the next step (fan-out / join lines, not a tiny arrow). Node detail
  (phase, role, profile, tokens, cost, attempts, inside-the-turn) lives in the hover
  popover to keep the tree clean. The separate "Step timeline" box was duplicating
  the steps and was removed; the engagement lane only takes a column when it has
  entries, otherwise the tree gets the space.
- **Errors are now visible in the dashboard, not just the console.** A new
  **ErrorBoundary** wraps each page: a render crash shows a readable panel (message
  + stack + component stack, with Try again / Reload) instead of unmounting the app
  to a blank screen - and the nav bar survives, so you can navigate away. A
  **global overlay** surfaces what a boundary can't catch (async failures and
  unhandled promise rejections) as a dismissible toast. Previously the only trace
  of a UI crash was an uncaught error in F12.
- **Fixed a blank-page crash opening older runs.** `readRunAssurance` returned
  raw JSON typed as `RunAssurance`, so a pre-0.7.11 `assurance.json` (written
  before the `coverage` field existed) flowed through with `coverage` undefined and
  crashed the run-detail page on every consumer. It now backfills `coverage`/`caps`
  at the read boundary, honoring its return contract.

## 0.7.24

- **The flow graph and run audit are now one graph.** The run-detail page used to
  carry two separate boxes - a live "Flow graph" and, once terminal, a verbose
  "Run audit" list. They are now a single `RunGraph`: the run's dependency DAG laid
  out top-to-bottom in longest-path layers (the layout the Flow graph, CLI, and TUI
  share) - orchestrator at the root, each step below the steps it needs, concurrent
  steps side by side in a "parallel" wave, joins converging below. It renders live
  (topology + per-step status) and, once the run is terminal, enriches the same
  nodes from `/api/runs/:id/audit`. Nodes are compact - status, name, and only the
  high-signal badges (retries, fell-back, sub-agents) - and **hovering (or focusing)
  a node reveals the detail** in a popover: the color-coded attempt chain
  (rate-limit -> retry -> fallback -> success), inside-the-turn tool calls and
  spawned sub-agents, provider/model/cost, and the decision. One entity, far less
  visual noise, full depth on demand.

- **`pnpm demo` - a runnable, no-API simulation.** A new
  `scripts/demo-simulation.ts` builds a throwaway project wired to fake local
  providers and runs one panel-review that exercises the resilience + audit work
  end to end: a step that rate-limits, retries, and falls back to a backup model;
  a step that streams tool calls and a sub-agent (so the audit sees inside the
  turn); a tolerated reviewer failure; and an arbiter approval reaching
  `merge_ready` with a `partially_verified` verdict. Prints the audit tree and the
  `vibe ui` / `vibe audit` commands to view it in the dashboard.

## 0.7.23

- **Unattended toggle in the dashboard composer.** Launching a run from the
  dashboard now has an "Unattended" toggle next to "Read-only" - so the
  never-pause behavior (forces budget/resilience limits to stop/fail rather than
  wait for a human) is one click in the UI, matching the `vibe run --unattended`
  flag. Closes the last UI/CLI parity gap from the resilience work.

- **The audit now sees inside the turn.** For providers that stream structured
  output (claude-code `stream-json`), each step in the run audit shows what the
  turn did internally - the tool calls it made (e.g. `Read×2 · Edit`) and any
  sub-agents it spawned (with their task description) - in `vibe audit` and the
  web audit tree. Providers that don't stream that detail are honestly marked
  "opaque," and a spawned sub-agent's own internals stay opaque too (they run
  inside the tool, not in the parent stream). This completes the run audit graph
  (derivation → web tree → inside-the-box).

- **Bounded context on marathon runs.** Vibestrate already rebuilds each turn's
  context from artifacts, so a run's prompt doesn't grow with its length - but
  when it reuses a provider session (e.g. `claude --resume`) across many turns,
  that session can still balloon. `session.maxReuseTurns` now caps how many turns
  a reused session lives before Vibestrate re-opens a fresh one and re-grounds it
  from the artifacts (lossless "compaction by re-grounding"; 0 = unlimited, the
  default). The provider's own auto-compaction stays the safety net. This
  completes the unattended-resilience work (count/time ceilings, retries,
  fallback, cap actions, pause/`--unattended`, usage-limit waiting, and now
  session lifetime).

- **Usage limits are handled like the quotas they are.** A subscription usage
  limit is a per-model quota that *resets* (often hours away), not a per-minute
  throttle - so retrying it for a few seconds is pointless. Vibestrate now detects
  usage-limit/quota errors as their own class, separate from rate limits, with
  `resilience.usageLimit.action`: `wait` sleeps for the reset window (the parsed
  reset hint, capped at `maxWaitMin`) and then continues - so an overnight run
  "runs until the window refills"; `fallback` switches to another model; `stop`
  (the default) ends honestly instead of burning a retry budget. The wait is an
  automatic timed sleep, not a human pause, so it's safe to leave unattended.
  Recorded as a `provider.usage_limit` event.

- **The run audit, now visual.** The run detail page gains a "Run audit · what
  happened" tree: every flow step with its model/cost/duration and a color-coded
  **attempt chain** - rate-limit → retry → fell-back → success, paused, or
  failed-but-tolerated - plus the run-level budget/spend/pause events and a
  totals/assurance header. It sits next to the live flow graph (which shows
  topology); the audit tree shows the per-step story. Same data as `vibe audit`,
  now at a glance in the dashboard.

- **See exactly what happened in a run - `vibe audit`.** A new audit view folds a
  run into one tree: the flow's steps and, per step, what each turn did - succeeded,
  got rate-limited then retried, fell back to another model, paused for you, or
  failed-but-tolerated - with the model/cost/duration and the run-level
  budget/spend/pause events, all rolled up with the assurance verdict. It's derived
  from the recorded evidence (events + state + metrics), so it's an exact account of
  vibestrate's own orchestration. Read it with `vibe audit <runId>` (`--json` for
  the raw tree) or `GET /api/runs/:runId/audit`. (Inside-the-turn provider
  sub-agents are a later phase, shown only when a provider streams that detail.)

- **Pause-for-a-human at a limit (attended), or force never-pause (unattended).**
  For runs you're watching, a budget ceiling can now wait for you instead of just
  stopping: `budget.onLimit: pause` asks you to approve continuing past the
  ceiling (or reject to stop), and `resilience.onExhausted: pause` asks when a
  provider's retries and fallback are exhausted (approve for a fresh round, reject
  to fail). Defaults stay stop/fail, so nothing changes unless you opt in. For
  genuinely unattended runs, launch with **`vibe run --unattended`** (or
  `unattended` on `POST /api/runs`): it forces no-pause everywhere, so the run
  always reaches a terminal state on its own and never sits waiting for someone
  who isn't there. `onLimit` is settable via `vibe budget set --on-limit` and the
  dashboard Budget control. This completes the unattended-resilience work.

- **At the spending cap, keep going cheaper instead of always stopping.** The
  daily dollar cap's action is now real (it was stop-only): `downgrade-model`
  switches the rest of the run to the cheaper `budget.fallbackProfile`, and
  `reduce-effort` continues at the provider's minimum effort - so an overnight run
  can press on more cheaply rather than halting, with the count/time ceilings
  still the ultimate stop. Each switch is recorded as a `spend.action` event. Set
  it with `vibe budget set --action downgrade-model --fallback <profile>` or the
  dashboard's Budget control (which now has a fallback-profile field; also fixed a
  field-name mismatch that had made the fallback unsettable from the API/UI).

- **Fall back to another model when one is down.** When a provider keeps
  rate-limiting or erroring after its retries are spent, Vibestrate can now run
  that turn once on an alternate model instead of giving up - set
  `resilience.rateLimit.fallbackProfile` / `resilience.transient.fallbackProfile`
  to another Profile. Useful overnight when one provider is hard-down: the work
  continues on the backup. The fallback uses a different provider (no shared
  session), isn't itself retried, and is recorded as a `provider.fallback` event,
  so the model swap is always visible - never silent.

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
  the dashboard or `vibe profile`; the page groups by provider and shows which
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

