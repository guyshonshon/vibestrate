# Changelog

Concise, newest-first log of every change. One short line per change.
`Unreleased` accrues until the next `pnpm release`, then it's renamed to the
version. Update it in the same commit as the change it describes.

## Unreleased

- **Phase 3 — Promote item → card:** a checklist item can graduate to its own
  card. The new card keeps a `derivedFrom` back-pointer and the origin item gains
  a `promotedTaskId` forward-pointer (a relation — the item stays put, inherits
  the parent's roadmap item). Double-promote is refused; re-promote is allowed
  after the derived card is deleted (delete clears the dangling pointer).
  `vibe tasks checklist promote <task> <item>`, `POST /api/tasks/:id/checklist/
  :itemId/promote`, an ↗ button per item + a "derived from" link on the card.
- **Phase 3 — "Needs testing" advisory:** a reviewer/verifier can emit a
  non-blocking `HUMAN_REVIEW: ADVISORY` marker (+ optional `HUMAN_REVIEW_REASON`)
  when a human should eyeball something the model can't perceive (visual/UX/3D).
  The run keeps its real verdict (still reaches merge_ready); the linked card is
  flagged `needsTesting` with the reason. A human verdict routes it —
  `POST /api/tasks/:id/needs-testing/verdict {pass|fail}` (pass → done, fail →
  reopen to ready), surfaced as a banner on the task + a board-card badge.
  Distinct from `HUMAN_APPROVAL`, which blocks.
- **Phase 3 — Pick-up execution (continuous-mode loop):** a run bound to a task
  with a Checklist now executes it **item-by-item in one worktree**. The flow's
  `checklistSegment` (a contiguous step body) repeats once per item: the
  current-item brief + carried compact summaries are injected as context, the
  item's work is committed (stamped `Vibestrate-Checklist-Item: <id>`), a compact
  summary is carried forward (not full diffs), and status + commit sha are
  written back to the task. A holistic plan runs once before, review once after.
  **Continuous** (back-to-back) or **step-by-step** (pauses between items, reuses
  the pause gate). Stop-on-failure, linear. New built-in `pickup` flow;
  `vibe tasks pickup <id> [--step]`, `vibe run --checklist <continuous|step>`,
  `POST /api/runs {checklistMode}`, and a "Run checklist" button on the task. New
  git commit helpers + `src/pickup/item-summary.ts` (the forward-carry). With no
  checklist a flow runs once — the instant-task N=1 case, unchanged.
- **Phase 3 — Assist primitive + Enhance:** new `src/assist/` — a one-shot,
  read-only, structured-output run (`runAssist`: resolve crew-planner profile →
  broker-gated `provider.spawn` → parse + Zod-validate JSON, one reprompt on
  failure; audited to `runs/assist/`). First consumer **Enhance** decomposes a
  task into a checklist: `proposeChecklist` (dry-run) / `enhanceChecklist`
  (append), `vibe tasks enhance [--apply]`, `POST /api/tasks/:id/enhance`, and an
  "Enhance" button in the checklist panel (preview → Add all). Model never
  mutates the board on its own — accepting is explicit.
- **Phase 3 — Checklist drag-reorder:** task-detail checklist items now reorder
  via native drag-and-drop (grip handle), replacing the up/down buttons; new-order
  math extracted to `ui/lib/reorder.ts` and unit-tested. CLI `checklist move` stays.
- **Phase 3 — Card Checklist:** tasks now hold an ordered in-card `checklist`
  of items (`pending`/`in_progress`/`done`/`blocked`). Service CRUD + reorder,
  `vibe tasks checklist add|list|check|uncheck|status|edit|remove|move`,
  `POST/PATCH/DELETE/PUT /api/tasks/:id/checklist[/:itemId]`, and a checklist
  panel in the task detail page (UI⇄CLI parity). Foundation for enhance +
  pick-up execution.
- **Chore:** untrack `.vibestrate/issues.ndjson` (gitignored) — it's the
  runtime failure-inbox stream the app appends to on every error/scheduler
  restart, was tracked by accident; dropped stale `logo_full*.png` assets.
- **Rename cleanup (amaco → Vibestrate):** purged the last in-code `amaco`
  references — `RootKind` union member `"amaco"`→`"vibestrate"` (a dead member,
  never constructed), and stale comments (`AMACO_MCP_CONFIG`→`VIBESTRATE_MCP_CONFIG`,
  "Amaco data dirs"→"Vibestrate"). The `.gitignore` `.amaco/` entry is kept on
  purpose as a legacy-state guard. GitHub remote + npm name were already `vibestrate`.
- **Phase 2 — API contract:** versioned `/api/v1` prefix (aliased to `/api` via
  Fastify `rewriteUrl`, so the bundled UI and external callers share handlers);
  optional bearer-token auth (`VIBESTRATE_API_TOKEN`) gating every `/api/*`
  request, constant-time compared; `vibe ui --host` for non-loopback binds, which
  now refuse to start without a token (fail-closed). New `docs/architecture/http-api`.
- **Phase 2 — flow portability:** single-flow import/export. `vibe flows export
  <id>` / `vibe flows import <file-or-url>`, plus `GET /api/v1/flows/:id/export`,
  `POST /api/v1/flows/import`, and the flow-creator `POST /api/v1/flows`. All
  writes go through one guarded path (schema + secret refusal + control-char/size
  guard + SSRF guard on URLs + overwrite policy + atomic write). Dashboard Flows
  page gains Export / Import / New-flow controls (UI⇄CLI parity).
- **Safety hardening (QA pass):** fixed real issues found reviewing the safety
  pillar — (1) `globToRegex` leading `**/` now also matches repo-ROOT files, so a
  `**/*.env`-style policy no longer lets a root-level secret through; (2) the
  apply-only gateway refuses a reply with multiple ```diff blocks (was silently
  applying only the first) and ignores non-patch fenced prose; (3) Run Assurance
  no longer counts a *denied* `command.run` as a validation result (it's a policy
  violation, not a check); (4) the post-turn diff-gate rollback now reports
  success/failure and records "rollback failed" evidence so a failed rollback
  surfaces as an `unsafe` verdict. Added a strict-apply-only end-to-end test.
  (Kept `git clean -fd` — not `-fdx` — on rollback so it can't delete pre-existing
  gitignored files like node_modules/.env.)
- **Safety UI/UX:** the Policies dashboard panel gains a highlighted **Advanced —
  Safety behavior** section: editable toggles for strict apply-only (badged
  high-assurance), interactive terminal, and the forbid-* guards, with a **live
  preview** describing exactly how a run will behave under the chosen settings
  (gate path, action-policy count, hard guards). Backed by `GET/PATCH
  /api/policies/config` and `vibe policies config` (UI⇄CLI parity).
- **Strict apply-only mode (S4):** new `policies.strictApplyOnly` flag. When on,
  write-capable roles run read-only (no direct disk writes); they propose a
  unified diff (```diff block) which Vibestrate applies through the broker
  gateway — secret/forbidden-path safety → `file.patch` policy → audited
  `git apply` → recorded evidence. A refused patch blocks the run. The role
  prompt is augmented to instruct the agent to emit the diff. (`apply-gateway.ts`.)
