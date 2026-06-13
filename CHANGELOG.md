# Changelog

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

