// ── Egress allowlist proxy ──────────────────────────────────────────────────
//
// The only route out of an egress-confined run container. It runs in its own
// container attached to BOTH the run's `--internal` network (no external route)
// and a normal bridge network, so the run container can reach it and it can
// reach the internet.
//
// It is an unauthenticated forward proxy on that bridge network, so other
// containers on the default bridge (and the host) can also reach it. That is
// bounded - it only ever relays to allowlisted hosts - but it is not private.
//
// The enforcement is the NETWORK TOPOLOGY, not this process and not the
// HTTP(S)_PROXY env vars. Those env vars only tell a well-behaved client where
// the proxy is; a hostile turn that ignores them finds no route at all, because
// an internal Docker network has no gateway. That distinction is the whole
// design: an allowlist proxy reachable over a normal network would be theater
// that one raw socket defeats.
//
// What it does NOT close: this is a CONNECT proxy, so for an allowlisted host it
// tunnels opaque TLS. Data can still be encoded into an otherwise-legitimate
// request to an allowed model API. Hostname allowlisting NARROWS exfiltration;
// it does not eliminate it. Say so in the docs, never "closes exfil".
//
// Deliberately dependency-free (node builtins only) and import-free: the file is
// bind-mounted into a container that has nothing but a node runtime, so it must
// run exactly as emitted, with no module resolution.

import http from "node:http";
import net from "node:net";
import dns from "node:dns";

/** Default listen port inside the proxy container. */
export const EGRESS_PROXY_PORT = 8888;

/** Idle timeout for a CONNECT client from the moment it asks, and for both ends
 *  of the tunnel it may get. */
const TUNNEL_IDLE_MS = 120_000;

/** Resolve a hostname to addresses. Injectable so a caller (a test, or a
 *  process with its own resolver) is not forced onto the system one. */
export type HostResolver = (hostname: string) => Promise<string[]>;

/**
 * How long a name may take to resolve before whoever asked refuses.
 * `dns.lookup` takes no AbortSignal, so without a deadline a resolver that never
 * answers holds the caller with nothing able to cancel it. The SSRF check in
 * flow-portability shares this number and imports it from here: this file can
 * import nothing (see above), so that is the only direction that keeps one copy.
 */
export const HOST_RESOLVE_TIMEOUT_MS = 5_000;

/** The system resolver, answering with the one address getaddrinfo puts first:
 *  the CONNECT path checks that address and then dials it, never the answer to
 *  a second lookup. */
const systemResolver: HostResolver = async (hostname) => [
  (await dns.promises.lookup(hostname)).address,
];

/** What resolving a CONNECT host came to. The failures are kept apart so the log
 *  says which one happened: a name that does not exist, a resolver in trouble,
 *  and a resolver that did not answer need different fixes. */
type Resolution =
  | { kind: "address"; address: string }
  | { kind: "unresolvable" }
  | { kind: "failed"; code: string }
  | { kind: "timeout" };

/** dns.lookup's codes for a name that genuinely has no address. Anything else,
 *  EAI_AGAIN for a SERVFAIL say, is the resolver failing, not an answer. */
const NO_SUCH_NAME = new Set(["ENOTFOUND", "ENODATA"]);

/**
 * Resolve `host` to the one address a tunnel may dial. Never rejects, and always
 * settles within `timeoutMs`. The lookup itself cannot be cancelled and may
 * still finish later; its answer is ignored, the client having been refused.
 */
