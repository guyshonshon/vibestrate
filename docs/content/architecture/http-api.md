---
title: HTTP API
description: The local dashboard API, a versioned /api/v1 contract with optional bearer-token auth and the flow import, export, and create endpoints.
slug: architecture/http-api
---

## In simple words

`vibe ui` starts a local server (default `http://127.0.0.1:4317`) that backs the dashboard. The same endpoints are a stable, scriptable contract.

```bash
curl http://127.0.0.1:4317/api/v1/runs
```

<div class="docs-callout warn">

**It binds to loopback.** The server is reachable from this machine, not from your network, and write endpoints cross the same Action Broker the rest of the product does. A policy denying file writes stops an HTTP caller exactly as it stops the UI.

</div>

<div class="docs-callout tip">

**Tip.** Versioned paths (`/api/v1/...`) are rewritten to their unversioned form internally, so both work. Prefer the versioned form in scripts you intend to keep.

</div>

## What the API is for

<div class="docs-cards">

**Driving a run from code**
Start one, poll it, read the verdict, all without a browser.

**CI**
Kick a run from a pipeline and act on the result.

**Your own surface**
The dashboard is a client of this API, not a privileged path around it.

**Reading the record**
Runs, decisions, artifacts and the ledger.

</div>

<div class="docs-callout">

**Did you know?** "Can I automate that?" almost always has the answer yes - the button you are looking at is calling an endpoint you can call.

</div>


## Going deeper

### Endpoints at a glance

Well over 250 routes are registered. Four areas are described in full below; the rest follow the same shape, one route module per domain under `src/server/routes/`.

```text
GET  /api/v1/health

GET  /api/v1/flows
GET  /api/v1/flows/:flowId/export
POST /api/v1/flows/import
POST /api/v1/flows
POST /api/v1/flows/draft
POST /api/v1/crews/draft

GET  /api/setup/doctor
POST /api/setup/doctor/fix
GET  /api/setup/status
POST /api/setup/init

GET  /api/integration/overview
POST /api/integration/advice
POST /api/integration/analyze
POST /api/integration/finish

GET  /api/supervisor/threads
POST /api/supervisor/threads/:threadId/turn
```

### Base URL and versioning

`/api/...` is what the bundled dashboard calls; `/api/v1/...` is the canonical contract for external callers.

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

A breaking payload change ships under a new prefix, while `/api/v1` keeps working for a deprecation window.

### Binding, origin and CSRF

The server binds loopback (`127.0.0.1`) by default, and refuses cross-origin requests from anything but `localhost`, `127.0.0.1` or the configured host; a malformed `Origin` is refused too. `--host` on `vibe ui` exposes it elsewhere, but a non-loopback bind **requires a token** or the server refuses to start.

State-changing methods additionally reject any request a browser marks `Sec-Fetch-Site: cross-site` or `cross-origin`, so a page in your browser cannot drive your local API. Non-browser clients such as `curl` omit that header and are unaffected. A destructive endpoint like snapshot prune still requires an explicit body, and never acts on an empty one.

### Authentication

Auth is **off by default** on a loopback bind (single-user, local-first). Setting `VIBESTRATE_API_TOKEN` turns it on: every `/api/*` request must then send `Authorization: Bearer <token>`, compared in constant time, and a missing or invalid token returns `401` with `WWW-Authenticate: Bearer`. Static UI assets and `/favicon.*` stay open.

The token is read from the environment only. It is never written to `project.yml`, artifacts, logs, or the UI.

```bash
# expose on the LAN, token-gated
export VIBESTRATE_API_TOKEN=$(openssl rand -hex 24)
vibe ui --host 0.0.0.0

# then call it with that token
AUTH="Authorization: Bearer $VIBESTRATE_API_TOKEN"
curl -H "$AUTH" http://<host>:4317/api/v1/flows
```

### Setup and doctor

These four back the dashboard's **Setup** page and are the machine-readable form of `vibe doctor` and `vibe init`.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/setup/doctor` | The health report on its own: findings with severity, whether each is fixable, and recommended next steps. |
| `POST` | `/api/setup/doctor/fix` | The repair pass behind `vibe doctor --fix` and the page's **Fix what's safe** button. Returns `{ applied, skipped, report }` - a freshly run report, so a caller renders the state *after* the repair. |
| `GET` | `/api/setup/status` | Whether `.vibestrate/` exists, whether the folder is a git repo, and the project name. What the onboarding screen gates on. |
| `POST` | `/api/setup/init` | Scaffold the project, the parity of `vibe init`. `{ gitInit: true }` creates the repository first; without that flag it never does. |

