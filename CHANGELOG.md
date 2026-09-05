# Changelog

## Unreleased

- **The path guard follows a symlink chain to where it really lands.** It judged
  a dangling link by one textual hop: read the target, resolve it against the
  link's own directory, compare. Anything needing a second resolution slipped
  through, and three shapes did - a chain that only leaves on its second hop, a
  target whose parent is a symlinked directory pointing out of the root, and the
  relative spelling of that same escape. All three were declared contained while
  really pointing outside, reproduced against the guard before the fix. The
  ancestor walk already resolved real paths; the leaf branch did not, and that
  asymmetry was the bug. Each hop now resolves against its parent's real path,
  bounded the way the OS bounds one. A link to a file that does not exist yet
  inside the root still resolves, because that is an honest 404 rather than an
  escape. Worth knowing if you run Linux: on macOS these were refused anyway, by
  accident, because the temp root's `/var` spelling never matched its
  `/private/var` real path - the containment check was not what stopped them.

- **Another server on your localhost cannot drive the API either.** A browser
  decides "same site" without looking at the port, so a page served by any other
  local dev server counted as same-site with the dashboard and passed the check
  above. Such a page may not be showing content you control. It can still link
  you to the dashboard, which is how people open it, but it is now refused on
  `/api/*`, where the side effects are.

- **A page you visit can no longer make your dashboard do work.** The server
  refused cross-site requests a browser marked `Sec-Fetch-Site: cross-site`, but
  only on state-changing methods. A browser sends no `Origin` header at all for
  an `<img>` or a no-cors fetch, so the origin rule never fired on one either,
  and a plain `<img src="http://127.0.0.1:4317/api/...">` on any page you
  happened to open reached a real handler. Reads were not harmless: provider
  detection shells out to every coding CLI it knows, so the cheapest version of
  this spawned processes on your machine in a loop. The check now covers every
  method. Typing the address yourself still works, and `curl` and the CLI, which
  send no such header, are unaffected. Found by auditing a CodeQL rate-limiting
  alert that turned out to be pointing at something else.

- **A TODO written in an HTML comment keeps its text.** `--!>` is the HTML
  spec's other comment terminator and browsers accept it, but the harvester only
  knew `-->`, so a TODO closed that way arrived on the Board with a stray `--!`.

- **Two dead operations removed.** A derived-flow note ran a replace that
  substituted `"no "` with itself, and the third-party attribution script
  stripped `<email>` with a pattern that left an unbalanced `<` behind on a
  malformed author field. Neither was reachable as a vulnerability; both were
  wrong.

## 0.4.0

- **The default flow is now three seats: planner, implementer, reviewer.**
  Review findings go straight back to the implementer, which re-enters with
  them in context - no dedicated fixer seat, no verify turn; merge-ready is an
  approved review plus passing validation. The implementer self-reviews its
  own diff before every hand-off, and the scaffolded reviewer runs under a new
  `review_exec` permission profile: it can execute the tests it judges (the
  claude-code invocation drops the edit tools - a tool-layer gate, not a
  prompt request). Profiling real runs showed the old pipeline spent five of
  six turns around the one turn that writes code. The six-seat pipeline
  (architect, fixer, independent verify gate) is unchanged and available as
  the `deep` flow.

- **A step gets its inputs whole, and can refuse to run without one.** Handoffs
  between steps used to be summarized by fixed byte thresholds that knew nothing
  about the model's context. Measured on a real twelve-step run, two thirds of
  every handoff was compressed to reclaim under one percent of a window that was
  never close to full. Prior artifacts now arrive in full up to a 32K-token
  budget (2K under `compact`), and only the largest are summarized past it. A
  flow step can also name `requiredInputs`: the run stops before that step
  rather than hand the model a digest of something it cannot do without. The
  built-in default flow's reviewer now requires the brief and the execution
  record.

- **The Supervisor can add context to a step, and never take any away.** Every
  seated step now receives a manifest of the outputs this run produced that the
  step did not declare, with sizes and where to read them. Turn on
  `supervised.supervisor.contextEngine.enabled` and the Supervisor also reads
  those outputs and injects up to two, the artifact's own bytes, with its reason
  recorded as a `supervisor.context_injection` event and shown in the
  supervisor's decision feed on the run page. It is structurally
  additive: the engine is never shown what a step already has, so it cannot
  shrink or drop an input. On a benchmark run it handed a reviewer the diff the
  flow had not given it, 1,838 bytes traced byte for byte to the run's own
  snapshot.

- **Steering a live run works, and the dashboard can do it.** `vibe steer`
  queued a note onto a running run and reported it queued - and on every flow
  that ships, nothing ever read it. The drain had a single call site inside the
  graph frontier, and no built-in flow declares `needs`, so `default` and the
  other thirteen all took the linear walk. A second defect stacked on top: the
  orchestrator persists state whole-object from a snapshot taken before the
  turn, so a note queued while you watched a step go wrong was written to disk
  and then wiped by the post-turn write. Both are fixed, both with a test that
  fails against the old code. `pendingGuidance` now has one funnel - appended by
  whoever queues it, removed only by an atomic drain - so a whole-object write
  can neither clobber it nor bring a drained note back.

- **A Steer box on the run screen**, in the control centre directly above the
  transcript: the run's input beside its output. Pick which step reads the note
  from the run's own steps, and the box says when nothing is running to read it
  rather than implying it landed. Notes are redacted on the way into the prompt,
  never at rest, because the secret matcher fires on ordinary English and
  redacting a stored note would destroy it with no copy to recover.

- **Every docs diagram is on the design system now.** The figures were drawn
  with `currentColor` at 0.28 opacity and 11px labels, which is the weakest
  convention on the page rather than the design: the site defines
  `--violet-deep`, `--fg-100` and Geist, and those figures used none of them.
  All fifty-five were redrawn across two passes - filled surfaces, white
  labels, violet secondaries, heavier connectors, and about 1.7x the type size
  at 720px. Geometry is untouched, so nothing reflowed, and no page shows a
  bold drawing beside a faint one.

