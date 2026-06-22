# Design: Flows Hub Publish

Status: **approved, pre-implementation** · Branch: `feat/hub-publish` · Date: 2026-06-22

Closes the last open verb of the Flows Hub. Today the hub is read-only from the
client: `vibe flows hub list` / `install` pull from the hosted service at
`vibestrate.com/api/hub`. This adds **publish** - the write verb - so a project
flow can be pushed to the public registry.

The server side already exists and is tested
(`vibestrate-marketing/registry/` + `vibestrate-marketing/functions/api/hub/publish.ts`).
This spec is the **client** (CLI + dashboard + local-server proxy) built to that
real contract. It supersedes the `gh`-PR / `meta.json` model in
`docs/design/flows-hub.md`, which predates the hosted service.

---

## 1. The server contract (authoritative - read from the server code)

Public edge: `POST https://vibestrate.com/api/hub/publish`
(`vibestrate-marketing/functions/api/hub/publish.ts`).

- **Auth**: `Authorization: Bearer <github-token>`. The edge verifies the token
  against `https://api.github.com/user` and resolves the lowercased GitHub
  login. That login **is** the publisher handle; the token never travels past
  the edge.
- **Request body** (JSON, <= 512 KB): `{ ref: string, content: string }`. Nothing
  else. The edge relays the body verbatim to the private registry worker.
- **`ref`** = `[handle@]name[:version]` (`vibestrate-marketing/registry/src/refs.ts`):
  - Community publish: `<handle>@<name>:<X.Y.Z>`. The worker enforces
    `handle === your-github-login` (else 403). `handle` is a GitHub-style slug.
  - `name`: 2-40 chars, `^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$` (must start AND end
    alphanumeric).
  - `version`: a **concrete** semver `^\d{1,9}\.\d{1,9}\.\d{1,9}$`. `latest` is
    rejected (400).
  - Bare-name (no `handle@`) = a *verified* flow; maintainer-only (403 for
    everyone else). The client never publishes bare-name in v1.
- **`content`** = the flow YAML. Metadata (summary, tags, steps) is
  **server-derived** by the registry's `scanFlow` scanner; the client sends
  none.
- **Response status codes** (from `registry/src/index.ts::handlePublish` + the edge):
  - `201` success: `{ ok, ref, version, sha256, verified, diagnosis }`
  - `400` bad ref, bad JSON, non-concrete version, or `ref`/`content` missing
  - `401` missing/invalid GitHub token (edge) or missing actor identity (worker)
  - `403` publishing under a handle that isn't yours, or a verified flow as a
    non-admin
  - `409` that exact `name:version` already exists - **versions are immutable**
  - `413` payload > 512 KB
  - `422` scanner **rejected** the flow: `{ error, diagnosis }` (diagnosis has
    redacted findings)
  - `429` rate/quota: per-IP (edge), per-publisher daily (60/day), or
    per-handle flow quota (100)
  - A scanner verdict of `flagged` (not `rejected`) still returns `201` with
    warnings in `diagnosis` - the flow publishes, surfaced with its findings.

This contract is **fixed by the deployed server**; the client must match it, not
negotiate it.

### 1a. The server is NOT a secret backstop (load-bearing)

Verified in `vibestrate-marketing/registry/src/scanner.ts`: the secret rules
(`secret.aws-key`, `secret.private-key`, `secret.token`) are severity **`high`**,
and the verdict logic 422-**rejects only `critical`** (`scanner.ts:414`); `high`
maps to **`flagged`**, which still publishes (`201`). **So a flow carrying a live
token is published, not blocked, server-side.** The client refusal is therefore
the **sole** control that prevents a secret from leaving the machine - it is not
belt-and-braces. Two consequences drive the design below:

- The client secret scan must not be weaker than the server's. The client's
  `scanTextForSecrets` (`diff-service.ts:77-89`) misses generic `sk-[A-Za-z0-9]{32,}`
  and short `github_pat_`, which the server's `secret.token` regex *does* match.
  We align the client patterns to the server's so the two never disagree in the
  wrong direction.
- The realistic leak is not a vendor token at all: a flow's free-text
  `prompt`/`run`/`instructions` routinely contains **absolute paths that embed
  the user's OS username and home-dir layout** (`/Users/<name>/...`). Publishing
  that to a public, immutable registry leaks it permanently. No scanner on either
  side catches it. Publish must surface it before the irreversible write.

---

## 2. Architecture