`GET /api/setup/summary` carries the doctor report **and** provider detection in one payload. Detection shells out to every known coding CLI, far too heavy for a panel that re-checks after each repair - which is why `/api/setup/doctor` exists separately.

The fix pass is deliberately narrow: it creates missing `.vibestrate/` subdirectories, restores bundled role files that are absent, and makes two writes to `project.yml` - adopting a detected provider and pointing every profile at it, and filling in the validation commands it detected. Each fires only when that part of the config is empty, so an existing provider set is never replaced and existing validate commands never overwritten. It never edits your source, works under the server's own project root, and takes no input from the request, so there is nothing in it to aim elsewhere.

### Flow portability endpoints

Flows are portable because they name **Seats** - what kind of worker a step needs, not which model fills it - rather than your local Roles or Providers. One exported from another project imports cleanly and resolves against whatever Crew you have.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/flows/:flowId/export` | Export a flow as canonical YAML. `?format=yaml` returns the raw file as a download; default is JSON `{ flowId, source, yaml }`. |
| `POST` | `/api/v1/flows/import` | Import one flow from `{ yaml }` **or** `{ url }` (exactly one) plus optional `overwrite`. |
| `POST` | `/api/v1/flows` | Write a brand-new project flow from `{ flow: <FlowDefinition>, overwrite? }`. |

All three write the flow's own `flow.yml` under `.vibestrate/flows/`, through one guarded path:

- **Schema validation** against the full Flow schema.
- **Secret refusal** - a flow carrying a high-precision token shape (AWS, GitHub, Stripe, Anthropic, PEM and others) is rejected, not written.
- **Control-character and size guard** - NUL and disallowed control chars are refused; imports are capped at 256 KB.
- **SSRF guard** on URL imports - `http(s)` only, and the resolved host must not be private or loopback. (`vibe flows import <url>` trusts a user-typed URL and skips the host block; the HTTP API never does.)
- **Overwrite policy** - an existing *project* flow is replaced only with `overwrite: true`; a builtin of the same id is always shadowable. New writes return `201`, replacements `200`.
- **Action Broker gate** - each of them, plus fork, the builder's patch and `DELETE`, raises a `file.write` the broker decides on.

`DELETE` rides the same kind on purpose - losing a flow is the same authority over the same path as overwriting it. A refusal comes back as `403` with the broker's reasons, not a thrown error. Because flow edits happen outside any run, the evidence lands in `runs/flows/actions.ndjson`, tagged with which writer it was (`flow-import`, `flow-create`, `flow-fork`, `flow-patch`, `flow-delete`); a write that fails after being allowed still records its failure, so no decision sits in the log without an outcome.

CLI equivalents: `vibe flows export <id> [--out file]` and `vibe flows import <file-or-url> [--overwrite]`. In the dashboard, the **Flows** page carries **Import** and **New flow**, and **Export** sits in each card's menu.

### Drafting a Flow or a Crew

Two endpoints turn an English description into an editable draft.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/v1/flows/draft` | Draft a flow from `{ description, crewId? }`. Returns `{ draft }`: the `FlowDefinition`, its canonical YAML, the rationale, seat `coverage` against that crew, `targetPath`, and `exists`. |
| `POST` | `/api/v1/crews/draft` | Draft a crew from `{ description }`. Returns `{ draft }`: the `crews.<id>` block, its YAML, one `roleFiles` entry per role, the rationale, `problems`, and `exists`. |

What holds for both:

- **Draft only.** Adopting a flow is a separate call to `POST /api/v1/flows` or `/api/v1/flows/import`; adopting a crew is the owner saving each `roleFiles` entry and *then* editing `project.yml`, in that order - a crew block whose roles point at files nobody wrote fails when the config loads.
- **Redacted in, secret-scanned out.** The description is redacted before it reaches the model, and a draft carrying a secret shape is refused rather than redacted.
- **Bounded input.** `description` is capped at 1000 characters, rejected with `400` past that before a provider is resolved. Bad input and a refused draft return `400` with the reason; anything else is a `500` with the path stripped out.
- **No network of ours.** Any currency claim in the response comes from the agent's own web tool inside its provider CLI. Vibestrate opens no socket here, so an agent without one reports the gap in `currency.unverified`.
- `crews/draft` needs an initialized project - `404` otherwise.

CLI equivalents: `vibe flows draft "<description>" [--crew <id>]` and `vibe crew draft "<description>"`. In the dashboard, each has its own panel: **Draft a flow** on the **Flows** page, **Draft a crew** on the **Crew** page.

### Supervisor turns (SSE over POST)

