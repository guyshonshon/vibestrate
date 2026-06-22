# Hub Publish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `publish` write verb to the Flows Hub client (CLI + dashboard + local-server proxy) so a project flow can be pushed to the existing hosted registry at `vibestrate.com/api/hub/publish`.

**Architecture:** Mirror the read path's browser -> local-server -> hub topology. A pure ref-builder + leak-preflight (`publish-guards.ts`), a thin token-bearing network client (`publishFlow` in `hub-client.ts`), a CLI command, a fail-closed server route with a confirm literal, and a dashboard form. The GitHub token lives only in the CLI/server process env (resolved from an env-ref) and is attached only for the `vibestrate.com` origin.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), Zod, Vitest, Commander (CLI), Fastify (server), React (dashboard). Node 20+.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-06-22-hub-publish-design.md` is authoritative. Every task implements part of it.
- **Server contract is fixed** (deployed): `POST https://vibestrate.com/api/hub/publish`, `Authorization: Bearer <github-token>`, body `{ ref, content }` (<=512KB), success is **`201` only**. Codes: 400/401/403/409/413/422/429. See spec §1.
- **The client is the sole secret guard** - the server flags-but-publishes secrets (spec §1a). Hard-refuse known token shapes before egress; warn on home-dir/identity leaks.
- **Token-host pin**: attach `Authorization` only when the base origin equals `https://vibestrate.com`. Refuse a non-default origin before attaching the token.
- **env-ref only**: the token is read from `process.env.VIBESTRATE_HUB_TOKEN` via `resolveSecret("env:VIBESTRATE_HUB_TOKEN")`. Never stored inline, never sent to the browser, never logged. A configurable env-var *name* is deferred (out of scope).
- **Fail-closed**: the local route refuses without `VIBESTRATE_API_TOKEN` and requires `confirm: "publish"`.
- **Redaction**: every error path runs through `redact(x, [token])` (`src/notifications/gateways/secret-resolver.ts`).
- **Style:** no em dashes (use `-`), no emojis anywhere, keep the term "Provider". TDD, frequent commits.
- **Verification before "done":** `pnpm typecheck && pnpm test && pnpm build` all green.

---

### Task 1: Ref builder + leak preflight (pure helpers, no network)

**Files:**
- Create: `src/flows/hub/publish-guards.ts`
- Test: `src/flows/hub/publish-guards.test.ts`

**Interfaces:**
- Consumes: nothing (pure). Mirrors the hub `NAME_RE`/semver rules from `vibestrate-marketing/registry/src/refs.ts` (copied verbatim, not approximated).
- Produces:
  - `buildPublishRef(input: { handle: string; name: string; version: string }): { ok: true; ref: string } | { ok: false; reason: string }`
  - `assertNoHardSecrets(content: string): string[]` - returns refusal reasons (empty = clean). The never-bypassable tier.
  - `collectPublishWarnings(content: string): string[]` - returns warn strings (home-dir/identity, `env:` refs, `user:pass@` URLs).
  - `runPublishPreflight(content: string): { ok: false; refusals: string[] } | { ok: true; warnings: string[] }`

- [ ] **Step 1: Write the failing tests**

```ts
// src/flows/hub/publish-guards.test.ts
import { describe, it, expect } from "vitest";
import {
  buildPublishRef,
  assertNoHardSecrets,
  collectPublishWarnings,
  runPublishPreflight,
} from "./publish-guards.js";

describe("buildPublishRef", () => {
  it("builds a valid community ref", () => {
    expect(buildPublishRef({ handle: "guy", name: "deep-refactor", version: "1.2.0" }))
      .toEqual({ ok: true, ref: "guy@deep-refactor:1.2.0" });
  });
  it("rejects a 1-char name (hub min is 2)", () => {
    const r = buildPublishRef({ handle: "guy", name: "a", version: "1.0.0" });
    expect(r.ok).toBe(false);
  });
  it("rejects a trailing-hyphen name (hub requires alnum end)", () => {
    expect(buildPublishRef({ handle: "guy", name: "my-flow-", version: "1.0.0" }).ok).toBe(false);
  });
  it("rejects a name over 40 chars", () => {
    expect(buildPublishRef({ handle: "guy", name: "a".repeat(41), version: "1.0.0" }).ok).toBe(false);
  });
  it("rejects uppercase in the name", () => {
    expect(buildPublishRef({ handle: "guy", name: "MyFlow", version: "1.0.0" }).ok).toBe(false);
  });
  it("rejects 'latest' and partial semver", () => {
    expect(buildPublishRef({ handle: "guy", name: "x-flow", version: "latest" }).ok).toBe(false);
    expect(buildPublishRef({ handle: "guy", name: "x-flow", version: "1.2" }).ok).toBe(false);
  });
  it("fails fast on an empty handle (no bare-name fallthrough)", () => {
    expect(buildPublishRef({ handle: "", name: "x-flow", version: "1.0.0" }).ok).toBe(false);
  });
  it("rejects '@' or ':' smuggled into name or handle", () => {
    expect(buildPublishRef({ handle: "guy", name: "x@evil", version: "1.0.0" }).ok).toBe(false);
    expect(buildPublishRef({ handle: "g:y", name: "x-flow", version: "1.0.0" }).ok).toBe(false);
  });
});

describe("assertNoHardSecrets", () => {
  it("refuses an AWS key (shared high-precision pattern)", () => {
    expect(assertNoHardSecrets("steps:\n  - run: AKIAABCDEFGHIJKLMNOP\n").length).toBeGreaterThan(0);
  });
  it("refuses a generic OpenAI sk- key the shared scan misses", () => {
    expect(assertNoHardSecrets(`token: sk-${"a".repeat(40)}\n`).length).toBeGreaterThan(0);
  });
  it("refuses a short github_pat the shared scan misses (server matches {22,})", () => {
    expect(assertNoHardSecrets(`pat: github_pat_${"a".repeat(30)}\n`).length).toBeGreaterThan(0);
  });
  it("passes a clean flow", () => {
    expect(assertNoHardSecrets("steps:\n  - run: echo hi\n")).toEqual([]);
  });
});

describe("collectPublishWarnings", () => {
  it("warns on an absolute home-dir path", () => {
    expect(collectPublishWarnings("prompt: open /Users/guy/Programming/secret\n").join(" "))
      .toMatch(/home|\/Users\//i);
  });
  it("warns on an env: ref", () => {
    expect(collectPublishWarnings("key: env:MY_SECRET\n").join(" ")).toMatch(/env:/);
  });
  it("warns on a user:pass@ URL", () => {
    expect(collectPublishWarnings("url: https://bob:hunter2@example.com\n").join(" ")).toMatch(/credential|user/i);
  });
  it("is silent on a clean flow", () => {
    expect(collectPublishWarnings("steps:\n  - run: echo hi\n")).toEqual([]);
  });
});

describe("runPublishPreflight", () => {
  it("refuses when a hard secret is present", () => {
    const r = runPublishPreflight("k: sk-" + "a".repeat(40));
    expect(r.ok).toBe(false);
  });
  it("passes with warnings on a path leak", () => {
    const r = runPublishPreflight("prompt: /Users/guy/x");
    expect(r).toEqual({ ok: true, warnings: expect.arrayContaining([expect.any(String)]) });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/flows/hub/publish-guards.test.ts`
