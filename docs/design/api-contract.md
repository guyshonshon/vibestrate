# API contract + flow portability (Phase 2)

Status: shipped. Design rationale for the Phase 2 work in `docs/TODO.md`
("API contract + flow portability"). Companion to
`roadmap-and-sequencing.md` §4 (HTTP API) and §5 (Flows hub, first slice).

This doc records the *why* behind the decisions; the *what* lives in the
[HTTP API doc](../content/architecture/http-api.md) and the code.

---

## 1. Versioning — `rewriteUrl`, not 30 route refactors

**Goal:** freeze a `/api/v1` contract for external callers without breaking the
bundled UI (which calls `/api/...`) and without touching 30 route modules that
hardcode their `/api/...` paths.

**Decision:** alias `/api/v1/<path>` → `/api/<path>` in Fastify's `rewriteUrl`
hook, which runs *before* routing. One function (`rewriteVersionedApiUrl`),
zero route changes, and handlers/logs see the canonical de-versioned path.

**Why not** mount the routes twice under a prefix? The route files embed the
`/api` prefix, so a prefixed registration yields `/api/v1/api/flows`. Rewriting
relative paths across every module is a large, regression-prone diff for what
is meant to be a thin hardening pass. `rewriteUrl` is the minimal correct seam.

**Edge:** only `/api/v1`, `/api/v1/...`, and `/api/v1?...` are rewritten —
`/api/version` and friends pass through untouched (covered by a test).

## 2. Auth — opt-in bearer token, fail-closed on non-loopback

**Decision:**
- Loopback + no token → **no auth** (unchanged single-user default).
- A token (`VIBESTRATE_API_TOKEN` env, or `apiToken` option) → **every `/api/*`
  request** must carry `Authorization: Bearer <token>`, constant-time compared.
- A **non-loopback bind without a token → refuse to start.** Exposing an
  unauthenticated API on a real interface is the footgun; fail-closed beats a
  silent exposure.

**Why env-only token:** an API token is a secret. The security posture forbids
secrets in `project.yml` / artifacts / logs, so the token is read from the
environment and never persisted. The origin allow-list (already present) stays
on as defense-in-depth.

**Why static assets stay open:** the UI must load its bundle before it can
attach a token; assets carry no secrets. Only `/api/*` is gated.

**Known limitation:** the bundled dashboard does not yet inject a token into its
own `fetch` calls, so a token-gated server is currently driven by external
callers (curl/scripts) or a loopback UI. Wiring the UI to a token is a small
follow-up; it was out of scope for the contract/hardening pass.

## 3. Flow portability — one guarded writer

Import (text/URL/file), URL fetch, and the create API all funnel through
`writeProjectFlowDefinition`, so the guarantees are defined once:

- schema validation (the full Flow schema, same as the loader),
- secret refusal (`scanTextForSecrets` over the canonical YAML — a shared flow
  must not smuggle a live key),
- control-char + 256 KB size guard,
- overwrite policy (replace an existing *project* flow only with `overwrite`;
  shadowing a builtin is always allowed, mirroring `fork`),
- atomic write (tmpfile + rename, `0600`), path-guarded inside
  `.vibestrate/flows/` (the id schema `[a-z][a-z0-9-]*` already blocks
  traversal; the `isPathInside` check is belt-and-suspenders).

**SSRF:** URL imports are `http(s)`-only and the resolved host must not be a
private/loopback address (`isBlockedIp` + DNS lookup, fail-closed on resolution
error). The HTTP API always enforces this. The CLI's `vibe flows import <url>`
sets `allowPrivateHosts` because the user typed the address — but the API never
exposes that escape hatch.

**Why no server-side file-path import over HTTP:** the API accepts `{ yaml }`
or `{ url }`, never a local path — reading arbitrary local files over HTTP is
exactly the capability we don't want. File-path import is CLI-only.

## 4. What was explicitly *not* built

- No new API framework — Fastify, detached-spawn, SSE, and structured
  `RunSpec` payloads already existed. This phase is a version prefix + thin
  auth + portability endpoints + docs.
- No remote/cloud exposure beyond the opt-in `--host` + token. Still
  local-first by default.
- No browsable Flows Hub yet — single-flow import/export is the first slice
  (`roadmap-and-sequencing.md` §5); the curated index lands later.
