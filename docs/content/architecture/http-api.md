---
title: HTTP API
description: The local dashboard API, a versioned /api/v1 contract with optional bearer-token auth and the flow import, export, and create endpoints.
slug: architecture/http-api
---

`vibe ui` starts a Fastify server (default `http://127.0.0.1:4317`) that backs
the dashboard. The same endpoints are a stable, scriptable contract: every
dashboard action is an HTTP call, so anything the UI does, an external caller
can do too.

Pin `/api/v1` in scripts - it is rewritten to `/api` before routing, so both
prefixes reach the same handlers.

The server binds loopback and auth is off by default. Set
`VIBESTRATE_API_TOKEN` and every `/api` request must then carry
`Authorization: Bearer` with that token. Binding a non-loopback host without a
token is refused at startup.

## Endpoints at a glance

Three areas: flows, integration, and the supervisor. Each one is described in
full further down.

```text
GET  /api/v1/health
GET  /api/v1/flows
GET  /api/v1/flows/:flowId/export
POST /api/v1/flows/import
POST /api/v1/flows
POST /api/v1/flows/draft
POST /api/v1/crews/draft

GET  /api/integration/overview
POST /api/integration/advice
POST /api/integration/analyze
POST /api/integration/finish

GET  /api/supervisor/threads
POST /api/supervisor/threads/:threadId/turn
```

## Base URL and versioning

- **Unversioned:** `/api/...` - what the bundled dashboard calls.
- **Versioned:** `/api/v1/...` - the canonical contract for external callers.

A versioned path is rewritten to its unversioned form before routing, so the
two are the same handlers.

<svg viewBox="0 0 560 92" width="100%" style="max-width:560px;height:auto" role="img" aria-label="A versioned path such as slash api slash v1 slash flows is rewritten to its unversioned form before routing, so both prefixes reach one handler.">
  <g fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1">
    <rect x="1" y="26" width="160" height="40" rx="8"/>
    <rect x="244" y="26" width="130" height="40" rx="8"/>
    <rect x="419" y="26" width="140" height="40" rx="8"/>
  </g>
  <g fill="none" stroke="currentColor" stroke-opacity="0.5" stroke-width="1">
    <path d="M374 46 H409"/>
  </g>
  <polygon points="409,42.5 414,46 409,49.5" fill="currentColor" fill-opacity="0.5"/>
  <g fill="currentColor" text-anchor="middle">
    <text x="81" y="50" font-size="12" font-family="ui-monospace,monospace">/api/v1/flows</text>
    <text x="202" y="50" font-size="11" fill-opacity="0.5">rewritten to</text>
    <text x="309" y="50" font-size="12" font-family="ui-monospace,monospace">/api/flows</text>
    <text x="489" y="50" font-size="12">one handler</text>
  </g>
</svg>

`/api/v1/health` and `/api/v1/flows` behave identically to their unversioned
forms.

Pin `/api/v1` in scripts. A future breaking payload change ships under a new
prefix, while `/api/v1` keeps working for a deprecation window.

## Binding and origin

The server binds loopback (`127.0.0.1`) by default. It refuses cross-origin
requests from anything but `localhost`, `127.0.0.1` or the configured host, and
a malformed `Origin` is refused too.

To expose it on another interface, pass `--host` to `vibe ui`. A non-loopback
bind **requires a token** (below), or the server refuses to start.

**CSRF.** State-changing methods - POST, PUT, PATCH and DELETE - additionally
reject any request a browser marks `Sec-Fetch-Site: cross-site` or
`cross-origin`, so a page in your browser can't drive your local API.

Non-browser clients such as `curl` and your own scripts omit that header and
are unaffected. A destructive endpoint like snapshot prune still requires an
explicit body, and never acts on an empty one.

## Authentication

Auth is **off by default** on a loopback bind (single-user, local-first). It
turns on when a token is present:

- Set `VIBESTRATE_API_TOKEN` (or pass `apiToken` to `startServer`).
- Every `/api/*` request must then send `Authorization: Bearer <token>`,
  compared in constant time. A missing or invalid token returns `401` with
  `WWW-Authenticate: Bearer`.
- Static UI assets and `/favicon.*` stay open (they carry no secrets).
- Binding a **non-loopback** host without a token is refused at startup -
  fail-closed, so you never accidentally expose an unauthenticated API.

The token is read from the environment only; it is never written to
`project.yml`, artifacts, logs, or the UI.

```bash
# expose on the LAN, token-gated
export VIBESTRATE_API_TOKEN=$(openssl rand -hex 24)
vibe ui --host 0.0.0.0

# then call it with that token
AUTH="Authorization: Bearer $VIBESTRATE_API_TOKEN"
curl -H "$AUTH" http://<host>:4317/api/v1/flows
```

## Flow portability endpoints

These endpoints move flows in and out of a project. A **Seat** is a named slot in a flow that says what kind of worker a step needs, not which model fills it.

