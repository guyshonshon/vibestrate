# Design: Multi-project navigator (slices b · d · f)

Status: **shipped**. Closes the remaining Multi-project backlog on top of the v1
registry + switcher and the read-only "All projects" overview (slice c).

This records the *final* shape after a deliberate course-correction. An earlier
iteration added a cross-project **control plane** (launch/abort/queue runs in
other roots from one dashboard). That was reverted in favour of the model below.
Process rules live in `CLAUDE.md`; the running checklist in `docs/TODO.md`.

---

## The model: isolated tenants + a navigator

Each project is a **fully independent tenant** — its own `vibe ui` process: its
own HTTP server, its own *managed scheduler* (`startManagedScheduler`) draining
its own queue, its own Action Broker and policies. Projects **never touch or
know about each other**. State is file-backed (`<root>/.vibestrate/…`), so a
project is "lively kept" whether or not anyone is looking at it.

The **workspace is a navigator**, not a control plane. It does two things:

1. **Glance** — the read-only "All projects" overview rolls up each registered
   project's runs (bounded reads under each `<root>/.vibestrate/runs`).
2. **Open** — take you to any project's *own* dashboard in a new tab, starting it
   if it's dormant.

"Acting like you reopened the tool there" is literal: opening a project gives you
its complete, live dashboard (board, runs, flows, diffs, terminal, approvals,
scheduler) — because it *is* that project's own `vibe ui`.

## The (b) decision: navigator, not a shared/control server

The open question was "one server serves N roots" vs "workspace server." The
answer is **neither, and not a control plane either**:

- **No shared multi-root server.** Each project stays its own server. The thing
  you look at is always rooted in one project.
- **No cross-project control plane.** We do *not* launch/abort/queue runs in
  other roots from one dashboard — that would make projects reach into each
  other, the opposite of isolation. The way to run work in project B is: open B;
  B's own scheduler processes B's queue.

## The navigator runtime (`workspace-runtime.ts`)

`ensureProjectServer({project})` is the one primitive:

1. **Safety gate (f)** — `resolveTargetProject` requires the target be a
   registered, initialized project (or the served root). Fail-closed.
2. **Reuse if live** — probe the registry's last port with `/api/health`,
   confirming it serves *that* root (so a recycled port never hands back the
   wrong dashboard). If live, return its URL.
3. **Start if dormant** — pick a free port, spawn `vibe ui --port <free>
   --no-open` (detached, cwd pinned). The child self-registers its port and runs
   its own scheduler. Poll health (bounded) and return the URL.

The browser then opens a new tab to the URL. The dashboard never spawns commands
itself; it asks the server (`POST /api/workspace/open`), which is exactly what a
user typing `vibe ui` in that directory would do.

Surfaced as: `POST /api/workspace/open`; a `live` flag on `/api/workspace` and
the overview; `vibe workspace open <label> [--all] [--no-open]`; Open/Launch
buttons on the overview cards; and live●/dormant○ status in the TopBar switcher.

## Close: the inverse of Open

Closing a project shuts it back down cleanly — we never kill PIDs. Every server
exposes `POST /api/server/shutdown`, which stops its scheduler, closes the HTTP
server, and hands off to the process owner (the `vibe ui` CLI calls
`process.exit`; tests pass a spy instead, so an in-process server just closes).
The navigator's `POST /api/workspace/close` finds the project's live port and
calls that endpoint (forwarding `VIBESTRATE_API_TOKEN` when the machine uses
one). Idempotent: a project that isn't live reports `alreadyStopped`.

Before shutting down, the UI shows a **confirmation** with a real busy check
(`GET /api/workspace/status` → `readProjectBusyStatus`): active runs, queued
tasks, and running task ids, read from the project's own `.vibestrate` on disk —
never an HTTP call into it. **"Busy" means in-flight work only** — a merely-live
(idle) scheduler loop is the normal state of any open project and never blocks a
close. `vibe workspace close <label> [--all] [--force]` refuses a busy project
unless `--force`. Closing frees the port; the project shows dormant ○ again.

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
queue or daemon — and we don't claim one.

## What stays out of scope (honest limits)

- No shared multi-root HTTP server; no hosted relay; no cross-project control
  plane, dispatch queue, or merge.
- The dashboard you look at is always one project; the workspace navigates
  between independent tenants rather than unifying them.
- Close is cooperative (the server shuts itself down via the endpoint); there's
  no force-kill of an unresponsive process, and no auto-stop on idle.
