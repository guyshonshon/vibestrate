# Run experience + usability batch (June 2026)

Implementation plan for the seven raw TODOs captured at the bottom of
[`docs/TODO.md`](../TODO.md) on 2026-06-11. This doc turns each note into a
scoped, sequenced slice with concrete architecture, file-level changes, and
acceptance criteria. Status of each slice is tracked in TODO.md; the why/how
lives here.

**Adversarially reviewed (2026-06-11):** an independent reviewer attacked the
draft; findings folded in below. The three load-bearing changes: P4 ships a
diff-floored `express` flow (a gate-free `solo` was rejected - routing to it
from task text re-introduces the exact fallacy proportional-orchestration
forbids); P7b's safety rests on broker `require_approval` + tested invariants
(a request-body confirm string is not a gate); and stream/prompt redaction is
a *required deliverable* of P2 (streams and prompt artifacts are unredacted
today - P2/P5 would amplify their readability).

Related designs this batch extends (does not fork):

- [`proportional-orchestration.md`](./proportional-orchestration.md) - P4 ships
  its A2 slice + the `express` flow (its A3) + the A1 sizer.
- [`flows-hub.md`](./flows-hub.md) + the `feat/shell-flow-hub-and-seating`
  branch resume-state in TODO.md - P3 unblocks and finishes that work.
- [`run-audit-graph.md`](./run-audit-graph.md) /
  [`rewind-phase-2.md`](./rewind-phase-2.md) - P1/P5 build on their data.

Out of scope by the user's own marking: the paid local version and the
website-builder flows ("LEAVE OUT FOR NOW").

---

## Verified current state (what the plan builds on)

Facts checked against the codebase on 2026-06-11, because several notes assume
gaps that do not exist:

1. **Live streaming already exists end to end.** Every turn's stdout/stderr is
   appended incrementally to `runs/<id>/streams/<promptName>.ndjson`
   (`src/core/provider-stream-store.ts`, best-effort writes), tail-streamed
   over SSE (`GET /api/runs/:id/streams/:name/stream`, `src/server/sse.ts`),
   and rendered by `src/ui/components/runs/LiveOutputPanel.tsx` (SSE with
   polling fallback). The gap is *rendering*: for `claude -p
   --output-format stream-json` the chunks are JSON event lines, so the panel
   shows machine output, not the model's text/thinking/tool calls.
2. **Review findings are already persisted and servable.** Review output lands
   at `runs/<id>/artifacts/flows/review/output.md`; the artifacts route
   (`GET /api/runs/:id/artifacts/*`, `src/server/routes/artifacts.ts`) serves
   any artifact at any time, including mid-run. `finalDecision` is in
   `state.json`; validation results in
   `artifacts/flows/validation/validation-results.json`. No UI reads the
   review artifact today.
3. **Resume-at-stage exists.** Rewind phase 1 covers
   `scratch|architecting|executing`; phase 2 adds snapshot-gated
   `reviewing|fixing|verifying`. The web `RerunDialog`
   (`src/ui/app/routes/RunDetailPage.tsx`) calls `api.spawnRun` with
   `resumeFrom`. The blocked-run banner maps actions but the review/rerun
   handlers are not wired to anything useful.
   *(Build-time check for P1: confirm the exact `fromStage` enum
   `resolveResumeFrom` accepts and pre-seed with a valid member - a wrong
   stage name is a different failure than a missing snapshot.)*
4. **The hub branch is built and stranded.** `feat/shell-flow-hub-and-seating`
   (142e9f5, 9ca0226, 604dc2e - 3 commits ahead of main, green at 1225 tests)
   replaces the static-index hub with the real API client
   (`src/flows/hub/hub-client.ts`: `searchHubFlows` / `pullHubFlow`
   sha256-verified / `installFlowFromHub`), migrates CLI + server routes, and
   ships a full shell-TUI hub browser. It was blocked on
   `vibestrate.com/api/hub` going live; the endpoints are now alive. The web
   dashboard has no hub browser on either branch, and `src/ui/lib/api.ts`
   still types the old static-index schema.