Flows are portable because they name **Seats**, not your local Roles or
Providers - a flow exported from one project imports cleanly into another and
resolves against whatever Crew the importing project has.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/flows/:flowId/export` | Export a flow as canonical YAML. `?format=yaml` returns the raw file as a download; default is JSON `{ flowId, source, yaml }`. |
| `POST` | `/api/v1/flows/import` | Import one flow from `{ yaml }` **or** `{ url }` (exactly one) + optional `overwrite`. |
| `POST` | `/api/v1/flows` | **Flow creator** - write a brand-new project flow from `{ flow: <FlowDefinition>, overwrite? }`. |

All three write the flow's own `flow.yml` under `.vibestrate/flows/`, through
one guarded path:

- **Schema validation** against the full Flow schema.
- **Secret refusal** - a flow carrying a high-precision token shape (AWS, GitHub,
  Stripe, Anthropic, PEM and others) is rejected, not written.
- **Control-character / size guard** - NUL and disallowed control chars are
  refused; imports are capped at 256 KB.
- **SSRF guard** on URL imports - `http(s)` only, and the resolved host must not
  be a private/loopback address. (The CLI's `vibe flows import <url>` trusts a
  user-typed URL and skips the host block; the HTTP API never does.)
- **Overwrite policy** - an existing *project* flow is replaced only with
  `overwrite: true` (a builtin of the same id is always shadowable, like
  `fork`). New writes return `201`; replacements return `200`.
- **Action Broker gate** - every one of them (plus fork, the builder's patch,
  and `DELETE`) raises a `file.write` the broker decides on, so a policy that
  denies file writes stops flow authoring too.

The broker gate has four consequences worth knowing:

- `DELETE` rides the same kind on purpose. Losing a flow is the same authority
  over the same path as overwriting it, and gating only the writes would let a
  locked-down project still lose every project flow.
- A refusal comes back as `403` with the broker's reasons, not as a thrown
  error.
- Flow edits happen outside any run, so the evidence lands in
  `runs/flows/actions.ndjson`, tagged with which writer it was
  (`flow-import`, `flow-create`, `flow-fork`, `flow-patch`, `flow-delete`).
- A write that fails after being allowed still records its failure, so a
  decision never sits in the log without an outcome.

CLI equivalents: `vibe flows export <id> [--out file]` and
`vibe flows import <file-or-url> [--overwrite]`. In the dashboard: the **Flows**
page has **Export**, **Import** (paste YAML or URL), and **New flow** controls.

## Drafting a Flow or a Crew

Two endpoints turn an English description into an editable draft. Neither one
writes anything, and neither is a shortcut past the write endpoints above.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/v1/flows/draft` | Draft a flow from `{ description, crewId? }`. Returns `{ draft }`: the `FlowDefinition`, its canonical YAML, the rationale, seat `coverage` against that crew, `targetPath`, and `exists`. |
| `POST` | `/api/v1/crews/draft` | Draft a crew from `{ description }`. Returns `{ draft }`: the `crews.<id>` block, its YAML, one `roleFiles` entry per role (the exact JSON role file to save), the rationale, `problems`, and `exists`. |

What holds for both:

- **Draft only** - adopting a flow is a separate call to `POST /api/v1/flows` or
  `/api/v1/flows/import`; adopting a crew is the owner saving each `roleFiles`
  entry and then editing `project.yml`, in that order (a crew block whose roles
  point at files nobody wrote fails when the config loads). The model proposes;
  committing is the owner's action.
- **Redacted in, secret-scanned out** - the description is redacted before it
  reaches the model, and a draft carrying a secret shape is refused rather than
  redacted.
- **Bounded input** - `description` is capped at 1000 characters and rejected
  with `400` past that, before a provider is resolved. Bad input and a refused
  draft return `400` with the reason; anything else (a provider that never
  answered, an unreadable config) is a `500` with the path stripped out.
- **No network of ours** - any currency claim in the response comes from the
  agent's own web tool inside its provider CLI. Vibestrate opens no socket here,
  so an agent without one reports the gap in `currency.unverified`.
- **`crews/draft` needs an initialized project** - `404` otherwise.

CLI equivalents: `vibe flows draft "<description>" [--crew <id>] [--yaml|--json]`
and `vibe crew draft "<description>" [--yaml|--json]`. In the dashboard: the
**Flows** page and the **Crew** page each have a draft panel.

## Supervisor turns (SSE over POST)

