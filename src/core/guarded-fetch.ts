// ── SSRF-guarded, bounded text fetch ──────────────────────────────────────────
//
// A reusable outbound-fetch guard for user-supplied URLs: http(s) only, the
// resolved host must not be private/loopback/link-local (SSRF), and the body is
// bounded by size + time. Reuses the IP block-list from flow-portability so the
// two outbound paths share one rule set. Injectable fetch for tests.

import http from "node:http";
import https from "node:https";
import net from "node:net";
import zlib from "node:zlib";
import pkg from "../../package.json";
import {
  checkFetchHost,
  hostRefusalReason,
  type FetchImpl,
  type HostResolver,
  type HostVerdict,
} from "../flows/runtime/flow-portability.js";

/**
 * The decoder for one content coding.
 *
 * What keeps a body that is tiny on the wire from expanding without limit is NOT
 * a zlib option: `maxOutputLength` caps a single output buffer, and a stream
 * emits 16 KB at a time, so it never fires here (measured: an 8 MB bomb decodes
 * in full under a 64 KB cap). The decoder is stopped by the reader instead - it
 * counts decoded bytes per chunk and destroys this stream on the first one past
 * the limit, which lands within a chunk of it.
 *
 * `Z_SYNC_FLUSH` because origins truncate the trailer often enough that `fetch`
 * tolerates it, and something that imported yesterday should import today. Raw
 * (headerless) deflate is NOT handled: `fetch` sniffs for it, this refuses it,
 * and a loud refusal beats bytes that look like a document.
 */
function decoderFor(
  coding: string,
): zlib.Gunzip | zlib.Inflate | zlib.BrotliDecompress | null {
  const tolerant = { finishFlush: zlib.constants.Z_SYNC_FLUSH };
  if (coding === "gzip" || coding === "x-gzip") return zlib.createGunzip(tolerant);
  if (coding === "deflate") return zlib.createInflate(tolerant);
  if (coding === "br") return zlib.createBrotliDecompress();
  return null;
}

/** How a checked host is reached. Production pins the connection to the
 *  addresses the check approved; a test can watch which those were, or point the
 *  real transport at a local origin while keeping the caller's own limits. */
export type PinnedFetchFactory = (
  addresses: string[],
  opts: { maxBytes?: number },
) => FetchImpl;

/**
 * A fetch that connects only to addresses a check approved, while still speaking
 * to the host by name: the same `Host` header, and over https the same SNI and
 * certificate check, because only the connection's destination is pinned.
 *
 * This is what makes the SSRF check mean anything. The check resolves a name and
 * judges the addresses it got; a request then made BY NAME resolves a second
 * time, and an answer that changed in between lands it somewhere nothing looked
 * at. Node's `lookup` option is the seam that closes that gap.
 *
 * It also replaces `fetch` on these paths, so what `fetch` was quietly doing is
 * done here on purpose: decoding a compressed body, refusing one that runs past
 * the caller's limit WHILE it arrives, dropping a BOM, and saying who we are.
 */