async function resolveWithin(
  resolveHost: HostResolver,
  host: string,
  timeoutMs: number,
): Promise<Resolution> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<Resolution>((settle) => {
    timer = setTimeout(() => settle({ kind: "timeout" }), timeoutMs);
    timer.unref();
  });
  try {
    return await Promise.race([
      resolveHost(host).then((addrs): Resolution => {
        const address = addrs[0];
        // Only an IP literal. net.connect would resolve a name AGAIN, after the
        // private-address check, which is the gap resolving first exists to close.
        return address && net.isIP(address)
          ? { kind: "address", address }
          : { kind: "unresolvable" };
      }),
      deadline,
    ]);
  } catch (err) {
    const code = (err as { code?: unknown } | null)?.code;
    if (typeof code === "string" && NO_SUCH_NAME.has(code)) return { kind: "unresolvable" };
    // Only a code-shaped token reaches the log line, whatever the resolver threw.
    return {
      kind: "failed",
      code: typeof code === "string" && /^[A-Z0-9_]+$/.test(code) ? code : "unknown",
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Hosts every egress-confined run gets, because blocking them means no run at
 * all: the model API endpoints the supported provider CLIs authenticate and
 * talk to. Kept deliberately short - a provider that needs more is the user's
 * `execution.container.egress.allow` to extend, and every refusal is logged
 * with the exact host so they know what to add.
 */
export const DEFAULT_EGRESS_ALLOW: readonly string[] = [
  "api.anthropic.com",
  "console.anthropic.com",
  "statsig.anthropic.com",
  "api.openai.com",
  "chatgpt.com",
  "auth.openai.com",
];

/**
 * Match a host against one allowlist entry. An entry is either an exact
 * hostname (`api.anthropic.com`) or a dot-prefixed suffix covering subdomains
 * (`.anthropic.com` matches `api.anthropic.com`, and the bare apex too).
 *
 * A bare `anthropic.com` entry matches ONLY that exact name - never
 * `evil-anthropic.com` and never `api.anthropic.com` - so widening to
 * subdomains is always a deliberate `.`-prefixed choice rather than an
 * accident of substring matching.
 */
export function hostMatches(host: string, entry: string): boolean {
  const h = host.trim().toLowerCase();
  const e = entry.trim().toLowerCase();
  if (!h || !e) return false;
  if (e.startsWith(".")) return h === e.slice(1) || h.endsWith(e);
  return h === e;
}

export function isAllowed(host: string, allow: readonly string[]): boolean {
  return allow.some((entry) => hostMatches(host, entry));
}

/** Split an authority into host + port, tolerating IPv6 literals. */
export function parseAuthority(
  authority: string,
  defaultPort: number,
): { host: string; port: number } | null {
  const raw = authority.trim();
  if (!raw) return null;
  if (raw.startsWith("[")) {
    const close = raw.indexOf("]");
    if (close === -1) return null;
    const host = raw.slice(1, close);
    const rest = raw.slice(close + 1);
    const port = rest.startsWith(":") ? Number(rest.slice(1)) : defaultPort;
    return Number.isFinite(port) && port > 0 ? { host, port } : null;
  }
  const idx = raw.lastIndexOf(":");
  if (idx === -1) return { host: raw, port: defaultPort };
  const host = raw.slice(0, idx);
  const port = Number(raw.slice(idx + 1));
  if (!host || !Number.isFinite(port) || port <= 0) return null;
  return { host, port };
}

/** Ports a tunnel may target. Anything else is refused even for an allowed host
 *  - CONNECT to an arbitrary port is a generic TCP tunnel, not web egress. */
const ALLOWED_PORTS = new Set([80, 443]);

/** Hop-by-hop headers (RFC 7230 6.1) plus the proxy's own credentials. None of
 *  these may be relayed to the upstream origin. */
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

/**
 * The headers to send upstream. Two things matter here, and the first is a
 * bypass, not a nicety:
 *
 * The allowlist decides on the absolute-URI authority, but the ORIGIN routes on
 * `Host`. Relaying a client-supplied `Host` therefore lets
 * `GET http://api.anthropic.com/... ` + `Host: attacker.example` open a
 * connection to an allowed host and be routed, at the far end, to somebody
 * else's site - and the audit log would record it as an allowed request. Any
 * allowlisted host behind shared CDN/reverse-proxy infrastructure is a live
 * exfiltration path. So `Host` is always overwritten with the authority the
 * allowlist actually approved.
 *
 * Second, hop-by-hop headers belong to this connection, not the next one;
 * forwarding `Proxy-Authorization` in particular leaks the proxy's credentials
 * to the origin.
 */
export function forwardableHeaders(
  headers: http.IncomingHttpHeaders,
  approvedAuthority: string,
): http.IncomingHttpHeaders {
  const out: http.IncomingHttpHeaders = {};
  for (const [key, value] of Object.entries(headers)) {
    const k = key.toLowerCase();
    if (k === "host" || HOP_BY_HOP.has(k)) continue;
    out[k] = value;
  }
  out.host = approvedAuthority;
  return out;
}

/**
 * Addresses an allowlisted hostname must never resolve to. A user who allows
 * `.corp.example` and has `metadata.corp.example` pointed at 169.254.169.254
 * would otherwise get cloud-metadata (or an internal service) reachable from
 * the proxy's own network, which is routable even though the run container's is
 * not. Resolve first, check the address, then connect to that address - which
 * also closes the check-then-connect gap a DNS rebind would use.
 */
export function isForbiddenAddress(ip: string): boolean {
  // Strict dotted-quad only: `::ffff:127.0.0.1` also splits into four parts on
  // ".", and letting it through here would make every octet NaN and every
  // comparison false - i.e. loopback would read as public.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    const [a, b] = ip.split(".").map((n) => Number(n)) as [number, number, number, number];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast + reserved
    return false;
  }
  const v6 = ip.toLowerCase();
  if (v6 === "::1" || v6 === "::") return true;
  // Unique-local (fc00::/7), link-local (fe80::/10), and v4-mapped loopback.
  if (/^f[cd]/.test(v6) || v6.startsWith("fe8") || v6.startsWith("fe9")) return true;
  if (v6.startsWith("fea") || v6.startsWith("feb")) return true;
  if (v6.startsWith("::ffff:")) return isForbiddenAddress(v6.slice(7));
  return false;
}

/** A hostname must be plain letters-digits-hyphen-dot. Anything else (userinfo
 *  smuggled into the authority, an embedded `@`, unicode) is refused up front
 *  rather than left to the resolver to reject by luck. */
export function isPlausibleHostname(host: string): boolean {
  return /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9.])?$/.test(host) && host.length <= 253;
}

