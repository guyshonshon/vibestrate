# Backlog triage - June 2026 braindump, expanded

Source: 18 raw notes appended to `docs/TODO.md` on 2026-06-12, triaged here.
Each item gets: the raw ask, what it actually means, current state in the
code, a mini-plan to expand when the item is picked up, a size estimate, and
dependencies. The sequencing rationale is at the bottom; the one-line
checklist lives in [`../TODO.md`](../TODO.md) under "Triage queue".

Conventions: T-numbers are stable references. "Size" is S (a day or less),
M (a few days), L (a week-plus or needs a design doc first).

---

## Wave 0 - trust + bug fixes

These come first because later features (merge advisor, continuity, welcome)
consume the signals these bugs corrupt. All are small and independent.

### T1 - Worktree file viewer: "File not found" for new files - SHIPPED

**Status (shipped):** `resolveSafePath` gained an opt-in `preferExistingRoot`
(among containing roots, choose the one where the file exists) and
`buildProjectRoots` gained `worktreeFirst`; the run `/file` route uses both, so a
file created or modified in the worktree resolves to the worktree copy, never a
stale/absent project one. Pruned worktree now returns 410 with an honest message
(not a generic 404). The space-in-filename "bug" was a phantom - the guard's
reject class held a literal NUL byte (the design doc misread it as a space), and
spaces were always allowed; cleaned up the embedded NUL (git was treating the
file as binary). Workspace surface: dashboard run-detail panel + TUI inspector
line + `vibe path <runId>` (`--cd`, `--json`). Tests: `tests/path-guard.test.ts`
(7) + route block in `server-routes.test.ts` (worktree-first, new-file,
spaced-name, prune-410). Security note: the precedence change only re-orders
preference among ALREADY-validated containing roots; all traversal/NUL/symlink-
escape checks are unchanged and still tested. Editor (write) route deliberately
left on project-first precedence - out of scope for the read viewer.

**Raw ask:** "File not found - The resource no longer exists... happens when
we make a new file... how do I even approach this merging? how do I access
that git worktree?"

**What it means:** Two things. (1) A bug: files created inside a run
worktree 404 in the dashboard file viewer. (2) A discoverability gap: the
run UI never tells you *where* the worktree is or how to get into it.

**Root cause (confirmed 2026-06-12):** `resolveSafePath`
(`src/core/path-guard.ts:98-113`) picks, for a relative path, the *first
root that geometrically contains* `resolve(root, rel)` - which is true of
any traversal-free relative path - so the first root always wins.
`buildProjectRoots` (`path-guard.ts:157`) puts **project before worktree**,
so `/api/runs/:runId/file?path=super.md` (`src/server/routes/project.ts:378`)
always resolves to `<projectRoot>/super.md`. A file *created* in the run
worktree doesn't exist there -> `viewFile` ENOENT ->
`FileViewError(404, "File not found.")` (`src/core/file-view-service.ts:94`)
-> the generic 404 explainer (`src/core/error-format.ts:122`). Worse,
silent variant: a *modified* file resolves to the project-root copy, so the
viewer shows the **stale pre-run content** without error. Side-bug found in
the same guard: paths containing a space are rejected outright
(`path-guard.ts:74` includes `" "` in the invalid-character class).

**Mini-plan:**
1. Fix root precedence for the run-scoped route: worktree root first (or
   prefer the root where the file exists, first-containing as fallback) -
   the run file viewer must show the run's version of the file.