- **Your codebase's TODO comments are now a backlog you can pick from.**
  Adopting Vibestrate on a project that is already underway used to mean a
  working setup and an empty Board, with the actual work still living in your
  head. But your team already wrote a lot of it down, in the `TODO` and `FIXME`
  comments they left while busy with something else. `vibe learn` now collects
  those, `vibe todos` lists them grouped by directory, and you promote the ones
  that are real onto the Board - in the terminal or on the dashboard, one at a
  time or in a batch, editing the title and priority first if you want.
  **Nothing lands on the Board on its own.** There is a new
  [Picking up a project already underway](https://vibestrate.com/docs/getting-started/existing-project)
  guide for the whole flow.

  Two things make it usable rather than a one-time novelty. Promoted cards
  remember which comment they came from, so re-running the scan never offers the
  same TODO twice, editing code above a TODO does not confuse it, and deleting a
  card puts its TODO back in the list. And you can dismiss the stale ones - a
  note to self from three years ago stops coming back, permanently, until you
  undismiss it.

  The scan is deliberately fussy about what counts, because a review list full of
  noise is the chore this removes: the marker has to be in a real comment (not a
  string literal, not prose that merely mentions a TODO), it has to open the
  comment, and it has to actually say something - bare `// TODO` and
  `// TODO: fix` are counted but never offered. Detection is line-based and says
  so rather than pretending to be exhaustive.

- **`vibe roadmap accept` and the new `vibe todos` commands complete with TAB.**
  Leave the id off and press TAB to pick from the real options, with titles shown
  next to them. No shell configuration, and it works the same on Windows.

- **Five frozen polyfills in the dependency tree now resolve to maintained
  forks.** `object-assign`, `safe-buffer`, `safer-buffer`, `indent-string` and
  `is-unicode-supported` are shims for things Node has had natively for years, or
  utilities smaller than the cost of depending on them. They arrive transitively,
  so they cannot simply be deleted; they are pinned to Socket's zero-dependency
  replacements instead. Worth stating plainly because it changes what lands in
  your `node_modules`: those five now come from `@socketregistry`.

- **The docs describe the flow the product actually runs.** The default flow
  became three seats and four steps, but the pages explaining it still walked
  eight: `concepts/workflow.md` kept an architect, a dedicated fixer and a
  verify turn in its step table, its figure and its review-loop description,
  and `concepts/flow.md`, `concepts/task.md` and `concepts/derived-flows.md`
  each counted the old steps. The generated stage reference also called that
  seven-stage pipeline "the default Vibestrate workflow", so the docs shipped
  the wrong shape twice: once in prose and once as generated data. The stage
  list itself was right and stays: `architecting`, `fixing` and `verifying`
  are real run statuses that `--resume-stage` accepts, they just belong to
  `deep` rather than to the default. The six-seat pipeline is now described
  where it lives, as `deep`.

- **One text colour, and labels in their own voice.** Secondary text used
  three near-white tokens within three percent of each other, which separated
  nothing and only made text look tired - and there is no opacity anywhere in
  the app, so that was the greyness. `chalk-200/300/400` now resolve to
  `chalk-100` in both themes: one colour, with hierarchy carried by weight,
  size and a new mono label register. Labels moved to Geist Mono at 13px so
  they read as a different kind of type from prose rather than a dimmer shade
  of it. Done at the token level, so it is one edit and one revert across
  roughly 1,700 call sites.

- **The Run assurance card leads with what went wrong.** Four gates used to
  render as four equal columns inside a 474px panel: 104px per cell, every
  cell forced to 142px by the one that wrapped, and three of the four holding
  a single word. Gates that did not clear now get a full-width row each, with
  room for a real sentence; gates that cleared collapse to one line; the raw
  status codes are gone (every one already appears above it in words); and
  how the run was conducted moves behind a disclosure.

- **The Supervisor now speaks up when a run does not finish.** Any run that
  ends without completing gets a typed cause and a Supervisor intervention: a
  one-line summary of what stopped it and what it proposes to do, raised as a
  notification, recorded on the run, and visible in the notification centre.
  It speaks up about every non-completed run - including the ones it refuses
  to act on, because a silent refusal is how a stuck delivery ends up looking
  like a finished one. With `supervisorControl.autonomy: "act"` it carries out
  the remedy itself, but only where the fault is deterministically an
  environment fault; exhaustion and unknown are never self-executed, and the
  on-disk pause flag overrides the setting either way.

- **Queueing a task from the CLI now starts the work.** The config schema
  documents this as an invariant - it is the stated reason Supervisor autonomy
  has two settings and not three - but only the dashboard and the TUI ever
  called `ensureSchedulerRunning`, so `vibe queue add` wrote a card into a
  queue nothing drained.

- **A run now records WHY it ended, as a code.** `error` is free text, so
  everything downstream guessed from it - the dashboard identified a budget
  stop with `errLower.includes("spend cap")`, for a cause that already emits a
  typed event. `terminalCause` is derived from the run's own evidence (events
  and validation results, never a model's account of itself) and is what a
  supervisor branches on to decide whether a failure is safe to act on. Only a
  deterministic environment fault is auto-remediable; exhaustion and unknown
  are explicitly not.

- **A stopped Docker daemon is no longer reported as failed validation.** A
  missing binary counted as an environment fault; a tool that is installed
  with its daemon down did not, so a run whose `docker compose` never got to
  look at any code recorded `validation_failed` - the code that means the work
  is defective. A Supervisor reading it would propose sending correct work back
  for rework instead of asking for the service to be started, and because
  `validation_environment` is the only auto-remediable cause, the
  misclassification also disabled the one safe automatic remedy. The patterns
  are narrow and name the tool reporting its own daemon unreachable: a bare
  connection refused stays a real failure, because a suite that cannot reach a
  service it was supposed to start IS a defect.

- **Scheduled runs are unattended, which is what makes a scheduler worker
  safe.** The argv the scheduler spawned omitted `--unattended`, so a
  scheduled run took the approval gate's indefinite branch - the gate's own
  comment warns that an unanswered approval "would wedge a scheduler worker
  forever", and with a single in-flight slot that is exactly what happened.
  `vibe tasks sequence` now accepts and forwards the flag too, so the
  supervised path carries the same contract.

- **Validation commands are bounded.** They ran with no timeout and no
  tree-kill, so a command that blocks - `docker compose up` waiting on a
  healthcheck is the obvious one - hung the run forever. An unattended run
  promises to terminate on its own and could not keep that promise. New
  `commands.validateTimeoutMs`, default 15 minutes.

- **Seats that are allowed to run commands can now actually run them.** A
  permission profile could say `allowShell: true` and the agent still could
  not execute anything: `--permission-mode acceptEdits` auto-approves file
  edits but not Bash, so in a headless run every command outside the host's
  own allow rules waited for an approval nobody could give, and the call hung.
  One reviewer seat made 39 attempts and collected 21 "this command requires
  approval" results while its profile said it had shell. That is the cause of
  every "the tests were never executed" refusal we have measured. Seats now
  carry an explicit, auditable command grant, derived by default from the
  project's own `commands.validate`, the common language runtimes, and
  read-only inspection, and widenable per profile with `allowedCommands`.
  Package installers stay out of the default - those reach the network and
  need naming explicitly.

- **A turn that can mutate the worktree is diff-gated whether it holds the
  edit tools or a shell.** The pre-turn snapshot used to key on `allowWrite`,
  which left a shell-capable reviewer as the one executing seat with no
  snapshot, no secret scan, no broker record and no rollback. It now keys on
  `allowWrite || allowShell`.

- **The read-only clamp resolves the built-in profile, never project config.**
  `vibe init` scaffolds a `read_only` profile, and project config wins over
  the builtin - so a project one boolean from `allowShell: true` could have
  handed a shell to investigation and strict-apply-only runs, the two paths
  whose whole purpose is to affect nothing.

- **The docs overview now explains the docs.** It described the product and
  stopped, so the shape of the manual - what a page looks like, which of the
  three kinds you are on, what is generated and therefore cannot drift - was
  something you inferred. It says so now, and it points at the schematics, which
  were real but effectively unfindable three levels down the sidebar. Schematics
  is a top-level Architecture entry now.

- **The docs got the diagrams they were missing, and a page that collects them.**
  Seven subjects that only had prose now have a figure: what a flow holds, what a
  profile holds, what a run holds, the default flow and its one cycle, how a run
  is driven, what one turn does, and how a failed turn is resolved. Each sits on
  the page that explains it, and `architecture/schematics` collects the whole set
  in dependency order for reading in one pass. They are drawn to the docs' own
  idiom rather than imported from elsewhere: 560px wide like the forty-one
  figures already there, every fill and stroke `currentColor`, no literal colour
  anywhere. Two new gates hold that line - one refuses a figure that hard-codes a
  colour or overruns the article column, the other refuses a repeated figure that
  has drifted from its original.

- **The docs now say what each type is made of.** Every core concept page
  carried a good explanation of what a Flow or a Profile is *for* and nothing at
  all about what it *holds*, so the only way to learn that a profile has a
  `timeoutMs` was to open the Zod schema. Flow, Steps, Profile, Role, Crew, Run
  and Task each gained a "What a X carries" table naming its real fields with
  what they mean; `architecture/overview` gained a type map putting all nine on
  one screen; and the quick start opens with the six words and the one sentence
  that connects them, so the shape is clear before the install. The tables are
  curated rather than exhaustive - `reference/config` stays the generated,
  complete list - and a new gate parses every table back against the schema it
  describes, so prose can no longer name a field that was renamed or removed.
  It found one on the way in: a flow seat has no `id` field, the id is the key
  it is filed under.

- **An unattended run can no longer be held open by a hung provider.**
  `--unattended` promises the run always terminates on its own, but nothing
  bounded a provider turn: `profile.timeoutMs` is unset unless you set it, so a
  wedged CLI hung the run forever with no event, no failure and no end. There is
  now an inactivity watchdog, and the distinction matters - it watches for
  *silence*, not elapsed time. A model streaming for an hour is working and is
  never touched; a turn that produces no output at all for 20 minutes has its
  whole process group killed and fails as the typed class `stall`, which retries
  under `resilience.transient` and then honors `onExhausted` like any other
  recoverable failure, ending with one terminal event that names the cause.
  `resilience.stallTimeoutMs` sets the window (`0` disables it; a number applies
  to attended runs too). It arms only where silence is evidence of a wedge - a
  `claude-code` turn under `--output-format stream-json`, its default - because
  a CLI that buffers until it exits is legitimately quiet, and killing a healthy
  turn costs more than waiting out a dead one.

- A run's task now fits a full GitHub issue. The task field was capped at
  2,000 characters at six separate entry points; pasting an ordinary issue got
  refused before any agent ran. The bound is now 65,536 - GitHub's own
  issue-body limit - enforced by one shared schema so the boundaries cannot
  drift apart again.

- **Two first-run killers from the head-to-head benchmark, fixed.** `vibe init`
  hardcoded `mainBranch: main`, so on a `master` repository every run died at
  worktree creation with `fatal: invalid reference: main` - the first run a new
  user ever starts, failing on a config file they did not write. Init now reads
  the repo's actual HEAD. And a flat `.vibestrate/flows/<id>.yml` - the shape
  everyone writes first - was silently ignored; it is now reported with the move
  that fixes it, through the same channel a malformed flow uses.

- **`vibe queue service`** prints a launchd or systemd unit that brings the
  scheduler back after a reboot - the one piece of always-on that was missing.
  Queueing work already spawns a scheduler, records its spawn and exit, and
  derives whether it is alive; what it never survived was the machine
  restarting. The unit is per project, is printed rather than installed
  (writing into `~/Library/LaunchAgents` changes how your machine boots, which
  is your call), and comes with the line that undoes it. It also does not
  respawn unconditionally: the scheduler self-heals when work is queued, and an
  endless respawn would turn one unparseable config into a machine busy-looping
  all night.

- **Every run now checks whether its review is talking about real files.** A
  finding citing `src/uploader.ts` when there is no such file has not read the
  change - it has produced something that reads like a finding. Each cited path
  is resolved against the worktree the review actually read, and any that do not
  resolve are recorded in the run's events with the paths named. Advisory, never
  a gate: a reviewer may legitimately name a file the change *should* create, so
  it points you at that finding rather than dismissing it. No index, no
  embeddings, nothing leaves your machine - the filesystem answers the precise
  question that retrieval would only answer fuzzily.

- **A flow that produces no code.** `vibe run "..." --flow research` answers a
  question in writing, with what each claim rests on named, checked by a second
  seat for whether the sources actually carry it - and writes nothing to your
  repository. It is the worked example for runs that are not diffs: marketing
  copy, an image brief and a literature review are the same shape with different
  parameters. Takes `audience` and `depth` as flow params.

- **Documented a trap that costs an afternoon.** A `review-turn` whose `outputs`
  do not include `review-decision` has its `DECISION:` line silently ignored -
  the run ends `blocked` however the review went, with an `APPROVED` artifact in
  the run folder saying otherwise. `review` is the obvious name to reach for and
  it is the wrong one. Now called out in the flow reference.

- **Your backlog moves in and out as CSV.** `vibe tasks import their-export.csv`
  and `vibe tasks export` - the format Jira, Trello, Monday, Asana and Linear all
  read and write. Columns match by name rather than position, Jira's `Key` and
  `Summary` are understood, and a status the pipeline does not have ("In Review")
  becomes a **stage** rather than being dropped. A row with no title is skipped
  by line number instead of the file being refused. Importing is additive: it
  never updates or deletes a card. A file rather than a connector on purpose -
  every one of those trackers is a hosted service reached with a stored
  credential, and shipping one would settle that posture question by accident.

- **`vibe integrate pr <runId>` prepares a pull request** - the branch, the
  base, and a body written from what the run recorded: the verdict, which checks
  passed, and whether the review was a different model or the same one checking
  itself. It prints the `gh pr create` line and stops. Opening a PR requires a
  push, and pushing is the one thing Vibestrate does not do, so it does the
  tedious part and leaves the irreversible one to you. The outgoing diff is
  swept with the stricter patterns the Flow Hub uses before publishing - a
  finding refuses the whole thing rather than warning, because a leaked key is
  recoverable on a local branch and public the moment it is pushed.

- **`forbiddenOperations` no longer pretends to be a gate.** It reaches the
  agent's prompt and nothing else - a seat with a shell can do as it likes, and
  intercepting that is what the container backend is for. It now reads "do not
  perform these operations" rather than "forbidden", and what actually holds
  those lines is structural and tested: no code path runs `git push`, a merge to
  main is refused without your confirmation, and secret-like paths are refused
  on read and write.

- **Tasks have a workflow stage, separate from their run status.** The Board's
  columns were a projection of run status, which conflates two things: execution
  state, which the machine owns and moves on its own, and where a person filed
  the card. That is why dragging a card was never a real gesture - every honest
  move was either a lie or an execution. `stage` is a free label you set
  (`vibe tasks stage <id> Needs planning`, or the API), it starts nothing, and
  nothing in the engine branches on its value. Name your stages in
  `board.stages`; leave it empty and the board keeps the status columns it
  always had.

- **`vibe provider refresh --probe-cloud`** asks cloud providers what models
  they actually have, instead of relying on a built-in list that goes stale.
  It is a flag rather than a default because it is the only part of a refresh
  that leaves your machine, and it spends your key: Vibestrate does not call
  model APIs unless you ask. A provider with no key is refused before any
  request goes out, and a gateway that echoes your key back inside an error has
  it redacted before you see it. Results land in the catalog overlay under the
  API family, and existing entries survive unless you pass `--force`.

- **`vibe shell --full-screen`** draws in the terminal's alternate buffer,
  filling the window instead of rendering inline. Off by default on purpose:
  redrawing correctly on resize is a property of your terminal rather than of
  Vibestrate, and VSCode's integrated one misbehaved when this was tried - so it
  is a flag to try, not a default that could break a shell in an editor people
  live in. The terminal is handed back whatever happens: the restore is armed on
  a normal exit, a crash, and Ctrl+C, because exiting still in the alternate
  buffer hides your scrollback.

- **PDFs can be a context source.** `vibe run --context-pdf docs/spec.pdf`, or
  **pdf** in a task's context panel. The text goes through the same path guard
  and the same secret redaction a `file` source does - a PDF is not a way around
  either - and a scanned document with no text layer is refused rather than
  attached as an empty section. Vibestrate reads them with poppler's
  `pdftotext` rather than bundling a parser: that would have added about a third
  to the package for a source most runs never attach, and a binary parser over
  user files is attack surface a tool like this should not grow. A missing
  `pdftotext` is reported with the command that installs it.

- **A Homebrew formula, rendered from what npm actually published.**
  `pnpm tsx scripts/update-homebrew-formula.ts` takes the tarball url and a
  sha256 from the registry itself, so the formula cannot describe a build that
  never shipped - and asking for a version npm does not have fails with that
  reason instead of emitting a formula whose checksum is only found wrong on
  someone else's machine, after `brew install` has downloaded it. The tap repo
  itself is not created here; steps are in `.github/MAINTAINING.md`.

- **A unique prefix of a run id is enough**, the way a short SHA is enough for
  git. Ids are timestamped and task-derived - `20260614-125024-add-audit-logging`
  - which is unambiguous and a nuisance to retype, so `vibe path 20260614-1250`
  now resolves. Three references work, in order: the id, a name you set with
  `vibe rename`, then a prefix. A reference matching more than one run is an
  error listing the candidates rather than a guess at the newest, because the
  alternative is aborting a run you did not mean; a full id always wins outright
  so an older run stays reachable when a longer id appears; and a name you chose
  beats a prefix you did not. Live on the commands you type an id into by hand:
  abort, pause, resume, replay, steer, path, rename, logs, assurance, audit.

- **Ctrl+C during a wizard stops being an error.** `vibe setup` says "Press
  Ctrl+C to cancel anytime", and doing so printed
  `✗ User force closed the prompt with SIGINT` and exited 1 - the product
  reporting the action it had just suggested as a failure. Cancelling now prints
  `Cancelled.` and exits **130**, the shell convention for SIGINT, so a script
  wrapping `vibe` can tell a cancellation from a real failure. Every prompt in
  the CLI runs through one boundary, so this cannot come back one `catch` at a
  time.

- **Why auto-merge is off by default, answered properly.** It is not off by
  default - it was never built. No code path runs `git push`, a merge to main is
  refused without your confirmation, and the **Hard guards** that name both
  *declare* that rather than create it, so turning one off enables nothing. A
  default can be changed by someone else's config or a future version; a
  capability that does not exist cannot be turned on by accident.

- **Installing ends in one command, not three.** `install.sh` closed by teaching
  `vibe init`, `vibe doctor --fix` and `vibe run` to someone who had not seen the
  app yet. It is `vibe ui` now: in a folder with no `.vibestrate/` that opens an
  onboarding screen with **Initialize project**, and **More > Setup** walks the
  same checks doctor runs. The terminal path is still named, as the alternative
  it is. The README's first-run block had the same shape and the same fix.

- **A flow your crew cannot start now looks different from one that just needs
  a pick.** The crew editor painted both amber. They are not the same problem:
  a seat two roles take still runs when the run names which one, while a seat no
  role takes can never start at all. Both throw when the flow resolves, and the
  editor is the only place you would catch either before launching. Three states
  now, with the red one reserved for the failure that is unconditional.

- **Run history stays out of your repository.** `.vibestrate/runs/` holds
  per-run artifacts and state, grows without bound, and a run's `state.json`
  carries the raw text of anything steered onto it - and nothing kept it out of
  a commit. The docs told you to add the line by hand, which is a step the
  product can take. A repository Vibestrate creates now ignores it from the
  start, and `vibe doctor` (with **More > Setup**) warns when it is not ignored,
  louder once run files are already committed. The rest of `.vibestrate/` is
  still committed on purpose - crews, flows, policies and rules are the point of
  the folder. The warning is deliberately not something **Fix what's safe**
  applies: every other doctor fix stays inside `.vibestrate/`, and your
  `.gitignore` is yours.

- **A docs page is its sections now, not one box called "Going deeper".** Every
  page filed its real content under a single catch-all heading, so it rendered
  as a short intro plus one closed chapter holding everything else - and the
  site folded that chapter's own sub-headings a second time, putting the
  content two clicks down and reading as a chapter inside a chapter. The
  sections were promoted to the page's own level on all 60 pages, so the
  collapsed page is now a list of what is actually on it: on Configuration,
  "The Config page", "In the terminal shell", "The commands" and five more,
  in that order, instead of "Going deeper". With no second level left, the site
  stopped folding one. A test keeps the shape: no catch-all section, and no
  section may hold more than a third of its page.

## 0.3.0

- **Four more places where the product stated something false.** The Config
  page's record rows are read-only summaries whose only affordance is a button
  through to the screen that owns them, and four of the five never rendered:
  the lookup keyed on the setting's group, and a top-level record has no group,
  so providers, profiles, crews and personas all fell through to nothing. The
  interactive shell advertised `vibe skills assign` with its two arguments the
  wrong way round. A missing-flow-parameter error told you to persist it with
  `vibe profile set --flow`, which edits a profile and has no such flag. And
  `vibe crew presets add --help` named two of the four presets that ship.

- **The documentation is written for the app now, not the terminal.** All 60
  pages led with a command and mentioned the screen in passing. Vibestrate is
  UI first, the interactive shell second and the CLI last, and the guides now
  read that way: the screen and the control that does the thing, then `vibe`,
  then the command as the automation path. No commands were removed, and the
  CLI reference pages are still about the CLI.
- **Ninety-odd factual corrections came out of it.** Every page was reviewed
  against the source that renders it, adversarially, by a reader who had not
  written it. Some of what that found: the Crew page said an ambiguous seat
  resolves to "the first match" when the resolver refuses the run outright; the
  Policies surface was described as gates that cannot be turned off, when all
  four are editable switches that declare an invariant rather than enforce it;
  the dashboard's own help cards offered six commands that fail if you copy
  them; three screenshot captions described controls their pictures do not
  contain. Those are fixed in the product as well as in the docs.
- **Two new gates, because both of those classes were invisible.** Every
  `vibe …` in the docs and in the dashboard's help cards is now checked against
  the real command tree - subcommands, flags and required arguments, not just
  the first word, which is how `vibe crew set-profile` passed the old check
  twice. And all 19 scoped screenshots are registered with the labels they show
  and the components that render them, so a renamed button fails a test instead
  of quietly making a picture lie.
- **The pages are about 5% shorter.** Four independent compression passes each
  reported the same thing: the prose is dense rather than padded. A corpus-wide
  search for filler returns single digits, and roughly a quarter of what is on
  these pages is code, diagrams and screenshot descriptions that carry facts.
  The duplication that did exist - captions re-narrating their own alt text,
  an analogy after a plain definition - is gone.

- **Setting a project up no longer means a terminal.** `vibe ui` already ran
  `vibe init` from the browser, but `vibe doctor` had no dashboard surface at
  all - the report was computed by an API route nothing rendered, and the repair
  pass behind `--fix` had no route at all. So the docs had to send people to a
  terminal for the one step that tells them what is wrong. There is now a
  **Setup** page: the same checks doctor prints, grouped into numbered steps -
  a repository, the config, a model, your test commands, everything else - with
  a **Fix what's safe** button that runs the same narrow repair, and the button
  that starts your first run at the end. Every step reads its state out of
  doctor's own findings, so a check added to the service appears here without
  being re-implemented. Running `vibe ui` on a project with no provider
  detected now lands you there instead of on an empty dashboard.
- **Two annotated reference pages**, in the spirit of a commented `values.yaml`:
  the Default flow written out as the YAML you would author, and the crew,
  profiles and role files `vibe init` writes - every field explained where it
  appears rather than in a table somewhere else.

- **Every documentation section is a chapter you open.** Pages were long
  because the material is long, and all of it was on screen at once. Each `##`
  section is now collapsible, and a section carrying three or more `###`
  sub-sections folds those away too, so opening "Going deeper" gives a menu
  rather than a wall. The first chapter stays open, there is an Expand all
  control, and links from the "On this page" rail open the chapter they point
  into. Collapsed, the 4,300-word safety page goes from sixteen screens to
  under half of one.
- **39 headings lost a third of their words**, because a chapter title is now
  what the page shows at rest. Symptom headings in Troubleshooting were left
  long on purpose - people search those.

- **A rebuilt dashboard no longer dead-ends the tab you had open.** Pages load
  as hashed chunks out of `dist/ui`, and a rebuild replaces every filename, so
  a tab that was open across one still asked for names the server no longer
  had: opening a run died on `Failed to fetch dynamically imported module`.
  Nothing in the page could repair that, because the stale name is baked into
  code that has already loaded. A route whose chunk fails to arrive now reloads
  the tab once and lands on the page you asked for. Once, and only for a
  missing file: a chunk still absent after the reload reaches the error panel
  instead of refreshing forever, and it now says the build is incomplete rather
  than blaming the view.
- **Screenshots in the docs open full screen.** The crops are 2x captures, so a
  2900px-wide run header rendered into a text column was a picture of text
  nobody could read. Click any of them for the full-size view, with a step up
  to native pixels for the widest ones, Esc to close.
- **The documentation navigation has a second level.** A topic's sub-topics sit
  under it - Flow over Steps and Seat, Crew over Role, Profile and Provider,
  Run over Run state, Worktree and the task lifecycle - so the sidebar shows
  what belongs to what instead of one long flat run of names. Breadcrumbs carry
  the parent too.
- **Getting started is a numbered path.** Install, connect a model, learn the
  words, run one task, keep the change, and so on in that order - the pages
  used to hand off backwards, sending you to your first run before you had a
  model wired up.
- **Quick start and the full walkthrough are navigable.** Every real step in
  them was an H3 buried under a single "Going deeper" heading, which is what a
  reader's table of contents showed: three entries for a 570-line page. The
  steps are now headings in their own right, with subheadings under the long
  ones.

- **The card-carries-its-spec fix had no producer behind it, so every card
  still ran blind.** A card records the approved spec it came from in
  `specRef`, and both launchers attach it. Nothing ever wrote the file that
  reference pointed at: it was derived from the source run's
  `spec-up-approved-spec.md`, which only `vibe spec-up build` writes and the
  roadmap path never calls. The lookup failed, fell through its `if (exists)`
  to null, and every accepted card silently carried no spec, exactly as before
  the field existed. `vibe roadmap accept` now resolves a real file, because
  the roadmap run's scope, spec, architecture and risks are assembled and
  written beside the proposal when the proposal is created.
  The spec is stored with the proposal rather than in the run for two reasons:
  a card can sit in the backlog long after run artifacts are pruned, and inside
  a run store that filename already means "this spec is frozen", so putting one
  there would have blocked editing the run's sections as a side effect.
  Both handoffs now share one assembler, so `build` and `approve` cannot drift
  into handing the models different specs for the same approved work, and each
  fails fast on a run with no spec instead of continuing with empty context.
- **The dashboard dropped the spec that `vibe run --task` attached.** Only the
  CLI read a card's `specRef`, so the surface most cards are launched from was
  the one that ignored it and the same card built differently depending on
  where you clicked.
- **`vibe run --task <id>` ignored a card's own context sources.** The dashboard
  inherited them and the CLI did not. The CLI now does, on the same precedence:
  an explicit `--context-file` or `--context-url` wins, otherwise the card's
  sources apply. The spec rides along either way.
- **`vibe run --no-select` did not exist.** A plan-worthy brief is routed into
  the read-only spec-up chain first, and naming a flow with `--flow` does not
  skip that: the flow you name becomes what spec-up builds afterwards, which is
  the intended design. The documented per-run way out is `--no-select`, which
  the dashboard sends - but the CLI never registered the flag and never passed
  the value, so the only way to stop the detour from a terminal was
  `adaptiveSpecUp: off` in `project.yml`, turning a per-run choice into a
  permanent one. The flag now exists and works. The walkthrough also still said
  a run started from a card carries its title without the spec; it carries the
  spec.
- **`vibe tasks show` now lists what a run from the card will be given** - the
  approved spec-up spec and any files or urls attached to it. The dashboard
  showed this and the terminal did not, so a card silently carrying a spec was
  visible only in `--json`.
- **The dashboard now shows the spec on the card too.** The Grounding row
  listed the files and urls someone attached by hand but not the approved spec,
  so the surface that SETS a card's spec was the one that never displayed it.
  It sits in the same row as the other references, with its own icon and no
  remove control, because it is derived from the proposal rather than owned by
  the card.
- **A colour token that does not exist now fails the build.** A Tailwind class
  naming an undefined `-soft` token renders as no colour at all, silently, past
  a green typecheck and a successful build - the design-drift guard caught one
  token by name, `chalk-500`, and nothing else. It now checks every `-soft`
  class in the dashboard against what `index.css` actually defines.
- **`vibe init --yes` writes the provider it actually found.** The
  non-interactive path hardcoded `claude` in both branches of its config
  renderer, so a machine whose only installed CLI was codex was told "Codex CLI
  detected" and handed a `project.yml` naming a binary that is not on PATH. The
  first `vibe run` then failed for a reason the output had actively misdirected
  about. The scaffolded provider now comes from the same preset table that
  `vibe doctor --fix` and the setup wizard already use, so codex gets `exec`,
  gemini gets no args, and aider gets its one-shot `--message` form with the
  prompt as an argument rather than on stdin. The "Default agents will use:"
  line is rendered from that same source, which is what stops it claiming an
  invocation nobody wrote. With no CLI detected the placeholder stays `claude`,
  which is what doctor then tells you to fix. Claude is still scaffolded as
  `type: cli`: switching it to `claude-code` is what grants a write seat
  `--permission-mode acceptEdits`, and that stays a decision you make rather
  than one init makes for you.

- **`vibe doctor` names your project type the way `vibe init` does.** It printed
  the raw internal value (`node`) where init printed `Node.js`.

- **A review can now stand itself down when the change never touched its
  subject.** `skipWhen` understood one condition - "the diff is prose" - and
  only worked in linear flows, so a derived flow (always a graph) could not use
  it at all. It now understands whether the run's real diff shows an auth
  surface, caller-supplied input reaching a sink, a schema change, a change to
  the rendered surface, or a dependency change, and the graph frontier evaluates
  it too. Derived flows attach the right condition to each lens automatically, so
  tagging a unit `auth` speculatively costs nothing when the finished code turns
  out not to decide who may act. Correctness never stands down - there is no diff
  safe to leave unread. Skipping requires positive evidence of absence: an
  unreadable diff, an empty change set or a read-only run all run the step, so a
  wrong call can only ever cause more review. `--flow-force <step>` runs a step
  whatever its condition says; there is deliberately no inverse, because a lever
  that turns reviews off is a hole rather than a control.

- **`vibe flows derive` builds a flow around the task instead of picking one off
  the shelf.** A shaping turn decomposes the work - units, what depends on what,
  and what each unit is risky about from a closed tag set - and deterministic
  code compiles the graph. "c depends on b" becomes a real edge; "test only once
  a, b and c are made" gates validation behind every unit; and each risk tag
  aims a review lens, so *what* gets reviewed is derived from the work rather
  than fixed by the recipe. The model never authors a step, an edge or a lens,
  which is the same reason a `block` policy is owner-only: it can influence what
  it is checked for, only through a closed vocabulary, and can never remove a
  gate. Nothing is written - the graph, the reason for every lens, and seat
  coverage against your crew are printed for review, and adopting it is
  `flows import`. Decomposition costs a model turn per unit, so the output warns
  past four units and `--max-units` refuses a split you did not ask for.

- **`vibe steer <runId> <note>` queues a note onto a live run**, applied at the
  next step boundary, so a run that is heading somewhere you did not intend can
  be corrected without aborting it. `--step` targets a specific one.

- **The architect's scope is now a contract, and it can block a merge.** This is
  the release's largest behaviour change: a run that reached merge-ready on
  0.2.1 can be capped on 0.3.0. An architecture
  step already wrote down exactly which paths the implementer could touch, and
  nothing read it - so the implementer could, and did, create files its own
  architect had ruled out. Measured on this project's benchmark: three of three
  orchestrated runs produced a `test/api.test.js` that was not on their
  architect's allowlist, under an architect that had written "no test framework
  was specified in the brief or stack list". The architecture handoff now
  carries a `scope` of path globs; the writing seats are told what it is before
  they write, and the run's real diff is checked against it at the merge gate -
  a deterministic cap, never a model verdict, exactly like a `block` policy.
  Declaring nothing keeps the old behaviour: absence is silence, not a ban - but
  the architecture prompt now asks for a scope, so in practice most flows with an
  architecture step will start declaring one and gain a cap they did not have.
  After the change, a rerun produced zero violations against its own declared
  scope.

- **Your policies now reach the agent writing the code, not just the one
  reviewing it.** An `advise` policy was injected into reviewer turns only, so a
  rule you had written down was invisible to the implementer and the fixer - the
  seats that could have honoured it. The rule was violated, caught, and removed
  by a review, fix and re-review round trip, every time, paying three model turns
  to delete something that would never have been written. A benchmark run put
  that round trip at 23% of the run's spend and 19% of its wall clock. Advise
  rules now bind the writing seats too, worded to constrain rather than
  commission: comply with these in this change, and do not go hunting for
  pre-existing violations elsewhere. One selection feeds both sides, so a rule
  can never bind a writer without also being checkable by a reviewer, and an
  unconfirmed rule still reaches neither.

## 0.2.1

- **The dashboard bundle now carries its licences.** Vibestrate ships the
  dashboard pre-built, which inlines about sixty third-party libraries and
  minifies their copyright notices away. `LICENSES/third-party-browser.txt`
  reproduces every one of them in full, generated from the build's own
  sourcemaps so it lists the code that is actually in the bundle. A library that
  arrives without attribution now fails the build.
- **Six commands the product told you to run did not exist.** `vibe doctor`
  named `vibe policies set` in the fix hint for one of its own findings, and the
  dashboard's CLI hints and the shell's command palette offered
  `vibe approvals accept`, `vibe notifications gateways`, `vibe tasks comments`,
  `vibe gateways add` and `vibe validation run`. Each is now the command that
  actually exists, and the one that named a capability Vibestrate does not have
  says what happens instead.
- **The in-shell docs browser listed seven topics that could not open.** The
  Reference pages are rendered by the website from generated JSON and have no
  markdown file, so choosing one failed with a raw filesystem error. They are no
  longer offered, and a test now reads every topic the browser lists rather than
  one hand-picked slug.
- **A botched rename reached `vibe --help`.** A global Guide-to-Flow pass
  rewrote "Guided" into "Flowd" in two command descriptions, which then rode
  into the generated CLI reference and the documentation the assistant answers
  from.
- **The README shows the product instead of a terminal recording**, and the run
  page's "View diff" moves you to the diff rather than switching a tab far below
  the fold.

## 0.2.0

- **The supervisor chat streams again.** The answer appears as it is written
  instead of after the whole turn, the reasoning trail shows where a provider
  reports one, and a turn that fails now names the reason instead of saying it
  had nothing to add.
- **Answers fit the screen you are on.** Ask the dashboard how to make a flow and
  it points at your real screens, not at four terminal commands. Enforced in what
  the answer may read, not just in what it is asked to say.
- **Show me how, on any answer that warrants it.** The supervisor builds a
  walkthrough for what you just asked, moves you to each screen and rings the
  actual section. It can only ever navigate: it never clicks, saves, or starts a
  run, and a step it cannot verify is dropped rather than pointed at nothing.
- **Consult is grounded in Vibestrate's own documentation.** Compiled from the
  shipped docs at build time and retrieved deterministically, so the same
  question returns the same pages and an unrelated one pulls in nothing. It stops
  inventing buttons and commands that do not exist.
- **Consult has two sides.** One asks about your codebase and answers read-only.
  The other works on Vibestrate itself and is the supervisor conversation, so it
  carries the autonomy gate, the pause switch and the audit trail. Neither can
  edit your code.
- **It knows what things cost.** "How much did Claude cost me this week" reads
  your runs, per provider, last seven days. Figures are worked out from token
  counts and published prices, so most are marked as estimates.
- **Describe a Flow or a Crew and get a draft back.** `vibe flows draft "review
  every change to payment code twice"`, `vibe crew draft "cheap planner, strong
  reviewer"`, and a draft panel on both pages. A draft comes back as the exact
  YAML and role files that accepting it would write, with the problems no schema
  catches already marked. Neither one writes anything.
- **Edit a Flow or a Crew from the dashboard.** The Flow Editor re-runs the real
  schema on every keystroke and pins each violation to the step or field that
  caused it. The Crew Editor saves role parameters and instructions from the
  page, and hands you the exact bytes to paste for the parts that are a
  `project.yml` edit.
- **Flow, Role and skill authoring now crosses the Action Broker.** Flow YAML
  reached disk on five paths and role prompts on another, none of them gated, so
  the directories deciding how every future run is shaped were the ones your
  policies could not reach. All of them go through one audited writer now: a
  denial comes back as a refusal you can read, writes are atomic, and the
  decision lands in the action log. A prompt that reads as carrying a secret is
  refused rather than stored.
  **Worth knowing:** a path-scoped `file.write` rule is now wider than it reads,
  because a Role's prompt, its fields and a skill assignment all declare the same
  pair of paths.
- **`pathGlob` policies were silently protecting nothing on Windows.** A glob is
  authored with `/` and was compared against a native `\` path, so every rule
  matched nothing and allowed the write. Both spellings are tested now. A
  `pathGlob` is still anchored and absolute, so `.vibestrate/project.yml` matches
  nothing; write `**/`.
- **Choose which roles see the methodology and the codebase map.**
  `methodologyRoles` and `codebaseMapRoles`. Both used to ride the planner's
  channel, so `express`, `scaffold` and `quality-arbitration` - which have no
  planner seat - saw neither, whatever you configured. Clean-room judges still
  see nothing.
- **Every documentation page was rewritten against the code that decides it.**
  All 54, checked against the schema, the CLI definitions and the flow files
  rather than against the previous version of themselves. Eighteen wrong claims
  are fixed. Pages now draw the shape they used to describe: 53 diagrams, and
  code samples that fit a phone.
- **The dashboard opens straight away, and reads properly.** First paint went
  from 900ms warm and 2.3s cold to 36ms, and the page now makes zero external
  requests. It ships the screen you are looking at rather than all of them, opens
  on a loading screen instead of assembling in pieces, and secondary text is no
  longer a faint grey hardcoded in 920 places. Menus near an edge open upward
  instead of being clipped.

*Upgrading from 0.1.x: role prompts are JSON now.
`.vibestrate/roles/planner.md` becomes `planner.json` holding
`{"schemaVersion": 1, "id": "planner", "prompt": "..."}`, with your wording in
`prompt` unchanged, and every `prompt:` under `crews:` repointed. A config still
naming a `.md` is refused at load with the edit spelled out.*

## Earlier releases

Everything below shipped before anyone was using Vibestrate. The versions are on
npm and stay there, but they reached registry mirrors rather than people, so
their notes are kept as a record rather than as something to read: the changelog
page starts at 0.2.0. If you want the older entries, they are in `CHANGELOG.md`
in the repository.

## 0.1.1

> **Breaking: Vibestrate needs Node 24 or newer.** If `vibe` stops starting after
> an upgrade, check `node -v` first.

- **A run waiting on your approval could fail over the approval landing itself.**
  Approving is what unblocks the run, so the one moment you were needed was the
  one that could break.
- **Windows is genuinely tested again**, and atomic writes survive a reader
  holding the file open.

## 0.1.0

First release on the 0.x line.

## 1.1.7

- Beta status is stated plainly, with what it does and does not promise.

## 1.1.6

- **The replay timeline works.** Scrub a finished run and watch it play back.
- **The supervisor leads Mission Control**, and the chat opens where the
  conversation already is rather than on a fresh panel.

## 1.1.5

> **Breaking: `effect: require_approval` is refused on any kind other than
> `run.complete` or `file.patch`,** because only those two can actually wait for
> a human. Elsewhere it was a hard block wearing a hold's label. **Migration:**
> change those entries to `effect: deny`, which is what they already did.
> A policy set that fails to load now blocks runs instead of being skipped.
> `vibe policies list` names any file that will be refused.

- **Secrets no longer reach the run brief.** The brief is carried into every
  later turn's prompt and was assembled from raw provider text, so a token-shaped
  string in one step's output was written to disk and re-sent from then on.
- **Supervisor Control: a conversation about a run that remembers.** Every run
  gets its own thread, and the recent turns go back to the answerer. With
  `supervisorControl.autonomy: act` it can turn "add a hero section" into a task,
  a checklist or a run. Off by default, and refused at config load unless a
  budget ceiling is set.
- **A stop button that means it.** In the panel header and on the CLI, survives a
  restart, and fails closed. Talking still works while stopped; the routing model
  is not called at all.
- **Harder to talk into things through your own repo.** Deciding what you meant
  and writing the reply are separate calls that never meet, and code with no model
  involved then checks the result: the task must be one that was offered, and a
  run's instructions are your words verbatim.
- **A supervisor-started run now actually starts.** It never had. The thread said
  it had started one while the launch was missing the run id and the child's
  output was discarded.
- **Task writes no longer lose each other.** Every mutation was a lock-free
  read-modify-write, so a run ticking off a checklist item could be silently
  undone by an edit from the board a moment later.
- **A run stops if its policy set did not fully load.** A file that fails to
  parse contributed no rules and a duplicate id kept only the first, so the
  stricter rule you just added could vanish while `vibe policies list` still
  looked healthy. An unreadable policies directory used to be indistinguishable
  from having none.
- **Approval gates show you what changed.** A gate about a diff carried a file
  count, which is not something you can approve. It carries the file list now.
- **Confine the container's network, not just its filesystem.**
  `execution.container.egress.mode: allowlist` puts the run on a Docker network
  with no gateway whose only peer is an allowlisting proxy, so code that ignores
  `HTTPS_PROXY` finds no way out either. Off by default.
- **Small tasks stop paying for the full line.** `express` now verifies code
  changes rather than only reviewing them, and flow authors can diff-floor their
  own verify step.
- **Project instructions can be more than one file**, and they are handled like
  everything else that reaches a prompt.

## 1.0.1

- A fresh install, and the no-terminal message, now say something useful and
  point somewhere.

## 1.0.0

- **A run is a flow you watch, not a chat you scroll.** Plan, architect,
  implement, validate, review, fix, verify, in an isolated git worktree.
- **The models are yours, and so is the bill.** Local agent CLIs, your own
  accounts, nothing routed through us.
- **Swap the crew without rewriting the work.** Roles, seats and profiles decide
  who does what.
- **You hold the gates.** Nothing merges, pushes or writes outside the worktree
  without you.
- **Cost is a number, not a surprise.** Budget ceilings, and spend you can read
  per run.
- **Everything twice.** A reviewer that did not write the code, and a verifier
  that did not review it.

Apache-2.0, all of it. Free to use, fork and ship.

## 0.77.0

- Source comments stand on their own, with no internal phase names, ticket ids
  or review references, and the largest modules carry a header.
- Internal build briefs, per-phase specs and QA checklists are out of the
  published docs.
- Corrected what the docs claimed about the read side of artifacts.

## 0.76.1

- **The dashboard can merge to main more than once.** Merging took a lock and
  then failed to release it, every time. From the CLI that went unnoticed,
  because the lock names the process that holds it and that process had already
  exited. From `vibe ui` the named process is the server itself, still very much
  alive, so every merge after the first was refused as "another merge is in
  progress" until you deleted the lock directory by hand.
- **A bundle can be reverted after smart apply undoes a failing step.** Smart
  apply counted a step it had just auto-reverted as applied, so the bundle's
  reverse patch described changes that were no longer in the worktree. Git
  refused it, and the whole bundle became impossible to revert. Steps whose
  revert failed still count, because those changes really are still there.
- **Renaming a run no longer costs it its progress.** A run's state file is
  written by the run itself and by whatever you do to it from outside, and
  nothing was serializing the two. Rename read the file, the run wrote minutes
  of progress, and rename put its stale copy back. Writers are now serialized
  per run; anything acting from outside reads the freshest state at the moment
  it writes. Reading was never affected.
- **An abort issued at an awkward moment is no longer dropped.** The previous
  release made abort a request the run watches for, but the watcher stops before
  the post-turn review gate, and that gate can wait on you indefinitely. An
  abort arriving in that window was overwritten by the run's own next write. The
  request now survives it.

## 0.76.0

- **Aborting a run actually aborts it.** `vibe abort`, the dashboard's Abort
  button, the TUI and task terminate all used to write "aborted" straight into
  the run's state file. The run itself writes that same file at the end of every
  turn, from its own in-memory copy - so an abort that landed at the wrong
  moment was quietly overwritten, and the run carried on spending while you had
  already been told it stopped. Abort is now a request the run watches for and
  acts on itself, the way pause always has. It stops at its next checkpoint and
  still writes its final report, assurance record and ledger entry, instead of
  being cut off mid-sentence.
- **The wording is honest about that.** `vibe abort` says "abort requested,
  stopping at the next checkpoint" rather than claiming the run is already over.
  A run whose process has died is still closed out immediately, because in that
  case there is nobody left to do it.
- **A corrupt roadmap no longer takes the whole Board down.** The previous
  release made an unreadable roadmap.json report itself instead of silently
  reading as empty, which was right - but the Board loaded the roadmap and the
  tasks together, so one unreadable file replaced the entire page, tasks
  included, every four seconds. The roadmap now degrades on its own and the
  board keeps showing the work you can act on. `vibe roadmap update` and
  `archive` also recover from a corrupt file now instead of refusing until you
  repaired it by hand.
- **Upgrading past a removed setting tells you what to do.** A project.yml still
  carrying `execution.backend: remote-sandbox` now fails with the key, the
  replacement and the reason, instead of a bare schema error that blocked every
  command. It is deliberately not migrated silently - that would put back the
  quiet host execution the removal exists to stop.

## 0.75.0

A pre-1.0 audit pass. Thirteen review lenses over the whole repo, every finding
attacked by independent reviewers before it was believed, and the survivors
fixed here. One high-severity defect, several real ones below it, and a
dependency list that had drifted a long way from what the CLI actually needs.

- **A website could read your dashboard, and no guard could see it.** Vibestrate
  checked the `Origin` header, but a page that rebinds its DNS to 127.0.0.1
  becomes same-origin in the browser's eyes, so a plain `GET` carries no
  `Origin` at all - every read endpoint was reachable from any tab: run logs,
  diffs, artifacts, codebase search, config. The request's own `Host` header is
  the only thing that still names the attacker, and nothing was looking at it.
  Now it is checked, on loopback binds, where that is the control. A LAN bind is
  unaffected - it already requires a bearer token.
- **Redaction was leaving the key behind.** The private-key pattern matched the
  `-----BEGIN-----` line only, and replacing a match replaces just that line -
  so the body survived into prompts, artifacts and the provider stream with a
  `[REDACTED]` marker sitting on top of it, pointing at what it had missed. It
  now takes the whole block, including one that got cut off mid-stream.
- **`.envrc` and `prod.env` are secrets too.** The secret-file check only knew
  the `.env*` spelling, so direnv files and the `name.env` convention were read,
  diffed and displayed like ordinary source. That check is the only protection
  on the file viewer and the diff view, neither of which redacts content.
- **A dangling symlink is not a missing file.** The path guard skipped its
  containment check whenever the target did not exist, which is exactly what a
  symlink pointing nowhere looks like - so a write following it landed outside
  the project. Both cases are now told apart, and a symlinked parent directory
  is caught too.
- **Two settings promised something the code never did.** `remote-sandbox` and
  `cloud-runner` were accepted as execution backends and silently ran on your
  host, while the docs promised the opposite: "it refuses rather than pretend".
  They are gone, so asking for a backend that does not exist is now refused at
  config load. `git.allowAutoMerge` and `git.allowAutoPush` are gone too - there
  is no push code path to permit, and a setting reading "permit automatic
  pushes" implied you could switch off a guarantee that is structural.
- **A corrupt roadmap file no longer erases your roadmap.** It used to be read
  as "no items", which the next add then wrote back over the real file. Now it
  is moved aside intact and you are told where it went.
- **`npm i -g vibestrate` was installing 15.4 MB it never used.** 44 declared
  dependencies, 13 of which the CLI actually loads. The rest are bundled into
  the dashboard at build time or were left over from a UI scaffold that was
  never built on. CI now also verifies the packed tarball in a clean room, which
  is the one release check it had been skipping.

## 0.74.1

- **The model pickers were showing a guess.** Vibestrate probes each provider's
  own bundled model catalog at the start of every run and caches it, but the
  endpoint feeding the Profile editors merged the overlay over the built-in
  curated list and stopped - it never read that cache. Codex was offering three
  models, two of which it does not have, while the seven it really has sat
  unread on disk. The editors now serve the resolved catalog: built-in <
  detected < your overlay.
- **A model has to be one the provider actually has.** Writing a profile whose
  model its provider does not offer is refused, with the available ids in the
  error - it used to reach `project.yml` and fail only when a run tried to spawn.
  A patch is judged by the pair it would leave on disk, so changing only the
  model still checks it against the provider already configured.
- **It only fails closed where the evidence is real.** When the list came from
  the provider itself, a model outside it is wrong and the write is refused.
  When all we have is the curated fallback, the value is allowed and reported as
  unverified - refusing an id we merely have no record of would block every new
  model on release day.
- **Drift is surfaced, not silently carried.** A model can stop existing without
  anyone touching the config, when a provider ships a build that drops it. The
  Profiles page marks the profile and says which provider has no such model, and
  the dashboard shows a banner naming it - the run that would have failed has
  not started yet.

## 0.74.0

- **Pages have a header now, and a shape.** Every screen leads with a real page
  hero - a tonal state column that says whether the page needs attention, the
  title and its actions on one row, a metric strip, and a line saying what the
  current state means. Before this a page opened with a small title over a grey
  paragraph on bare canvas, which is what "there's no real header area" meant.
- **Nothing stretches to the monitor any more.** Page regions are cells in a
  twelve-column grid that resolves against the content width, not the viewport,
  so a card holding four facts is card-sized instead of 1610px wide. Things that
  belong side by side sit side by side: Project's eight panels, Config's
  seventeen setting groups, Settings, Metrics, New run and the run inspector all
  became columns instead of a single stretched stack.
- **The dead space is gone.** A grid row is as tall as its tallest cell and the
  next row cannot backfill under a shorter one, which is why panels used to
  strand a few hundred pixels of nothing beside them and push everything below
  past both. Pages that mix tall and short panels now pack columns of stacks -
  measured, not eyeballed: Project's two columns land within 165px of each
  other over 1568, Config's within 38px over 4000.
- **A profile that cannot work says so.** A profile pointing at a model its
  provider does not have (a `codex` profile on a Claude model) used to render as
  if it were fine and fail only when a run started. The model now shows amber
  with the reason on the card. It warns rather than blocks - the model list is a
  suggestion, not an allowlist, so a genuinely new model still goes through.
- **Profile cards are the same size.** A long model id overflowed the fact row
  and wrapped one tile onto its own line, making otherwise identical cards
  different heights; facts with no value no longer take a tile at all.
- **The layout law is written down and enforced.** The width law, the height
  law, and the page hero are sections of the design contract rather than a
  comment in one file, and two build guards defend them: a route page that lays
  itself out without the grid fails, and so does a type-ladder class fighting an
  inline size - a silent collision that had left five sizes in the page hero
  dead, which is why it still measured small after being made bigger.

## 0.73.2

- **The road to 1.0.** A CTO for your AI coding: you hand it a task in plain
  language, it breaks the work down, hands each part to the right AI, and
  supervises the whole thing to a diff you review before anything ships.
  Everything a run does is local, worktree-bounded, and reversible - no
  auto-push, no auto-merge, no cloud, no model APIs unless you ask. This release
  is the point where a first-time user can arrive and find their footing.
- **Onboarding, end to end.** A new `vibe welcome` walks you through providers,
  crew, flows, and your first run - skippable and resumable, remembering where
  you left off, and honest when a step does not finish. The dashboard greets a
  first-time visitor with a short guided tour of the surfaces that matter (runs,
  flows, board, consult, new run), dismissible and re-launchable from help.
- **Every failure has a way forward.** No screen dead-ends on a line of red text
  or a spinner that never resolves. A failed page load is a visible, recoverable
  state with Retry; empty states offer the action instead of pointing at a
  command; and a lazy chunk that fails to load lands in an error boundary with a
  reload, not a blank page. On the run screen this now extends to the two panels
  a human actually reviews before merging: a diff or an assurance verdict that
  fails to load says so, rather than rendering as "this run changed nothing" or
  quietly falling back to the weaker outcome banner. Other secondary panels
  still degrade silently to their empty state - that work is tracked, not
  claimed as finished.
- **One design system, everywhere.** The last screens still wearing an older
  generation were rebuilt on the current one, starting with the setup screen a
  first-time user meets before anything else. Two panels had been rendering
  against colour variables nothing in the app defined, so they drew in no colour
  at all. Flow cards had forked into three near-copies and are now one. The
  keyboard-shortcuts overlay described a shell that had been retired, along with
  shortcuts that were never wired up, and now documents what the app actually
  does.
- **No more browser popups.** Every confirmation and prompt is an in-app dialog
  in the product's own surface, rather than the browser's grey system box. They
  fail closed: only an explicit confirm proceeds, and cancel, Escape, clicking
  away, or navigating mid-question all decline. Four of these gates turned out to
  be skippable under the old code, so a destructive action could run without ever
  asking.
- **Nothing sends you to a text editor.** Every screen that used to name a file
  path or a terminal command now offers the action itself. The continuity ledger
  takes entries by hand, from the Board or from `vibe ledger add`, and marks them
  as yours so a later run never reads your note as its own work. You can register
  another project, initialise one, install a skill from a URL, and start the
  queue without leaving the dashboard. Where a command genuinely has to stay on
  the CLI - shell values, policy files, provider logins - the screen now says why
  instead of just telling you to go elsewhere.
- **The run screen has its Terminal and Replay tabs back.** The Mission Control
  redesign dropped two inspector tabs that the rest of the product kept
  advertising: the per-run interactive shell that `policies.allowInteractiveTerminal`
  turns on, and the scrubbable replay timeline `vibe replay` points you to. Both
  are wired into the run inspector again, so the terminal policy and the CLI's
  own hint lead somewhere real. The deep links that had been quietly landing on
  the wrong panel resolve too - `?tab=replay` from the runs list, and `?tab=diff`
  from Mission Control's run diff, which the Artifacts tab now owns.
- **Docs that match the code.** The handwritten docs were swept for factual
  drift and corrected against the current source - real commands, real config
  keys, real run artifacts - so the getting-started path and the concept pages
  describe the tool as it actually behaves.
- **Security: the API token could be bypassed on a network-exposed bind.** If you
  ever ran the dashboard non-loopback with `VIBESTRATE_API_TOKEN` set, update. The
  auth gate decided whether a request was API-scoped by testing whether its raw
  URL started with `/api/`, while the router resolved routes by its own
  normalisation. Because the router percent-decodes path segments and the server
  accepts absolute-form request targets, `/%61pi/...` and
  `GET http://host/api/... HTTP/1.1` both reached the real handler with no token
  at all - every API route was readable and writable unauthenticated, in exactly
  the configuration where the token is the only control. The gate now derives
  scope from the resolved route rather than the URL string, and fails closed when
  the route cannot be determined, so a newly added API route is covered without
  anyone remembering to cover it. Unmatched `/api` paths are now refused too,
  rather than falling through to the static handler and letting a caller map the
  API by telling 404 apart from 401. Loopback with no token configured is
  unchanged.
- **A current, audited dependency stack on Node 22+.** Every dependency was
  brought current for the cut - including the execa 10, commander 15, and zod 4
  majors - with `pnpm audit` fully clean. Node 18 and 20 reached end of life,
  so Vibestrate now requires Node 22 or newer.

## 0.73.0

- **The error-state migration is finished - failure is always visible, always
  recoverable.** The last empty states that pointed you at a CLI command now
  carry the action itself: the runs list offers New run, the project page's
  provider section jumps to Add provider, and the scheduler queue opens the
  board. The silent failures went too - a dead server can no longer masquerade
  as "No runs yet" in the run switcher or as an empty policies list; both now
  show the designed error card with Retry, and a genuine empty stays honest.
  Retry also reached the surfaces that were missing it (crew, providers, the
  flows hub, run detail), and the lazy-loaded terminal and replay panels now
  fail into an error boundary with a reload path instead of a blank pane.

## 0.72.2

- **The error surface reached across the app.** A dozen more places that used to
  print a line of red text - a task or board that won't load, the runs list,
  flows, config, workspace, supervisors, consult, metrics, the crew and provider
  pages - now render the designed error card with a Retry and a way back, and
  the two one-off "error banner" components were folded into the shared one. The
  starting-run and not-found states were reworked to the app's text-first look
  (no more icon-in-a-box), with the message split one sentence per line and a
  progressive bar while a run spins up.

## 0.72.0

- **Errors are a fork now, not a dead end.** A missing run, a failed fetch, or a
  forbidden action renders through one designed error surface - a clear headline,
  what to do about it, and buttons that actually move you forward (Back to runs,
  New run, Retry) - instead of a line of red text. The copy is the server's own
  classification (the same a 404 shows on the CLI), so "not found" reads "it may
  have been deleted, cancelled, or never existed" with real recovery links.
  First casualty: opening a run that no longer exists used to spin on
  "Starting run…" forever - now it tells you it's gone and points you home.

## 0.71.2

- **The sub-surfaces caught up to the design system.** Popups, form fields, and
  opened panels that still wore the old visual language were rebuilt on the
  canonical recipes in one pass - the notifications drawer and bell, the
  project-parameters and gateway settings forms, the profile-maintenance and
  replay panels, the artifact/validation/diff views, the help popup, the consult
  answer card, and the spec-up gap-questions screen. Borders now show up in light
  mode instead of vanishing, chips are flat instead of pills, and buttons are
  real buttons. Along the way we confirmed a cluster of superseded components
  (an old Mission Control exploration, the notes/skills panels) were dead code
  and left them for removal rather than restyling what nothing renders.

## 0.71.1

- **Every page wears the same header now.** The last pages still on the old
  visual language - Roadmap proposals and the Consult surface - were rebuilt on
  the design system (contained framed intros, real buttons, the 24px page
  title), and the Supervisors and All-runs headers were normalized to match.
  No page leads with a loose grey subtitle or an undersized title anymore;
  verified in both themes.

## 0.71.0

- **Approval gates carry a purpose now: request changes, don't just approve or
  reject.** When an agent pauses and asks for your call, you can return
  free-form guidance and the run **re-runs that stage with it** instead of
  dead-ending on a reject. It's bounded (`policies.approvalMaxChangeRounds`,
  default 3), fails closed on policy gates (which have no agent turn to re-run),
  and works from every surface: the dashboard card, `vibe approvals
  request-changes <run> <id> --guidance "..."`, and the shell TUI (press `c`).
  A **Discuss** action on the card opens the supervisor consult, pre-seeded with
  the gate's context, when you want advice before deciding.