export function fetchPinnedTo(
  addresses: string | readonly string[],
  opts: { maxBytes?: number } = {},
): FetchImpl {
  const approved = (typeof addresses === "string" ? [addresses] : [...addresses]).filter(
    (a) => net.isIP(a) !== 0,
  );
  const maxBytes = opts.maxBytes;
  const pin = ((_hostname: string, options: { all?: boolean }, cb: unknown) => {
    // Fail closed: no approved address means no connection, never a fresh lookup.
    if (approved.length === 0) {
      (cb as (e: Error) => void)(new Error("no approved address to connect to"));
      return;
    }
    // net.connect asks for every address when it picks a family, so both shapes
    // have to be answered or the connection quietly falls back to a lookup.
    // Answering with all of them keeps the failover the platform would have had:
    // every one passed the same check.
    if (options?.all) {
      (cb as (e: null, a: { address: string; family: number }[]) => void)(
        null,
        approved.map((address) => ({ address, family: net.isIP(address) })),
      );
    } else {
      const first = approved[0]!;
      (cb as (e: null, a: string, f: number) => void)(null, first, net.isIP(first));
    }
  }) as never;
  return (url, init) =>
    new Promise((resolve, reject) => {
      const target = new URL(url);
      const secure = target.protocol === "https:";
      const sent = init as { method?: string; headers?: Record<string, string>; body?: string };
      // Lowercased, so a caller's header replaces a default rather than
      // arriving beside it in a different case.
      const headers: Record<string, string> = {
        // An empty User-Agent is a bot signal to every CDN in front of a host
        // worth fetching from, and the only way to tell our own traffic apart.
        "user-agent": `vibestrate/${pkg.version}`,
        accept: "*/*",
        // Only what this can decode. Advertising `deflate` invites the raw,
        // headerless spelling of it, which is refused below.
        "accept-encoding": "gzip, br",
      };
      for (const [key, value] of Object.entries(sent.headers ?? {})) {
        headers[key.toLowerCase()] = value;
      }
      const req = (secure ? https : http).request(
        {
          host: target.hostname,
          port: target.port || (secure ? 443 : 80),
          path: `${target.pathname}${target.search}`,
          method: sent.method ?? "GET",
          headers,
          lookup: pin,
          // No pooling. A keep-alive socket is keyed by host and port alone, so
          // a later request for the same name would reuse the connection without
          // consulting `lookup`, and the pin would quietly stop applying.
          agent: false,
        },
        (res) => {
          const status = res.statusCode ?? 0;
          const headerOf = (name: string) => {
            const value = res.headers[name.toLowerCase()];
            return Array.isArray(value) ? value.join(", ") : (value ?? null);
          };
          const chunks: Buffer[] = [];
          let received = 0;
          let settled = false;
          let body: http.IncomingMessage | zlib.Gunzip | zlib.Inflate | zlib.BrotliDecompress = res;
          const fail = (err: Error) => {
            if (settled) return;
            settled = true;
            reject(err);
            // Nobody is waiting on these now, and a decoder left running holds a
            // native zlib handle and the socket until the origin gives up.
            body.destroy(err);
            res.destroy(err);
            req.destroy(err);
          };
          const tooLarge = () => {
            const err = new Error(`Remote content exceeded ${maxBytes} bytes.`);
            err.name = "ContentTooLarge";
            fail(err);
          };
          const onStreamError = (err: NodeJS.ErrnoException) => {
            fail(err instanceof Error ? err : new Error(String(err)));
          };
          // Attached BEFORE anything can fail. A stream whose error nobody is
          // listening for takes the process with it, and `fail` below destroys
          // these: one bad `content-encoding` header would otherwise be a remote
          // kill switch on the server that fetched it.
          res.on("error", onStreamError);
          // Decode whatever the origin sent, not what it was asked for: object
          // storage serves `content-encoding: gzip` regardless, and undecoded
          // bytes reach a YAML parser as binary and a secret scanner as noise.
          // Node joins repeated headers with ", ", so this is a list; ONE coding
          // is decoded and anything longer is refused rather than piped through a
          // chain of decoders, which is a pile of states to get right on a path
          // an attacker picks the input for.
          const codings = (headerOf("content-encoding") ?? "")
            .toLowerCase()
            .split(",")
            .map((coding) => coding.trim())
            .filter((coding) => coding.length > 0 && coding !== "identity");
          if (codings.length > 1) {
            fail(new Error(`Remote content used more than one content-encoding (${codings.join(", ")}).`));
            return;
          }
          const coding = codings[0];
          if (coding !== undefined) {
            const decoder = decoderFor(coding);
            // Refused, not passed through: bytes nobody decoded would reach a
            // parser looking like a document.
            if (!decoder) {
              fail(new Error(`Remote content used an encoding this client cannot decode (${coding}).`));
              return;
            }
            decoder.on("error", onStreamError);
            res.pipe(decoder);
            body = decoder;
          }
          body.on("data", (chunk: Buffer) => {
            if (settled) return;
            received += chunk.length;
            // WHILE it arrives, and settling HERE: destroying the request does
            // not reject on its own once the response is complete, and `end`
            // would then resolve with a truncated body that reads as whole.
            if (maxBytes !== undefined && received > maxBytes) {
              tooLarge();
              return;
            }
            chunks.push(chunk);
          });
          body.on("end", () => {
            if (settled) return;
            settled = true;
            resolve({
              ok: status >= 200 && status < 300,
              status,
              headers: { get: headerOf },
              text: async () => {
                const text = Buffer.concat(chunks).toString("utf8");
                // fetch's UTF-8 decode drops a BOM. JSON.parse does not forgive one.
                return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
              },
            });
          });
        },
      );
      req.on("error", reject);
      // The caller decides a timeout by reading err.name, so the name is part of
      // the contract, not decoration.
      const abort = () => {
        const err = new Error("The operation was aborted.");
        err.name = "AbortError";
        req.destroy(err);
      };
      if (init.signal.aborted) abort();
      else init.signal.addEventListener("abort", abort, { once: true });
      req.end(sent.body);
    });
}

/**
 * Check a host and hand back the transport that reaches it. One funnel, so no
 * caller can check a name and then connect to that name: the check is what
 * produces the connection, pinned to the address it approved.
 */
export async function guardedTransportFor(input: {
  hostname: string;
  /** How the refusal reads: "fetch", "follow a redirect to", "publish to". */
  what?: string;
  resolveHost?: HostResolver;
  timeoutMs?: number;
  /** Ceiling on the body, enforced as it arrives rather than after. */
  maxBytes?: number;
  /** Overridable so a test can see which addresses were pinned, or point the
   *  real transport at a local origin. Production pins with fetchPinnedTo. */
  pinnedFetchFor?: PinnedFetchFactory;
}): Promise<{ ok: true; fetchImpl: FetchImpl } | { ok: false; reason: string }> {
  const decision = await checkFetchHost(input.hostname, {
    resolveHost: input.resolveHost,
    timeoutMs: input.timeoutMs,
  });
  if (decision.verdict !== "ok") {
    return { ok: false, reason: hostRefusalReason(input.hostname, decision.verdict, input.what) };
  }
  const pinnedFetchFor: PinnedFetchFactory = input.pinnedFetchFor ?? fetchPinnedTo;
  return {
    ok: true,
    fetchImpl: pinnedFetchFor(decision.addresses, { maxBytes: input.maxBytes }),
  };
}

