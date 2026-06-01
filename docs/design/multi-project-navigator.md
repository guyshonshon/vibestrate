# Design: Multi-project navigator (slices b · d · f)

Status: **shipped**. Closes the remaining Multi-project backlog on top of the v1
registry + switcher and the read-only "All projects" overview (slice c).

This records the *final* shape after a deliberate course-correction. An earlier
iteration added a cross-project **control plane** (launch/abort/queue runs in
other roots from one dashboard). That was reverted in favour of the model below.
Process rules live in `CLAUDE.md`; the running checklist in `docs/TODO.md`.

---

## The model: isolated tenants + a navigator

Each project is a **fully independent tenant** - its own `vibe ui` process: its
own HTTP server, its own *managed scheduler* (`startManagedScheduler`) draining
its own queue, its own Action Broker and policies. Projects **never touch or
know about each other**. State is file-backed (`<root>/.vibestrate/…`), so a
project is "lively kept" whether or not anyone is looking at it.

The **workspace is a navigator**, not a control plane. It does two things:

1. **Glance** - the read-only "All projects" overview rolls up each registered
   project's runs (bounded reads under each `<root>/.vibestrate/runs`).
2. **Open** - take you to any project's *own* dashboard in a new tab, starting it
   if it's dormant.

"Acting like you reopened the tool there" is literal: opening a project gives you
its complete, live dashboard (board, runs, flows, diffs, terminal, approvals,
scheduler) - because it *is* that project's own `vibe ui`.

## The (b) decision: navigator, not a shared/control server

The open question was "one server serves N roots" vs "workspace server." The
answer is **neither, and not a control plane either**:

- **No shared multi-root server.** Each project stays its own server. The thing
  you look at is always rooted in one project.
- **No cross-project control plane.** We do *not* launch/abort/queue runs in
  other roots from one dashboard - that would make projects reach into each
  other, the opposite of isolation. The way to run work in project B is: open B;
  B's own scheduler processes B's queue.

## The navigator runtime (`workspace-runtime.ts`)

`ensureProjectServer({project})` is the one primitive:

1. **Safety gate (f)** - `resolveTargetProject` requires the target be a
   registered, initialized project (or the served root). Fail-closed.
2. **Reuse if live** - probe the registry's last port with `/api/health`,
   confirming it serves *that* root (so a recycled port never hands back the
   wrong dashboard). If live, return its URL.
3. **Start if dormant** - pick a free port, spawn `vibe ui --port <free>
   --no-open` (detached, cwd pinned). The child self-registers its port and runs
   its own scheduler. Poll health (bounded) and return the URL.

The browser then opens a new tab to the URL. The dashboard never spawns commands
itself; it asks the server (`POST /api/workspace/open`), which is exactly what a
user typing `vibe ui` in that directory would do.

Surfaced as: `POST /api/workspace/open`; a `live` flag on `/api/workspace` and
the overview; `vibe workspace open <label> [--all] [--no-open]`; Open/Launch
buttons on the overview cards; and live●/dormant○ status in the TopBar switcher.

## Close: the inverse of Open

Closing a project shuts it back down cleanly - we never kill PIDs. Every server
exposes `POST /api/server/shutdown`, which stops its scheduler, closes the HTTP
server, and hands off to the process owner (the `vibe ui` CLI calls
`process.exit`; tests pass a spy instead, so an in-process server just closes).
The navigator's `POST /api/workspace/close` finds the project's live port and
calls that endpoint (forwarding `VIBESTRATE_API_TOKEN` when the machine uses
one). Idempotent: a project that isn't live reports `alreadyStopped`.

Before shutting down, the UI shows a **confirmation** with a real busy check
(`GET /api/workspace/status` → `readProjectBusyStatus`): active runs, queued
tasks, and running task ids, read from the project's own `.vibestrate` on disk -
never an HTTP call into it. **"Busy" means in-flight work only** - a merely-live
(idle) scheduler loop is the normal state of any open project and never blocks a
close. `vibe workspace close <label> [--all] [--force]` refuses a busy project
unless `--force`. Closing frees the port; the project shows dormant ○ again.

