import path from "node:path";
import crypto from "node:crypto";
import { isPathInside } from "../utils/paths.js";

export class HttpError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

/**
 * A bind to a loopback host keeps the server's default "no-auth,
 * origin-allow-listed" posture. Any other host (including `0.0.0.0`, which
 * binds every interface) is treated as a real network exposure that must
 * carry a bearer token - see the auth hook in `startServer`.
 */
export function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return normalized === "127.0.0.1" || normalized === "::1" || normalized === "localhost";
}

/**
 * Is the `Host` a name this server actually answers to?
 *
 * This is the DNS-rebinding guard. An attacker page whose domain has been
 * rebound to 127.0.0.1 reaches us on the real loopback socket, and because the
 * browser considers the request same-origin it sends NO `Origin` header on a
 * simple GET - so the origin allow-list never runs. `Host` still carries the
 * attacker's own hostname, which makes it the only header that separates
 * "the user's dashboard" from "some website that rebound its DNS".
 *
 * Only meaningful for a loopback bind. A non-loopback bind is reachable under a
 * LAN address or DNS name we cannot enumerate here, and already requires a
 * bearer token (`startServer` refuses to bind otherwise), so that token is the
 * control there - not this.
 */
export function isAllowedRequestHost(hostname: string | undefined): boolean {
  if (typeof hostname !== "string" || hostname.length === 0) return false;
  // Refuse anything carrying userinfo, a path, or whitespace rather than trying
  // to parse around it: `evil.com@127.0.0.1` must not read as loopback.
  if (/[@/\\\s]/.test(hostname)) return false;
  // Fastify strips the port but keeps the brackets on an IPv6 literal.
  const bare =
    hostname.startsWith("[") && hostname.endsWith("]")
      ? hostname.slice(1, -1)
      : hostname;
  const normalized = bare.trim().toLowerCase();
  if (isLoopbackHost(normalized)) return true;
  // The IPv4-mapped IPv6 loopback, in both the textual and the compressed form
  // Node may hand back, plus RFC 6761's reserved `*.localhost` - `app.localhost`
  // is a real local-dev convention and resolves to loopback by definition.
  return (
    normalized === "::ffff:127.0.0.1" ||
    normalized === "::ffff:7f00:1" ||
    normalized.endsWith(".localhost")
  );
}

/**
 * Constant-time string compare that never short-circuits on length. Returns
 * false for any mismatch (including length) without leaking timing about how
 * much of the token matched.
 */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  // timingSafeEqual throws on unequal lengths; hash both to a fixed width first
  // so the comparison itself is always constant-time regardless of input size.
  const ah = crypto.createHash("sha256").update(ab).digest();
  const bh = crypto.createHash("sha256").update(bb).digest();
  return crypto.timingSafeEqual(ah, bh);
}

/** Pull a bearer token out of an Authorization header. Returns null when the
 *  header is absent or not a well-formed `Bearer <token>`. */
export function bearerToken(authorization: string | undefined): string | null {
  if (typeof authorization !== "string") return null;
  // Bounded before the regex, and `\S` after the separator so `[ \t]+` and the
  // capture cannot both match the same run of whitespace - that ambiguity is
  // what made a header of 50k spaces cost more than it should.
  if (authorization.length > 8192) return null;
  const m = /^Bearer[ \t]+(\S.*)$/i.exec(authorization.trim());
  return m ? m[1]!.trim() : null;
}

const RUN_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function assertSafeRunId(runId: string): void {
  if (!runId || !RUN_ID_RE.test(runId)) {
    throw new HttpError(400, `Invalid run id: ${runId}`);
  }
  if (runId.includes("..")) {
    throw new HttpError(400, "Run id may not contain '..'.");
  }
}

export function assertSafeRelativePath(relPath: string): void {
  if (!relPath) throw new HttpError(400, "Path is required.");
  if (path.isAbsolute(relPath)) {
    throw new HttpError(400, "Absolute paths are not allowed.");
  }
  const segments = relPath.split(/[\\/]/);
  if (segments.some((s) => s === "..")) {
    throw new HttpError(400, "Path may not contain '..'.");
  }
}

export function assertContainedIn(parent: string, candidate: string): void {
  if (!isPathInside(parent, candidate)) {
    throw new HttpError(400, "Resolved path escapes its allowed root.");
  }
}

export function bindAddressFromArgs(input: { host?: string }): string {
  // Always 127.0.0.1 unless the user explicitly opts in (and we don't expose that flag in V0).
  return input.host && input.host.length > 0 ? input.host : "127.0.0.1";
}