5. **Proportional orchestration shipped only B3** (change-scoped validation,
   `src/core/validation-scope.ts`, inert-allowlist + fail-safe). A1 (sizer),
   A2 (protected-path matcher), and any express/minimal flow are design-only.
   The built-in flow inventory has no flow lighter than `pickup`; `default` is
   6 model turns. This is why "make a test.txt" took ~20 minutes (run
   `20260609-071618`).
6. **`vibe integrate` CLI exists** (`src/cli/commands/integrate.ts`) alongside
   the API + dashboard Integration panel - parity holds. What does not exist:
   any path from a clean integration branch to main (by design: no auto-merge,
   `requireHumanMerge`), and any git-init help in `vibe init` (a non-git dir
   gets a refusal + hint, exit 1).

---

## P1 - Blocked-run UX: see the review, re-run with fixes

**Note being addressed:** "when blocked by review, can not click 'see review'
or re-run with changes."

**Shape:** pure UI over existing data. No new persistence, no new write paths,
no server changes.

### Design

- New `src/ui/components/runs/ReviewFindingsPanel.tsx`:
  - Fetches `flows/review/output.md` via the existing `api.readArtifact`.
  - Parses the trailing `VIBESTRATE_FLOW_OUTPUT` JSON block (same contract the
    orchestrator parses, `flow-output-contracts.ts`) for
    decision + structured findings; on parse failure falls back to rendering
    the raw markdown. Never throws on a malformed artifact - degrade, do not
    blank the page.
  - For fix-loop runs, prefers the latest loop's review artifact
    (`flows/loops/loop-N/review/output.md` when present) and labels which
    iteration it is showing.
