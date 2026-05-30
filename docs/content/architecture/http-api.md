---
title: HTTP API
description: The local dashboard API — versioned /api/v1 contract, optional bearer-token auth, and the flow import/export/create endpoints.
section: architecture
slug: architecture/http-api
---

`vibe ui` starts a Fastify server (default `http://127.0.0.1:4317`) that backs
the dashboard. The same endpoints are a stable, scriptable contract: every
dashboard action is an HTTP call, so anything the UI does, an external caller
can do too.

## Base URL and versioning

- **Unversioned:** `/api/...` — what the bundled dashboard calls.
- **Versioned:** `/api/v1/...` — the canonical contract for external callers.

`/api/v1/<path>` is rewritten to `/api/<path>` before routing, so the two are
the same handlers. Pin `/api/v1` in scripts; a future breaking payload change
ships under a new prefix while `/api/v1` keeps working for a deprecation
window. `/api/v1/health` and `/api/v1/flows` behave identically to their
unversioned forms.

## Binding and origin

The server binds loopback (`127.0.0.1`) by default and refuses cross-origin
requests from anything but `localhost` / `127.0.0.1` / the configured host. To
expose it on another interface, pass `vibe ui --host <host>` — but a
non-loopback bind **requires a token** (below) or the server refuses to start.

## Authentication

Auth is **off by default** on a loopback bind (single-user, local-first). It
turns on when a token is present:

- Set `VIBESTRATE_API_TOKEN` (or pass `apiToken` to `startServer`).
- Every `/api/*` request must then send `Authorization: Bearer <token>`
  (constant-time compared). Missing/invalid → `401` with `WWW-Authenticate:
  Bearer`.
- Static UI assets and `/favicon.*` stay open (they carry no secrets).
- Binding a **non-loopback** host without a token is refused at startup —
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

Flows are portable because they name **Seats**, not your local Roles or
Providers — a flow exported from one project imports cleanly into another and
resolves against whatever Crew the importing project has.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/flows/:id/export` | Export a flow as canonical YAML. `?format=yaml` returns the raw file as a download; default is JSON `{ flowId, source, yaml }`. |
| `POST` | `/api/v1/flows/import` | Import one flow from `{ yaml }` **or** `{ url }` (exactly one) + optional `overwrite`. |
| `POST` | `/api/v1/flows` | **Flow creator** — write a brand-new project flow from `{ flow: <FlowDefinition>, overwrite? }`. |

All three write to `.vibestrate/flows/<id>/flow.yml` through one guarded path:

- **Schema validation** against the full Flow schema.
- **Secret refusal** — a flow carrying a high-precision token shape (AWS, GitHub,
  Stripe, Anthropic, PEM, …) is rejected, not written.
- **Control-character / size guard** — NUL and disallowed control chars are
  refused; imports are capped at 256 KB.
- **SSRF guard** on URL imports — `http(s)` only, and the resolved host must not
  be a private/loopback address. (The CLI's `vibe flows import <url>` trusts a
  user-typed URL and skips the host block; the HTTP API never does.)
- **Overwrite policy** — an existing *project* flow is replaced only with
  `overwrite: true` (a builtin of the same id is always shadowable, like
  `fork`). New writes return `201`; replacements return `200`.

CLI equivalents: `vibe flows export <id> [--out file]` and
`vibe flows import <file-or-url> [--overwrite]`. In the dashboard: the **Flows**
page has **Export**, **Import** (paste YAML or URL), and **New flow** controls.