Mirror the existing read path's trust model exactly.

```
CLI:  vibe flows hub publish <flow-id> --version X.Y.Z [--name <slug>] [--handle <gh-login>] [--yes]
        -> resolve token from env-ref (CLI's own process env)
        -> publishFlow()  ──────────────────────────────►  vibestrate.com/api/hub/publish

UI:   FlowsPage Hub section "Publish" control
        -> POST /api/flows/hub/publish   (LOCAL server; fail-closed requireToken())
        -> server resolves token from ITS process env-ref
        -> publishFlow()  ──────────────────────────────►  vibestrate.com/api/hub/publish
```

The bearer (GitHub) token lives **only in the CLI/server process env**, as an
env-ref (`env:VIBESTRATE_HUB_TOKEN`), resolved at call time via the existing
`resolveSecret` (`src/notifications/gateways/secret-resolver.ts`). The browser
**never** holds the token - it calls the local server, which holds the env-ref.
This is the same browser -> local-server -> hub topology the read path uses, and
it satisfies the env-ref-only invariant structurally.

### Components

1. **`publishFlow()`** - new in `src/flows/hub/hub-client.ts`. The single
   client. Signature:
   ```ts
   export async function publishFlow(input: {
     content: string;          // the flow YAML to publish
     ref: string;              // "<handle>@<name>:<X.Y.Z>"
     token: string;            // already-resolved bearer (caller resolves the env-ref)
     baseUrl?: string;
     fetchImpl?: FetchImpl;
   }): Promise<HubPublishResult>;
   ```
   - **Pre-egress leak gate** (see §2a) on `content` *before* any network call:
     `validateFlowText` for hard refusal on known token shapes + control chars +
     oversize + schema; plus the publish preflight that flags home-dir paths,
     `env:` refs, and `user:pass@` URLs. The hard-refuse cases never transmit.
   - **Token-host pin (token-exfil guard).** The `Authorization: Bearer <token>`
     header is attached **only** when the resolved `baseUrl` origin **equals**
     `DEFAULT_HUB_BASE_URL`. A non-default origin (a fat-fingered or
     flow-supplied `--base-url`) is **refused before the token is attached** -
     never "send the PAT and see what happens". The POST itself goes through an
     SSRF-guarded fetch (the read path's `fetchGuardedText` posture), so
     `--base-url http://169.254.169.254/...` cannot turn publish into a
     token-bearing metadata probe.
   - POST `{ ref, content }` with a bounded timeout, using the **exact**
     http-api-provider structure (`http-api-provider.ts:187-211`): a single
     try/catch wrapping fetch + `res.text()` + parse, where **every** throw path
     interpolates `redact(x, [token])`. The token is never interpolated into the
     URL and never `console.*`-logged.
   - **Strict success**: treat `status === 201` as the only success (not
     `res.ok`, which is any 2xx; not `body.ok` alone). Parse the body with a
     try/catch -> on non-JSON (a Cloudflare HTML 5xx) return
     `{ ok:false, status, reason:"non-JSON response from hub" }`, never throw.
     `diagnosis` is **optional on every status** including 422 (edge-origin
     401/413/429 bodies are `{error}`-only - see §1).
   - **Idempotency on 409** (immutable-version replay): a 409 may mean a prior
     POST (or a timed-out one) already stored *this exact content*. On 409, pull
     the existing version's `sha256` (reuse `pullHubFlow`) and compare to
     `sha256Hex(content)`. **Match -> report idempotent success** ("this exact
     version already exists"), do **not** advise a bump. Differ -> a genuine
     collision; advise bumping the version.
   - **All errors run through `redact(err, [token])`** (`secret-resolver.ts`).
   - Returns a discriminated result:
     ```ts
     type HubPublishResult =
       | { ok: true; ref: string; version: string; sha256: string;
           verified: boolean; diagnosis: HubDiagnosis;
           alreadyExisted?: boolean }                       // 201, or 409-with-matching-sha
       | { ok: false; status: number; reason: string;
           diagnosis?: HubDiagnosis };                      // everything else
     ```
   - Ref construction is the **caller's** job via `buildPublishRef` (below), not
     `publishFlow`'s - `publishFlow` takes a fully-formed `ref` so the
     building/validation logic is tested once in a pure helper and the network
     function stays thin.

2. **`buildPublishRef()`** - pure helper (in `hub-client.ts` or a sibling),
   unit-tested in isolation:
   ```ts
   buildPublishRef({ handle, name, version }):
     | { ok: true; ref: string }
     | { ok: false; reason: string }
   ```
   The **sole** constructor of a publish `ref` - no raw ref ever reaches
   `publishFlow` from anywhere else. Validates:
   - `name` against the hub's `NAME_RE` **copied/imported verbatim**
     (`^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$`, 2-40 chars, must end alphanumeric) -
     not an approximation; the end-anchor is easy to get wrong. This catches the
     flow-id -> hub-name gap (flow-id allows 1-char, trailing hyphen, up to 80
     chars; the hub does not) with `--name` as the escape hatch.
   - `version` against the concrete semver regex (`latest` rejected).
   - `handle` **required, non-empty**, against the handle regex. A missing handle
     must **fail fast**, never fall through to a bare-name ref (which the worker
     treats as a maintainer-only *verified* publish, `index.ts:241`).
   - **Reject `@` or `:` inside `name` or `handle`** so `--name evil@thing` or a
     crafted handle cannot smuggle ref structure / a different identity.
   Returns `"<handle>@<name>:<version>"` or a precise failure reason.

3. **CLI** - `vibe flows hub publish <flow-id>` in `src/cli/commands/flows/`
   (sibling of `runHubList`/`runHubInstall`):
   - Resolve the flow YAML via `exportFlowYaml({ projectRoot, flowId })`
     (`flow-portability.ts`) - works for both project and builtin flows.
   - `--version X.Y.Z` (required), `--name <slug>` (default = flow id),
     `--handle <gh-login>` (or `hub.handle` config; required - see Decisions),
     `--base-url`, `--yes` (skip confirm), `--json`.
   - Resolve the token via `resolveSecret(hub.tokenRef ?? "env:VIBESTRATE_HUB_TOKEN")`.
     If unset -> fail fast with the env-var name (never the value), like the
     http-api provider does.
   - **Explicit confirm** before the POST (unless `--yes`): print the ref, the
     name, the version, the byte size, and "this publishes a public, immutable
     version to vibestrate.com". No auto-publish, ever.
   - On `201 flagged`, print the warnings. On `422`, print the rejected
     findings. On `409`, use the sha-compare result: identical content ->
     "already published (this exact version)"; different content -> "bump the
     version". On `403`, surface the server message verbatim (it names their
     correct login).

4. **Local server route** - `POST /api/flows/hub/publish` in
   `src/server/routes/flows.ts` (sibling of the existing
   `POST /api/flows/hub/install`):
   - **Fail-closed**: `requireToken()` (403 without `VIBESTRATE_API_TOKEN`) -
     the same guard the git/integration write routes use. A tokenless local API
     must not expose an authenticated outbound publish.
   - Body schema (zod): `{ flowId, version, name?, handle?, baseUrl?,
     confirm: z.literal("publish") }`. The **confirm literal** is required
     server-side (the pattern `git.ts` uses with `z.literal("apply-merge")`) so a
     stray local POST cannot publish without a deliberate two-step - the route
     has no implicit `--yes`. `overwrite` is **not** accepted (versions are
     immutable; publish is add-only).
   - Resolve the flow YAML + the hub token (`env:VIBESTRATE_HUB_TOKEN`) from the
     **server's** env, build the ref, call `publishFlow()`, relay the typed
     result as JSON with the upstream status mapped sensibly (e.g. a hub `409`
     surfaces as a 409 to the dashboard).
   - If the server's hub token env-ref is unset -> a clear 400/412 ("set
     VIBESTRATE_HUB_TOKEN in the `vibe ui` process env"), never a 500.

5. **Dashboard** - `api.publishHubFlow()` in `src/ui/lib/api.ts` + a "Publish"
   affordance in `FlowsPage`'s Hub section (`src/ui/app/routes/FlowsPage.tsx`):
   a small form (pick a project flow, name prefilled from id, version field,
   handle field) + a confirm step that restates "public + immutable", then shows
   the result (ref/version/sha256, or the rejected findings). UI<->CLI parity:
   everything the CLI can do, the dashboard can too.

---

## 2a. Publish leak-preflight (the client owns the secret guarantee)

Because the server flags-but-publishes secrets (§1a), the client is the only line.
A two-tier preflight runs on the exported YAML **before** any network call and
**before** the confirm step renders:

- **Hard refuse (no transmission, ever):** `validateFlowText` - known
  high-precision token shapes, control chars, oversize, schema failure. We
  **extend** the client secret pattern set to match the server's `secret.token`
  rule (generic `sk-[A-Za-z0-9]{32,}`, short `github_pat_`) so the client is
  never weaker than the server. Refusal, not redaction - we never silently strip
  and publish.
- **Warn + show in the confirm (publish is allowed, but surfaced):** a
  publish-specific lint that flags, with the exact line:
  - absolute paths that embed the user's identity - match `os.homedir()` and the
    `/Users/<x>`, `/home/<x>`, `C:\Users\<x>` shapes (the most likely real leak);
  - `env:NAME` refs (a flow referencing a secret env var is legitimate, but the
    publisher should *see* it going public);
  - `user:pass@host` URLs.

  The confirm step **renders the diagnosis the server will return** (reuse the
  read path's diagnosis surfacing) so the user sees "this will publish *flagged*
  with: embeds an absolute path under your home dir" **before** the irreversible
  write - not after. `--yes` (CLI) / the confirm literal (route) is the only
  bypass of the *interactive* step; the hard-refuse tier is never bypassable.

This is the §1 BLOCKER fix: the client renders exactly what goes public, refuses
known secrets outright, and forces an informed choice on path/identity leaks that
no scanner catches.

---

## 3. Decisions (settled in brainstorming)

| Decision | Choice | Why |
|---|---|---|
| Handle source | **Explicit** `--handle` / `hub.handle` config (required) | No new `api.github.com/user` call in core. The server's 403 names the correct login, so a wrong handle is self-correcting and surfaced verbatim. Token->handle auto-resolve is a deferred convenience. |
| Token storage | **env-ref config** `hub.tokenRef`, default `env:VIBESTRATE_HUB_TOKEN`, resolved via `resolveSecret` | Matches the provider/OTel secret pattern; the literal token is never stored, only the env-ref. |
| Broker gating | **Not** routed through the Action Broker | The broker is run-scoped (gates *agent* actions mid-run). Publish is a deliberate user action with no run context. Guard = explicit confirm + fail-closed route auth + pre-egress secret refusal. We will **not** claim "broker-gated". |
| Live smoke | **Fake-fetch unit tests** against the worker's exact responses; optional local `wrangler dev` smoke | A real publish is an immutable public write to the production registry. A real publish happens only with explicit user go-ahead, under a throwaway name/version. |
| CLI placement | `vibe flows hub publish` | Consistent with `vibe flows hub list` / `install`. |

---

## 4. Safety / security posture

- **Pre-egress leak gate** (§2a): hard refusal on known token shapes (client
  patterns aligned to the server's) + warn-and-show on home-dir/identity paths,
  `env:` refs, and `user:pass@` URLs. Scoped, honest guarantee: **known
  high-precision vendor token shapes never leave the machine**; path/identity
  leaks are surfaced for an informed choice (no scanner, here or on the server,
  can catch every one).
- **Token confinement + host pin**: resolved from an env-ref at call time; never
  stored inline, never sent to the browser, never logged. The `Authorization`
  header is attached **only** for the `vibestrate.com` origin - a non-default
  `--base-url` is refused before the token is attached (token-exfil guard). Every
  error path goes through `redact([token])` using the http-api-provider's exact
  try/catch structure, so a thrown zod/network error cannot leak the PAT.
- **Fail-closed route + confirm literal**: the local `POST /api/flows/hub/publish`
  refuses without `VIBESTRATE_API_TOKEN` (identical to git-merge/integrate-finish)
  **and** requires `confirm: "publish"` server-side, so a stray local POST cannot
  publish.
- **No auto-publish**: explicit confirm (CLI) / confirm step + literal (UI/route).
  `--yes` bypasses only the *interactive* step, never the hard-refuse tier, and an
  unset token still fails fast.
- **Honest claims**: the integrity sha256 is transport-level only (same caveat as
  the read path); not supply-chain provenance. We do **not** claim broker gating
  (publish has no run context). We **explicitly do not** claim the server blocks
  secrets - it flags-and-publishes them (§1a); the client refusal is the only
  thing that prevents transmission, and that guarantee is scoped to known token
  shapes, not arbitrary content.
- **Local-first invariant intact**: publish is opt-in, explicit, flows-only.
  Runs/prompts/code never touch the hub. The tool stays fully functional offline.

---

## 5. Testing

- **`buildPublishRef`** - pure unit tests: valid community ref; invalid name
  (1-char, trailing hyphen, >40 chars, uppercase); invalid version (`latest`,
  `1.2`, non-numeric); **missing/empty handle fails fast** (no bare-name
  fallthrough); **`@`/`:` in name or handle is rejected** (no smuggling).
- **`publishFlow`** - injected `fetchImpl` returning each status:
  - worker-origin 201 accepted, 201 flagged-with-findings, 400, 403, 409, 422
    (`{error,diagnosis}`);
  - **edge-origin 401/413/429 with `{error}`-only bodies** (no `diagnosis`) -
    assert the parser tolerates a missing `diagnosis`;
  - **a Cloudflare HTML 5xx (non-JSON)** -> `{ok:false, reason:"non-JSON..."}`,
    no throw;
  - assert success is gated on `status===201`, not `res.ok`.
- **Token-host pin** - `baseUrl` set to a non-`vibestrate.com` origin: assert the
  POST is refused and the `Authorization` header is **never** sent (spy on the
  request init).
- **Pre-egress hard refusal** - flow YAML with a planted token shape (incl. the
  newly-aligned `sk-...` / short `github_pat_`): assert refusal **before**
  `fetchImpl` is called (zero calls).
- **Leak warn tier** - flow YAML with an `/Users/<name>/...` path and an `env:X`
  ref: assert the preflight surfaces both in the confirm payload but does **not**
  refuse.
- **409 idempotency** - 409 then a `pullHubFlow` whose `sha256` matches the
  content -> `{ok:true, alreadyExisted:true}`; sha mismatch -> `{ok:false}` with
  "bump the version".
- **Redaction depth** - force a thrown **zod** error and a thrown **network**
  error mid-call; assert the token is absent from `err.message` **and**
  `err.stack` and from the returned `reason`, not just the success result.
- **CLI** - resolves the flow, builds the ref, honors `--yes`/confirm, prints the
  right thing per status; token-unset fails fast naming the env var, no network
  call.
- **Server route** - fail-closed without `VIBESTRATE_API_TOKEN` (403); **missing
  `confirm:"publish"` literal -> 400** (no publish); hub token env-ref unset ->
  clean 400/412 (never 500); happy path relays the upstream result; `overwrite`
  not accepted.
- No test performs a real network publish.

---

## 6. Out of scope (YAGNI)

- The `gh`-PR-to-index-repo path and any local `meta.json` (server derives meta).
- Client-side tags/license/description fields (server-derived from content).
- A published-ref sidecar or `vibe flows outdated`-for-published tracking.
- Token -> handle auto-resolution via `api.github.com/user` (deferred convenience).
- `update`/`outdated`/`star` verbs (separate, not this slice).
- Any change to the read path or the server side.

---

## 7. Files touched

- `src/flows/hub/hub-client.ts` - add `publishFlow` (token-host pin + redaction
  + 409 sha-compare), `buildPublishRef` (sole, hardened ref constructor), the
  publish preflight (warn lint), the publish result + diagnosis types.
- `src/core/diff-service.ts` (or wherever `SECRET_CONTENT_PATTERNS` live) - add
  the generic `sk-...` / short `github_pat_` shapes so the client scan is never
  weaker than the server's `secret.token` rule.
- `src/cli/commands/flows/hub.ts` + `index.ts` - `runHubPublish` + command wiring.
- `src/server/routes/flows.ts` - `POST /api/flows/hub/publish` (fail-closed).
- `src/ui/lib/api.ts` + `src/ui/lib/types.ts` - `publishHubFlow` + result type.
- `src/ui/app/routes/FlowsPage.tsx` - publish affordance in the Hub section.
- Tests alongside each.
- Docs: `docs/content/` hub page + `CHANGELOG.md` + version bump; `docs/TODO.md`
  tick the Hub Publish line.

---

## 8. Tier-2 review

This is outward-facing (public registry), auth-bearing (GitHub token), and
secret-adjacent.

- **Spec review: DONE** (2026-06-22, independent Opus-4.8 fresh-context agent).
  Nine findings, all accepted: the BLOCKER (server flags-not-rejects secrets ->
  client is the sole guard + home-dir/identity leak), two HIGHs (token-exfil via
  unpinned `--base-url`; PAT leak before the redact wrapper), and six
  MEDIUM/LOW. All folded into §1a, §2, §2a, §3, §4, §5 above.
- **Diff review: pending** - a second independent Opus-4.8 adversarial pass runs
  on the implementation diff before merge.