- Wire the existing action map in `RunDetailPage.tsx` (`RunOutcomeBanner`,
  ~line 499) and `AssuranceBadge` (inline, ~line 819):
  - `review: changes_requested` (or `blocked`) -> **View review** opens
    `ReviewFindingsPanel`; **Re-run with fixes** opens the existing
    `RerunDialog` pre-seeded with
    `resumeFrom: { sourceRunId: runId, fromStage: "executing" }` so the user
    lands one click from a fix run. If the phase snapshot needed for a
    downstream stage is missing, the dialog says so instead of failing on
    submit (surface `resolveResumeFrom`'s refusal reason).
  - `validation: failed` -> **View validation** scrolls/focuses the existing
    `ValidationSummary`.
- Shell-TUI parity: the run detail view gains a review expander reading the
  same artifact through the same parse helper. The parse helper lives in a
  dependency-free shared module (`src/flows/runtime/review-findings.ts`,
  pure + tested) so web, shell, and `vibe runs show` share one parser - same
  pattern as `flow-graph-layout.ts`.

### Acceptance criteria

- On a run blocked with `review: changes_requested`, the assurance panel
  offers View review (renders decision + findings) and Re-run with fixes
  (opens RerunDialog correctly pre-seeded; spawning it produces a run that
  resumes at executing with the snapshot restored).
- A malformed/missing review artifact renders an honest "no structured
  findings; raw output below / not found" state.
- `pnpm typecheck && pnpm test && pnpm build` green; browser click-through on
  a real blocked run reported honestly.

**Branch:** `feat/blocked-run-review-ux` - size S. No dependencies.

---## P2 - Live transcript: render what the model is actually saying

**Note being addressed:** "True CLI is still not showing on UI, I can not see
the actual output and thinking of the model."

**Diagnosis (to confirm first):** capture + SSE transport already work; the
panel shows raw stream-json lines. Step 0 of the branch is a 10-minute repro
on a live claude run. If the repro shows something else (e.g. chunks not
arriving at all), stop and re-diagnose before building the parser.

### Design - parse client-side over the existing chunk stream

Options considered:

| Option | Verdict |
| --- | --- |
| Incremental client-side parser over the existing SSE chunk stream | **Chosen** - zero server change; raw stream stays available; shell TUI reuses the same pure module |
| Server-side parsed-event SSE endpoint + persisted transcript | Second persistence format, more routes, and the shell would still need its own renderer; build only if client-side proves too heavy |

- New pure module `src/providers/adapters/stream-transcript.ts`:
  - `createTranscriptReducer(format: "stream-json" | "raw")` with
    `feed(line: string): TranscriptEvent[]` - incremental, tolerant of
    partial/garbage lines (skip, never throw).
  - `TranscriptEvent` kinds: `thinking`, `text`, `tool_use` (name + compact
    target, e.g. file path), `tool_result` (ok/error only), `subagent`
    (description), `usage` (running token counts when the stream carries
    them).
  - Factors only the *pure per-event mapping* out of `turn-internals.ts` and
    `claude-stream-json.ts` - `createLiveFilter`'s stateful line buffering and
    `extractTurnInternals`' batch parsing stay as thin adapters over the
    shared mapping (incremental vs batch is a real impedance; don't force one
    shape). No behavior change to audit output (snapshot test), plus a
    fuzz/partial-line tolerance test for the new incremental reducer.
  - Dependency-free (no React/Ink imports) so web + shell TUI + CLI share it.
- `LiveOutputPanel` gains a **Transcript** default view: thinking collapsed by
  default behind a toggle, tool calls as one-line chips, assistant text as
  prose; auto-follows the newest stream as today. The current raw view stays
  as a second tab (debugging + non-claude providers). Providers whose stdout
  is not stream-json degrade honestly to the raw view (detect by first
  parseable line, not provider id - a user's custom CLI may also emit
  stream-json).
- Shell-TUI parity: the run page's output pane renders the same transcript
  events in Ink (compact: chips + text), sharing the reducer.

### Security note - redaction is a required deliverable, not a check

Reviewer-verified: **neither streams nor prompt artifacts are redacted
today** - `provider-stream-store.ts` appends raw chunks, and the orchestrator
writes role prompts to artifacts verbatim; only context-source
materialization redacts. The raw stream was already exposed in the UI, so the
transcript adds no new *path* - but parsed prose makes any leaked secret far
more *readable* than raw JSON noise. Amplifying readability without fixing
the seam is not acceptable.

Therefore P2 ships, as part of the same branch:

- A secret-redaction pass at the stream capture seam
  (`appendStreamLine` in `provider-stream-store.ts`), reusing the existing
  high-precision token-shape redactor, so raw view, transcript, and the SSE
  route all benefit.
- The same pass at the prompt/response artifact write seam (P5 depends on
  this - it surfaces prompts as a first-class viewed object).
- A test planting a token-shaped secret in provider output and asserting it
  renders redacted in stream storage.

### Acceptance criteria

- A live claude run shows readable assistant text + tool-call chips within the
  panel while the turn is still executing; thinking is visible behind the
  toggle.
- Raw tab still shows the unparsed stream; non-stream-json output falls back
  to raw automatically.
- `turn-internals` audit output is byte-identical before/after the refactor
  (snapshot test); the incremental reducer survives partial/garbage lines.
- A planted token-shaped secret in provider output is redacted in stream
  storage (and therefore in both views).
- Standard validation suite green.

**Branch:** `feat/live-transcript` - size M. No dependencies; prerequisite for
P5 (both the reducer and the redaction seam).

---

## P3 - Flows Hub: merge the stranded branch, ship the web hub browser

**Note being addressed:** "Flows ui to match the HUB with references to the
hub to download and access it + fetcher from hub + implement the hub as the
endpoints are now alive."

Sequenced as three steps; the first two are this batch.

### Step 1 - unblock + merge `feat/shell-flow-hub-and-seating` (size S-M)

- Rebase onto current main. Main has moved ~30 patch versions since the branch
  was cut; expect conflicts concentrated in `src/server/routes/flows.ts`,
  `src/cli/commands/flows/hub.ts`, and the shell `FlowsPage.tsx`.
- Integration-test against the live hub: `searchHubFlows` (q/tag/author
  paging), `pullHubFlow` (sha256 verification against real payloads, and the
  mismatch path), `installFlowFromHub` end to end into a scratch project.
  Keep the existing fake-fetch unit suite; add a small opt-in live smoke
  (env-gated, e.g. `VIBESTRATE_HUB_LIVE=1`) so CI never depends on the
  network.
- If the live contract drifted from the documented one the branch was built
  against, fix the client to the live contract (the server is the source of
  truth now) and note the drift in the report. Pin the expected contract
  shape (schema-validate responses, refuse on incompatible drift) so a server
  change cannot silently alter install behavior.
- Honesty about what the checks mean: the sha256 comes from the *same*
  response as the content, so verifying it catches transport corruption
  only - it is not integrity against a compromised hub. Do not present it as
  such anywhere. Real integrity (publisher signing) is out of scope; the
  honest posture is labeling, below.
- Merge with the curated changelog entry + version bump the TODO resume-note
  already specifies. This retires the old static-index client
  (`flow-hub.ts`) from main.

### Step 2 - web dashboard hub browser (size M, branch `feat/web-hub-browser`)

- Update `src/ui/lib/api.ts` to the real schema: `listHubFlows` returns
  `HubFlowSummary[]` (`ref`, `verified`, `diagnosis`, `tags`, `author`,
  `label`, `description`); `installHubFlow` takes `{ ref, overwrite? }`. The
  current web types still describe the deleted static index - this is a real
  contract mismatch and must land with (not after) step 1's merge if the web
  build references the old route shapes.
- `FlowsPage.tsx` gains a Hub section (collapsible panel or tab beside the
  catalog): search input (debounced -> `GET /api/flows/hub?q=`), result cards
  showing tags / author / diagnosis, an Install button per card (confirm +
  overwrite prompt when the flow id already exists locally), and a refresh of
  the local flows list after install. Interaction model mirrors the shell-TUI
  hub browser that already exists on the branch - do not invent a new one.
- **Badge wording:** the hub's `verified` field renders as "hub-curated" (or
  similar), never the bare word "verified" - it is the hub's curation claim,
  not an integrity guarantee. The install confirm states plainly that a hub
  flow is executable configuration: it will drive agents and propose
  commands in this project. Audit the shell-TUI badge wording on the branch
  to the same standard during the rebase.
