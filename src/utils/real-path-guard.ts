/**
 * Containment proven against real paths, for reads of a directory the product
 * itself writes into.
 *
 * A lexical check - path.resolve plus a string compare - proves only that a
 * requested PATH lands inside a root. It says nothing about where the bytes
 * behind it live, and stat/readFile/readdir all follow symlinks. That gap is
 * only interesting where something other than the caller can create entries in
 * the root, which is exactly the case for a run's own directories: an agent
 * writes there, so a planted link turns a read into an escape.
 *
 * Three facts, because each defeats a different link:
 *
 *   - the root itself must really live under `anchor`. A run can remove its own
 *     directory and re-create it as a link; anchoring only on the root's
 *     realpath would then make the escape target the root, with everything
 *     under it trivially "contained".
 *   - the leaf must not be a symlink.
 *   - the leaf's PARENT must really resolve inside the root, since a linked
 *     intermediate directory escapes as well as a linked leaf.
 *
 * What this does not close: a parent directory swapped between the check and
 * the open. Node exposes no openat/RESOLVE_BENEATH, so callers that care close
 * the leaf race themselves with O_NOFOLLOW on the open.
 */
import path from "node:path";
import { promises as fs, type Stats } from "node:fs";
import { isPathInside } from "./paths.js";

/** `symlink` is split out of `escapes` because it is worth saying out loud. */
export type RealPathFailure = "missing" | "symlink" | "escapes";

export type RealRootVerdict =
  | { ok: true; realRoot: string }
  | { ok: false; reason: RealPathFailure };

export type RealLeafVerdict = { ok: true; entry: Stats } | { ok: false; reason: RealPathFailure };

/** Prove `root` really resolves inside `anchor`. */
export async function verifyRealRoot(root: string, anchor: string): Promise<RealRootVerdict> {
  const realRoot = await fs.realpath(root).catch(() => null);
  if (!realRoot) return { ok: false, reason: "missing" };
  const realAnchor = await fs.realpath(anchor).catch(() => null);
  if (!realAnchor || !isPathInside(realAnchor, realRoot)) {
    return { ok: false, reason: "escapes" };
  }
  return { ok: true, realRoot };
}

/**
 * Prove `target` is a non-symlink leaf whose parent really sits inside
 * `realRoot`, which must have come from verifyRealRoot.
 */
export async function verifyRealLeaf(target: string, realRoot: string): Promise<RealLeafVerdict> {
  const entry = await fs.lstat(target).catch(() => null);
  if (!entry) return { ok: false, reason: "missing" };
  if (entry.isSymbolicLink()) return { ok: false, reason: "symlink" };
  const realParent = await fs.realpath(path.dirname(target)).catch(() => null);
  if (!realParent || !isPathInside(realRoot, realParent)) {
    return { ok: false, reason: "escapes" };
  }
  return { ok: true, entry };
}