- **The approval card, rebuilt.** It now uses the canonical hero-card anatomy - a
  tonal status column that reads the risk at a glance, the agent's ask as the
  headline, and real buttons - replacing the old flat, grey-labelled banner.

## 0.70.1

- **A failed map refresh no longer wipes the map.** On the Codebase Map view, a
  transient refresh error used to replace the whole map with a full-page error
  whose "Retry" re-ran the initial load, not the refresh. Now the map stays on
  screen and the failure shows as a dismissable inline banner whose Retry
  actually re-runs the refresh.
- **Declared entry points can't escape the project root.** A `package.json`
  `main`/`bin` pointing outside the repo (`../secret`, an absolute path) is now
  dropped from the map instead of being recorded and surfaced in the UI and
  planner grounding.

## 0.70.0

- **`vibe learn` now reads Next.js apps properly.** Measured against a real
  Next.js/Shopify project, the map was missing every `src/app/**/route.ts`
  handler (it only recognized a root-level `app/`) and scraping phantom routes
  from prose in markdown docs. Route detection now covers the `src/app` and
  `src/pages/api` layouts and scans source files only.
- **The planner gets a curated map, not a truncated dump.** The grounding fed
  to the planner is now a prioritized projection - invariant-signaling scripts
  first, a route summary (count + areas) instead of a wall of paths - so the
  high-signal grounding survives the token budget instead of being cut off. On
  the same project the planner block went from 4084 truncated bytes to 1857
  complete ones.