### Force-kill fallback

Cooperative shutdown can fail to *exit* the process (a lingering handle, a
mis-wired teardown). So every `vibe ui` records its **PID** in the registry, and
if a confirmed-live server doesn't exit within a grace window, Close escalates:
**SIGTERM** (the CLI's own handler tears down the scheduler cleanly) → if still
alive, **SIGKILL**. The result's `method` (`graceful` / `sigterm` / `sigkill` /
`unreachable` / `none`) is surfaced.

The safety rule that makes auto-killing acceptable: **a PID is only signalled
when its server is confirmed live for that root** - i.e. the port answers
`/api/health` for the project, and that same process self-registered both the
port and the PID. A dormant/unreachable port means we can't prove the recorded
PID is still *our* server (PID reuse), so we never signal it - we report
`unreachable` with the PID for the user to kill manually. This trades
auto-recovery of a fully event-loop-hung server (rare) for never killing the
wrong process.

## Path canonicalization (a correctness fix the navigator exposed)

The registry deduped by `path.resolve`, which doesn't resolve symlinks. Spawning
`vibe ui` re-derives the root via the OS realpath (e.g. macOS `/var` →
`/private/var`), so a project could register **twice** under two spellings.
`canonicalRoot()` (realpath with a `path.resolve` fallback for not-yet-existing
paths) is now the dedup + match key everywhere, so a project never doubles.

## Per-project scheduler liveness (slice d, reframed)

"Each project's scheduler running and processing tasks" is delivered by the
existing per-project machinery, not a workspace-level queue: `vibe ui` starts a
managed scheduler that restarts on crash and dies with the UI; `ensureScheduler
Running` auto-spawns one the moment work is queued. The navigator simply ensures
that machinery is *up* for any project you open. There is no workspace-level
queue or daemon - and we don't claim one.

## Where runtime state lives: per-project lock, not the shared file

The user-level registry (`~/.vibestrate/workspace.json`) holds **durable intent
only** - which projects exist and their labels. A running dashboard's
**runtime** state (pid + port) lives in that project's own
`<root>/.vibestrate/ui.lock` (`ui-lock.ts`), exactly mirroring the scheduler's
lock. This split is deliberate:

- **No shared-file runtime races.** Each running `vibe ui` is the *single writer*
  of its own lock; the shared file is only touched on `add`/`remove`/first-run
  (and those writes are now atomic via temp+rename).
- **Self-healing liveness.** A project is "running" iff its lock names a live PID
  on this host (`isProcessAlive`). A crash (`kill -9`) leaves a stale lock that
  reads as dormant and is reclaimed on the next start - the file never lies for
  long, and nothing has to actively reconcile it.
- **Right lifecycles in the right place.** Durable intent persists across reboots
  in one file; ephemeral runtime is born and dies with each process, in a file
  that process owns.

### Why not a supervisor daemon

We considered a long-running `vibe workspace` process that spawns and tracks
every project (real `exit` events, auto-restart, tree-kill). Rejected: it's a new
always-on lifecycle and a single point of failure (if it dies, children orphan or
all die), needs cross-platform IPC, and **still** needs a file to be discovered -
all to centralize what per-project locks already give us without a daemon. It
also contradicts the isolated-tenant model. The lock approach is the same pattern
the scheduler has used successfully, so the runtime question reuses proven code
rather than introducing a new moving part.

## What stays out of scope (honest limits)

- No shared multi-root HTTP server; no hosted relay; no cross-project control
  plane, dispatch queue, or merge.
- The dashboard you look at is always one project; the workspace navigates
  between independent tenants rather than unifying them.
- Close auto-recovers a confirmed-live server that won't exit (SIGTERM→SIGKILL),
  but a fully unreachable instance whose PID can't be confirmed is reported
  `unreachable` for a manual kill rather than risk killing the wrong process.
  There is no auto-stop on idle (open projects stay live until closed).