The supervisor's conversation endpoints are inert storage - list threads, open
one, append a message - except the turn, which is the only one that reaches a
model.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/supervisor/threads` | List threads. With `?runId=` the run's thread; without it, the project thread. |
| `POST` | `/api/supervisor/threads` | Open a thread from `{ runId? }`. |
| `GET` | `/api/supervisor/threads/:threadId` | Read one thread in full. |
| `POST` | `/api/supervisor/threads/:threadId/messages` | Append the user's message from `{ text }`. |
| `POST` | `/api/supervisor/threads/:threadId/turn` | Take a turn, streamed as it happens. |
| `GET` / `POST` | `/api/supervisor/pause` | Read or set the kill switch. No model on this path. |

The turn is **SSE over POST**, not `GET`. It carries the user's message, up to
20 000 characters, so it cannot go in a query string - and `EventSource` has no
way to send a body. The framing is ordinary SSE (`event:` then `data:`), so a
client reads it over `fetch(...).body` instead.

The body is `{ text, effort?, profileId? }`. An effort the chosen provider does
not have is refused with `400` before any provider is resolved, and an unknown
thread is `404`. Both checks run before the stream opens, because a hijacked
reply can no longer carry a status code.

Seven event kinds stream, each sent under its own SSE name and also carrying
`kind`, so you can listen by name or switch on the parsed payload:

| Event | What it carries |
|---|---|
| `message` | The user's message as persisted, with id and time. |
| `phase` | Which leg runs: routing, acting or answering. |
| `thinking` | Provider reasoning, where the provider exposes it. |
| `tool` | One tool or sub-agent the provider invoked. |
| `answer` | Answer prose as it is written. |
| `done` | Terminal. Carries the stored message and the thread. |
| `error` | Terminal, nothing was answered. |

`thinking` and `tool` appear only when the provider actually emits them. A
provider that exposes no reasoning produces none, and nothing is substituted -
an invented "thinking" trace would be worse than honest silence.

Treat `done.message.text` as authoritative and replace your streamed buffer
with it, because an executed action's reply is prepended when the message is
written.

**Stopping is aborting the fetch.** There is no stop endpoint. Closing the
socket aborts the turn's signal, which sends `SIGTERM` to the process group of
whichever provider CLI is in flight and records a stopped message in the
thread.

What that cannot retract is an action that already ran - a created task or a
started run outlives the request and is recorded as having happened. A
heartbeat comment goes out every 15 seconds so idle proxies don't close the
stream.

## Integration: merge advice + guided merge-to-main

These four endpoints back the dashboard's Merge page: a cheap read to list merge-ready runs, an optional deeper analysis, deterministic advice, and the guarded merge itself.

`GET /api/integration/overview` returns the **cheap** per-run projection the
dashboard's Merge page lists: check lanes + branch topology per merge-ready
run - no dry-run preview and deliberately **no recommendation** (a
recommendation computed blind to conflicts would mislead). Fast read-only
git ops; safe per page load.

`POST /api/integration/analyze` (`{ runId }`) runs the **optional**
"analyze deeper" pass. A local provider reads the run's byte-capped, redacted
diff vs main and returns a semantic-risk narrative, never a merge verdict.

It is broker-gated through the assist primitive, the same exposure class as
`POST /api/consult` - it spawns a local provider, creates no run, and writes
only a cached markdown artifact under the run's own dir. Secret-like files are
suppressed and secret-shaped tokens redacted before the provider sees the diff.

The deterministic recommendation and flags are computed elsewhere and are never
changed by this pass. CLI equivalent: `vibe integrate analyze <runId>`.

`POST /api/integration/advice` (`{ runIds? }`) returns **read-only,
deterministic** merge advice for the selected (or all) merge-ready runs. The
advice for each run carries:

- risk flags derived from the run's assurance lanes, including the honest
  "nothing was actually checked" case;
- the dry-run conflict report;
- the run branch's topology vs main;
- a recommendation - `finish-now`, `stage-on-integration-branch`, or
  `resolve-first`.

It contains no model output and mutates no branch. Gating and cost are the same
as `/api/integration/preview`, which it wraps: a scratch-worktree dry run per
call, so call it on demand rather than per list row.

CLI equivalent: `vibe integrate advise [runIds...] [--json]`.

`POST /api/integration/finish` (`{ integrationBranch, confirm: "merge-to-main" }`)
merges a **complete, clean** integration branch into your main branch -
locally, never pushed. It refuses:

- partial integrations, where the apply stopped at a conflict;
- dirty working trees;
- merge conflicts, aborted cleanly;
- any `git.merge` action policy that says `deny` or `require_approval`.

Preconditions are re-checked under a lock immediately before the merge.

This endpoint is **fail-closed**: it refuses outright (`403`) unless
`VIBESTRATE_API_TOKEN` is set. A tokenless local API is reachable by any local
process, and the `confirm` body token only guards against *accidental*
invocation - it is not authorization.

The default human path is the CLI: `vibe integrate finish <branch>`, which
requires the typed confirmation `merge-to-main`, runs only from your terminal,
and refuses to move your `HEAD` (you must already be on main).

A `git.merge` action policy (`deny` or `require_approval`) can additionally
refuse merges from any surface. The merge also refuses when the integration
branch tip changed since `apply` recorded it - you merge exactly what you
reviewed.