- Errors surface the hub client's `HubResult.reason` verbatim (offline, 4xx,
  sha mismatch) - no silent empty states.
- Parity check: after this step, hub browse/install exists on web + shell +
  CLI.

### Step 3 - publish (own branch, later, unchanged from TODO.md)

`POST /api/hub/publish`, Bearer token via env-ref only, explicit confirm, no
auto-publish. Outward-facing + secret-bearing, so it stays isolated on its own
branch and gets a Tier-2 adversarial review before merge. Not part of this
batch's sequencing.

### Acceptance criteria (steps 1+2)

- `vibe flows hub list/install`, shell hub view, and the web hub section all
  operate against the live hub; sha256 mismatch refuses install with a clear
  error (labeled as a transport-integrity check, nothing more).
- No surface presents a hub flow as "verified"; install always discloses
  executable-configuration nature.
- Old static-index client gone; no route or UI type still references it.
- Standard validation suite green on the rebased branch before merge.

---

## P4 - Proportional sizing + a `solo` flow (the test.txt fix)

**Note being addressed:** "how come a 'make a simple test.txt' becomes a super
long task... perhaps even 'run as a single model'... but this needs more
thinking."

This extends [`proportional-orchestration.md`](./proportional-orchestration.md)
- its non-negotiables are load-bearing here and unchanged:

1. Front-only judgment: a sizer may skip planner/architect, never back gates.
2. Back descent is diff-derived only (B3 shipped; A2 below), never task-text.
3. Fail safe toward more checking.
4. No silent skip - every downsize is logged with a reason.

**Rejected by the adversarial review: a gate-free `solo` flow.** "Run as a
single model," taken literally, is a flow with *no* back gates - and any
auto-routing to it (even a "deterministic" classifier) decides from task
text, before a diff exists. Choosing a zero-back-gate flow from task text is
operationally identical to skipping the back gates on task text - the exact
fallacy non-negotiable #2 exists to prevent (the risk lives in the diff; a
real auth change ships through the lightest pipeline because the user didn't
type a keyword). The reviewer also caught that the B3 inert allowlist
includes `.svg` - active content (scripts/handlers), fine as a *validation
cost* heuristic, unsafe as a *review skip* trigger.