2. Decide whether `/api/runs/:runId/tree` + file view should fall back
   honestly when the worktree was pruned ("worktree cleaned up - see the
   diff") instead of the generic 404.
3. Fix the space-in-filename rejection (only NUL/newlines are invalid).
4. Add a "Workspace" panel to run detail (UI + TUI): worktree path, branch
   name, copy-able `cd` line. UI/CLI parity: `vibe run path <runId>`.
5. Route-level tests: new file in worktree, modified file shows worktree
   (not project) content, filename with space, read after prune.

**Size:** S-M. **Depends on:** nothing. **Unblocks:** T13 (merge window
needs the same "where is the work" surface).

### T2 - Assurance verdict semantics: nothing-to-verify is not "partially verified" - SHIPPED

**Status (shipped):** Lane statuses gained `not_applicable` (distinct from
`missing`/`not_run`); a new `notes` array carries informational items (n/a lanes
+ inert-diff review skip) separate from verdict-capping `caps`; `pickVerdict`
moved to a PASS/NA/GAP/FAIL lane model, so an all-passed-or-n/a `merge_ready` run
reads `verified` ("no checks were required") instead of `partially_verified`.
Applicability is computed run-locally in `buildAndWriteRunAssurance` (flow step
kinds + `state.readOnly` + the `validation.scoped` event + `commands.validate`).
This refines (not contradicts) the P4b express cap - see
[`policy-enforcement-assurance.md`](./policy-enforcement-assurance.md) §
Applicability for the reconciliation. A `verified` run with
`anyRealCheckPassed: false` means "nothing required", never "checked + approved".
Adversarially reviewed pre-merge (fresh-context Opus): no gate reads the verdict,
real failures can't be masked (broker log is immutable + the applicability flag
is dead on any lane with evidence), inert path is A2-floored. Two follow-ups
logged for T13: persist applicability into run state (re-derive drift); require
T13 to read lane statuses / `anyRealCheckPassed`, not the bare verdict.

**Raw ask:** "why if there's no verifications needed it does: partially
verified... validation: missing (0/0), review: skipped_inert_diff,
verification: not_run".

**What it means:** The verdict roll-up treats *not applicable* as *missing
evidence*. A run with zero configured validations (0/0), an inert diff
(review skipped by design), and no verification step gets shamed as
"partially verified" - which trains the user to ignore the verdict, which
poisons T13 (merge advisor) that must rely on it.

**Root cause (confirmed 2026-06-12):** Verdict derivation is
`src/safety/run-assurance.ts`. `validationStatus` is computed purely from
broker evidence: zero executed `command.run` actions is always classified
`missing` (`run-assurance.ts:227-229`) - there is no
"not configured / not applicable" state, and the builder receives no input
about whether validation commands exist for the project/flow. `pickVerdict`
(`run-assurance.ts:345-355`) only returns `verified` when validation,
review, *and* verification all passed - so a run with review approved +
verification passed but 0/0 validation can never do better than
`partially_verified`, and `caps` always gains `validation_missing`
(`run-assurance.ts:257`).

**Mini-plan:**
1. Thread "was validation configured/applicable?" into
   `buildRunAssurance` input and introduce a `not_applicable` lane status
   distinct from `missing` (= configured but never ran), same for
   verification steps absent from the flow and inert-diff review skips.
2. Headline verdict: all-lanes passed-or-n/a reads "verified (nothing
   skipped)" or "passed - no checks were required for this change"; reserve
   "partially verified" for *required-but-absent* evidence.
3. Keep the caps but split into blocking caps vs informational notes in the
   UI rendering.
4. Test matrix over the verdict combinations; update the assurance docs
   page.

**Size:** S-M. **Depends on:** nothing. **Unblocks:** T13.

### T3 - Inspect artifacts spam - SHIPPED

**Status (shipped):** Widened `isInternal()` in `ArtifactList.tsx` to also hide
run-level orchestration plumbing (`selection.json`, `flow.json`,
`participants.json`, `context/*`, numbered `*-prompt.md` record copies) on top of
the existing per-turn plumbing; deliverables (output/report/idea/outcomes) and
evidence (validation-results, findings, finding-responses, decision-summary,
diffs, patches) stay visible. Step groups are now collapsible (default expanded),
and the internals toggle persists per browser (default off) via
`usePersistedState`.

**Raw ask:** "are these even supposed to be a part of the Inspect
artifacts? It is quite spammy."