## 0.69.0

- **`vibe learn` - a codebase map the orchestrator actually uses.** One command
  deterministically scans your project (stack, scripts, layout, languages,
  best-effort HTTP routes, tooling) into a machine-owned, regenerable map -
  `.vibestrate/CODEBASE.md` + `codebase-map.json` - with no model call, secret
  redaction, and atomic writes. `vibe init` runs it for you, the planner and
  Consult ground on it (judges stay clean-room), and it refreshes itself at run
  terminal outcomes, flagging itself stale once `HEAD` moves.
- **A Map view on the Codebase page.** Stat tiles and dense sections for the
  whole map, a Refresh action, and an explicit stale indicator - backed by
  `GET /api/codebase-map` and `POST /api/codebase-map/refresh`.

## 0.68.0

- **Sub-agent denylist per role.** Profiles gained a `disallowedTools` knob that
  maps to the provider's `--disallowedTools`. Its main use is `["Task"]` on a
  strict flow's write seats, so a seat's agent can't spin up its own nested
  sub-agents that schedule work outside the flow DAG - keeping the supervisor's
  view of what ran legible. Off by default (nothing changes until a profile opts
  in). It is about orchestration legibility, not a write guard: read/explore
  sub-agents on a read-only seat are already write-safe via `--permission-mode
  plan`, and the denylist is best-effort (it blocks the default `Task` path, not
  every possible fan-out).