So the minimal flow is `express` (the parent doc's A3): one implementer turn
whose review descent is decided by the **actual diff after the turn**, not by
anyone's reading of the task.

### Slice 4a - A2 protected-path matcher (size S, branch `feat/protected-paths`)

The deterministic floor everything else stands on - ships first.

- New pure module `src/orchestrator/protected-paths.ts`:
  `isProtectedDiff(changedPaths, config) -> { protected: boolean, matches }`.
- Built-in glob set (auth/security/payment-ish paths, migrations, CI
  workflows, lockfiles, `.vibestrate/**`) + user-extensible
  `config.policies.protectedPaths` (additive; user globs can add, never
  remove built-ins - removing protection requires an explicit
  `unprotectedPaths` opt-out so the default stays fail-safe).
- Consumed by B3's validation-scoping immediately (a protected path is never
  inert) and by `express` next slice. Surfaced: `vibe config view` + Config
  page row.

### Slice 4b - built-in `express` flow (size M, branch `feat/express-flow`)

- Shape: one write-capable implementer agent-turn -> validation step (B3
  change-scoping applies) -> **diff-floored review descent**: after the turn,
  examine the real diff; if every changed path is inert (strict prose set -
  see below) *and* unprotected (A2), the review step is skipped on recorded
  diff evidence; otherwise a reviewer turn runs (and the normal
  fix-loop applies). `complexity: "low"`.
- The conditional descent is a deterministic evaluator at the flow-runtime
  seam (a load-validated `skipWhen: inert_diff` on the review step, or
  equivalent) - never a model judgment. Emits a `flow.step.skipped` event
  with the evidence (changed paths, matched class).