The supervisor's conversation endpoints are inert storage - list threads, open one, append a message - except the turn, which is the only one that reaches a model.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/supervisor/threads` | List threads. With `?runId=` the run's thread; without it, the project thread. |
| `POST` | `/api/supervisor/threads` | Open a thread from `{ runId? }`. |
| `GET` | `/api/supervisor/threads/:threadId` | Read one thread in full. |
| `POST` | `/api/supervisor/threads/:threadId/messages` | Append the user's message from `{ text }`. |
| `POST` | `/api/supervisor/threads/:threadId/turn` | Take a turn, streamed as it happens. |
| `GET` / `POST` | `/api/supervisor/pause` | Read or set the kill switch. No model on this path. |

The turn is **SSE over POST**, not `GET`: it carries the user's message, up to 20 000 characters, so it cannot go in a query string, and `EventSource` has no way to send a body. The framing is ordinary SSE (`event:` then `data:`), so a client reads it over `fetch(...).body`.

The body is `{ text, effort?, profileId? }`. An effort the chosen provider does not have is refused with `400` before any provider is resolved, and an unknown thread is `404`. Both checks run before the stream opens, because a hijacked reply can no longer carry a status code.

Seven event kinds stream, each under its own SSE name and also carrying `kind`:

| Event | What it carries |
|---|---|
| `message` | The user's message as persisted, with id and time. |
| `phase` | Which leg runs: routing, acting or answering. |
| `thinking` | Provider reasoning, where the provider exposes it. |
| `tool` | One tool or sub-agent the provider invoked. |
| `answer` | Answer prose as it is written. |
| `done` | Terminal. Carries the stored message and the thread. |
| `error` | Terminal, nothing was answered. |

`thinking` and `tool` appear only when the provider actually emits them, and nothing is substituted - an invented reasoning trace would be worse than honest silence. Treat `done.message.text` as authoritative and replace your streamed buffer with it, because an executed action's reply is prepended when the message is written.

**Stopping is aborting the fetch.** There is no stop endpoint. Closing the socket aborts the turn's signal, which sends `SIGTERM` to the process group of whichever provider CLI is in flight and records a stopped message in the thread. What that cannot retract is an action that already ran - a created task or a started run outlives the request and is recorded as having happened. A heartbeat comment goes out every 15 seconds so idle proxies do not close the stream.

### Integration: merge advice and guided merge-to-main

These back the dashboard's **Source** page **Merge** tab.

`GET /api/integration/overview` returns the **cheap** per-run projection the tab lists: check lanes and branch topology per merge-ready run, with no dry-run preview and deliberately **no recommendation** - one computed blind to conflicts would mislead. Fast read-only git ops, safe per page load.

`POST /api/integration/analyze` (`{ runId }`) runs the **optional** deeper pass: a local provider reads the run's byte-capped, redacted diff against main and returns a semantic-risk narrative, never a merge verdict. It is broker-gated through the assist primitive, the same exposure class as `POST /api/consult` - it spawns a local provider, creates no run, and writes only a cached markdown artifact under the run's own directory. Secret-like files are suppressed and secret-shaped tokens redacted before the provider sees the diff. The deterministic recommendation is computed elsewhere and never changed by this pass. CLI: `vibe integrate analyze <runId>`.

`POST /api/integration/advice` (`{ runIds? }`) returns **read-only, deterministic** advice for the selected (or all) merge-ready runs, carrying:

- risk flags from the run's assurance lanes, including the honest "nothing was actually checked" case;
- the dry-run conflict report;
- the run branch's topology against main;
- a recommendation - `finish-now`, `stage-on-integration-branch`, or `resolve-first`.

It contains no model output and mutates no branch. It wraps `/api/integration/preview`, so it costs a scratch-worktree dry run per call - call it on demand rather than per list row. CLI: `vibe integrate advise [runIds...] [--json]`.

`POST /api/integration/finish` (`{ integrationBranch, confirm: "merge-to-main" }`) merges a **complete, clean** integration branch into your main branch, locally, never pushed. It refuses partial integrations where the apply stopped at a conflict, dirty working trees, merge conflicts (aborted cleanly), any `git.merge` action policy set to `deny` or `require_approval`, and an integration branch whose tip changed since `apply` recorded it - you merge exactly what you reviewed. Preconditions are re-checked under a lock immediately before the merge.

It is **fail-closed**: it refuses outright (`403`) unless `VIBESTRATE_API_TOKEN` is set. A tokenless local API is reachable by any local process, and the `confirm` body token only guards against *accidental* invocation - it is not authorization.

The default human path is the CLI: `vibe integrate finish <branch>`, which requires the typed confirmation `merge-to-main`, runs only from your terminal, and refuses to move your `HEAD`.