- **Session continuity is per-seat, on the record.** Provider sessions are
  reused across a flow's steps by **Seat**, never by profile - a same-model
  reviewer and writer stay independent processes so the reviewer can't inherit
  and rubber-stamp the writer's context. This was already the behavior; it is now
  pinned by a load-bearing comment and an invariant test so it can't silently
  regress into a profile-keyed rule.

## 0.66.0

- **Ponytail minimalism, built in.** Code-writing agents (the implementer and
  fixer seats) now run with the **ponytail** "lazy senior dev" posture by
  default: before writing code they climb the ladder - does this need to exist
  (YAGNI)? already in the codebase? stdlib? native feature? one line? - and only
  then write the minimum that works, with the hard guards intact (understand the
  problem first, validate at trust boundaries, leave one runnable check). The
  result is smaller, less over-engineered diffs. Reviewers and planners are
  deliberately left out of it. Toggle with `ponytail` in project config (on by
  default). Vendored verbatim from the open-source ponytail skill
  (github.com/DietrichGebert/ponytail, MIT) so it is genuinely ponytail and works
  across every provider, with no plugin dependency.

## 0.65.0

- **Hardened run containers.** When a run executes in the Docker backend, the
  container now runs with a **read-only root filesystem** (only the worktree,
  a tmpfs `/tmp`, and a tmpfs HOME are writable) and a **process cap**
  (`--pids-limit`, default 512) on top of the existing dropped capabilities and
  no-privilege-escalation. A rogue or buggy agent's blast radius shrinks to
  disposable surfaces. Both are configurable (`execution.container.readonlyRoot`,
  `execution.container.pidsLimit`); read-only root is on by default for the
  stock image, and if a custom image's HOME isn't writable the run fails at
  start with a clear message (set `readonlyRoot: false`) instead of a cryptic
  mid-run error.