- **Strict inert set for skip decisions:** `.md` / `.txt` / `.rst` only - a
  strict subset of B3's allowlist. `.svg` and friends stay inert for
  validation *cost* (B3's job) but never justify skipping *review*.
- Honesty + merge-readiness (tested invariants, not prose):
  - Review skipped on diff evidence -> assurance records
    `review: skipped_inert_diff`, verdict caps at `partially_verified`
    (never `verified`), and merge-readiness is only reachable through this
    recorded-evidence path - a test asserts an express run whose diff is
    non-inert and somehow unreviewed can never be `merge_ready`, never shows
    the green Ready pill, never appears in `listMergeReady` /
    `vibe integrate list`.
  - Note: `merge_ready` is computed independently of the assurance verdict
    today (review APPROVED + validation passed); the express skip path
    extends that computation explicitly (skip-evidence counts only when
    recorded by the deterministic evaluator) rather than faking an APPROVED.
- Human-selectable everywhere flows already are: `vibe run --flow express`,
  composer picker, `defaultFlow`. Diff-gate, policies, broker, budget
  ceilings all apply unchanged (same `runRole` path).

### Slice 4c - A1 sizer: smarter flow attaching (size M, branch `feat/flow-sizer`)

Task-text may choose **front leanness only**; the back is protected by
`express`'s own diff floor, never by the sizer.

- Runs on the non-`--select` path before the default-flow fallback in
  `chooseRunFlow` (`src/orchestrator/select-workflow.ts`):
  1. **Deterministic tier (no model call):** a conservative obvious-trivial
     classifier (e.g. task references exactly one file in the strict prose
     set, no risk tags). Hit -> route to `express` (whose back gates remain
     diff-decided regardless of what the classifier believed).
  2. **Gray-zone tier (one cheap model call, opt-in):** the existing assist
     primitive with a tight schema (`size: trivial|standard`, `reasons`), on
     the crew's cheapest profile. `trivial` -> `express`; anything else, a
     parse failure, or a timeout -> default flow (fail toward more
     checking).
  3. Everything else: unchanged default-flow path.
- The sizer can never route to a flow lacking diff-floored back gates
  (enforce structurally: the sizer's target set is `["express"]`, not
  user-extensible in this slice).
- Interaction with personas: the staff-engineer/security upgrade bias fires
  *after* sizing - an upgrade always beats a downsize (test: a risk-tagged
  task never lands on `express` via the sizer).
- Auditability: `flow.sized` event (tier, reasons, chosen flow) + the
  always-shown `Flow: <name> · <source>` line gains source `sized`. The
  engagement lane classifies it as judgment (gray-zone) vs structural
  (deterministic tier).
- Config: `orchestrator.sizing: off | deterministic | assisted`
  (default `deterministic`; `assisted` enables the gray-zone call). Settable
  via config + Config page (parity).

### Acceptance criteria

- "make a simple test.txt file" on `sizing: deterministic` runs `express`:
  one model turn, validation skipped as inert (B3), review skipped on
  recorded inert-diff evidence, wall-clock dominated by the single turn;
  assurance `partially_verified` with the skip recorded.
- An express run whose *diff* touches `src/auth/login.ts` (whatever the task
  text said) gets a real review turn - and if review never ran on a
  non-inert diff, the run can never be merge-ready/green (tested invariant).
- Every sized run carries the `flow.sized` event + flow line; `sizing: off`
  reproduces today's behavior byte-for-byte.

---

## P5 - Control Center for a running task

**Note being addressed:** "When a task is initiated or selected, we should see
... current seated role that is working ... the flow selected, crew selected
... live what it is writing ... the kind of prompt it gets ... the files it
changes, its git branch."

**Shape decision:** evolve `RunDetailPage` into the Control Center for live
runs rather than adding a parallel page. The data spine (SSE event stream,
audit tree, engagement lane, RunGraph, LiveOutputPanel) already lives there;
a second page would drift. "Control Center" = the live-state layout of the
run-detail route; terminal runs keep the current audit-centric layout.

### Data sources (almost everything exists)

| Card | Source | Status |
| --- | --- | --- |
| Flow + Crew + persona header | resolved `flow.json` snapshot, `persona.selected` event, crew from resolve snapshot | exists |
| Seat board: per-seat role/profile/model, state waiting/working/done/failed, token rollup | flow snapshot + `role.started/completed/failed` + `flow.step.*` events + metrics | derive (new pure module) |
| Live transcript of the active turn | P2 transcript over the existing SSE chunk stream | P2 |
| Prompt the active role received | `artifacts/<N>_<roleId>-prompt.md` - written *before* the provider call; artifacts route serves mid-run | exists - fetch on `role.started`; **requires P2's redaction-at-write seam first** (prompt artifacts are unredacted today; path-guarding stops traversal, not secret content) |
| Response of each finished turn | `<N>_<roleId>-response.md` artifact | exists |
| Files changed + branch | `GET /api/runs/:id/files/changed` (poll) + `state.json` worktree/branch | exists |
| In-flight turn metrics | only complete on turn end today | v1: show "counting..." honestly; P2's `usage` transcript events can fill it where the stream carries usage |

### Implementation

- New pure `src/core/run-seat-board.ts`: `deriveSeatBoard(events, flowSnapshot,
  metrics)` -> ordered seat cards with states - same derive-from-evidence
  style as `deriveEngagement` / `deriveRunAudit`, fully unit-tested, no I/O.
- `RunDetailPage` live layout: header strip (task · flow+source · crew ·
  persona · branch) / seat-board lane (cards; the working seat pulses; click
  selects) / main pane bound to the selected seat: its prompt (collapsible),
  live transcript (P2) while working or response artifact when done /
  side rail: changed files (existing `ChangedFilesList`) + event stream.
- Selection follows the active seat by default (auto-advance as the flow
  progresses), sticky when the user explicitly picks a seat.
- Shell-TUI parity: compact seat strip + the shared transcript on the shell
  run view. CLI parity: `vibe runs show <id> --live` already tails events;
  gains a seat-state line. (Read-only everywhere; no new write paths, no
  broker changes, no new server routes except none at all in v1.)
- Graph flows: the seat board groups parallel fan-out members (reuse the
  grouping from `flow-graph-layout.ts`) so a panel-review wave reads as one
  row of sibling cards.

### Acceptance criteria

- During a live default-flow run: seat cards advance in real time; selecting
  the working seat shows its prompt and a growing transcript; changed files
  appear as the implementer writes; branch shown in the header.
- During a panel-review run: three reviewer cards run side by side.
- Terminal runs keep today's layout (no regression to the audit view).
- A prompt artifact containing a planted token shape renders redacted in the
  Control Center.
- Standard validation suite + honest click-through report.

**Branch:** `feat/control-center` - size L. Depends on P2 (transcript reducer
*and* the redaction seams).

---

## P6 - UI revamp to match the website

**Note being addressed:** "Completely revamp the UI to match the website +
clarity and simplifying many aspects."

Deliberately sequenced after P5: restyling `RunDetailPage` before the Control
Center rebuild means doing it twice.

- **Phase 0 - design tokens (blocked on input).** The marketing site lives in
  a separate repo. Needed: its palette, type scale, radii, spacing, and any
  logo/wordmark assets - either as a dropped-in token file or explicit
  authorization to extract them from vibestrate.com. Without tokens, "match
  the website" is guesswork; this phase is a hard gate.
- **Phase 1 - token layer + primitives (size M).** Introduce a theme module
  (CSS variables) consumed by the shared primitives (buttons, cards, badges,
  inputs, panels). Most pages inherit the bulk of the visual shift from this
  alone. One branch.
- **Phase 2 - per-page clarity passes (several S-M branches).** Ordered by
  traffic: Runs/Control Center -> Flows (fresh from P3) -> Board -> Mission
  Control -> the rest. Each pass also does the "simplifying" half of the
  note: collapse duplicate panels, demote advanced controls behind
  expanders, kill dead affordances. One page-group per branch so each is
  reviewable.
- Match the Mission Control idiom (`primitives-contract.md` + the live screen)
  directly - no separate design-skill ceremony; keep the no-emoji and voice rules.

No acceptance criteria beyond per-branch validation here until Phase 0
resolves; this section gets its own detailed follow-up doc once tokens exist
(`design/ui-revamp.md`), since per-page specifics depend on them.

---

## P7 - Git onboarding + guided merge-to-main

**Note being addressed:** "System should help with installing and creating git
and merging to main."

Two independent slices. Both touch repo-level invariants (git state, the
no-auto-merge rule), so both get a Tier-2 independent adversarial review at
implementation time before merge.

### Slice 7a - git onboarding (size S, branch `feat/git-onboarding`)

- `vibe init` in a non-git directory currently refuses (exit 1, hint).
  Change to an explicit, confirmed offer: "Not a git repository. Initialize
  one now? [y/N]" -> on yes, `git init`, then continue the wizard.
  Default answer No; `--yes` does *not* imply git-init consent (separate
  `--git-init` flag for non-interactive use) - creating repo history is never
  a side effect of a generic yes.
- The initial commit is guarded, not automatic: before offering it, write (or
  detect) a sensible `.gitignore` (node_modules, build dirs, `.env*`), then
  scan the would-be-staged set for secret-shaped files (reuse the existing
  secret-path/token-shape guards) - any hit means **no commit** (git init
  only, with a clear explanation; staging stays a human activity). A commit
  is harder to walk back than a working-tree change; never sweep a directory
  into history by default.
- Web + shell first-run onboarding parity: the existing init surfaces gain the
  same gated step (a checkbox/confirm, default off). The server-side init
  route performs the `git init` only with the explicit flag set - never
  inferred.
- Refuses inside an existing repo's subdirectory worktree confusion cases:
  if `git rev-parse --show-toplevel` resolves to a *parent* repo, keep
  today's behavior (init inside an existing repo is a different intent -
  surface the situation, do not nest repos).