**Current state:** `src/ui/components/artifacts/ArtifactList.tsx` already
hides plumbing (context-packet.json, prompt.md, mcp/*.json, ...) behind an
internals toggle via `isInternal()`.

**Mini-plan:**
1. Audit a real run's artifact listing; list everything visible by default
   and classify: deliverable / evidence / plumbing.
2. Widen `isInternal()` patterns so only deliverables + evidence show by
   default; group by flow step with collapsed groups.
3. Persist the internals toggle per browser; default off.

**Size:** S. **Depends on:** nothing.

### T4 - Host-environment hooks leaking into provider turns

**Raw ask:** "What happens when your model has its own hooks, like we have
super-guy, does it interfere?"

**What it means:** Almost certainly yes, it interferes. Vibestrate runs the
provider CLI (e.g. `claude`) as a subprocess; that CLI loads the *user's*
`~/.claude` settings - including UserPromptSubmit hooks like a personal
supervisor directive - inside every Vibestrate turn. Our own note in
`src/providers/claude-code-settings.ts` ("CLAUDE.md / hooks / plugins inside
run turns are NOT supported") describes intent, not reality: we don't manage
them, but we also don't isolate them. Effects: skewed reviewer verdicts,
prompt-format pollution, wasted tokens.

**Mini-plan (investigation first):**
1. Empirically confirm: run a provider turn with a known marker hook
   installed; check whether the marker text appears in the captured output
   or alters behavior.
2. Survey isolation options per provider (Claude Code: settings flags /
   env overrides / `--settings`; Codex/Gemini equivalents).
3. Decide policy: isolate by default, or detect + warn. Either way add a
   `vibe doctor` check that flags user-level hooks likely to fire inside
   runs.
4. Document in the provider docs page what is and is not isolated.

**Size:** S investigation, M if isolation is implemented.
**Depends on:** nothing.

### T5 - Publish verification gate (npm pack smoke)

**Raw ask:** "before publishing, make sure we test npm verify etc so
telegram bot issues won't reoccur."

**What it means:** A past incident (in another project) shipped a broken
published package. The gate we have (`scripts/release.sh`: typecheck, build,
test, audit) tests the *repo*, never the *published artifact* - a bad
`files:` whitelist, missing runtime dep, or broken bin shebang would sail
through.

**Current state:** `scripts/release.sh`, `scripts/prepublish-trim.mjs`,
`.github/workflows/release.yml` (OIDC publish). `package.json` has `vibe` +
`vibestrate` bins and a `files` whitelist.

**Mini-plan:**
1. New script `scripts/verify-pack.sh`: `npm pack` -> install the tarball
   into a temp dir with a clean `node_modules` -> run `vibe --version`,
   `vibe --help`, and `vibe init --yes` in a scratch project -> assert exit
   codes and that no `ERR_MODULE_NOT_FOUND` appears.
2. Wire it into `release.sh` after the existing gate and into the release
   workflow before `npm publish`.
3. Assert the tarball file list against an expected manifest (catches
   accidental whitelist regressions).

**Size:** S. **Depends on:** nothing. Do before the next release.

---

## Wave 1 - small UX wins

### T6 - Run display names

**Raw ask:** "runs name better than just a random number."

**Current state:** IDs are not random - `makeRunId()`
(`src/core/orchestrator.ts:322`) emits `YYYYMMDD-HHMMSS-<task-slug>`, and
`shortRunId()` shortens for display. The slug is mechanical, though, and
long tasks slugify badly. The ID format is locked by regex; do not change
it.

**Mini-plan:**
1. Add optional `displayName` to RunState (default: first ~6 words of the
   task, title-cased).
2. Rename action: `vibe run rename <id> <name>` + inline rename in run
   detail (UI/CLI parity).
3. Lists/boards show displayName with the short ID as secondary text.

**Size:** S. **Depends on:** nothing.

### T7 - "Starting up" progress UI

**Raw ask:** "when starting a task, a nicer ui for 'starting up' should
show."

**Current state:** Run start does real work (worktree create, env symlinks,
context assembly, provider spawn) with no staged feedback - the user stares
at nothing.

**Mini-plan:**
1. Emit startup-stage events from the run launcher (`creating workspace` ->
   `linking environment` -> `assembling context` -> `starting <provider>`).
2. Render as a staged checklist in dashboard run detail and as a spinner +
   stage line in the TUI.
3. Failure during startup shows the failed stage with the error, not a
   blank run.

**Size:** S-M. **Depends on:** nothing.

### T8 - CLI/TUI input layer fixes

**Raw ask:** config set provider unclear; autocomplete truncates; `config
set --help` doesn't enumerate keys/values; no Alt/Cmd+Backspace word delete;
no ctrl+r history search; `vibe config` output too long/truncated.

**Current state:** Ink TUI; input in
`src/shell/ink/components/PromptInput.tsx` (has word *navigation*, not word
*delete*); completion engine in `src/shell/ink/completion.ts`; ctrl+r
appears in a test but is not wired. Config keys/values are already
introspectable - `scripts/generate-docs-metadata.ts` walks the Zod schemas.

**Mini-plan:**
1. PromptInput: Alt+Backspace / Cmd+Backspace word delete (reuse
   `prevWordOffset`), Ctrl+W, and wire ctrl+r incremental history search.
2. Schema-driven help: `vibe config set --help` and completion enumerate
   actual keys, value types, and enums straight from the Zod config schema
   (same introspection the docs generator uses) - no hand-maintained list.
3. Fix completion truncation: paginate/scroll the suggestion list instead
   of clipping.
4. TUI config browser: a `config` page listing every key with current
   value, type, and an edit affordance - kills the "each config is very
   long" problem. (Respect the standing decision: no in-TUI YAML editor;
   this edits discrete keys, not raw YAML.)
5. Investigate the "outside the vibe tui" message the user hit for
   `config set provider` - find which command emits it and either make it
   work in-shell or fix the copy. (UI/CLI parity rule: never tell the user
   to leave the surface they're on.)

**Size:** M. **Depends on:** nothing.

---

## Wave 2 - architecture spine

The two items everything later leans on. Do these before the Wave 3
features that consume them.

### T9 - Project continuity ledger (the CRUCIAL note)

**Raw ask:** "are we able to continue a session that is finished
(merge-ready)? ... I have a bunch of todo files, it loses context...
duplications and conflicting todos... hard to take a new session and be
like 'we stopped here, you've done xyz, pick up from this phase'."

**What it means:** Run-level continuity mostly exists; *project-level*
memory does not. Today: pause/resume (`src/core/pause-service.ts`),
resume-from rewind (`src/core/run-launcher.ts` forks a new run seeded from
a prior run's stage artifacts), phase snapshots, and roadmap task linking
(RunState.taskId). The gap: when a run merges, nothing writes back "what
shipped, what's still open, what was mentioned but never done" anywhere a
*new* session can read - so TODOs rot, duplicate, and contradict.

**Mini-plan:**
1. Design doc first (`design/project-ledger.md`): a structured,
   append-mostly project state file under `.vibestrate/` - shipped slices,
   open intents, decisions (including "decided against"), and
   mentions-never-acted-on, each with source run IDs and timestamps.
2. Write-back on run completion/merge: a summary-turn step appends a ledger
   entry (what shipped, residuals) - machine-written, human-editable.
3. Ingestion + dedupe: when a new TODO/intent arrives (task text, consult,
   roadmap), match against open intents; surface "this duplicates /
   contradicts X" instead of silently appending.
4. Session pickup: a `vibe status`-style brief ("here's where the project
   stands, last 3 runs, open intents") assembled deterministically from
   the ledger and injected into planning context for new runs.
5. Answer the literal question in docs: finished merge-ready runs can be
   rewound (resume-from) but not "continued"; the ledger is what carries
   context *across* runs.

**Size:** L (design doc + phased implementation).
**Depends on:** nothing. **Unblocks:** T10, T13, T15, T18.

### T10 - Deterministic consult

**Raw ask:** "consult window should be more deterministic, it may suggest
next steps and reasonable things to do on project, overviews, things we
'mentioned but never worked on'... we could even use Context systems like
Graphy."

**Current state:** Consult (`src/consult/consult.ts` +
`consult-context.ts`) is read-only Q&A; context = git log, codebase stats,
run artifacts. Suggestions are whatever the LLM volunteers - hence
non-deterministic. Graphy integration is already a scope-first backlog
line.

**Mini-plan:**
1. Split the consult answer into computed sections + narrated sections:
   "recent activity", "open intents", "mentioned but never worked on",
   "suggested next steps" are *computed in code* from the T9 ledger +
   roadmap + run history; the LLM only narrates/ranks them.
2. Same question + same project state => same sections (testable).
3. Graphy/context-graph stays a separate scope-first spike; the ledger is
   the 80% version without a new dependency.

**Size:** M. **Depends on:** T9.

### T11 - Parameterized flows

**Raw ask:** "A flow might be more than just a MD? It should be like `vibe
flow xxxx` which lets you also fill up data... a make-a-website flow that
just takes different vars."

**Current state:** Flows are YAML (`.vibestrate/flows/<id>/flow.yml`, not
MD), with steps/seats/stages (`src/flows/schemas/flow-schema.ts`). There is
no flow-level parameter schema; variability comes only from the task text.

**Mini-plan:**
1. Schema: add optional `params:` to flow.yml - name, type
   (string/enum/bool/path), required, default, description, secret flag.
2. Launch: `vibe run --flow make-website --param name=X` plus interactive
   prompting for missing required params; dashboard renders a form from
   the schema when starting a run with that flow (UI/CLI parity).
3. Injection: prompt-builder substitutes params into step prompts
   (`{{params.name}}`); params recorded in run state + context packet
   (secret params redacted from artifacts, same rules as env).
4. Docs + a builtin example flow demonstrating params.

**Size:** M-L. **Depends on:** nothing.
**Unblocks:** T19 (beyond-code flows are parameterized flows + new
artifact types).

---

## Wave 3 - features on the spine

### T12 - Crews hub + Providers page

**Raw ask:** "how can we change the crew we're viewing? we need a Hub page
for selecting crew, then have this configuration window. same goes for
Provider (there's none atm, only profile)."

**Current state:** Crew view exists (`src/ui/components/crews/`) but
switching the active/viewed crew is unclear; providers have a catalog +
detection (`src/providers/provider-catalog.ts`, `provider-detection.ts`)
and CLI setup, but no dashboard page - only profiles.

**Mini-plan:**
1. Crews hub: list all crews with role/seat summaries; select active crew
   (writes `defaultCrew`); click-through to the existing configuration
   window. Follow the flows-hub pattern
   ([`flows-hub.md`](./flows-hub.md)).
2. Providers page: catalog of known + detected providers, detection
   status, capabilities, a "test provider" action (mirrors
   `vibe provider test`), and which profiles bind to each.
3. Both pages: parity check against existing CLI commands; no new write
   paths beyond what config set already allows.

**Size:** M. **Depends on:** nothing hard; nicer after T2 (honest status
signals).

### T13 - Merge window: supervisor merge advisor

**Raw ask:** "saying we should never merge is a lie - we need a window for
merging, done by the supervisor: insights and suggestions about merging
plan (FF, merge, rebase...), force a feat branch when needed (configurable,
no hard rules), a deeper Analyze for whether merging would hurt/break/risk
functionality. Advising for a non-developer and for a developer."

**Current state:** The hard part exists:
`src/integration/integration-service.ts` does cumulative dry-run merges on
a scratch worktree with conflict detection; merges are manual and never
auto (keep that invariant - this feature is *advice + explicit action*,
not auto-merge).

**Mini-plan:**
1. Design doc first (`design/merge-advisor.md`) - this is
   security-adjacent (writes to main).
2. Merge window per merge-ready run: branch topology, divergence from
   main, dry-run conflict report (existing mergePreview), assurance
   verdict (needs T2's honest semantics), and a strategy recommendation
   (ff when linear, merge/rebase tradeoffs) computed from topology - the
   recommendation logic is deterministic code, not LLM.
3. Supervisor advisory layer: a persona-voiced explanation of the risk at
   two depths - plain-language for non-developers, full detail for
   developers (one text, progressive disclosure - matches the docs voice
   rule).
4. "Analyze deeper" action: optional consult-style read-only pass over the
   diff vs main hot paths (files touched recently by other runs, test
   coverage of touched files).
5. Configurable branch policy: project config rule like "require feature
   branch when diff touches >N files / protected paths" - supervisor
   *suggests* enforcement, user can override; no hard rules per the ask.
6. The merge itself stays the existing explicit integration action with
   credit trailers. No auto-merge, no push.

**Size:** L. **Depends on:** T2 (verdict honesty), T1 (workspace surface);
reads from T9's ledger when present.

### T14 - Docker sandbox execution backend

**Raw ask:** "The supervisor should control how each flow/agent works with
a sandbox (Docker), prepare Dockerfile, with volume shared or inside git or
whatever - flexible."

**Current state:** `src/execution/execution-backend-schema.ts` already
declares `docker` / `remote-sandbox` / `cloud-runner`; only
`local-worktree` is implemented. The orchestrator already has a
`sandbox-suggested` posture and consult can recommend `request_sandbox` -
suggestion plumbing exists, the backend doesn't.

**Mini-plan:**
1. Design doc first (`design/docker-backend.md`): image strategy (user
   Dockerfile vs base image + project mount), workspace strategy
   (bind-mount the worktree vs clone-into-container), credential and env
   handling (never bake secrets into images), provider CLI availability
   inside the container.
2. Implement the ExecutionBackend interface for docker: prepareRun (build/
   pull image, create container, mount), exec wrapper, cleanup; fall back
   loudly when Docker is absent (`vibe doctor` check).
3. Config: per-flow / per-step backend selection in flow.yml + project
   default; supervisor persona can *suggest* sandbox for risk-tagged tasks
   (wiring the existing posture to a real backend).
4. Tests with a stub backend; one gated real-Docker smoke.

**Size:** L. **Depends on:** nothing hard; pairs well after T11 so flows
can declare backend needs alongside params.

---

## Wave 4 - onboarding + docs

### T15 - `vibe welcome` guided walkthrough

**Raw ask:** "vibe welcome which lets you walk through the early configs
(providers, crew, flows [with hub introduction]), each step skippable...
and cli, tui, ui (starting up only)."

**Current state:** `vibe init` + interactive setup wizard
(`src/cli/wizards/setup-wizard.ts`) already covers scaffolding +
provider/crew setup; `vibe doctor` covers health. The gap is the *guided
tour* framing: explaining what each concept is as you configure it, and
introducing the three surfaces.

**Mini-plan:**
1. `vibe welcome`: a thin sequencer over existing setup services -
   providers -> crew -> flows (with hub intro) -> "how to start your first
   run", every step skippable, resumable (remembers progress in project
   state).
2. Each step opens with the one-paragraph concept explanation (reuse docs
   content, don't duplicate).
3. Ends by pointing at the three surfaces: CLI, TUI (`vibe`), dashboard
   (`vibe ui`).

**Size:** M. **Depends on:** T12 (hub pages must exist to introduce them);
reads T9 progress state if present.

### T16 - Dashboard first-run tour

**Raw ask:** "welcome tour on UI?"

**Mini-plan:**
1. First-visit overlay tour (4-6 stops: runs board, hubs, consult,
   approvals, settings), dismissible + re-launchable from help.
2. Persist "seen" per browser; never block interaction.
3. Keep it data-light: plain coach marks, no third-party tour lib unless
   one is already in the dep tree.

**Size:** S-M. **Depends on:** T12 (tour should point at hub pages).

### T17 - Docs rewrite

**Raw ask:** "docs fully rewritten to be updated and much better looking...
always propose the super simplified explanation, and for AI/LLM/Advanced
the full elaborated."

**Constraint:** Per the established docs-voice decision, pages flow
naturally simple -> detailed on one page; no "Simple"/"Professional"
labeled variants. The ask is satisfied by leading every page with the
plain-language explanation and deepening into the elaborated detail below.

**Mini-plan:**
1. Audit pass: list every `docs/content/` page with a staleness verdict
   (references removed behavior? missing new features?).
2. Rewrite in priority order: getting-started, concepts (flows, crews,
   providers, supervisor/assurance), workflows, CLI.
3. Every page: leads with the two-sentence plain explanation, ends with
   the full detail; frontmatter present so it renders on web.
4. Regenerate `pnpm docs:generate`; refresh README where the surface
   changed.

**Size:** L (but parallelizable per-page). **Schedule last in a feature
wave** - rewriting docs before T11/T12/T13 land means rewriting twice.

---

## Scope-first (research before commitment)

### T18 - RAG grounding for the supervisor

**Raw ask:** "RAG implementation for the supervisor to avoid
hallucination."

**Why scope-first:** "RAG" is a mechanism, not a requirement. The actual
requirement is *grounded judgments* - reviewers and consult citing real
repo facts instead of inventing them. T9 (ledger) + T10 (deterministic
context) deliver most of that without an embedding index. Spike only
after those land: measure where hallucination still occurs (review
verdicts citing nonexistent code?), then decide whether a local embedding
index over docs/design/artifacts pays for its complexity. Keep the
existing constraint: local-only, no model APIs unless explicitly
requested.

**Size:** spike S, implementation L. **Depends on:** T9, T10.

### T19 - Beyond-code runs (images, marketing campaigns, research)

**Raw ask:** "run this tool for generation of images too, and other
artifacts rather than just code... marketing campaign with pixel...
research a genre... when env is required, prompt the user (always
private)."

**Why scope-first:** This is a product-direction expansion, not a feature.
Most of the machinery generalizes already (flows are arbitrary step DAGs,
artifacts are arbitrary files, validation is configurable commands), but
the assurance model (diff gates, code review, merge) is code-shaped.

**Spike plan:**
1. Build one non-code flow with existing primitives (e.g. a research +
   campaign-brief flow producing markdown/asset artifacts, params via
   T11) and find what actually breaks.
2. From the breakage, scope the real gaps: artifact types/preview (images
   in the viewer), non-diff assurance (what does "review" mean for a
   campaign brief?), env/secret prompting at run start (private, never in
   artifacts - extend the existing redaction rules).
3. Then write the design doc for the gaps, not before.

**Size:** spike M, full L+. **Depends on:** T11 (params); benefits from
T14 (sandbox) for tool-heavy research flows.

---

## Sequencing rationale

1. **Wave 0 first because trust compounds.** The merge advisor (T13)
   renders the assurance verdict; if "partially verified" is noise (T2),
   the advisor inherits the noise. T5 gates the next publish regardless of
   everything else. T1/T3/T4 are cheap and remove daily friction.
2. **Wave 2 before Wave 3.** T9 (ledger) is the substrate for consult
   (T10), session pickup, and the merge advisor's project awareness; T11
   (params) is the substrate for beyond-code (T19). Building Wave 3
   features first means retrofitting them onto the spine later.
3. **Onboarding and docs last in the cycle** (Wave 4): a welcome tour that
   points at pages that don't exist yet, or docs describing behavior about
   to change, is double work.
4. **Scope-first items (T18, T19) are deliberately not scheduled** - each
   gets a bounded spike whose output is a design doc, after their
   dependencies land.

Suggested first three branches: (1) T2+T3 together (assurance semantics +
artifact noise - one "honest signals" slice), (2) T1 (worktree viewer bug +
workspace surface), (3) T5 (publish gate). Then open the T9 design doc.