export function startEgressProxy(opts: {
  allow: readonly string[];
  port?: number;
  /** Where refusals/allows are reported. Defaults to stdout via console. */
  log?: (line: string) => void;
  /** Resolves a CONNECT host before it is checked and dialled. Defaults to the
   *  system resolver. */
  resolveHost?: HostResolver;
  /** Ceiling for one CONNECT host resolution. Defaults to HOST_RESOLVE_TIMEOUT_MS. */
  resolveTimeoutMs?: number;
  /** Idle timeout for a CONNECT client and both ends of its tunnel. Defaults to
   *  TUNNEL_IDLE_MS; settable so a test need not wait two minutes. */
  idleTimeoutMs?: number;
}): http.Server {
  const allow = [...opts.allow];
  const log = opts.log ?? ((line: string) => process.stdout.write(`${line}\n`));
  const resolveHost = opts.resolveHost ?? systemResolver;
  const resolveTimeoutMs = opts.resolveTimeoutMs ?? HOST_RESOLVE_TIMEOUT_MS;
  const idleTimeoutMs = opts.idleTimeoutMs ?? TUNNEL_IDLE_MS;

  const server = http.createServer((req, res) => {
    // Same reasoning as the CONNECT path: a client that disconnects while being
    // refused must not raise an unhandled 'error'.
    req.on("error", () => res.destroy());
    res.on("error", () => res.destroy());
    // Plain-HTTP proxying (absolute-URI request). Rare next to CONNECT, but
    // HTTP_PROXY-aware clients use it for http:// URLs.
    let target: URL;
    try {
      target = new URL(req.url ?? "");
    } catch {
      res.writeHead(400).end("egress proxy: absolute URI required\n");
      return;
    }
    // An `https://` absolute-URI here would be silently downgraded to cleartext
    // on port 80. Refuse it: https belongs on the CONNECT path.
    if (target.protocol !== "http:") {
      res
        .writeHead(400, { "content-type": "text/plain" })
        .end("egress proxy: only http:// absolute URIs are proxied here; use CONNECT for https\n");
      return;
    }
    const port = target.port ? Number(target.port) : 80;
    if (
      !isPlausibleHostname(target.hostname) ||
      !isAllowed(target.hostname, allow) ||
      !ALLOWED_PORTS.has(port)
    ) {
      log(`egress DENY http ${target.hostname}:${port}`);
      res
        .writeHead(403, { "content-type": "text/plain" })
        .end(
          `egress proxy: ${target.hostname} is not in this run's egress allowlist. ` +
            `Add it with: vibe config set execution.container.egress.allow '["${target.hostname}"]'\n`,
        );
      return;
    }
    log(`egress ALLOW http ${target.hostname}:${port}`);
    const upstream = http.request(
      {
        host: target.hostname,
        port,
        method: req.method,
        path: `${target.pathname}${target.search}`,
        headers: forwardableHeaders(req.headers, target.host),
      },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      },
    );
    upstream.on("error", () => {
      if (!res.headersSent) res.writeHead(502);
      res.end("egress proxy: upstream error\n");
    });
    req.pipe(upstream);
  });

  // CONNECT is the path that matters: every https:// call arrives here.
  server.on("connect", (req, clientSocket, head) => {
    // Attach this FIRST. A refused client typically resets the connection the
    // moment it reads the 403, and a socket 'error' with no listener is an
    // unhandled event that kills the process - so the very first denial would
    // take egress down for the rest of the run. Refusals are the common case
    // here, which makes this the hot path, not an edge case. Proven by
    // mutation: remove this line and the refusal test reports an unhandled
    // ECONNRESET instead of passing.
    clientSocket.on("error", () => clientSocket.destroy());
    // Reap from the moment the client asks, not from the moment a tunnel is
    // dialled. Sockets nothing reaps pile up until file descriptors run out, and
    // then the proxy - the run's only exit - dies. That includes every refused
    // one: a refusal is end(), which only half-closes, and an http.Server socket
    // is allowHalfOpen, so it stays open until the client closes its side too.
    // The 'connect' event types the client side as a Duplex; it is a Socket at
    // runtime, but narrow rather than assert.
    if (clientSocket instanceof net.Socket) {
      clientSocket.setTimeout(idleTimeoutMs, () => clientSocket.destroy());
    }
    const parsed = parseAuthority(req.url ?? "", 443);
    // `why` goes to the log, which the user reads. `told` goes to the client, the
    // confined run, and names only the rule that refused it: never an internal
    // address and never a reason, because telling a name that does not exist
    // from one that points into private space lets the run map internal names
    // under an allowlisted suffix. And only a host outside the allowlist is told
    // it is outside it; saying that of one inside sends the reader after the
    // wrong fix.
    const refuse = (
      shown: string,
      why: string,
      told = "is not in this run's egress allowlist",
    ) => {
      log(`egress DENY connect ${shown} (${why})`);
      clientSocket.end(
        "HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain\r\n\r\n" +
          `egress proxy: ${shown} ${told}.\n`,
      );
      // A refused connection is finished. The idle timeout alone lets a client
      // that never closes and keeps sending bytes hold it for as long as it
      // likes, so this deadline does not move with activity.
      const cap = setTimeout(() => clientSocket.destroy(), idleTimeoutMs);
      cap.unref();
      clientSocket.once("close", () => clearTimeout(cap));
    };
    if (!parsed || !isPlausibleHostname(parsed.host) || !isAllowed(parsed.host, allow)) {
      refuse(parsed ? `${parsed.host}:${parsed.port}` : (req.url ?? "?"), "not allowed");
      return;
    }
    const shown = `${parsed.host}:${parsed.port}`;
    if (!ALLOWED_PORTS.has(parsed.port)) {
      refuse(shown, "not allowed", "is not tunnelled: only ports 80 and 443 are");
      return;
    }
    const listed =
      "is in this run's egress allowlist, but was refused: the egress proxy's log says why";
    // Resolve BEFORE connecting and dial the resolved address, so an allowlisted
    // name that points at link-local/private space (cloud metadata, an internal
    // service) is refused, and so the address checked is the address used. The
    // resolution has its own deadline: `dns.lookup` takes no AbortSignal.
    void resolveWithin(resolveHost, parsed.host, resolveTimeoutMs).then((resolved) => {
      // A client that left while its name resolved gets nothing dialled: its
      // 'close' has already fired, so nothing would ever tear the upstream down.
      if (clientSocket.destroyed) return;
      if (resolved.kind !== "address") {
        const why =
          resolved.kind === "timeout"
            ? "resolution timed out"
            : resolved.kind === "failed"
              ? `resolution failed (${resolved.code})`
              : "unresolvable";
        refuse(shown, why, listed);
        return;
      }
      const { address } = resolved;
      if (isForbiddenAddress(address)) {
        refuse(shown, `resolves to ${address}`, listed);
        return;
      }
      log(`egress ALLOW connect ${shown}`);
      const upstream = net.connect(parsed.port, address, () => {
        clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head && head.length > 0) upstream.write(head);
        upstream.pipe(clientSocket);
        clientSocket.pipe(upstream);
      });
      // The dialled side is reaped the same way as the client side.
      upstream.setTimeout(idleTimeoutMs, () => upstream.destroy());
      upstream.on("error", () => {
        upstream.destroy();
        clientSocket.destroy();
      });
      clientSocket.on("close", () => upstream.destroy());
    });
  });

  // A server-level error (EMFILE from fd exhaustion, an accept failure) with no
  // listener is an uncaught exception that kills the proxy, and with it the run's
  // only route out. Log and keep serving.
  server.on("error", (err) => log(`egress proxy server error: ${String(err)}`));

  // A malformed request (or a client that hangs up mid-headers) must not be
  // able to kill the proxy either - same reasoning as the socket handler above.
  server.on("clientError", (_err, socket) => {
    if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
    socket.destroy();
  });

  server.listen(opts.port ?? EGRESS_PROXY_PORT, "0.0.0.0");
  return server;
}

// Entry point when bind-mounted into the proxy container and run by node. The
// allowlist arrives as a newline-free comma-separated env var so the container
// argv stays trivial.
if (process.env.VIBESTRATE_EGRESS_ENTRY === "1") {
  const allow = (process.env.VIBESTRATE_EGRESS_ALLOW ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  startEgressProxy({ allow });
  process.stdout.write(
    `egress proxy listening on ${EGRESS_PROXY_PORT}; allow=${allow.join(" ") || "(none)"}\n`,
  );
}