## 0.64.0

- **Launch-prep fixes.** Three v1-readiness items from the launch audit:
  - The docs no longer tell you to run `vibe saga create` - a command that was
    migrated to `vibe tasks --supervised` and no longer exists. README + the CLI
    and concept docs now describe the real (shipped) supervised-task + Conductor
    flow.
  - **Config writes are atomic.** `project.yml` (config and policy edits) now
    writes to a temp file and renames it into place, so a crash mid-write can no
    longer truncate your project config.
  - **Provider detection is cached off the poll path.** The Metrics and Providers
    pages were re-probing up to 16 provider CLIs (a subprocess each) on every
    poll; detection is now cached (30s) with in-flight de-duplication, so those
    pages no longer stall while probing.

## 0.63.1

- **Broader secret redaction, safely.** The shared redactor (used before every
  model call) now also catches generic `SECRET_KEY = value` assignments the
  vendor-token patterns missed (e.g. `DB_PASS=...`, `client_secret: "..."`),
  redacting only the value and preserving the key for context. The matcher is
  bounded (no catastrophic backtracking on hostile input) and only fires when
  the secret word is the trailing segment of the key, so `tokenizer`,
  `access_key_header`, and `password_hint` are left alone. Hardened after an
  review caught a ReDoS and a false-positive class in the first cut.

## 0.63.0

- **Policies got a supervisor and a test bench.** The Policies page can now help
  you write and check rules: describe a rule in plain English and the supervisor
  drafts an editable policy (statement + a suggested matcher + tier) for you to
  review and save - nothing is committed automatically. A "Suggested policies"
  section proposes rules from your recent runs on demand. And a Test panel dry-
  runs any matcher against a pasted snippet or your recent run diffs, showing
  exactly what it would flag - with matched lines redacted. The block-vs-advise
  distinction is now spelled out: advise rules are reviewer-checked, block rules
  cap the merge with a deterministic matcher. Each works in the UI and the CLI
  (`vibe policies draft | suggest | test`).
- **Safety, verified.** A block tier stays owner-only - the supervisor can only
  suggest a draft; committing it is always your explicit action. Every model
  call redacts its input first, and the Test dry-run is read-only, runs through
  the same bounded matcher engine the merge-gate uses, and never echoes raw
  secret content. Independently security-reviewed.

## 0.62.0

- **Providers are cards now, and the drag/lock cruft is gone.** The Providers
  tab (under Crew) rendered providers as horizontal stripes with a drag-to-
  reorder handle and a padlock "lock" toggle - both were local-only cosmetics
  (provider binding is by id; order never affected anything) and the lock only
  existed to pin a row against that useless drag. Removed both, and rebuilt the
  rows as a proper card grid matching the rest of the app: icon, name, version,
  status, guidance, and the real actions (Edit / Set default / Test, or Install /
  Set up) in a footer. Every provider action is unchanged.

## 0.61.0

- **Supervisors is now an authoring surface with an archetype gallery.** The
  page used to only list the active supervisors read-only. It now offers a
  gallery of six curated archetypes - Security Hawk, Performance Skeptic,
  Correctness Purist, Frontend Reviewer, Data & Migration Guardian, Ship-fast
  Pragmatist - each with the review lenses it aims the reviewers at. Adopt one
  and it writes the persona into `project.yml`; you can also set the default
  supervisor and remove a project persona. Every action works in both the UI and
  the CLI (`vibe supervisor archetypes | adopt | default | remove`) over one
  shared service. The client only ever sends an archetype id - persona
  definitions are server-owned, closed-vocabulary, and schema-validated, so the
  UI can't inject an arbitrary persona.

## 0.60.0

- **Config is now a real editor, not a read-only mirror.** The Config page used
  to just display `project.yml` and split every setting into "live editor" vs
  "via CLI" - so half of it wasn't editable in the UI at all. It's now a
  schema-driven editor: every settable knob renders the right control for its
  type (toggle, dropdown, number/text input, JSON field) and saves through the
  same setter the CLI's `vibe config set` uses, so the UI and CLI stay in
  parity. Complex, id-keyed sections (providers, crews, profiles, personas) link
  to their dedicated editors. Shell/executable-valued keys (`commands.validate`,
  `editor.command`) are shown read-only and stay CLI-authored - the dashboard
  never accepts a shell command over HTTP. The write endpoint only accepts
  schema-defined keys, with size caps, reviewed against config-tamper attacks.

## 0.59.0

- **Git, Diffs, and Merge are now one Source page.** Three overlapping git
  surfaces collapsed into a single **Source** nav item with **Changes / Tree /
  Merge** tabs: Changes (working diff, commits, worktrees), Tree (the commit DAG
  + inspector + merge planner), and Merge (the per-run integrate flow). Old
  `/git`, `/git-tree`, and `/merge` deep-links still resolve to the matching
  tab, and the merge/integrate flow is unchanged - still explicit, still never
  pushes. Two fewer nav items.