- **Post-turn diff gate (S3):** every write-capable agent turn is now snapshotted
  before it runs (`git write-tree`) and its diff evaluated after — built-in
  secret/forbidden-path safety plus `file.patch` action policies. A deny/unsafe
  verdict restores the worktree to the pre-turn snapshot (`read-tree` +
  `checkout-index` + `clean`) and blocks the run; `require_approval` **pauses for
  a human** via the approval flow (approve → keep changes; reject → rollback +
  block). Default-allow → no behavior change. (`src/safety/diff-gate.ts`.)
- **Run Assurance artifact (S5):** every terminal run derives an evidence-backed
  verdict — `blocked` / `unsafe` / `unverified` / `partially_verified` /
  `verified` (no fake confidence %) — from the Action Broker log + the run's
  review/verification decisions, persisted to `runs/<id>/assurance.json`.
  Surfaced via `vibe assurance <runId>`, `GET /api/runs/:id/assurance`, and a
  verdict badge on the run detail page.
- **Policy Engine V2 (S2):** policy files (`.vibestrate/policies/*.yml`) can now
  carry an `actions:` list that gates the Action Broker's effect kinds —
  `provider.spawn` / `command.run` / `file.patch` / `file.write` /
  `terminal.create` / `run.complete` — with a `deny` or `require_approval`
  effect, matched by exact provider id, command regex, path glob, or run status.
  Compiled to broker evaluators and lazy-loaded into every broker via
  `createActionBroker` (construction stays sync; one path for all effects).
  Surfaced in `vibe policies list`/`doctor`, `GET /api/policies`, and the
  Policies dashboard panel. (Patch-content `rules:` unchanged.)
- **Action Broker (S0) — complete:** the remaining effect kinds now cross the
  broker — `run.complete` (orchestrator; a non-allow verdict downgrades
  merge_ready→blocked), `command.run` (validation runner), `file.write` (MCP
  config materialisation, path-only subject — never the token-bearing body), and
  `terminal.create` (terminal service, refuses 403 on deny). All fail-closed,
  default-allow; evidence in `runs/<id>/actions.ndjson`. S0 is done; S2 wires
  the evaluators.
- **Action Broker (S0) — file.patch (bundles):** bundle apply / smartApply /
  revert now also cross the broker (`kind: "file.patch"`, one decision per
  operation) with allow/deny + ok/fail evidence; fail-closed (a deny refuses the
  bundle, worktree untouched). Completes `file.patch` coverage across the
  suggestion + bundle apply surface.
