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
 * carry a bearer token — see the auth hook in `startServer`.
 */
export function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return normalized === "127.0.0.1" || normalized === "::1" || normalized === "localhost";
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
  const m = /^Bearer[ \t]+(.+)$/i.exec(authorization.trim());
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
