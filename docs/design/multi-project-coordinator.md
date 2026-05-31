# Design: Multi-project coordinator (slices b · c-board · d · f)

Status: **shipped**. Closes the remaining Multi-project backlog slices on top of
the v1 registry + switcher and the read-only "All projects" overview (slice c).

This is the canonical record of *why* cross-project actions are shaped the way
they are. Process rules live in `CLAUDE.md`; the running checklist in
`docs/TODO.md`.

---

## The (b) decision: coordinator, not a shared multi-root server

The open question was **"one HTTP server that serves N project roots" vs a
"workspace server."** We chose **neither** of the heavyweight options. The
dashboard stays **single-served** (one `vibe ui` per project, on its own port),
and the few cross-project *operations* go through a **coordinator** layered on
the existing per-root core primitives:

- **launch** → the audited detached core entry (`dist/run-entry.js`, via
  `src/core/detached-run.ts`) with `cwd` pinned to the target root. The run
  loads *that project's* own config, policies, and Action Broker — exactly like
  a local `vibe run` there.
- **abort** → the target root's own state-machine transition + event log.
- **read** (active runs, overview) → bounded reads under `<root>/.vibestrate`.

Why not serve N roots from one server? Because every read and write handler
would have to take a root parameter and re-establish its path guards per
request — a large, error-prone surface. The coordinator keeps the surface tiny:
a handful of endpoints, all funnelling through **one** safety gate.

Trade-off accepted: switching *dashboards* is still a port hop (slice c keeps
the "Open dashboard" link). What's new is that you can **act** on another
project (start / queue / abort runs) without leaving the current dashboard —
without a hosted backend and without a shared-server refactor.

## The (f) safety gate: `resolveTargetProject`

Cross-root actions are a wider capability than the single-project server was
built around, so **no caller-supplied path is trusted.** `src/workspace/
workspace-safety.ts` is the single fail-closed gate every launch / abort /
enqueue passes. A target is allowed only when it is:

1. a path resolving to a real directory,
2. present in the **user-owned registry** (or is the served/current root), and
3. an **initialized** Vibestrate project (`.vibestrate/project.yml` exists).

Anything else is refused with a clear `WorkspaceSafetyError` (HTTP status
preserved) rather than acted on. Because the registry is user-owned and every
action re-enters that project's own broker/policies, the trust model stays
local-first. Every cross-project dispatch is appended to
`~/.vibestrate/workspace-dispatch.ndjson` (best-effort audit; the action is the
source of truth).

## The (c-board) write surface

`src/workspace/workspace-coordinator.ts` exposes `launchRunInProject`,
`abortRunInProject`, and `listActiveRunsInProject`. The launch request
(`workspaceRunRequestSchema`) is deliberately **narrow** — the same constrained
shape as `POST /api/runs`, never arbitrary argv. Surfaced as
`POST /api/workspace/runs`, `POST /api/workspace/runs/abort`,
`GET /api/workspace/active`, `vibe workspace run|abort`, and inline actions on
the All-projects page (a Run composer + per-project active-run abort).

## The (d) workspace scheduler

`src/workspace/workspace-queue.ts` is a **dispatch queue**, not a daemon — and
we say so plainly. Entries (`~/.vibestrate/workspace-queue.json`) record "run
this in that project." A **drain** is one pass that launches eligible entries in
FIFO order under two code-enforced caps:

- a **global** concurrency cap across all projects, and
- a **per-project** cap.

Capacity is measured from each project's **real non-terminal runs on disk**
(not an in-memory guess), so the count is correct across separate `vibe ui` /
CLI processes. An entry blocked by a per-project cap stays queued and is
reported; an entry whose target is unsafe is dropped and reported. The drain is
invoked explicitly (`vibe workspace queue drain`, the dashboard Drain button, or
a user cron) — we never claim always-on scheduling we don't have. The launcher
is injectable so the cap/ordering logic is unit-tested without spawning.

## What stays out of scope (honest limits)

- No always-on background workspace daemon (drain is pull, not push).
- No shared multi-root HTTP server; no hosted relay; no cross-project *merge*.
- The dashboard a user looks at is still rooted in one project; cross-project
  reads/writes are the listed endpoints only.