Expected: FAIL - "Cannot find module './publish-guards.js'".

- [ ] **Step 3: Implement the helpers**

```ts
// src/flows/hub/publish-guards.ts
import os from "node:os";
import { scanTextForSecrets } from "../../core/diff-service.js";

// Hub grammar, copied VERBATIM from vibestrate-marketing/registry/src/refs.ts.
// Do not approximate - the alnum end-anchor and the 2-40 length are load-bearing.
const HUB_NAME_RE = /^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/;
const HUB_HANDLE_RE = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/;
const HUB_SEMVER_RE = /^\d{1,9}\.\d{1,9}\.\d{1,9}$/;

export function buildPublishRef(input: {
  handle: string;
  name: string;
  version: string;
}): { ok: true; ref: string } | { ok: false; reason: string } {
  const handle = input.handle.trim().toLowerCase();
  const name = input.name.trim().toLowerCase();
  const version = input.version.trim().toLowerCase();

  // Reject smuggled ref structure before anything else.
  if (/[@:]/.test(handle) || /[@:]/.test(name)) {
    return { ok: false, reason: "handle/name may not contain '@' or ':'." };
  }
  if (!handle) {
    return { ok: false, reason: "a handle is required (your GitHub login); bare-name flows are maintainer-only." };
  }
  if (!HUB_HANDLE_RE.test(handle)) {
    return { ok: false, reason: `invalid handle "${handle}" (GitHub-style: 1-39 chars, single internal hyphens).` };
  }
  if (!HUB_NAME_RE.test(name)) {
    return {
      ok: false,
      reason: `"${name}" is not a valid hub name (2-40 chars, lowercase alphanumeric + internal hyphens, must start and end alphanumeric). Pass --name to override.`,
    };
  }
  if (!HUB_SEMVER_RE.test(version)) {
    return { ok: false, reason: `version "${version}" must be a concrete semver like 1.2.0 (not "latest").` };
  }
  return { ok: true, ref: `${handle}@${name}:${version}` };
}

// Publish-scoped extra token shapes. Kept LOCAL to publish (not added to the
// shared SECRET_CONTENT_PATTERNS) on purpose: the shared set is deliberately
// underfit to avoid false-positive patch blocks; publish can afford a broader,
// recoverable refusal. These align the client up to the server's secret.token
// rule so the client is never weaker than the server.
const PUBLISH_EXTRA_SECRETS: { name: string; re: RegExp }[] = [
  { name: "OpenAI-style key", re: /\bsk-[A-Za-z0-9]{20,}\b/ },
  { name: "GitHub fine-grained PAT (short)", re: /\bgithub_pat_[A-Za-z0-9_]{22,}\b/ },
];

export function assertNoHardSecrets(content: string): string[] {
  const reasons: string[] = [];
  for (const m of scanTextForSecrets(content)) {
    reasons.push(`looks like a secret (${m.pattern}) on line ${m.line + 1}: ${m.redactedSnippet}`);
  }
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    for (const { name, re } of PUBLISH_EXTRA_SECRETS) {
      const found = re.exec(lines[i]!);
      if (found) {
        const tok = found[0];
        const red = tok.length <= 8 ? `${tok.slice(0, 2)}…(${tok.length})` : `${tok.slice(0, 4)}…(${tok.length} chars)`;
        reasons.push(`looks like a secret (${name}) on line ${i + 1}: ${red}`);
      }
    }
  }
  return reasons;
}

export function collectPublishWarnings(content: string): string[] {
  const warnings: string[] = [];
  const home = os.homedir();
  if (home && content.includes(home)) {
    warnings.push(`contains your home directory path (${home}) - it embeds your username and will be public.`);
  }
  const pathRe = /(?:\/Users\/|\/home\/|[A-Za-z]:\\Users\\)[^\s"':,)]+/;
  if (pathRe.test(content)) {
    warnings.push("contains an absolute user path (e.g. /Users/<name>/...) - it may leak your username and local layout.");
  }
  if (/\benv:[A-Z][A-Z0-9_]*/.test(content)) {
    warnings.push("references an env: secret variable - the reference (not the value) will be public.");
  }
  if (/[a-z][a-z0-9+.-]*:\/\/[^\s/@]+:[^\s/@]+@/i.test(content)) {
    warnings.push("contains a URL with embedded credentials (user:pass@host).");
  }
  return warnings;
}

export function runPublishPreflight(
  content: string,
): { ok: false; refusals: string[] } | { ok: true; warnings: string[] } {
  const refusals = assertNoHardSecrets(content);
  if (refusals.length > 0) return { ok: false, refusals };
  return { ok: true, warnings: collectPublishWarnings(content) };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/flows/hub/publish-guards.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/flows/hub/publish-guards.ts src/flows/hub/publish-guards.test.ts
git commit -m "feat(hub): publish ref builder + leak preflight (pure)"
```

