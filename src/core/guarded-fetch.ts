// ── SSRF-guarded, bounded text fetch ──────────────────────────────────────────
//
// A reusable outbound-fetch guard for user-supplied URLs: http(s) only, the
// resolved host must not be private/loopback/link-local (SSRF), and the body is
// bounded by size + time. Reuses the IP block-list from flow-portability so the
// two outbound paths share one rule set. Injectable fetch for tests.

import {
  isBlockedFetchHost,
  type FetchImpl,
  type HostResolver,
} from "../flows/runtime/flow-portability.js";

export type GuardedFetchResult =
  | { ok: true; text: string }
  | { ok: false; reason: string };

/** Resolve a hostname and report whether it points at a blocked range.
 *  Fail-closed on an error, an empty answer or a slow resolver. Exported so the
 *  token-bearing publish POST reuses the exact same SSRF rule set.
 *
 *  A re-export, not a second implementation: this file used to carry its own
 *  copy of the check, character-for-character the same as the flow importer's,
 *  which is how the two outbound paths would have drifted apart. */
export const isFetchHostBlocked = isBlockedFetchHost;
export type { HostResolver };

/**
 * How many hops a guarded fetch will follow before giving up.
 *
 * Redirects have to be followed BY HAND, because the guard runs on the URL a
 * caller supplied and `fetch` follows a 3xx on its own - so a public host
 * answering `302 Location: http://127.0.0.1/...` walks the request straight
 * past a check that already passed. Every hop is re-checked, which is the only
 * thing that makes the guard mean what it says.
 */
export const MAX_GUARDED_REDIRECTS = 5;

/** A 3xx that a guarded fetch must re-check rather than follow blindly. */
export function redirectTargetOf(
  res: { status: number; headers: { get(name: string): string | null } },
  current: URL,
): { kind: "not-a-redirect" } | { kind: "no-location" } | { kind: "target"; url: URL } | { kind: "unparseable"; raw: string } {
  if (res.status < 300 || res.status >= 400) return { kind: "not-a-redirect" };
  const location = res.headers.get("location");
  if (!location) return { kind: "no-location" };
  try {
    return { kind: "target", url: new URL(location, current) };
  } catch {
    return { kind: "unparseable", raw: location };
  }
}

export async function fetchGuardedText(input: {
  url: string;
  fetchImpl?: FetchImpl;
  maxBytes?: number;
  timeoutMs?: number;
  /** Skip the SSRF host check. Only a local CLI (user typed the URL) sets this;
   *  the HTTP API never does. */
  allowPrivateHosts?: boolean;
  /** Name resolver for the SSRF check. Injectable for the same reason
   *  `fetchImpl` is: a test that reaches the real resolver is a test that
   *  fails offline and hangs when the network is slow. */
  resolveHost?: HostResolver;
  /** Deadline for ONE name resolution. Defaults to HOST_RESOLVE_TIMEOUT_MS. */
  resolveTimeoutMs?: number;
}): Promise<GuardedFetchResult> {
  const maxBytes = input.maxBytes ?? 512 * 1024;
  const timeoutMs = input.timeoutMs ?? 10_000;

  let parsed: URL;
  try {
    parsed = new URL(input.url);
  } catch {
    return { ok: false, reason: `Invalid URL: ${input.url}` };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, reason: `Only http(s) URLs are allowed (got ${parsed.protocol}).` };
  }
  if (!input.allowPrivateHosts && (await isFetchHostBlocked(parsed.hostname, { resolveHost: input.resolveHost, timeoutMs: input.resolveTimeoutMs }))) {
    return {
      ok: false,
      reason: `Refusing to fetch "${parsed.hostname}" - it resolves to a private/loopback address (SSRF guard).`,
    };
  }

  const fetchImpl = input.fetchImpl ?? (globalThis.fetch as unknown as FetchImpl);
  if (!fetchImpl) return { ok: false, reason: "No fetch implementation available." };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let current = parsed;
    for (let hop = 0; ; hop++) {
      const res = await fetchImpl(current.toString(), {
        signal: controller.signal,
        redirect: "manual",
      });
      const redirect = redirectTargetOf(res, current);
      if (redirect.kind === "no-location") {
        return { ok: false, reason: `Redirect (HTTP ${res.status}) carried no Location header.` };
      }
      if (redirect.kind === "unparseable") {
        return { ok: false, reason: `Redirect to an unparseable target: ${redirect.raw}` };
      }
      if (redirect.kind === "target") {
        if (hop >= MAX_GUARDED_REDIRECTS) {
          return { ok: false, reason: `Too many redirects (limit ${MAX_GUARDED_REDIRECTS}).` };
        }
        const next = redirect.url;
        if (next.protocol !== "https:" && next.protocol !== "http:") {
          return { ok: false, reason: `Redirect to a non-http(s) URL (${next.protocol}).` };
        }
        if (!input.allowPrivateHosts && (await isFetchHostBlocked(next.hostname, { resolveHost: input.resolveHost, timeoutMs: input.resolveTimeoutMs }))) {
          return {
            ok: false,
            reason: `Refusing to follow a redirect to "${next.hostname}" - it resolves to a private/loopback address (SSRF guard).`,
          };
        }
        current = next;
        continue;
      }
      if (!res.ok) return { ok: false, reason: `Fetch failed: HTTP ${res.status}.` };
      const len = res.headers.get("content-length");
      if (len && Number(len) > maxBytes) {
        return { ok: false, reason: `Remote content is ${len} bytes; the limit is ${maxBytes}.` };
      }
      const text = await res.text();
      if (text.length > maxBytes) {
        return { ok: false, reason: `Remote content exceeded ${maxBytes} bytes.` };
      }
      return { ok: true, text };
    }
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      reason: aborted
        ? `Fetch timed out after ${timeoutMs}ms.`
        : `Fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    clearTimeout(timer);
  }
}
