import path from "node:path";
import { isPathInside } from "../utils/paths.js";

export class HttpError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
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