## 0.58.0

- **The Ledger is now a tab on the Board.** The project's continuity log (what
  shipped, open intents, follow-ups, flagged runs, decisions on record) moved
  from its own nav item to a **Board / Ledger** tab, so the record sits next to
  the work it describes. It was also restyled onto the new design system in the
  move. Old `/ledger` deep-links still resolve to the tab. The segmented Board /
  Ledger and Crews / Providers toggles now share one `SegmentedControl` so they
  can't drift apart.

## 0.57.0

- **Providers now live inside Crew.** The standalone Providers page is gone; Crew
  gained a prominent **Crews / Providers** segmented header, and everything the
  old page did (detect, edit command/args, connectivity test, set default,
  install/setup) is one click away under Crew. Old `/providers` deep-links still
  resolve - they land on the Crew Providers tab. Fewer top-level nav items, and
  the engines that power a crew now sit next to the crew that uses them.

## 0.56.0

- **Git, Merge, and the diff/workflow panels moved onto the new design system.**
  The Git and Merge pages and the shared diff viewer, changed-files list,
  worktree view, secret-diff warning, workflow timeline, flow graph, event
  stream, and active-role card were the last surfaces drawn in the old idiom.
  They now compose the PageShell canvas and coal/chalk cards, with facts as
  `StatTile`s and empty/error states that point at the next action. The tuned,
  theme-aware diff add/remove colours are preserved. A leftover pulsing bar on
  the active workflow stage was removed (static tint instead). Groundwork for
  folding Git, Diffs, and Merge into one unified Source surface.

## 0.55.0

- **Config / admin pages moved onto the new design system.** Providers, Project,
  Config, Supervisors, and Settings were still drawn in the old idiom (the boxy
  `deep-scene` canvas, `.slab` cards, faint uppercase eyebrows, `fog-*`
  colours). They now compose the same PageShell canvas as Mission Control: a
  24px page header, violet-vivid section headings, dense coal/chalk cards, facts
  as `StatTile`s instead of grey dotted meta lines, and buttons that look like
  buttons. The Project page now leads with a `HeroCard` status hero. Empty
  states and errors point at the next action instead of dead-ending. Everything
  reads from theme tokens, so it holds in both light and dark.

## 0.54.0

- **Metrics charts, rebuilt on a real charting library.** The hand-rolled SVG
  charts are replaced with **visx**-backed ones in a consistent, interactive
  style: the runs-over-time chart is a smooth single-hue area with a floating
  card on hover (day + the merged/changes/failed split), the Outcomes donut is a
  thick rounded-cap ring, and latency-by-phase is a p50-to-p95 dumbbell instead
  of nested bars. Deeper surface layering, rounded cards, and a restrained
  top-lit highlight tie the whole page together; KPI tiles lead with a tone icon
  chip over an inline sparkline. Everything reads from theme tokens, so it holds
  in both themes.
- **The activity heatmap is interactive.** Hovering an hour cell now floats a
  card listing the providers that ran in that hour, each with its runs, cost,
  and tokens. The aggregator was extended to carry that per-provider breakdown
  per cell.
- **Cost reads "FREE", not "$0.00".** Anywhere actual spend or cost is zero
  (KPI, spend-by-agent, per-model, leaderboard, heatmap tooltip) it now says
  FREE - clearer for unmetered local-CLI runs. Spend caps and ceilings are
  untouched (a "$0 cap" is a limit, not "free").
- **The same chart idiom reaches the home dashboard.** The shared sparkline is
  now a smooth gradient mini-area (matching the Metrics area chart), and Mission
  Control's KPI cards use it instead of a hand-rolled flat line - so every
  sparkline across the app reads as one family.
- **Spend cap and ceilings is summary-first.** By default it shows a clean cap
  meter (today's spend against the daily cap, tinted amber past 90%) with the
  rest of the policy - at-cap action, the four ceilings, on-hit - as quiet
  read-only facts. An **Edit** reveal opens a tidy labelled form (no more
  cramped row of tiny inputs); with no cap set it leads with a "Set a daily
  cap" call to action instead of a dead read-out.

## 0.53.0

- **Seat coverage is now a chart, not a list.** A crew's role/seat relationship
  reads as a donut: one ring is the full set of seats a flow can ask for, each
  seat an arc coloured by the role that fills it, so a role's seats form one
  coloured wedge and the centre shows the coverage count. Hover a role (in the
  ring or the legend) and a detail panel to the right shows that role at the
  top wired down to the seats it takes, grouped by **work-type** (Writing,
  Reading, Reviewing, Verifying) from the role's permission - so not all seats
  read as equal. Empty seats show as hollow gaps in the ring. The crew hero
  slims to half width with the chart beside it, matched to the same height.
- **Permission reads like a label, not a token.** A role's permission renders
  as "Read only" / "Can write" with an icon in the card header and the picker,
  instead of the raw `read_only` / `code_write` slug.

## 0.52.1

- **Codebase "Ask" search is much cheaper.** Ranking files by intent is a light
  task, so it now runs at the provider's lowest viable effort (floored just
  above "minimal", which some providers can't emit valid JSON at) and its
  cheapest model where one is designated - instead of inheriting the crew
  planner's full effort. It also hands the model a trimmed, source-relevant
  file list (generated, lock, and minified files dropped), cutting input
  tokens. Note: on providers with no faster model (e.g. codex/gpt-5.5) the
  wall-clock time is bounded by the base model; the win here is token cost.

## 0.52.0

- **Search your codebase - by name, by content, or by asking.** The Codebase
  page's left rail now has three modes. **Files** filters the tree by name (as
  before). **Content** searches file contents across the whole repo (git grep)
  with Include/Exclude globs, a Regex toggle, and case sensitivity - results
  list every file and matching line, click one to open it right at that line.
  **Ask** is natural-language search: describe what you're after ("the file
  that handles login") and the supervisor ranks the files that fit and explains
  why, with grep terms you can drill into. Content matches are secret-safe:
  secret-named files are skipped and every snippet is redacted before it leaves
  the server, so a stray key can't surface in results.

## 0.51.0

- **HeroCard reaches the run overview and the projects grid.** The run detail
  page's status block is now the canonical hero: a tonal column carries the run
  state (merge-ready green, failed red, running blue), the phase rail sits in
  the middle, and provider / elapsed / diff / review-loop read as a divided
  metric strip. The "All projects" page was rebuilt on the same system - each
  project card is a hero whose column shows current / live / dormant, and the
  page itself moved onto the shared canvas (header, KPI cards, contained intro)
  so it finally matches the rest of the dashboard. The run breadcrumb and the
  Flows catalog cards (with their step bars) were intentionally left alone.

## 0.50.0

- **Diffs: see every branch, and let the supervisor help you merge.** The
  commit graph is denser now (the rows were too spaced), and a new **Branches**
  tab lists every local branch with how far it is ahead/behind main, its own
  diff size, whether it is merged or still open, and its latest commit - so you
  can see each branch even when linear history collapses the graph to one rail.
  Click a branch to focus it and stage it for merge. The merge planner grew a
  brain: **Ask the supervisor** for read-only advice on which branch to merge
  next and whether your pick is safe, and **Guided merge** runs the prediction
  and auto-proposes a conflict resolution (applying is still always your
  explicit click). When everything is already merged, the planner says so
  instead of offering a no-op.

## 0.49.0

- **The Diffs page tells the story of your history.** The commit graph is no
  longer a column of grey hashes: every row now carries the commit subject,
  its diff size (+added -removed), author and time, and branch tips render as
  labelled ring nodes on a violet main spine - you can finally see where each
  branch worked. Click a commit and the graph lights its history, dims
  everything unrelated, and marks the exact merge commit where it landed on
  main. The inspector leads with the question that matters - on main, merged,
  or unmerged - then the files it changed with per-file +/-, the full message,
  and clickable parents and branch tips. The merge planner now knows what has
  already landed: branch pickers annotate every branch as main/merged/open,
  and picking an already-merged pair says so up front instead of suggesting a
  no-op merge.

## 0.48.0

- **One hero, everywhere.** The task overview's anatomy - a tonal status
  column that anchors the state, a headline row, a divided metric strip - is
  now a canonical primitive (HeroCard), documented on the branding canvas as
  the page hero and the board grid item. The Crew page adopts it end to end:
  crew cards lead with roster health (gaps, ambiguous, default, ready) and the
  configure page opens with a state headline instead of a name echo.

## 0.47.0

- **Five more screens on the new design: Codebase, Profiles, Metrics, Diffs,
  Crew.** The design-system rollout reaches the config and analysis surfaces.
  All five pages now compose the Mission Control canvas (PageShell header +
  sections), dense coal/chalk cards with facts as stat tiles, real buttons by
  their section titles, and empty states that offer the next action instead of
  dead-ending. Metrics keeps its single-hue violet viz with status-categorical
  charts reading theme tokens, so every chart now flips correctly in light
  mode. The Diffs page (commit DAG + inspector + merge planner) re-themes its
  SVG graph per theme; merge behavior is untouched. Eyebrow kickers and the
  legacy slab/fog styling are gone from all five.

## 0.46.0

- **Guided plan: the supervisor asks before it breaks a task down.** "Plan the
  steps" now runs a short, bounded round of clarifying questions first - the ones
  whose answers actually change the breakdown (a provider choice, a scope
  boundary) - then turns your answers into the ordered checklist. Answer what you
  can, skip the rest, or skip straight to the breakdown. If the task is already
  clear, it asks nothing and goes straight through. Choices render as one-tap
  chips; open questions get a text box. Manual authoring stays as the escape
  hatch. (Reuses the assist runner, not the heavier spec-up card-planning chain.)

## 0.45.0

- **A task leads with an overview panel.** The top of a task is now a rich,
  contained panel that owns the task's high-level controls (Start, Cancel,
  Archive) and a designed state summary: a "where does this stand / what's next"
  headline plus stat tiles for status, steps done, runs, blockers and priority.
  Starting a task is a parent-level control, so it lives here - not buried in the
  Runs list. The Runs section just lists runs now; "Queue the first run" is gone.
  The panel fills its width: a tonal status column carries the task's state as
  colour, a segmented step track shows exactly where the run is (the in-progress
  step softly fades to signal live work), and a divided metric strip lays out
  runs, blockers and priority.

## 0.44.0

- **Let the supervisor plan the steps.** A task's checklist no longer opens as a
  blank "type every step yourself" form. When there are no steps, the card leads
  with "Let the supervisor plan this" - describe the task (and any references)
  and it breaks the work into an ordered set of steps you review, reorder and
  run. Writing a step by hand is still there, demoted to an "Add manually"
  escape hatch.
- **A step is a checkbox, not a status dropdown.** Checklist steps get a real
  check (V), and you can no longer hand-set a step to "in progress" or "blocked"
  - those are driven by the run. The only manual transition is marking a step
  done (or reopening it). The step's live state shows read-only.
- **Steps read as configurable.** A step row is now clickable end-to-end with a
  clear chevron; opening it lands in a panel that says "configure this step",
  carries a Board › Task › Step breadcrumb, and keeps "Detach into its own card"
  as a distinct, separate action.
- **Runs and their pipeline are one surface.** A run's per-phase micro-step
  pipeline now renders inside its run row, instead of floating in a separate
  section on the task page.
- **References belong to the brief.** Context sources moved into a single "Brief"
  block with the task description as a compact "Grounding" row, instead of a
  standalone card.

## 0.43.0

- **Open a checklist step as a task in its own right.** A step is no longer a
  bare line of text - each one has a detail drawer you open from the checklist.
  Inside: the step's own authoring (title / objective / acceptance / file hints),
  its status, the run + outcome that executed it (for supervised tasks), and its
  own comment thread. The parent task still owns the shared scaffolding - context,
  crew, git, blockers - and the drawer shows those clearly as "inherited from the
  parent", read-only, because every step shares one container. A plain task's step
  is honest about it: no per-step run, just status, commit and comments.
- **Per-step comments.** Comments can now be scoped to a single step (they live in
  the step drawer, not the task-level thread). "Detach into its own card" stays as
  a separate, clearly-labelled action - distinct from opening the step in place.

## 0.42.1

- **Create a supervised task from the dashboard.** The Board's "New task" form now
  has a Plain / Supervised mode toggle, so you can make a supervised (Conductor-run)
  task without the CLI. Its detail view already lets you author structured steps
  (objective / acceptance / file hints) and shows the live Conductor - so the whole
  make-author-run loop is in the UI now.