### Slice 7b - guided merge-to-main (size S-M, branch `feat/guided-merge`)

- Today integration stops at a clean integration branch; the final merge to
  main is fully manual git. Add one explicit, human-confirmed step:
  - CLI: `vibe integrate finish [--into-main]` - performs a local merge of
    the integration branch into main (ff when possible, merge commit
    otherwise per repo style), with a typed confirmation. Never pushes.
  - Dashboard: a "Complete merge to main" button on the Integration panel
    with a confirm modal stating exactly what will run; calls a new
    `POST /api/integration/finish`.
- **The gate is the broker, not a confirm string** (reviewer finding: a
  request-body token is not authorization - anything that can POST can
  include it; it only prevents *accidental* invocation, so keep it for that
  but claim nothing more). Real enforcement:
  - New `git.merge` action kind through the S0 broker, evidence-logged, with
    **`require_approval` semantics by default** - the merge cannot complete
    without an interactive human ack through the standard approval flow.
  - Tested invariant (not prose): no automated path emits `git.merge` - no
    scheduler hook, no `run.complete` evaluator, no flow step can reach the
    merge service; assert it.
  - Honest exposure note: on the default tokenless loopback bind, `/api/*`
    write routes are reachable by any local process (and by no-Origin
    requests the origin check cannot see). The dashboard merge button
    therefore requires either `VIBESTRATE_API_TOKEN` to be set or the
    broker approval to happen on an attended surface - document this in the
    HTTP API page; do not present the route as self-securing.