---

### Task 2: `publishFlow` network client

**Files:**
- Modify: `src/core/guarded-fetch.ts` (export the SSRF host check)
- Modify: `src/flows/hub/hub-client.ts` (add `publishFlow`, types)
- Test: `src/flows/hub/hub-client.publish.test.ts`

**Interfaces:**
- Consumes: `buildPublishRef`/`assertNoHardSecrets` (Task 1), `pullHubFlow`/`sha256Hex`/`DEFAULT_HUB_BASE_URL` (existing in `hub-client.ts`), `redact` (`secret-resolver.ts`), `isFetchHostBlocked` (newly exported), `FetchImpl` (`flow-portability.ts`).
- Produces:
  ```ts
  export interface HubDiagnosis {
    severity?: string; score?: number; verdict?: string;
    findings?: Array<{ id?: string; category?: string; severity?: string; message?: string; path?: string; evidence?: string }>;
  }
  export type HubPublishResult =
    | { ok: true; ref: string; version: string; sha256: string; verified: boolean; diagnosis?: HubDiagnosis; alreadyExisted?: boolean }
    | { ok: false; status: number; reason: string; diagnosis?: HubDiagnosis };
  export async function publishFlow(input: {
    content: string; ref: string; token: string;
    baseUrl?: string; allowTokenToCustomHost?: boolean; allowPrivateHosts?: boolean;
    fetchImpl?: FetchImpl;
  }): Promise<HubPublishResult>;
  ```

- [ ] **Step 1: Export the SSRF host check**

In `src/core/guarded-fetch.ts`, change the `isBlockedHost` declaration to an export and add an alias for clarity:

```ts
/** Resolve a hostname and report whether it points at a blocked range.
 *  Fail-closed: a resolution error blocks. Exported so the token-bearing
 *  publish POST can reuse the exact same SSRF rule set. */
export async function isFetchHostBlocked(hostname: string): Promise<boolean> {
  // ... existing body of isBlockedHost, unchanged ...
}
```

Then update the internal call site in `fetchGuardedText` from `isBlockedHost(...)` to `isFetchHostBlocked(...)`.

- [ ] **Step 2: Write the failing tests**

```ts
// src/flows/hub/hub-client.publish.test.ts
import { describe, it, expect, vi } from "vitest";
import { publishFlow } from "./hub-client.js";

const TOKEN = "gho_TESTTOKEN1234567890abcdefGHIJKLMNOPQR";
const CLEAN = "id: x-flow\nversion: 1\nsteps:\n  - run: echo hi\n";

function fakeFetch(status: number, body: unknown, opts: { html?: boolean } = {}) {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => (opts.html ? "<html>502</html>" : JSON.stringify(body)),
  })) as any;
}

describe("publishFlow", () => {
  it("returns ok on 201 (gated on status, not res.ok)", async () => {
    const f = fakeFetch(201, { ok: true, ref: "guy@x-flow:1.0.0", version: "1.0.0", sha256: "a".repeat(64), verified: false, diagnosis: { verdict: "accepted" } });
    const r = await publishFlow({ content: CLEAN, ref: "guy@x-flow:1.0.0", token: TOKEN, fetchImpl: f });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.version).toBe("1.0.0");
  });

  it("surfaces 422 rejected with diagnosis", async () => {
    const f = fakeFetch(422, { error: "flow rejected by scanner", diagnosis: { verdict: "rejected", findings: [{ id: "rce", message: "curl | sh", severity: "critical" }] } });
    const r = await publishFlow({ content: CLEAN, ref: "guy@x-flow:1.0.0", token: TOKEN, fetchImpl: f });
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.status).toBe(422); expect(r.diagnosis?.findings?.length).toBe(1); }
  });

  it("tolerates an edge 401 with an {error}-only body (no diagnosis)", async () => {
    const f = fakeFetch(401, { error: "invalid GitHub token" });
    const r = await publishFlow({ content: CLEAN, ref: "guy@x-flow:1.0.0", token: TOKEN, fetchImpl: f });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(401);
  });

  it("fails soft on a non-JSON 5xx (CloudFlare HTML), no throw", async () => {
    const f = fakeFetch(502, null, { html: true });
    const r = await publishFlow({ content: CLEAN, ref: "guy@x-flow:1.0.0", token: TOKEN, fetchImpl: f });
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.status).toBe(502); expect(r.reason).toMatch(/non-JSON/i); }
  });

  it("refuses a non-default origin BEFORE attaching the token (no fetch)", async () => {
    const f = vi.fn();
    const r = await publishFlow({ content: CLEAN, ref: "guy@x-flow:1.0.0", token: TOKEN, baseUrl: "https://evil.example", fetchImpl: f as any });
    expect(r.ok).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it("hard-refuses a secret-bearing flow before any fetch", async () => {
    const f = vi.fn();
    const r = await publishFlow({ content: "k: sk-" + "a".repeat(40), ref: "guy@x-flow:1.0.0", token: TOKEN, fetchImpl: f as any });
    expect(r.ok).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it("treats a 409 with matching content sha as idempotent success", async () => {
    const content = CLEAN;
    // sha256 of CLEAN, computed by the same helper the client uses.
    const { createHash } = await import("node:crypto");
    const sha = createHash("sha256").update(content, "utf8").digest("hex");
    const f = vi.fn(async (url: string) => {
      if (String(url).includes("/api/hub/publish")) {
        return { ok: false, status: 409, headers: { get: () => null }, text: async () => JSON.stringify({ error: "already exists" }) } as any;
      }
      // the pull verifying the existing version
      return { ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify({ ref: "guy@x-flow:1.0.0", version: "1.0.0", content, sha256: sha, verified: false }) } as any;
    });
    const r = await publishFlow({ content, ref: "guy@x-flow:1.0.0", token: TOKEN, fetchImpl: f as any, allowPrivateHosts: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.alreadyExisted).toBe(true);
  });

  it("never leaks the token in a thrown-network-error reason", async () => {
    const f = vi.fn(async () => { throw new Error(`connect failed for Bearer ${TOKEN}`); });
    const r = await publishFlow({ content: CLEAN, ref: "guy@x-flow:1.0.0", token: TOKEN, fetchImpl: f as any });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.includes(TOKEN)).toBe(false);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm vitest run src/flows/hub/hub-client.publish.test.ts`
