// ── Patch safety check ──────────────────────────────────────────────────────
//
// The built-in, textual safety inspection every patch-bearing surface runs
// before `git apply`: suggestion/bundle apply and revert, the apply-only
// gateway, and the post-turn diff gate. Path traversal, worktree escapes,
// secret-like file paths, and secret-bearing added lines are refused here,
// before any policy evaluation and before any bytes touch the worktree.

import path from "node:path";
import { isPathInside } from "../utils/paths.js";
import {
  isSecretLikePath,
  scanPatchContentForSecrets,
} from "../core/diff-service.js";

/**
 * Inspect a unified diff. Returns ok=false with a reason if any file path
 * leaves the worktree, references a secret-like path, or is otherwise unsafe.
 * The check is purely textual; the real authority is `git apply --check`.
 */
export function checkPatchSafety(
  patch: string,
  worktreeAbsPath: string,
): { ok: boolean; reason?: string; touchedFiles: string[] } {
  const touched = new Set<string>();
  const lines = patch.split(/\r?\n/);
  for (const line of lines) {
    let m = /^diff --git a\/(.*?) b\/(.+)$/.exec(line);
    if (m) {
      touched.add(m[1]!);
      touched.add(m[2]!);
      continue;
    }
    m = /^\+\+\+ (b\/)?(.+)$/.exec(line);
    if (m) {
      const target = m[2]!.trim();
      if (target !== "/dev/null") touched.add(target);
      continue;
    }
    m = /^--- (a\/)?(.+)$/.exec(line);
    if (m) {
      const target = m[2]!.trim();
      if (target !== "/dev/null") touched.add(target);
    }
  }
  if (touched.size === 0) {
    return {
      ok: false,
      reason: "Patch did not declare any target files.",
      touchedFiles: [],
    };
  }
  for (const t of touched) {
    if (t.includes("..") || t.startsWith("/") || t.startsWith("~")) {
      return {
        ok: false,
        reason: `Patch touches an unsafe path: ${t}`,
        touchedFiles: [...touched],
      };
    }
    const abs = path.resolve(worktreeAbsPath, t);
    if (!isPathInside(worktreeAbsPath, abs)) {
      return {
        ok: false,
        reason: `Patch path "${t}" escapes the worktree.`,
        touchedFiles: [...touched],
      };
    }
    if (isSecretLikePath(t)) {
      return {
        ok: false,
        reason: `Patch touches a secret-like file: ${t}`,
        touchedFiles: [...touched],
      };
    }
  }
  // Content-based scan: catches secrets pasted into otherwise-normal files
  // (e.g. a literal AWS key in src/config.ts). Path-based redaction above
  // only blocks .env-style files. Patterns are high-precision so this
  // shouldn't false-positive on real code.
  const secretHits = scanPatchContentForSecrets(patch);
  if (secretHits.length > 0) {
    const first = secretHits[0]!;
    const target = first.filePath ?? "(unknown)";
    return {
      ok: false,
      reason: `Patch adds a likely ${first.pattern} on line ${first.line + 1} of ${target} (${first.redactedSnippet}). Refusing to apply.`,
      touchedFiles: [...touched],
    };
  }
  return { ok: true, touchedFiles: [...touched] };
}