export type GuardedFetchResult =
  | { ok: true; text: string }
  | { ok: false; reason: string };

/** Resolve a hostname and report whether it points at a blocked range.
 *  Fail-closed on an error, an empty answer or a slow resolver. Callers that go
 *  on to connect use `guardedTransportFor` instead, which hands back the
 *  connection; this boolean is for a caller that only needs the verdict.
 *
 *  A delegation, not a second implementation: this file used to carry its own
 *  copy of the check, near enough identical to the flow importer's to look
 *  interchangeable and already differing in where it stripped IPv6 brackets.
 *  That is how two outbound paths drift apart. */
export async function isFetchHostBlocked(
  hostname: string,
  opts: { resolveHost?: HostResolver; timeoutMs?: number } = {},
): Promise<boolean> {
  return (await checkFetchHost(hostname, opts)).verdict !== "ok";
}
export type { HostResolver, HostVerdict };

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
  /** Ceiling for ONE name resolution. The effective deadline is the SMALLER of
   *  this and whatever is left of `timeoutMs`, so the whole call stays inside
   *  the bound this function documents. Unset means the remaining budget is the
   *  only limit - a single slow name can then spend all of it, which is the
   *  right trade for a bound that is honest over one that is merely smaller. */
  resolveTimeoutMs?: number;
  /** How a checked host is reached. Production pins the connection to the
   *  addresses the check approved; a test can watch which those were, or point
   *  the real transport at a local origin. */
  pinnedFetchFor?: PinnedFetchFactory;
}): Promise<GuardedFetchResult> {
  const maxBytes = input.maxBytes ?? 512 * 1024;
  const timeoutMs = input.timeoutMs ?? 10_000;
  // ONE deadline for the whole call. Each hop re-checks its host, and a
  // resolution that is not bounded by the remaining budget turns a documented
  // 10s limit into 10s of fetching plus MAX_GUARDED_REDIRECTS + 1 resolutions,
  // every one of them driven by whoever writes the Location headers.
  const startedAt = Date.now();
  const remainingMs = () => timeoutMs - (Date.now() - startedAt);
  // The check hands back the transport for the host it approved, so there is no
  // path here that checks a name and then connects to that name.
  const transportFor = (hostname: string, what?: string) =>
    guardedTransportFor({
      hostname,
      what,
      resolveHost: input.resolveHost,
      timeoutMs: Math.min(input.resolveTimeoutMs ?? Infinity, remainingMs()),
      maxBytes,
      pinnedFetchFor: input.pinnedFetchFor,
    });

  let parsed: URL;
  try {
    parsed = new URL(input.url);
  } catch {
    return { ok: false, reason: `Invalid URL: ${input.url}` };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, reason: `Only http(s) URLs are allowed (got ${parsed.protocol}).` };
  }
  // Pinned to whatever the check approved, and replaced at every hop by that
  // hop's own check. `allowPrivateHosts` skips both, which is the point of it:
  // the user typed a private URL on purpose.
  let pinned: FetchImpl | undefined;
  if (!input.allowPrivateHosts) {
    const transport = await transportFor(parsed.hostname);
    if (!transport.ok) return { ok: false, reason: transport.reason };
    pinned = transport.fetchImpl;
  }

  const controller = new AbortController();
  // What is LEFT of the budget, not a fresh copy of it: the host check above
  // already spent part of it.
  const timer = setTimeout(() => controller.abort(), Math.max(0, remainingMs()));
  try {
    let current = parsed;
    for (let hop = 0; ; hop++) {
      const fetchImpl = input.fetchImpl ?? pinned ?? (globalThis.fetch as unknown as FetchImpl);
      if (!fetchImpl) return { ok: false, reason: "No fetch implementation available." };
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
        if (!input.allowPrivateHosts) {
          const transport = await transportFor(next.hostname, "follow a redirect to");
          if (!transport.ok) return { ok: false, reason: transport.reason };
          // This hop's address, not the first hop's: reusing a pin across hosts
          // would be the same gap wearing a different hat.
          pinned = transport.fetchImpl;
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
    // An AggregateError, which is what every pinned address refusing looks like,
    // carries an empty message of its own. Say what its parts said instead of
    // printing "Fetch failed: " with nothing after the colon.
    const parts = (err as { errors?: unknown[] } | null)?.errors;
    const detail =
      Array.isArray(parts) && parts.length > 0
        ? parts.map((part) => (part instanceof Error ? part.message : String(part))).join("; ")
        : err instanceof Error
          ? err.message
          : String(err);
    return {
      ok: false,
      reason: aborted ? `Fetch timed out after ${timeoutMs}ms.` : `Fetch failed: ${detail}`,
    };
  } finally {
    clearTimeout(timer);
  }
}