Expected: FAIL - `publishFlow` is not exported.

- [ ] **Step 4: Implement `publishFlow`**

Add to `src/flows/hub/hub-client.ts` (imports at top, function near `installFlowFromHub`):

```ts
import { redact } from "../../notifications/gateways/secret-resolver.js";
import { isFetchHostBlocked } from "../../core/guarded-fetch.js";
import { assertNoHardSecrets } from "./publish-guards.js";

export interface HubDiagnosis {
  severity?: string; score?: number; verdict?: string;
  findings?: Array<{ id?: string; category?: string; severity?: string; message?: string; path?: string; evidence?: string }>;
}
export type HubPublishResult =
  | { ok: true; ref: string; version: string; sha256: string; verified: boolean; diagnosis?: HubDiagnosis; alreadyExisted?: boolean }
  | { ok: false; status: number; reason: string; diagnosis?: HubDiagnosis };

const hubPublishOkSchema = z
  .object({
    ok: z.boolean().optional(),
    ref: z.string().optional(),
    version: z.string().optional(),
    sha256: z.string().optional(),
    verified: z.boolean().optional(),
    diagnosis: z.unknown().optional(),
  })
  .passthrough();

function parseHubError(parsed: unknown): { reason?: string; diagnosis?: HubDiagnosis } {
  if (!parsed || typeof parsed !== "object") return {};
  const o = parsed as Record<string, unknown>;
  const reason = typeof o.error === "string" ? o.error : undefined;
  const diagnosis = o.diagnosis && typeof o.diagnosis === "object" ? (o.diagnosis as HubDiagnosis) : undefined;
  return { reason, diagnosis };
}

export async function publishFlow(input: {
  content: string;
  ref: string;
  token: string;
  baseUrl?: string;
  allowTokenToCustomHost?: boolean;
  allowPrivateHosts?: boolean;
  fetchImpl?: FetchImpl;
}): Promise<HubPublishResult> {
  const base = trimSlash(input.baseUrl ?? DEFAULT_HUB_BASE_URL);
  let origin: string;
  let hostname: string;
  try {
    const u = new URL(base);
    origin = u.origin;
    hostname = u.hostname;
  } catch {
    return { ok: false, status: 0, reason: `Invalid hub base URL: ${base}` };
  }

  // Token-host pin: never attach the GitHub token to a non-default origin.
  const defaultOrigin = new URL(DEFAULT_HUB_BASE_URL).origin;
  if (origin !== defaultOrigin && !input.allowTokenToCustomHost) {
    return {
      ok: false,
      status: 0,
      reason: `Refusing to send the hub token to a non-default origin (${origin}). Use the default hub, or pass --allow-token-to-custom-host for local testing.`,
    };
  }
  // SSRF guard (the HTTP route never sets allowPrivateHosts; the CLI may).
  if (!input.allowPrivateHosts && (await isFetchHostBlocked(hostname))) {
    return { ok: false, status: 0, reason: `Refusing to publish to "${hostname}" - it resolves to a private/loopback address (SSRF guard).` };
  }

  // Last-line, never-bypassable hard-refuse before egress.
  const refusals = assertNoHardSecrets(input.content);
  if (refusals.length > 0) {
    return { ok: false, status: 0, reason: `Refusing to publish (secret-shaped content): ${refusals.join("; ")}` };
  }

  const fetchImpl = input.fetchImpl ?? (globalThis.fetch as unknown as FetchImpl);
  if (!fetchImpl) return { ok: false, status: 0, reason: "No fetch implementation available." };

  const url = `${base}/api/hub/publish`;
  const body = JSON.stringify({ ref: input.ref, content: input.content });
  let res: Awaited<ReturnType<FetchImpl>>;
  let text = "";
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${input.token}` },
      body,
      signal: AbortSignal.timeout(20_000),
    });
    text = await res.text();
  } catch (err) {
    return { ok: false, status: 0, reason: `Hub publish request failed: ${redact(err, [input.token])}` };
  }

  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    parsed = undefined;
  }

  if (res.status === 201) {
    const ok = hubPublishOkSchema.safeParse(parsed);
    const v = ok.success ? ok.data : {};
    return {
      ok: true,
      ref: v.ref ?? input.ref,
      version: v.version ?? input.ref.split(":")[1] ?? "",
      sha256: v.sha256 ?? sha256Hex(input.content),
      verified: v.verified ?? false,
      diagnosis: (v.diagnosis as HubDiagnosis) ?? undefined,
    };
  }

  if (res.status === 409) {
    // A timed-out-but-stored publish, or a true re-publish. Compare content sha.
    const existing = await pullHubFlow({ ref: input.ref, baseUrl: base, allowPrivateHosts: input.allowPrivateHosts });
    if (existing.ok && existing.value.sha256 && existing.value.sha256.toLowerCase() === sha256Hex(input.content).toLowerCase()) {
      return {
        ok: true,
        ref: existing.value.ref,
        version: existing.value.version ?? input.ref.split(":")[1] ?? "",
        sha256: existing.value.sha256,
        verified: existing.value.verified ?? false,
        alreadyExisted: true,
      };
    }
    const { reason } = parseHubError(parsed);
    return { ok: false, status: 409, reason: redact(reason ?? "that version already exists (versions are immutable); bump the version.", [input.token]) };
  }

  if (res.status === 200 && !text) {
    return { ok: false, status: 502, reason: "Empty hub response." };
  }
  if (parsed === undefined && text) {
    return { ok: false, status: res.status, reason: `Non-JSON response from hub (HTTP ${res.status}).` };
  }
  const { reason, diagnosis } = parseHubError(parsed);
  return { ok: false, status: res.status, reason: redact(reason ?? `Hub returned HTTP ${res.status}.`, [input.token]), diagnosis };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run src/flows/hub/hub-client.publish.test.ts`
Expected: PASS. If the `AbortSignal.timeout` interferes with the fake fetch, confirm the fake resolves synchronously (it does).

- [ ] **Step 6: Typecheck + commit**

```bash
pnpm typecheck
git add src/core/guarded-fetch.ts src/flows/hub/hub-client.ts src/flows/hub/hub-client.publish.test.ts
git commit -m "feat(hub): publishFlow client - token-host pin, redaction, 409 sha-compare idempotency"
```

---

### Task 3: CLI `vibe flows hub publish`

**Files:**
- Modify: `src/cli/commands/flows/hub.ts` (add `runHubPublish`)
- Modify: `src/cli/commands/flows/index.ts` (register the subcommand)
- Test: `src/cli/commands/flows/hub.publish.test.ts`

**Interfaces:**
- Consumes: `exportFlowYaml` (`flow-portability.ts`), `resolveSecret`/`envVarName` (`secret-resolver.ts`), `buildPublishRef`/`runPublishPreflight` (Task 1), `publishFlow` (Task 2), `detectProject`.
- Produces: `runHubPublish(flowId: string, opts: { version?: string; name?: string; handle?: string; baseUrl?: string; yes?: boolean; json?: boolean; allowTokenToCustomHost?: boolean }): Promise<number>`

- [ ] **Step 1: Write the failing test**

```ts
// src/cli/commands/flows/hub.publish.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../flows/hub/hub-client.js", () => ({
  publishFlow: vi.fn(),
}));
vi.mock("../../../flows/runtime/flow-portability.js", () => ({
  exportFlowYaml: vi.fn(),
}));

