// ── Patch-apply EOL robustness ───────────────────────────────────────────────
// `git apply` matches a patch's context against the working-tree file byte for
// byte, EOL included. When a patch's line endings differ from the target file's
// (a real case on Windows repos under core.autocrlf=false), a strict apply
// rejects a legitimate edit; the obvious "fix" --ignore-whitespace instead
// applies it but writes a mixed-EOL file (silent corruption).
//
// The safe fix: normalize only on the failure path, double-guarded by
// `git apply --check`. A patch that already applies is never touched. The
// normalizer runs only after a patch has failed --check, and its output must
// pass a fresh --check before we apply it - so a wrong/incomplete normalization
// can only fall back to the clean refusal, never corrupt. See
// docs/superpowers/specs/2026-06-24-windows-patch-eol-design.md.
import { execa } from "execa";
import path from "node:path";
import { promises as fs } from "node:fs";

export type Eol = "\r\n" | "\n";

/** CRLF if the content contains any CRLF, otherwise LF. */
export function dominantEol(content: string): Eol {
  return /\r\n/.test(content) ? "\r\n" : "\n";
}

/**
 * Source-side file paths a unified diff touches (the `--- a/<path>` headers).
 * These are the existing on-disk files whose bytes `git apply` matches against;
 * `/dev/null` (a pure addition) has no on-disk file and is skipped.
 */
function sourcePaths(patch: string): string[] {
  const out: string[] = [];
  for (const line of patch.split(/\r?\n/)) {
    if (!line.startsWith("--- ")) continue;
    // Strip the marker, drop a trailing "\t<timestamp>", then one a//b/ prefix.
    let p = line.slice(4).split("\t")[0]!.trim();
    if (p === "/dev/null" || p.startsWith('"')) continue; // skip add / quoted
    if (p.startsWith("a/") || p.startsWith("b/")) p = p.slice(2);
    if (p) out.push(p);
  }
  return out;
}

/**
 * Read a worktree-relative path, refusing anything that escapes the worktree.
 * Uses realpath so a symlink whose lexical path is inside the worktree but
 * resolves outside is refused (path-guarded reads, per the repo security
 * posture). Missing files / escapes return null.
 */
async function readInside(worktree: string, rel: string): Promise<string | null> {
  try {
    const root = await fs.realpath(worktree);
    const real = await fs.realpath(path.resolve(root, rel));
    if (real !== root && !real.startsWith(root + path.sep)) return null;
    return await fs.readFile(real, "utf8");
  } catch {
    return null;
  }
}

/**
 * If every readable target file shares one dominant EOL, rewrite the entire
 * patch's line terminators to it; otherwise return the patch unchanged. The
 * caller's fresh `git apply --check` is the safety gate, so a no-op here simply
 * preserves the existing refusal.
 */
export async function normalizePatchEol(
  patch: string,
  worktreePath: string,
): Promise<string> {
  const eols = new Set<Eol>();
  for (const rel of sourcePaths(patch)) {
    const content = await readInside(worktreePath, rel);
    if (content !== null) eols.add(dominantEol(content));
  }
  if (eols.size !== 1) return patch; // nothing readable, or mixed -> leave as-is
  const target = [...eols][0]!;
  // Detect the PATCH's own terminator from its first (structural) line - never
  // from whole-patch content, because a CR that is part of a hunk line's
  // content would otherwise be mistaken for a terminator and dropped.
  const firstNl = patch.indexOf("\n");
  const from: Eol = firstNl > 0 && patch[firstNl - 1] === "\r" ? "\r\n" : "\n";
  if (from === target) return patch;
  // Swap only the inter-line terminators; line content (including any content
  // CR) is preserved.
  return patch.split(from).join(target);
}

async function applyCheck(
  patch: string,
  worktreePath: string,
  applyArgs: string[],
): Promise<{ ok: boolean; reason: string }> {
  const r = await execa(
    "git",
    ["apply", "--check", "--whitespace=nowarn", ...applyArgs],
    { cwd: worktreePath, input: patch, reject: false, timeout: 10_000, stdin: "pipe" },
  );
  if (r.exitCode === 0) return { ok: true, reason: "" };
  const reason = (r.stderr || r.stdout || "git apply --check failed")
    .toString()
    .slice(0, 500);
  return { ok: false, reason };
}

/**
 * Decide which patch text to feed to a strict `git apply`. Returns the patch
 * unchanged when it already applies; otherwise tries an EOL-normalized variant
 * and returns it only if a fresh `--check` passes; otherwise reports the
 * original failure. `applyArgs` (e.g. `["-R"]`) is threaded through both checks.
 */
export async function resolveApplicablePatch(
  patch: string,
  worktreePath: string,
  applyArgs: string[] = [],
): Promise<{ patch: string } | { ok: false; reason: string }> {
  const base = await applyCheck(patch, worktreePath, applyArgs);
  if (base.ok) return { patch };

  const normalized = await normalizePatchEol(patch, worktreePath);
  if (normalized !== patch) {
    const recheck = await applyCheck(normalized, worktreePath, applyArgs);
    if (recheck.ok) return { patch: normalized };
  }
  return { ok: false, reason: base.reason };
}
