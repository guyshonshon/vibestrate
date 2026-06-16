---
title: HTTP API
description: The local dashboard API, a versioned /api/v1 contract with optional bearer-token auth and the flow import, export, and create endpoints.
section: architecture
slug: architecture/http-api
---

`vibe ui` starts a Fastify server (default `http://127.0.0.1:4317`) that backs
the dashboard. The same endpoints are a stable, scriptable contract: every
dashboard action is an HTTP call, so anything the UI does, an external caller
can do too.

## Base URL and versioning

There are two ways to reach the same handlers: one the bundled UI uses, and one to pin in your own scripts.

- **Unversioned:** `/api/...` - what the bundled dashboard calls.
- **Versioned:** `/api/v1/...` - the canonical contract for external callers.

`/api/v1/<path>` is rewritten to `/api/<path>` before routing, so the two are
the same handlers. Pin `/api/v1` in scripts; a future breaking payload change
ships under a new prefix while `/api/v1` keeps working for a deprecation
window. `/api/v1/health` and `/api/v1/flows` behave identically to their
unversioned forms.

## Binding and origin

By default the server listens only on your own machine, and it is picky about who is allowed to call it.

The server binds loopback (`127.0.0.1`) by default and refuses cross-origin
requests from anything but `localhost` / `127.0.0.1` / the configured host (a
malformed `Origin` is refused too). To expose it on another interface, pass
`vibe ui --host <host>` - but a non-loopback bind **requires a token** (below) or
the server refuses to start.

**CSRF.** State-changing methods (POST/PUT/PATCH/DELETE) additionally reject any
request a browser marks `Sec-Fetch-Site: cross-site`/`cross-origin`, so a page in
your browser can't drive your local API. Non-browser clients (curl, your own
scripts) omit that header and are unaffected - but a destructive endpoint like
snapshot prune still requires an explicit body, never acting on an empty one.

## Authentication

Auth stays out of your way when you run locally, and switches on the moment you set a token.

Auth is **off by default** on a loopback bind (single-user, local-first). It
turns on when a token is present:

- Set `VIBESTRATE_API_TOKEN` (or pass `apiToken` to `startServer`).
- Every `/api/*` request must then send `Authorization: Bearer <token>`
  (constant-time compared). Missing/invalid → `401` with `WWW-Authenticate:
  Bearer`.
- Static UI assets and `/favicon.*` stay open (they carry no secrets).
- Binding a **non-loopback** host without a token is refused at startup -
  fail-closed, so you never accidentally expose an unauthenticated API.

The token is read from the environment only; it is never written to
`project.yml`, artifacts, logs, or the UI.

```bash
# expose on the LAN, token-gated
VIBESTRATE_API_TOKEN=$(openssl rand -hex 24) vibe ui --host 0.0.0.0
curl -H "Authorization: Bearer $VIBESTRATE_API_TOKEN" \
  http://<host>:4317/api/v1/flows
```

## Flow portability endpoints

These endpoints move flows in and out of a project. A **Seat** is a named slot in a flow that says what kind of worker a step needs, not which model fills it.

Flows are portable because they name **Seats**, not your local Roles or
Providers - a flow exported from one project imports cleanly into another and
resolves against whatever Crew the importing project has.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/flows/:id/export` | Export a flow as canonical YAML. `?format=yaml` returns the raw file as a download; default is JSON `{ flowId, source, yaml }`. |
| `POST` | `/api/v1/flows/import` | Import one flow from `{ yaml }` **or** `{ url }` (exactly one) + optional `overwrite`. |
| `POST` | `/api/v1/flows` | **Flow creator** - write a brand-new project flow from `{ flow: <FlowDefinition>, overwrite? }`. |

All three write to `.vibestrate/flows/<id>/flow.yml` through one guarded path:

- **Schema validation** against the full Flow schema.
- **Secret refusal** - a flow carrying a high-precision token shape (AWS, GitHub,
  Stripe, Anthropic, PEM, …) is rejected, not written.
- **Control-character / size guard** - NUL and disallowed control chars are
  refused; imports are capped at 256 KB.
- **SSRF guard** on URL imports - `http(s)` only, and the resolved host must not
  be a private/loopback address. (The CLI's `vibe flows import <url>` trusts a
  user-typed URL and skips the host block; the HTTP API never does.)
- **Overwrite policy** - an existing *project* flow is replaced only with
  `overwrite: true` (a builtin of the same id is always shadowable, like
  `fork`). New writes return `201`; replacements return `200`.

CLI equivalents: `vibe flows export <id> [--out file]` and
`vibe flows import <file-or-url> [--overwrite]`. In the dashboard: the **Flows**
page has **Export**, **Import** (paste YAML or URL), and **New flow** controls.

## Integration: merge advice + guided merge-to-main

These four endpoints back the dashboard's Merge page: a cheap read to list merge-ready runs, an optional deeper analysis, deterministic advice, and the guarded merge itself.

`GET /api/integration/overview` returns the **cheap** per-run projection the
dashboard's Merge page lists: check lanes + branch topology per merge-ready
run - no dry-run preview and deliberately **no recommendation** (a
recommendation computed blind to conflicts would mislead). Fast read-only
git ops; safe per page load.

`POST /api/integration/analyze` (`{ runId }`) runs the **optional**
"analyze deeper" pass: a local provider reads the run's byte-capped, redacted
diff vs main and returns a semantic-risk narrative (never a merge verdict).
It is broker-gated through the assist primitive, the same exposure class as
`POST /api/consult` - it spawns a local provider, creates no run, and writes
only a cached markdown artifact under the run's own dir. Secret-like files are
suppressed and secret-shaped tokens redacted before the provider sees the
diff. The deterministic recommendation and flags are computed elsewhere and
are never changed by this pass. CLI equivalent: `vibe integrate analyze
<runId>`.

`POST /api/integration/advice` (`{ runIds? }`) returns **read-only,
deterministic** merge advice for the selected (or all) merge-ready runs:
risk flags derived from the run's assurance lanes (including the honest
"nothing was actually checked" case), the dry-run conflict report, the run
branch's topology vs main, and a recommendation - `finish-now`,
`stage-on-integration-branch`, or `resolve-first`. It contains no model
output and mutates no branch. Gating and cost are the same as
`/api/integration/preview`, which it wraps (a scratch-worktree dry run per
call - call it on demand, not per list row). CLI equivalent:
`vibe integrate advise [runIds...] [--json]`.

`POST /api/integration/finish` (`{ integrationBranch, confirm: "merge-to-main" }`)
merges a **complete, clean** integration branch into your main branch -
locally, never pushed. It refuses partial integrations (the apply stopped at a
conflict), dirty working trees, merge conflicts (aborted cleanly), and any
`git.merge` action policy that says `deny` / `require_approval`; preconditions
are re-checked under a lock immediately before the merge.

This endpoint is **fail-closed**: it refuses outright (`403`) unless
`VIBESTRATE_API_TOKEN` is set, because a tokenless local API is reachable by
any local process and the `confirm` body token only guards against
*accidental* invocation - it is not authorization. The default human path is
the CLI: `vibe integrate finish <branch>`, which requires the typed
confirmation `merge-to-main`, runs only from your terminal, and refuses to
move your HEAD (you must already be on main). A `git.merge` action policy
(`deny` / `require_approval`) can additionally refuse merges from any
surface. The merge also refuses when the integration branch tip changed
since `apply` recorded it - you merge exactly what you reviewed.