- **Completeness + TOCTOU guards** (reviewer findings):
  - `integrate apply` stops at the first conflict, leaving a *partial*
    integration branch; `finish` must verify the branch is the complete set
    the user reviewed - record the included run branches in the integration
    metadata and refuse `finish` when the apply reported a `stoppedAt`.
  - Preconditions (clean working tree, main checkout-able, no active run
    holding main or the integration worktree) are re-checked inside a lock
    immediately before the merge, not just up front - a run checking out
    main between check and merge is the race to close.
- Both surfaces refuse with clear reasons rather than attempting recovery -
  conflict resolution stays a human/git activity in the integration worktree.

### Acceptance criteria

- 7a: `vibe init` in an empty dir offers git-init only on explicit yes/flag;
  `--yes` alone never inits git; a directory containing an `.env` gets
  git-init without a commit and says why.
- 7b: a clean, *complete* integration branch can be merged to main from CLI
  and dashboard through broker approval; every refusal path (dirty tree,
  conflict, partial integration branch, no approval, concurrent run holding
  main) tested; the broker log carries the `git.merge` action; the
  no-automated-path invariant has a test; no code path pushes.
- Tier-2 adversarial review performed and its findings folded in before
  merge (report it).

---

## Sequencing + branch map

| # | Slice | Branch | Size | Depends on |
| --- | --- | --- | --- | --- |
| 1 | Blocked-run review UX | `feat/blocked-run-review-ux` | S | - |
| 2 | Live transcript | `feat/live-transcript` | M | repro first |
| 3a | Hub branch rebase + live-test + merge | `feat/shell-flow-hub-and-seating` | S-M | live hub API |
| 3b | Web hub browser | `feat/web-hub-browser` | M | 3a |
| 4a | Protected-path matcher (A2) | `feat/protected-paths` | S | - |
| 4b | `express` flow (A3, diff-floored) | `feat/express-flow` | M | 4a |
| 4c | Flow sizer (A1) | `feat/flow-sizer` | M | 4a + 4b |
| 5 | Control Center | `feat/control-center` | L | 2 (reducer + redaction) |
| 6 | UI revamp | `feat/ui-revamp-*` (several) | L | 5 + website tokens |
| 7a | Git onboarding | `feat/git-onboarding` | S | Tier-2 review at build |
| 7b | Guided merge | `feat/guided-merge` | M | Tier-2 review at build |

Recommended order of execution: **1 -> 3a -> 4a -> 4b -> 2 -> 4c -> 3b -> 5 ->
7a -> 7b -> 6.** Rationale: 1 is the live pain on real runs; 3a before the
stranded branch drifts further; 4a+4b give the trivial-task relief on a safe
floor (4b is manually selectable the day it lands); 2 unblocks 5; 6 last so
nothing is styled twice. One slice per branch, standard validation suite per
slice, curated changelog entry + version bump per merge, per CLAUDE.md.

## Cross-cutting rules for every slice

- UI⇄CLI(⇄shell) parity for every user-facing action; never make the CLI the
  in-UI fix.
- All new file reads stay path-guarded to approved roots; review/prompt
  artifacts go through the existing artifacts route only - and path-guarding
  is not redaction: any slice that makes previously-unread content prominent
  ships the redaction seam with it (P2/P5).
- No new write paths except 7a/7b, which are explicit, confirmed,
  broker-gated, and never push.
- Honest reporting: skipped click-throughs and contract drift vs the live
  hub (P3) are stated in the slice's final report.