## 0.42.0

- **"Saga" is gone - a task now has a run mode.** What used to be a separate
  `kind: "saga"` is just a **Task with steps**, run in one of two modes:
  **plain** (the default flow, one holistic pass) or **supervised** (the
  Conductor: per-step review, fresh context, the supervisor + invariants +
  Enhance, a per-task budget, the run lock, clean-halt). The engine is still
  "the Conductor"; the mode is "Supervised". One toggle flips the whole bundle.
- **One unified surface.** `vibe saga` is retired - the supervised verbs live
  under `vibe tasks` now: `vibe tasks run <id>` sequences a supervised task (and
  runs a plain one once), plus `vibe tasks sequence | status | pause | resume`,
  `vibe tasks add --supervised`, and `--objective/--acceptance/--files` on
  `vibe tasks checklist add`. The dashboard Board renders a supervised task as a
  container card; the API takes `runMode`.
- **Your data carries over.** A one-time migration rewrites existing
  `kind:"saga"` tasks (and a `saga:` config block) to the new shape on first
  read - nothing is dropped.

## 0.41.0

- **The Saga Conductor re-grounds its own plan (Enhance).** A Saga's steps are
  planned before the code exists, so a long Saga drifts from a plan that was a
  guess. Now, when the between-steps supervisor judges the pending plan has
  diverged from reality, it returns a third verdict - **ENHANCE** - and the
  Conductor runs a plan-only re-ground pass before the next step: it re-reads the
  current code and revises the *pending* steps (sharpen an objective, drop a step
  that's no longer needed, resequence). It never writes code and never touches
  steps already done.
- **Bounded autonomy, owner-gated structure.** The autonomous pass may refine,
  reorder, or remove pending steps - but it may **not** add a new step or remove a
  step you authored. Either is a change to the plan's scope, so the Saga escalates
  that to you (a clean halt keeping the committed work) instead of deciding it
  itself. The revised plan is held in a saga-scoped overlay written atomically, so
  it survives a halt-and-re-sequence without disturbing how a Saga resumes, and is
  folded back into the steps on clean completion. Enhance runs read-only on the
  cheap supervisor profile and is spend-accounted the same way; its events surface
  live in the dashboard Conductor panel.

## 0.40.0

- **The Saga Conductor comes to the dashboard.** Mission Control's task detail now
  shows a live **Conductor** panel for a Saga: its lifecycle and step progress with
  per-step outcomes, the supervisor's PROCEED/ESCALATE decisions, the invariants
  ledger, and an escalation banner when it halts - polled live. It reaches full
  parity with the CLI: **Sequence** to launch (or **Re-sequence** to resume a halted
  Saga from the clean tip), and **Pause** / **Resume** while a run is live.
- **Launch a Saga from the dashboard.** Queuing a `kind:"saga"` task now sequences it
  through the same audited path as `vibe saga sequence` - the scheduler runs it in
  saga mode with the saga flow, the per-Saga budget + supervisor, the run lock, and
  the clean halt-with-reset. No new launch surface, and a launch rejected because the
  Saga is already running no longer mislabels the live run as failed.
- **`GET /api/sagas/:taskId/status`** serves the conductor status (lifecycle, the live
  run, step progress, halt, invariants) - one source shared with `vibe saga status`,
  so the dashboard and CLI can't drift. The supervisor's verdicts also surface in the
  run-detail engagement lane.

## 0.39.0

- **The Saga Conductor gets judgment - a supervisor between steps.** After each
  step commits cleanly, a cheap model turn now judges whether the Saga should
  keep going or stop. It returns **PROCEED** or **ESCALATE**: an ESCALATE halts
  the Saga cleanly while *keeping* the committed work (the supervisor caught the
  feature drifting off-goal or building on something wrong - distinct from a
  broken-step halt, which resets). The turn is read-only, runs on a cheap profile,
  and is purely advisory on top of the per-step review - a failed or unparseable
  supervisor turn never halts a healthy Saga. Its cost is counted (it counts
  toward the per-Saga budget and the daily spend cap, like any other turn - not
  free). Configure it under `saga.supervisor` in `project.yml` (on by default;
  point `profile` at a cheap model, or set `enabled: false` to turn it off).
- **A non-folding invariants ledger keeps conventions from drifting.** The
  supervisor records cross-cutting decisions ("all API responses use snake_case")
  to a durable, append-only ledger that is re-injected into *every* later step's
  packet - so a convention set in step 2 still holds in step 9, where a folding
  summary would have lost it. Redacted and bounded like every other packet section.
- **Drive a running Saga from the CLI.** `vibe saga status <id>` shows the
  lifecycle, step progress, any halt, and the invariants ledger; `vibe saga
  pause <id>` / `resume <id>` toggle the active run at the next step boundary.

  The live dashboard Conductor view + controls land next.

## 0.38.0

- **Sagas run themselves now - the Conductor (execution core).** Sequence a Saga
  with `vibe saga sequence <id>`: it runs the steps in order in one worktree, each
  one planned, implemented, and reviewed before the next, with a fresh model
  context per step grounded by a curated handoff (the feature goal, prior-step
  outcomes, the accumulated diff, and a fresh read of the step's files). It is
  built to be left alone safely:
  - **Clean halt, never a green-but-broken commit.** If a step can't pass review
    after a bounded self-heal loop, the Saga discards that step's work (the branch
    stays clean and reviewable), leaves the step pending, and ends blocked with a
    reason. Re-run `vibe saga sequence` to resume from the clean tip - finished
    steps are skipped. A later step never builds on a broken earlier one.
  - **Bounded by default.** A new Saga inherits a default step ceiling
    (`maxSteps: 20`) so a runaway always halts; `maxSpendUsd` is checked between
    steps. Set project-wide defaults under `saga` in `project.yml`, and the daily
    spend cap as the mid-step backstop for unattended runs.
  - **Locked, never auto-merged.** A first per-task run lock stops two runs from
    corrupting one Saga's checklist or branch, and a finished Saga lands as one
    reviewable branch - merging stays a human decision.

  This is the execution core; the between-steps supervisor turn and the live
  dashboard Conductor view land next.

## 0.37.0

- **Saga tasks - author a feature as coordinated steps (authoring surface).** A
  task can now be a **Saga**: one card that holds an ordered set of steps, each with
  its own objective, acceptance check, and file hints. Author them from the dashboard
  (a compact container card on the board, a step editor in the task detail) or the CLI
  (`vibe saga create | add-step | edit-step | reorder | list | show`). This is the
  first slice of a larger program: the autonomous Conductor that sequences a Saga's
  steps with fresh, curated context per step lands next. Verified in dark and light
  themes.

## 0.36.2

- **Policies page rebuilt on the design system.** The first cut reused the old
  panel idiom and stacked everything into one long, noisy scroll. It is now on the
  Mission Control coal/chalk system: a contained header with at-a-glance stat tiles
  (advise / block / pending / guards), then three focused tabs - **Policies** (author
  advise + block rules; the composer hides behind one button), **Safety gates** (the
  toggles, grouped into hard guards / execution / posture, with a real switch), and
  **Engine & tools** (the read-only `.yml` engine + check-patch). Verified in dark and
  light themes.

## 0.36.1

- **Policies are now a first-class page in the sidebar.** The consolidated policy
  surface shipped in 0.36.0 was only reachable buried at the bottom of Settings;
  it now has its own **Policies** entry (sidebar "More" group) at `#/policies`,
  showing the project-policy authoring for both tiers alongside the hard security
  gates. Removed the duplicate panel from Settings.

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
  an old config fails to load with a message pointing at the command.

## 0.35.0

- **A preference can now hard-block a merge, not just advise (preference gates
  block tier).** Mark a rule as a block with a pattern - `vibe preferences add
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
  automatic capture).** When you tell the supervisor something durable in a consult - "stop
  using em-dashes", "no eyebrow labels" - it can now propose that as a preference.
  The proposal lands *pending*: it does nothing until you confirm it, so a model
  can never quietly add a rule the reviewer enforces. Confirm or reject it with
  `vibe preferences confirm|reject <supervisor> <id>`, or from the Supervisors
  page, where pending proposals show up with Confirm / Reject next to the rules
  already active. Still optional end to end - a plain run carries none of it.

## 0.33.0

- **Teach a supervisor a preference without touching YAML (preference gates
  advise tier).** `vibe preferences add <supervisor> "use a hyphen, not an em-dash"` and
  it is live on the next review - or do it from the Supervisors page, where each
  card now has a one-line add field and a remove for the rules it checks. An
  owner add is trusted on creation, so there is no confirm step to wade through.
  Adding a preference to a built-in supervisor materializes a faithful project
  copy (its review lenses and posture are preserved, not wiped). All of this
  stays optional by design: a plain `vibe run` needs zero preferences, zero
  policies, zero gates - the depth is there when you want it, never on the path
  to a simple prompt.

## 0.32.0

- **Preference gates: teach a supervisor a rule, the reviewer checks for
  it.** A supervisor can now carry `preferences` - stated rules like "use a
  hyphen, not an em-dash" or "no eyebrow labels" that are real but not worth a
  lint rule. On a review turn the reviewer is told to check the change against
  each and name the fix, and a flag rides the normal review-and-fix loop. It is
  advisory (never a separate merge gate in this slice), a preference is injected
  only after you confirm it (unconfirmed entries are inert), and the reviewer is
  handed the exact diff - not a summary - so it can actually see a line-level
  violation. The `block` tier and automatic preference capture are deferred.

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

- **Publish hardening (post-review).** Three fixes from a review of
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

- **The Flows page joined the flat slab design.** The flow catalog had
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
  occasional auto-refresh + "new model" notification is the next step.

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
  run. The merge advisor is now complete.

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
  human-confirmed, local-only, never pushed.

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
  suggested next steps - computed in code from the ledger + roadmap + run
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
  or re-derive never double-records).

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
  staged symlink that resolves outside the worktree. Reviewed
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
  nothing failed. Both were reviewed pre-merge;
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
  Reviewed pre-merge; the no-automated-caller rule is a tested
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
  miss can't leak. Reviewed pre-merge: the review caught (and
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
  call. Proportional orchestration is complete.

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
  Reviewed before merge; a gate-free "solo" variant was
  rejected outright. Part of the proportional-orchestration work.

## 0.7.37

- **Protected paths: a deterministic floor under every "do less checking"
  decision.** A built-in glob set (auth/payments/migrations, CI workflows,
  lockfiles, `.env*`, `.vibestrate/`) plus your own `policies.protectedPaths`
  (additive - user globs extend protection, never shrink it; opting out of a
  built-in requires the explicit `policies.unprotectedPaths`). First consumer:
  validation scoping - a protected file is never "inert", so a changed
  workflow `.yml` or a protected `.md` validates in full even though its
  extension looks harmless. This is part of the proportional-orchestration work
  and the prerequisite for the upcoming `express` flow + flow sizer. Visible in
  `vibe config view` and the Config page.

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
  imports - display and enforcement can't drift. First slice of the run
  experience and usability batch.

## 0.7.34

- **Unattended runs no longer hang forever at an approval gate.** A run launched
  `--unattended` that hit any approval gate used to wait on a human who was never
  coming - wedging a scheduler worker and showing as "in flight" indefinitely. It
  now bounds the wait (`policies.unattendedApprovalTimeoutMs`, default block
  promptly): the gate `expires` and the run stops honestly as `blocked`, ready to
  re-launch when you decide. Attended runs are unchanged (they wait for you, a
  human is there). This only bounds the wait - it never auto-approves, and every
  gate, `forbidAutoMerge`, and `forbidAutoPush` are untouched. First slice of
  always-on execution.

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
  proportional orchestration (the orchestrator sizing the work); the flow-sizing
  half is deferred behind a diff-aware protected-path floor.

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
  `type: claude-code` to get this.

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

- **Supervisor personas: the orchestrator gets a judgment posture.** A
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
  self-check that can only lower confidence).

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

- **Checklist DAGs: parallel agents on every checklist item.**
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
  deferred (they need a per-item arbitration ledger first).

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

  First DAG slice: read-only fan-out only. Write-parallelism and checklist-DAGs
  stay deferred and on paper.

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
  (Per-step profile auto-selection and applying the sandbox
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
  `POST /api/vibestrate/proposals/:id/apply|reject`.

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
- Second slice of the **responsible orchestrator**.

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
- First slice of the **responsible orchestrator**. Next: workflow selection and
  the run brief.

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