import { runHubPublish } from "./hub.js";
import { publishFlow } from "../../../flows/hub/hub-client.js";
import { exportFlowYaml } from "../../../flows/runtime/flow-portability.js";

describe("runHubPublish", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.VIBESTRATE_HUB_TOKEN;
    (exportFlowYaml as any).mockResolvedValue({ ok: true, flowId: "x-flow", source: "project", yaml: "id: x-flow\nsteps: []\n" });
  });

  it("fails fast (no network) when the token env var is unset", async () => {
    const code = await runHubPublish("x-flow", { version: "1.0.0", handle: "guy", yes: true });
    expect(code).toBe(1);
    expect(publishFlow).not.toHaveBeenCalled();
  });

  it("publishes on the happy path with --yes", async () => {
    process.env.VIBESTRATE_HUB_TOKEN = "gho_x".padEnd(20, "y");
    (publishFlow as any).mockResolvedValue({ ok: true, ref: "guy@x-flow:1.0.0", version: "1.0.0", sha256: "a".repeat(64), verified: false });
    const code = await runHubPublish("x-flow", { version: "1.0.0", handle: "guy", yes: true });
    expect(code).toBe(0);
    expect(publishFlow).toHaveBeenCalledOnce();
  });

  it("aborts (no network) on an invalid handle/name ref", async () => {
    process.env.VIBESTRATE_HUB_TOKEN = "gho_x".padEnd(20, "y");
    const code = await runHubPublish("x-flow", { version: "latest", handle: "guy", yes: true });
    expect(code).toBe(1);
    expect(publishFlow).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/cli/commands/flows/hub.publish.test.ts`
Expected: FAIL - `runHubPublish` not exported.

- [ ] **Step 3: Implement `runHubPublish`**

Add to `src/cli/commands/flows/hub.ts`:

```ts
import { exportFlowYaml } from "../../../flows/runtime/flow-portability.js";
import { publishFlow } from "../../../flows/hub/hub-client.js";
import { resolveSecret, envVarName } from "../../../notifications/gateways/secret-resolver.js";
import { buildPublishRef, runPublishPreflight } from "../../../flows/hub/publish-guards.js";
import { confirm } from "../../ui/prompt.js"; // if no shared confirm exists, use readline (see note)

const HUB_TOKEN_REF = "env:VIBESTRATE_HUB_TOKEN";

export async function runHubPublish(
  flowId: string,
  opts: { version?: string; name?: string; handle?: string; baseUrl?: string; yes?: boolean; json?: boolean; allowTokenToCustomHost?: boolean },
): Promise<number> {
  if (!opts.version) {
    console.error(`${symbol.fail()} --version <x.y.z> is required.`);
    return 1;
  }
  if (!opts.handle) {
    console.error(`${symbol.fail()} --handle <your-github-login> is required (it must match the GitHub token's account).`);
    return 1;
  }

  const detected = await detectProject(process.cwd());
  const exported = await exportFlowYaml({ projectRoot: detected.projectRoot, flowId });
  if (!exported.ok) {
    console.error(`${symbol.fail()} ${exported.reason ?? `flow "${flowId}" not found.`}`);
    return 1;
  }

  const ref = buildPublishRef({ handle: opts.handle, name: opts.name ?? flowId, version: opts.version });
  if (!ref.ok) {
    console.error(`${symbol.fail()} ${ref.reason}`);
    return 1;
  }

  const preflight = runPublishPreflight(exported.yaml);
  if (!preflight.ok) {
    console.error(`${symbol.fail()} Refusing to publish - secret-shaped content:`);
    for (const r of preflight.refusals) console.error(indent(r));
    return 1;
  }

  const token = resolveSecret(HUB_TOKEN_REF);
  if (!token) {
    console.error(`${symbol.fail()} Set the env var ${envVarName(HUB_TOKEN_REF)} to a GitHub token before publishing.`);
    return 1;
  }

  const bytes = Buffer.byteLength(exported.yaml, "utf8");
  console.log(header("Publish to the Vibestrate hub"));
  console.log(indent(`ref:     ${color.bold(ref.ref)}`));
  console.log(indent(`size:    ${bytes} bytes`));
  console.log(indent(color.dim("This publishes a PUBLIC, IMMUTABLE version to vibestrate.com.")));
  if (preflight.warnings.length > 0) {
    console.log("");
    console.log(indent(color.dim("Heads up - this flow:")));
    for (const w of preflight.warnings) console.log(indent(`- ${w}`));
  }

  if (!opts.yes) {
    const okToGo = await confirm("Publish now?"); // see note: fall back to readline y/N
    if (!okToGo) {
      console.log("Aborted.");
      return 1;
    }
  }

  // CLI is user-initiated: the SSRF guard may allow the typed/default host.
  const result = await publishFlow({
    content: exported.yaml,
    ref: ref.ref,
    token,
    baseUrl: opts.baseUrl,
    allowTokenToCustomHost: opts.allowTokenToCustomHost,
    allowPrivateHosts: true,
  });

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return result.ok ? 0 : 1;
  }
  if (!result.ok) {
    console.error(`${symbol.fail()} Publish failed (HTTP ${result.status}): ${result.reason}`);
    if (result.diagnosis?.findings?.length) {
      for (const f of result.diagnosis.findings) console.error(indent(`- [${f.severity}] ${f.message}${f.path ? ` (${f.path})` : ""}`));
    }
    return 1;
  }
  if (result.alreadyExisted) {
    console.log(`${symbol.ok()} ${color.bold(result.ref)} already published (this exact version).`);
    return 0;
  }
  const flagged = result.diagnosis?.verdict === "flagged";
  console.log(`${symbol.ok()} Published ${color.bold(result.ref)}${flagged ? color.dim(" (flagged - see warnings)") : ""}.`);
  console.log(indent(color.dim(`sha256 ${result.sha256.slice(0, 12)}... (transport integrity only).`)));
  if (flagged && result.diagnosis?.findings?.length) {
    for (const f of result.diagnosis.findings) console.log(indent(`- [${f.severity}] ${f.message}`));
  }
  return 0;
}
```

Note on `confirm`: if `src/cli/ui/` has no shared confirm helper, inline a minimal one with `node:readline/promises` (`createInterface`, ask `"Publish now? [y/N] "`, return `/^y(es)?$/i.test(answer.trim())`). Grep `src/cli` for an existing prompt helper first and reuse it.

- [ ] **Step 4: Register the subcommand**

In `src/cli/commands/flows/index.ts`, after the `hub.command("install ...")` block and before `cmd.addCommand(hub)`:

```ts
  hub
    .command("publish <flowId>")
    .description("Publish a project flow to the hub (public, immutable).")
    .requiredOption("--version <semver>", "the release version, e.g. 1.2.0")
    .option("--name <slug>", "hub name (defaults to the flow id)")
    .option("--handle <login>", "your GitHub login (must match the token account)")
    .option("--base-url <url>", "override the hub base URL")
    .option("--allow-token-to-custom-host", "send the token to a non-default origin (local testing)")
    .option("--yes", "skip the confirmation prompt")
    .option("--json", "emit JSON")
    .action(async (flowId: string, opts: { version: string; name?: string; handle?: string; baseUrl?: string; allowTokenToCustomHost?: boolean; yes?: boolean; json?: boolean }) => {
      const { runHubPublish } = await import("./hub.js");
      process.exit(await runHubPublish(flowId, opts));
    });
```

- [ ] **Step 5: Run the tests + typecheck**

Run: `pnpm vitest run src/cli/commands/flows/hub.publish.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/cli/commands/flows/hub.ts src/cli/commands/flows/index.ts src/cli/commands/flows/hub.publish.test.ts
git commit -m "feat(hub): vibe flows hub publish CLI"
```

---

### Task 4: Server route `POST /api/flows/hub/publish` (fail-closed)

**Files:**
- Modify: `src/server/routes/flows.ts`
- Test: the existing flows route test (grep `flows` under `src/server/**/*.test.ts`); create `src/server/routes/flows.hub-publish.test.ts` if none covers this route.

**Interfaces:**
- Consumes: `exportFlowYaml`, `resolveSecret`, `buildPublishRef`, `runPublishPreflight`, `publishFlow`, `HttpError`.
- Produces: route `POST /api/flows/hub/publish`, body `{ flowId, version, name?, handle, baseUrl?, confirm: "publish" }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/server/routes/flows.hub-publish.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify from "fastify";
import { registerFlowsRoutes } from "./flows.js";

vi.mock("../../flows/hub/hub-client.js", async (orig) => ({
  ...(await orig<any>()),
  publishFlow: vi.fn(async () => ({ ok: true, ref: "guy@x:1.0.0", version: "1.0.0", sha256: "a".repeat(64), verified: false })),
}));
vi.mock("../../flows/runtime/flow-portability.js", async (orig) => ({
  ...(await orig<any>()),
  exportFlowYaml: vi.fn(async () => ({ ok: true, flowId: "x", source: "project", yaml: "id: x\nsteps: []\n" })),
}));

async function build() {
  const app = Fastify();
  // register the error handler the app uses (mirror the real server setup), then:
  await registerFlowsRoutes(app, { projectRoot: "/tmp/proj" });
  await app.ready();
  return app;
}

describe("POST /api/flows/hub/publish", () => {
  beforeEach(() => { delete process.env.VIBESTRATE_API_TOKEN; delete process.env.VIBESTRATE_HUB_TOKEN; });
  afterEach(() => { delete process.env.VIBESTRATE_API_TOKEN; delete process.env.VIBESTRATE_HUB_TOKEN; });

  it("403s without VIBESTRATE_API_TOKEN (fail-closed)", async () => {
    const app = await build();
    const res = await app.inject({ method: "POST", url: "/api/flows/hub/publish", payload: { flowId: "x", version: "1.0.0", handle: "guy", confirm: "publish" } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("400s without the confirm literal", async () => {
    process.env.VIBESTRATE_API_TOKEN = "t";
    process.env.VIBESTRATE_HUB_TOKEN = "gho_xxxxxxxxxxxxxxxxxxxx";
    const app = await build();
    const res = await app.inject({ method: "POST", url: "/api/flows/hub/publish", payload: { flowId: "x", version: "1.0.0", handle: "guy" } });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("412/400s when the hub token env-ref is unset (never 500)", async () => {
    process.env.VIBESTRATE_API_TOKEN = "t";
    const app = await build();
    const res = await app.inject({ method: "POST", url: "/api/flows/hub/publish", payload: { flowId: "x", version: "1.0.0", handle: "guy", confirm: "publish" } });
    expect([400, 412]).toContain(res.statusCode);
    await app.close();
  });

  it("relays the upstream success", async () => {
    process.env.VIBESTRATE_API_TOKEN = "t";
    process.env.VIBESTRATE_HUB_TOKEN = "gho_xxxxxxxxxxxxxxxxxxxx";
    const app = await build();
    const res = await app.inject({ method: "POST", url: "/api/flows/hub/publish", payload: { flowId: "x", version: "1.0.0", handle: "guy", confirm: "publish" } });
    expect(res.statusCode).toBe(200);
    expect(res.json().result.ok).toBe(true);
    await app.close();
  });
});
```

Note: match `build()` to how the other `flows.ts` route tests construct the Fastify app + error handler (grep a sibling test). If `HttpError` needs a registered handler to map to a status, copy that setup verbatim.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/server/routes/flows.hub-publish.test.ts`
Expected: FAIL - route returns 404 (not registered).

- [ ] **Step 3: Implement the route**

In `src/server/routes/flows.ts`, add the body schema near `hubInstallBody`:

```ts
const hubPublishBody = z.object({
  flowId: z.string().min(1).max(120),
  version: z.string().min(1).max(40),
  name: z.string().min(1).max(60).optional(),
  handle: z.string().min(1).max(60),
  baseUrl: z.string().url().max(2000).optional(),
  confirm: z.literal("publish"),
});
```

Inside `registerFlowsRoutes`, after the `POST /api/flows/hub/install` handler:

```ts
  // Publish is outward-facing + token-bearing. Fail-closed like the git write
  // routes: a tokenless loopback API is reachable by any local process.
  const requireApiToken = () => {
    if (!process.env.VIBESTRATE_API_TOKEN) {
      throw new HttpError(403, "Publishing from the dashboard requires VIBESTRATE_API_TOKEN to be set. Set a token and restart `vibe ui`.");
    }
  };

  app.post<{ Body: unknown }>("/api/flows/hub/publish", async (req) => {
    requireApiToken();
    const parsed = hubPublishBody.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.message);

    const { exportFlowYaml } = await import("../../flows/runtime/flow-portability.js");
    const exported = await exportFlowYaml({ projectRoot, flowId: parsed.data.flowId });
    if (!exported.ok) throw new HttpError(404, exported.reason ?? `flow "${parsed.data.flowId}" not found.`);

    const { buildPublishRef, runPublishPreflight } = await import("../../flows/hub/publish-guards.js");
    const ref = buildPublishRef({ handle: parsed.data.handle, name: parsed.data.name ?? parsed.data.flowId, version: parsed.data.version });
    if (!ref.ok) throw new HttpError(400, ref.reason);

    const pre = runPublishPreflight(exported.yaml);
    if (!pre.ok) throw new HttpError(400, `Refusing to publish (secret-shaped content): ${pre.refusals.join("; ")}`);

    const { resolveSecret } = await import("../../notifications/gateways/secret-resolver.js");
    const token = resolveSecret("env:VIBESTRATE_HUB_TOKEN");
    if (!token) throw new HttpError(412, "Set VIBESTRATE_HUB_TOKEN (a GitHub token) in the `vibe ui` process env to publish.");

    const { publishFlow } = await import("../../flows/hub/hub-client.js");
    const result = await publishFlow({ content: exported.yaml, ref: ref.ref, token, baseUrl: parsed.data.baseUrl });
    if (!result.ok) {
      const status = result.status >= 400 && result.status < 600 ? result.status : 502;
      throw new HttpError(status, result.reason);
    }
    return { result, warnings: pre.warnings };
  });
```

- [ ] **Step 4: Run the tests + typecheck**

Run: `pnpm vitest run src/server/routes/flows.hub-publish.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/routes/flows.ts src/server/routes/flows.hub-publish.test.ts
git commit -m "feat(hub): fail-closed POST /api/flows/hub/publish (confirm literal + env-ref token)"
```

---

### Task 5: Dashboard publish affordance

**Files:**
- Modify: `src/ui/lib/types.ts` (add the result type)
- Modify: `src/ui/lib/api.ts` (add `publishHubFlow`)
- Modify: `src/ui/app/routes/FlowsPage.tsx` (a publish form in the Hub section)

**Interfaces:**
- Consumes: the `POST /api/flows/hub/publish` route (Task 4).
- Produces: `api.publishHubFlow(input)`; a publish control in `FlowsPage`'s `HubSection`.

- [ ] **Step 1: Add the api client method + type**

In `src/ui/lib/types.ts` add:

```ts
export interface HubPublishResult {
  ok: boolean;
  ref?: string;
  version?: string;
  sha256?: string;
  verified?: boolean;
  alreadyExisted?: boolean;
  diagnosis?: { verdict?: string; findings?: Array<{ severity?: string; message?: string; path?: string }> };
}
```

In `src/ui/lib/api.ts`, in the hub block after `installHubFlow`:

```ts
  async publishHubFlow(input: {
    flowId: string;
    version: string;
    name?: string;
    handle: string;
  }): Promise<{ result: HubPublishResult; warnings: string[] }> {
    return jsonPost("/api/flows/hub/publish", { ...input, confirm: "publish" });
  },
```

(Import `HubPublishResult` from `./types` alongside `HubFlowRow`.)

- [ ] **Step 2: Add the publish form to `HubSection`**

In `src/ui/app/routes/FlowsPage.tsx`, add to the Hub section a small "Publish a flow" panel (mirror the existing section's flat-slab styling - no pills, dense card, per the project's UI rules): a project-flow `<select>` (reuse the page's already-loaded flows list, filter to `source === "project"`), a `name` input prefilled from the chosen id, a `version` input, a `handle` input, and a Publish button that:
1. calls `api.publishHubFlow({...})` inside a try/catch,
2. on a thrown `ApiError`, shows the message (the route maps refusals/4xx to a thrown error),
3. on success, shows `result.ref` + version + sha (and `alreadyExisted`/`flagged` notes + any returned `warnings`),
4. requires an explicit in-form confirm step (a second click / a checkbox "I understand this is public and immutable") before the call - the server also enforces the `confirm` literal, this is the visible half.

Keep it read-then-confirm; do not auto-submit. Follow the existing `HubSection` overwrite-confirm interaction as the model.

- [ ] **Step 3: Typecheck + build the UI**

Run: `pnpm typecheck && pnpm build`
Expected: PASS (build compiles the dashboard into `dist/ui`).

- [ ] **Step 4: Browser smoke**

Start the dashboard preview, open the Flows page, confirm the publish panel renders, fields validate, and a publish with no `VIBESTRATE_HUB_TOKEN` shows the clean 412 message (not a crash). Screenshot the panel. (No real publish.)

- [ ] **Step 5: Commit**

```bash
git add src/ui/lib/types.ts src/ui/lib/api.ts src/ui/app/routes/FlowsPage.tsx
git commit -m "feat(hub): dashboard publish form (UI<->CLI parity)"
```

---

### Task 6: Docs, changelog, version bump, TODO tick

**Files:**
- Modify: `docs/content/` hub page (grep for the existing flows-hub concept/CLI page)
- Modify: `CHANGELOG.md`
- Modify: `package.json` (version bump via `npm version minor --no-git-tag-version`)
- Modify: `docs/TODO.md` (tick the Hub Publish line)
- Modify: `docs/design/flows-hub.md` (one line noting publish is hosted-HTTP, not gh-PR)

- [ ] **Step 1: Docs** - document `vibe flows hub publish` (flags, the GitHub-token env var, the public+immutable+handle-must-match rules, the secret-refusal/leak-warning behavior, UI parity). Regenerate source-aware reference: `pnpm docs:generate` (commit the `docs/generated/*.json` diff).

- [ ] **Step 2: Changelog + version** - add a `## X.Y.Z` section: "Flows Hub: publish. `vibe flows hub publish` and a dashboard form push a project flow to the public registry - GitHub-token auth (env-ref only), pre-egress secret refusal + home-dir/identity leak warnings, token pinned to the hub origin, fail-closed dashboard route, immutable-version idempotency." Run `npm version minor --no-git-tag-version`.

- [ ] **Step 3: TODO** - in `docs/TODO.md`, tick the Hub "Publish" line under the Hub section (mark `[x] ✅` with the version + a one-line note).

- [ ] **Step 4: Commit**

```bash
git add docs/ CHANGELOG.md package.json
git commit -m "docs(hub): publish docs + changelog + version bump + TODO tick"
```

---

## Final verification (before the Tier-2 diff review + merge)

- [ ] `pnpm typecheck` - green
- [ ] `pnpm test` - green
- [ ] `pnpm build` - green
- [ ] Grep the diff: the token appears in no log/console/UI string; `Authorization` is attached only on the default origin.
- [ ] Second independent Opus-4.8 adversarial review on the **diff** (spec §8). Fold blockers before merge.
- [ ] Then: ff-merge to `main`, push origin main (per the auto-merge-and-continue convention).

## Self-review notes (author)

- Spec coverage: §1 contract -> Tasks 2/4; §1a server-not-a-backstop -> Task 1 (`assertNoHardSecrets` + extra patterns) + Task 2 (last-line refuse); §2 architecture -> Tasks 2-5; §2a leak preflight -> Task 1 + surfaced in Tasks 3/5; §3 decisions -> all; §4 safety -> Tasks 2/4; §5 testing -> tests in each task; §6 YAGNI -> nothing extra planned; §7 files -> Tasks 1-6.
- Deviation from spec (flagged): the token env-var *name* is fixed to `VIBESTRATE_HUB_TOKEN` (read via `resolveSecret`) rather than a configurable `hub.tokenRef` - the env-ref-only invariant holds; the configurable name is deferred. The handle uses `--handle` / body field rather than a `hub.handle` config key - deferred convenience. Both keep the plan to 6 tasks with no config-schema change.
- Type consistency: `HubPublishResult` (Task 2) is the single source; the route returns `{ result, warnings }`; the UI type `HubPublishResult` mirrors the success fields it reads. `buildPublishRef`/`runPublishPreflight`/`assertNoHardSecrets` names are identical across Tasks 1-4.