- **Action Broker (S0) — file.patch:** single-suggestion patch apply/revert now
  cross the broker boundary (`kind: "file.patch"`), recording allow/deny +
  ok/fail evidence to `runs/<id>/actions.ndjson`. Fail-closed: a deny verdict
  refuses the patch and marks the suggestion failed (worktree untouched).
  New `createActionBroker` factory + `gateAction` helper centralise construction
  so S2 wires evaluators once for every effect kind.
- **Vocabulary (S1):** reserve "policy"/"enforced" for code-enforced gates and
  call prompt-injected `rules.md` guidance "instructions". New glossary entries
  (Action Broker, Instructions, Policy); the `vibe init` rules template + the
  default-rules fallback now read "Project Instructions" and state up front that
  they are advisory (not enforced) — point to `.vibestrate/policies/` for gates.
- **Action Broker (S0):** new `src/safety/action-broker.ts` — the
  Vibestrate-owned boundary every real effect crosses. `decide()` runs an
  ordered evaluator chain (deny > require_approval > allow); `record()` appends
  evidence to `runs/<id>/actions.ndjson`. The orchestrator routes every
  `provider.spawn` through it (fail-closed, default-allow → behavior unchanged);
  a denial blocks the run and emits `action.denied`/`action.approval_required`.
- **Run-time seat disambiguation:** the run path now threads `seatRoleOverrides`
  (seat → role) end to end — CLI `--seat-role <seat=roleId>`, the `/api/runs`
  spawn payload, RunSpec, the orchestrator, and the resolved snapshot/run state.
  The Mission Control allocation table turns an ambiguous seat into an inline
  role picker (was a blocking "fix crew" link). Closes the last Phase 0 gap.
- **UI: web dashboard rewired to the Crew/Profile/Seat model.** `ui/lib/{types,api}`
  now talk to `/api/crews`, `/api/profiles`, and the
  `crewId`/`profileOverride`/`stepProfileOverrides` resolve/run payload.
- UI: **Crew page** redesigned around the crew — role roster cards (seat chips,
  profile badge with provider/model/power, permissions, skills, inline prompt
  editor) plus a seat-coverage panel (covered / uncovered / ambiguous).
- UI: new **Profiles page** (+ TopBar nav) to edit a profile's provider, model,
  power (provider-specific, free text), budget, max tokens, and timeout.
- UI: **Mission Control composer** now picks a **Crew** and shows a live
  **Step → Seat → Role → Profile → Provider** allocation table with per-step
  profile overrides; uncovered/ambiguous seats block Send with a "fix crew" link
  (run-time seat→role disambiguation isn't wired into the run path yet).
- UI: **Flow Builder** uses **Seat** (not slot); the per-step role override is
  gone (flows stay shareable — the Crew decides the role at run time); dry-run
  previews the seat→role→profile→provider resolution.
- Composer presets (`.vibestrate/composer-presets.json`, server + UI) now store
  `crewId`/`profileOverride`/`stepProfileOverrides` instead of `slotProviders`/`provider`.
- **BREAKING — Core model rewrite (Phase 0 / Epic D):** `Task + Flow + Crew = Run`
  with nouns Flow / Step / Seat / Crew / Role / Profile / Provider.
- Config: add top-level `profiles`, `crews`, `defaultCrew`; remove top-level
  `roles` and `effortMap`. Roles live under `crews.<id>.roles` and run on a
  Profile (`role.profile`), not a provider. A Role lists the Seats it can take
  via `seats: [...]` (the Flow declares Seats; the Role's `seats` list fills them). Profile power/effort is
  provider-specific (free string), never a forced global enum.
- Flows: `slots` → `seats`, `step.slot` → `step.seat`; dropped `step.roleId`.
  Flows declare required Seats only and stay shareable.
- Resolver: `step.seat` → Crew role (via `fills`) → Profile → Provider; clear
  errors on missing / ambiguous seat fills. Resolved snapshot records `crewId`
  and per-step `seat`/`resolvedRoleId`/`resolvedRoleLabel`/`profileId`/`providerId`.
- Orchestrator runs each step from its resolved Profile→Provider; run records
  `crewId`/`profileOverride`/`stepProfileOverrides`. Budget cap downgrade is
  temporarily stop-only in the Profile model (TODO: switch to `fallbackProfile`).
- CLI: `--crew`, `--profile`, `--step-profile <stepId=profileId>` (replacing
  `--provider`/`--flow-slot`); flow-run wizard picks per-step Profiles.
- Server: `GET /api/crews`, `GET /api/crews/:id`, `PATCH /api/crews/:id/roles/:roleId`,
  `GET /api/profiles`, `PATCH /api/profiles/:id`; crew-scoped role context; run
  resolve payload uses `crewId`/`profileOverride`/`stepProfileOverrides`
  (replacing `/api/roles` and `slotProviders`).
- TUI: the `agents` page is now **Crew**.
- Docs: **Unified TODO** — `docs/TODO.md` is now the single source of truth for
  pending work (Phase 0 rewrite → S safety pillar → API → board → context/
  providers → integration/hub → observability → backlog → UI/UX → SEO/GEO).
  Reconciled the competing `docs/design/roadmap.md` (Epics A–E) into it; design
  docs remain as linked deep-dives. Older/superseded planning docs
  (`roadmap.md`, `CODEX_PLAN.md`, `TODO_NEW*.md`) archived to gitignored
  `docs/archive/`.
- Docs: **Roadmap debated + sequenced** — `docs/design/roadmap-and-sequencing.md`
  answers the open design questions (board/planning, sources/context, parallel
  merge, HTTP API, guides hub, cloud models, telemetry), with continuous-mode
  execution resolved; places the core model rewrite as Phase 0.
- Docs: **TODO cleanup** — archived the completed spec checklist + Shipped
  Phases to gitignored `docs/archive/`; folded `moretodos.md` / `docs/TODO-v2` /
  `docs/TODO-V3.md` in (raw notes in `docs/archive/scratch-notes.md`).

- Add: **Providers page is the complete management surface** (UI⇄CLI parity) —
  each provider now has an editor to change `command`/`args`/`input` with a YAML
  preview and a **Save & test** loop in one place, plus **Remove**. You no longer
  have to drop to `vibe provider setup` to fix a provider in the dashboard.
- Add: **`vibe provider remove <id>`** + `DELETE /api/providers/:id` — removes a
  provider from project.yml, refusing if a role still uses it (reassign first).
- Change: shared `provider-yaml` helpers (parse args / render YAML) deduped
  across the Crew Configure modal and the Providers editor.

- Fix: **codex preset no longer passes the removed `-q` flag** — current codex
  (0.13x) rejects `codex exec -q` with an "unexpected argument" usage error
  (exit 2). Preset/builders now use `codex exec` (prompt on stdin). Existing
  configs with `-q` need a one-time `vibestrate provider setup codex` (or edit args).
- Change: provider-test classifier now reads a **rejected-argument** usage error
  as a "flags" problem (→ run setup) instead of a generic non-zero exit, with a
  clearer hint.

- Add: **"Add provider" card** on Crew — a dashed card beneath the configured
  roster that drops down the not-yet-configured CLIs; picking one opens the
  setup modal inline (no detour to the Providers page).
- Change: **Crew roles reorder by drag-and-drop** (grip handle) instead of ↑/↓
  buttons — drop a role onto another to move it; persists to the flow.

- Add: edit a role's **skills** from the Crew context panel — click skill chips to
  attach/detach (reuses the existing assign/unassign API). Completes per-role
  editing on Crew: provider + context (prompt) + skills.

- Change: **Crew is a live flow editor.** Reorder roles by dragging (persists to
  the flow — a built-in auto-forks to your project copy), set each role's
  provider, and edit each role's **context (its prompt/brain)** inline via an
  expander. Pick the flow to edit from the selector. No read-only gate;
  everything is editable. (The dedicated builder remains for advanced structural
  edits.)

- Change: **flows are always editable** — editing a built-in flow transparently
  writes a project copy (`.vibestrate/flows/<id>`) that shadows it, instead of
  refusing with "fork it first". No read-only gate.
- Add: **role context API** — `GET/PUT /api/roles/:roleId/context` reads and
  writes a role's prompt (its "brain"), path-guarded; the bulk roles list still
  never exposes prompt contents.

- Add: **loop authoring in the Flow Builder** — a Loop panel to add/remove the
  adaptive review→fix loop (from/to range, decision review, max iterations) with
  inline validity hints; shipped via the `loop` patch. Flow steps' `stage` and
  `skipWhenReadOnly` now round-trip through structural edits (reorder/add/remove)
  instead of being dropped.

- Change: a flow only requires a passing verification when it actually has a
  verify (summary) step — so a minimal flow (e.g. coder + reviewer, no verifier)
  reaches `merge_ready` on an APPROVED review + passing validation. The system
  tolerates arbitrary user-built flow shapes; no extra built-in flows are shipped
  for them.
- Add: the **default flow is editable** — "Fork & edit" on the Flows page forks it
  into the project and opens the Flow Builder; a forked/edited `default` now
  shadows the builtin for plain `vibestrate run` too (the orchestrator resolves the
  project copy when present).
- Add: the flow-edit patch can author the adaptive **loop** (set/clear) and
  per-step **stage** / **skipWhenReadOnly** — groundwork for loop authoring in the
  builder.

- Docs: `docs/design/crew-flow-authoring.md` — design/decision doc for per-role
  model+effort, fully editable flows (loop authoring, default-flow fork-&-edit),
  per-flow provider bindings, and model escalation on repeated review failure.

- Change: Crew page — the flow/roles panel moves into the left column beside the
  provider detail panel (was a full-width block that crowded the page) and gains
  a **flow selector**: pick any flow and its role-steps list in order, each with
  an inline provider picker. Compact two-line rows.
- Fix: Git page header counts no longer glue to the label ("…last commit5 files")
  — the eyebrow label and count are now laid out with `justify-between`. Same fix
  for the Crew "Configured providers" header. (`SectionEyebrow` renders all
  children in one span, so passing label + count as siblings ran them together.)

- Change: **Crew page reframed as the default flow.** The generic "Roles" grid
  is now a compact **Default flow** panel — the roles are listed as the flow's
  ordered, role-bearing steps (numbered Plan → Architect → Implement → Review →
  Fix → Verify, sourced from the real flow definition), each a one-line row with
  an inline provider selector, status, permission, and skill count. The verbose
  hero is trimmed.

- Fix: a single invalid project flow (e.g. a stale fork with a schema error) no
  longer hides the entire Flows catalog. Discovery now loads all valid flows —
  builtins are always present — and reports the broken ones separately:
  `GET /api/flows` returns `{ flows, invalid }`, the Flows page shows a
  non-blocking warning, and `vibestrate flows list` lists them and exits non-zero.
  Duplicate project flow ids are reported the same way instead of throwing.
- Fix: removed a stale `.vibestrate/flows/quality-arbitration` fork that predated the
  Agent→Role rename (used `defaultAgent`/`agentId`); the built-in is used.

- Fix: the dashboard "Re-run with changes → Rewind" selector was disabled for
  every run (it gated on non-flow runs, but every run is now a flow run). It now
  offers a stage when the run's flow declares it (the default flow's
  architecting/executing) and the upstream artifacts were captured. Flow run
  steps persist their `stage` so the UI can tell. Resumed runs re-run their own
  flow.
- Docs: README "How a run works" reframed around the one-runner model — a plain
  run executes the built-in `default` flow; other flows run through the same
  engine; added the `--resume-from`/`--resume-stage` rewind example.

- Change: **one runner** (D2 phase B-3c). Plain `vibestrate run` now resolves the
  built-in `default` flow and executes it through the same flow runner as every
  other flow; the hardcoded `Orchestrator.run()` plan→build→verify sequence is
  deleted. `run()` is now a thin entry that sets up the run and calls
  `runFlowSequence`. Flow steps gain a `stage` tag; `--resume-from`/`--resume-stage`
  (planning|architecting|executing) is now native to the flow runner (seeds the
  upstream steps' outputs from the source run, marks them skipped) and works with
  `--flow`. The final report's review-loop count is real (was hardcoded 0).
- Fix: read-only runs forced a `readOnly` permission profile the templates never
  ship — force the built-in `read_only`. Added the run-phase transitions the
  unified flow runner needs (`reviewing → merge_ready`, `* → architecting`,
  `architecting → executing`).
- Fix: read-only runs no longer report a misleading `NEEDS_HUMAN` verification —
  verification is `null` (the report shows "Skipped — read-only run"). The CLI
  rejects `--resume-stage reviewing|verifying` with a clear "not supported yet"
  message.
- Docs: `docs/design/runner-unification.md` rewritten to the shipped one-runner
  design; `concepts/workflow.md` + `concepts/flow.md` reframed (no "two runners").
- Docs: add `docs/design/runner-unification.md` — full context, current flow,
  decisions, the new constructs (adaptive `loop`, `skipWhenReadOnly`), parity
  matrix, and the remaining B-3 plan for merging the two orchestrator runners.
- Add: read-only parity in the flow runner (D2 phase B-3c, part 1). Flow steps
  gain `skipWhenReadOnly`; the default flow marks implement/validation/fix/
  revalidation/verify. A read-only run skips those, traverses the review loop
  once without re-entering, and an APPROVED review reaches `merge_ready`
  (CHANGES_REQUESTED → `blocked`) — matching `run()`.
- Fix: read-only runs forced a `readOnly` permission profile that the default
  templates never ship (they ship `read_only`); force the built-in `read_only`
  so read-only runs resolve on any project (fixes `run()`'s read-only path too —
  it had no end-to-end test).
- Fix: allow the `reviewing → merge_ready` state transition — read-only runs
  skip verification, so an APPROVED review goes straight to merge_ready
  (`run()`'s read-only path relied on this too).
- Add: the default flow is now a real catalog entry (D2 phase B-3b) —
  discoverable and runnable as `--flow default` through the unified flow runner,
  which executes its review→fix loop (via B-3a). The Flows page sources the
  Default card from the real definition (drops the hardcoded step list) and
  marks loop-body steps with ↺. The *implicit* default (a run with no flow
  picked) still uses `run()` until B-3c retires the runner split.
- Add: the flow runner now executes adaptive loops (D2 phase B-3a). `runFlowSequence`
  iterates a flow's `loop`: the decisionStep (a review-turn) gates re-entry —
  after it runs, exit past `to` when the review isn't CHANGES_REQUESTED or the
  iteration budget is spent, else finish the body and jump back to `from`. A
  head-positioned gate lets an early APPROVED skip the rest of the body (e.g. the
  default flow's fix). New `flow.loop.iteration` / `flow.loop.decision` events.
  Linear flows are unchanged. (Wiring the default flow onto this runner is B-3b.)
- Docs/Test: make the npm scanner false-positive response explicit in the
  distributed package: include `SECURITY.md` in the npm tarball, add a README
  note for the Telegram gateway false positive, and test that Telegram delivery
  sends notification text only, never environment contents.

- Add: author the fixed plan→build→verify workflow as a real `default` flow
  definition (`defaultFlow`) using the adaptive loop for the review→fix→re-validate
  cycle (D2 phase B-2). Single source of truth for the workflow's shape; not yet
  in the discoverable catalog — `run()` still executes it imperatively until B-3
  retires the run()/runFlowSequence() split.
- Add: the default plan→build→verify workflow now shows as the built-in
  **Default flow** on the Flows page (a display card — it still runs via the
  standard orchestrator path, not the flow runner), and the **Crew** page
  frames the roles as "the roles of the Default flow" (D2 phase A-2). Resolves
  the roles-vs-flows duplication in the UI. Executing the default *as* a real
  flow needs the deferred adaptive-loop primitive (phase B).

- Change: **rename Guide → Flow** across code, config-paths, API, UI, CLI, and
  docs (Epic D / D2, phase A-1). Clean rename, no back-compat (pre-release):
  `src/guides`→`src/flows`, `.vibestrate/guides/`→`.vibestrate/flows/` (flow files are
  `flow.yml`), `/api/guides`→`/api/flows`, `--guide*` CLI flags→`--flow*`, the
  dashboard's Guides catalog → **Flows** (`#/flows`; the Flow Builder is
  `#/flow`). The default plan→build→verify workflow is being reframed as the
  built-in *default flow* (next: surface it in the catalog, then unify the two
  orchestrator runners). No false-positive collisions ("workflow"/"overflow"
  untouched).

- Change: **Crew page is role-first and editable.** Set each role's provider
  inline via a dropdown (new `PATCH /api/roles/:roleId`, configured providers
  only). The hero drops the "N roles, M providers" count summary and the "an
  agent is a role" framing — it just talks about roles. Only **configured**
  providers appear on Crew; non-configured/installable ones live on the
  Providers page (with an "add / manage" link).

- Docs: SECURITY.md documents a **known false positive** — scanners flag the
  Telegram notification gateway (`fetch` + `api.telegram.org` + `process.env`)
  as exfiltration; clarified the token is user-supplied (no hardcoded token),
  `process.env` is only a single user-named lookup, and the POST body is the
  user's own notification text.

- Change: **rename Agent → Role** across config, API, code, and UI, and **merge
  the Agents + Providers dashboard pages into one Crew page** (Epic D / D1·2).
  Clean rename, no back-compat (pre-release): config key `agents:` → `roles:`,
  on-disk prompt dir `.vibestrate/agents/` → `.vibestrate/roles/`, metrics `agentId` →
  `roleId`, events `agent.*` → `role.*`. The provider-fleet data that was
  mislabeled "agent" is corrected to Provider (`/api/agents/overview` →
  `/api/providers/overview`; roles list at `/api/roles`). The dashboard's
  separate Agents + Providers nav entries collapse into **Crew** (`#/crew`;
  `#/agents` still parses as a legacy alias); the Providers detail/install view
  is reached from Crew. The external "coding-agent" provider prose is left
  unchanged. Canonical terms pinned in `docs/design/vocabulary.md`.

- Add: **`curl | sh` installer** (`install.sh`, served from raw GitHub) — wraps
  the global npm/pnpm install of `vibestrate` with a Node-version check and an
  `VIBESTRATE_VERSION` pin. Surfaced as the first install option in the README Quick
  start and the install docs.
- Fix: install docs showed `pnpm add -g vibestrate` (wrong package) — corrected to
  `vibestrate`.
- Docs: README now leads with a **Quick start** (install + run) right after the
  table of contents, so installation is above the fold; "Ready in one command"
  keeps the deeper `doctor` walkthrough (install block de-duplicated).
- Docs: add **npm downloads** and **GitHub stars** badges to the README badge row.
- Change: **relicense from MIT to Apache-2.0.** Full Apache 2.0 text in
  `LICENSE`, added a `NOTICE` file, `package.json` `license` → `Apache-2.0`,
  and updated every reference (README badge + License section + the
  open-source row, SECURITY.md, MAINTAINING.md). The bundled third-party skill
  keeps its own upstream license.
- Add: **Agents/Providers clarity** (Epic D / D1, legibility pass) — the
  dashboard now makes the agent↔provider relationship explicit instead of
  conflating them. The **Agents** page leads with a **Roles** panel (planner,
  architect, executor, fixer, reviewer, verifier) showing the provider each
  role runs on (with online/offline/not-configured state), its permission
  profile, and skill count, alongside the provider list, with a one-line
  explainer ("an agent is a role; a provider is the CLI it runs on; one
  provider can power many roles"). New read-only `GET /api/agents/roles`
  (config refs only — never prompt contents). Concept docs cross-link the two.
  Vocabulary decided: keep **Provider** (not "Engine"); **Role** is an
  acceptable label for an agent. A deeper Agent→Role rename / merged page
  stays design-first.
- Add: **Run navigation + clearer blocked UX** (Epic B / B2) — a global **run
  quick-switcher** (Cmd/Ctrl-K, or `g r`) lists recent runs and filters by
  task / runId / status so you can jump straight to any run without going
  through the full "all runs" page. Terminal non-success runs now show a
  **What happened / what to do** banner that names the cause (spend cap,
  rejected approval, review BLOCKED, verification, or the raw error) and
  offers the right next actions (re-run with changes, see review, view
  events). Also fixed: a `blocked`/`aborted` run no longer shows a live pulse
  + ticking timer (it's terminal). Pure `describeRunOutcome`/`filterRuns`
  helpers, unit-tested.
- Add: **Rewind to a stage** (Epic B / B1, phase 1) — fork a fresh run that
  resumes at **architecting** (reuse the plan) or **executing** (reuse plan +
  architecture) instead of re-running from scratch, so upstream context isn't
  re-paid for. The orchestrator seeds the upstream artifacts from the source
  run, skips the earlier stages, and runs a fresh worktree off main (correct
  because both stages regenerate the downstream code). The original run is
  untouched (new runId, `state.resumedFrom` lineage, `run.rewound` event).
  Surfaced in the run "Re-run with changes" dialog as a **Start from** selector
  (gated by which artifacts the source captured) and on the CLI via
  `vibestrate run --resume-from <runId> [--resume-stage architecting|executing]`.
  Resuming at review/verify (needs the executor's code present) is deferred to
  phase 2 (per-phase worktree snapshots). Tested (e2e resume + artifact
  validation).
- Docs: README repositioned around the **local-first coding-agent supervisor**
  category (per the marketing direction) — added a "Ready in one command"
  section that sells the out-of-the-box story (detect agents + project,
  `doctor --fix` auto-wires everything, no keys/config) with a `doctor`
  checks/fixes table, and a "Full coverage, full control" section (live
  output, artifact record, token/cost ledger + spend cap, validation referee,
  gates). Headline now pairs the vibe-coding hook with the supervisor category.
- Add: **Re-run with changes** (Epic B / B1) — a terminal run now has a
  "Re-run with changes" action in the run header that re-submits the task with
  adjusted settings (toggle read-only so the executor can write, change
  effort/provider; preserves the guide). Directly addresses "the run was
  read-only — give the executor write and run it again." Re-runs from scratch;
  true rewind-to-a-phase (reuse artifacts) is a separate, larger change.
- Add: **daily spend cap** (A5) — a `budget` config block (`spendCapDailyUsd`,
  `capAction`, `warnThresholdPct`, `fallbackProvider`) enforced before each
  agent turn: warn at the threshold, then at the cap apply the action —
  **stop** (block the run), **downgrade-model** (switch to the cheaper
  fallback / effortMap.low), or **reduce-effort** (drop a notch). Configure via
  CLI (`vibestrate budget set/show/off`) or the Metrics page (`/api/budget`). Builds
  on the A3 cost ledger. Tested (service + a stop-action e2e).
- Add: **metrics dashboard** (A4) — total-tokens KPI (+Δ vs prior window),
  median run duration beside the average, a per-model table
  (model/calls/tokens/cost), and a tokens-by-role bar. `/api/metrics/overview`
  gains `perModel`, `tokensByRole`, and `totals.{tokens,tokensDelta,
  medianDurationSeconds}` (additive, backward-compatible).
- Add: **token/cost ledger** (structured-output A3) — a local static pricing
  table (USD/1M by model, prefix-matched, no network). Cost precedence:
  CLI-reported → `tokens × list price` (labelled estimate) → null (never
  fabricated). Tokens are real where the provider reports them, estimated from
  text otherwise, so every provider shows token counts; per-step + run-level
  metrics carry `est.` labels. Added `costEstimated`/`tokensEstimated` flags.
- Change: **Claude streams by default.** The claude preset is now the
  first-class `claude-code` provider in stream-json mode (live output + real
  token/cost), unifying the two preset builders so `init` / `doctor --fix` /
  the dashboard all write the same config. Existing `type: cli` claude configs
  keep working unchanged. Roadmap A1+A2 marked done.
- Add: **Claude `stream-json` output adapter** (structured-output phase 2) —
  when a claude provider is configured `type: claude-code` with
  `settings.outputFormat: stream-json`, vibestrate streams live token-by-token text
  to the run panel and reads real token/cost/model metrics from the event
  stream. The response text is extracted losslessly from the terminal `result`
  event (control parsers unaffected); a malformed stream **fails the turn loud**
  (no silent fallback). `buildClaudeCodeArgs` adds the required `--verbose`.
  Validated against real claude 2.x output. Opt-in for now — making it the
  claude default needs unifying the two preset builders (follow-up).
- Docs: document the run view (live execution + the headless-buffering caveat,
  Steps inspector, changed files, live metrics) in `cli/dashboard`; regenerated
  the source-aware reference (`docs/generated/providers.json`).
- Add: provider **output-adapter layer** (structured-output epic, phase 1) —
  `NormalizedTurn { responseText, metrics }` + `ProviderOutputAdapter` +
  `textOutputAdapter`. The orchestrator now reads the adapter-normalized
  response text (control parsers) and metrics instead of hardcoding
  claude-specific fields. All providers use the `text` adapter for now → zero
  behavior change; sets the seam for the Claude stream-json adapter. Parity +
  fail-loud tests included.
- Add: prioritized `docs/design/roadmap.md` consolidating the scratch TODOs
  (token/cost ledger folded into the structured-output epic; rework-from-phase,
  guide complexity, naming unification, run nav, Windows as later epics).
- Chore: stop tracking notification runtime state (`.vibestrate/notifications/
  notifications.json`, `receipts.json`) — it churns on every run.
- Add: design doc for **provider structured output** (`docs/design/provider-
  structured-output.md`) — a per-provider output-adapter architecture for live
  streaming + real token/cost metrics that keeps supervision uniform (control
  always reads a normalized response text; lossless + fail-loud, no silent
  fallbacks; approvals stay between-turn).
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
- Change: decouple UI ⇄ CLI — the dashboard no longer spawns the `vibestrate`
  binary to start/retry runs. New shared core run launcher
  (`core/run-launcher.ts`, `runFromSpec`) + a detached core entry
  (`core/run-entry.js`, second build output) the server spawns with a JSON
  spec. Both CLI and dashboard now reach a run only through core; runs stay
  detached (survive closing the dashboard). Tests + tsup multi-entry.
- Change: README hero — centered Vibestrate logo + ASCII wordmark as a transparent
  image (no code-block background); dropped the redundant plain-text title and
  the footer "made for the love of building" line. Logo added to
  `.github/assets/` for use as the GitHub social preview.
- Add: codebase annotations — pin notes to a file / line / range from the
  Codebase page; "visible to agents" (default on, optional) injects open notes
  into every agent prompt as a `# Human Annotations` section so the crew
  acknowledges them. Stored in `.vibestrate/annotations.json` (never in source);
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
  (git-backed index → Cloudflare `vibestrate-hub` service) with API, rules, metrics.
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
  set-default / safe-test + "log in outside Vibestrate" prompts; TopBar nav entry
  and CLI-hints. Browser never spawns commands.
- Change: providers server route uses the generic preset registry (all 11
  providers) and exposes each provider's `loginCommand`; the test endpoint
  forwards `needsLogin`.
- Add: roadmap issues — Docker backend (#1), multi-container fan-out (#2),
  Guides Hub (#3), Providers UI in Mission Control (#4).
- Add: `CHANGELOG.md` + a rule to update it on every change.

## 0.1.1

- Fix: global/symlinked `vibestrate` bin was inert — entrypoint check now compares
  realpaths; added `tests/cli-bin-entrypoint.test.ts` regression guard.

## 0.1.0

- Add: first npm release as `vibestrate` (binary stays `vibestrate`).
- Add: out-of-the-box presets for all 11 providers + "log in outside Vibestrate"
  prompts; `doctor --fix` auto-applies any detected provider.
- Add: Gemini, Qwen Code, Crush, Goose, Cursor, Amp providers.
- Add: documentation system — handwritten content + source-aware generated
  reference (`pnpm docs:generate`), rendered at vibestrate.shonshon.com/docs.
- Change: CLI version single-sourced from `package.json`.
- Add: CI + tag-release GitHub workflows (OIDC trusted publishing); lean
  publish tarball (sourcemaps stripped); pinned `ws` (security advisory).
- Add: README rewrite (ASCII banner, real badges), CONTRIBUTING, SECURITY,
  MAINTAINING, issue/PR templates.
