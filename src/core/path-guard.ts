/**
 * Path containment guard for user-supplied paths.
 *
 * Resolves a path (relative or absolute) against a caller-declared list of
 * allowed roots and returns it only when containment holds - otherwise throws
 * PathGuardError(400). Containment is judged twice: textually against the root,
 * and again after symlink resolution against the root's own realpath, so a link
 * pointing out of the root is rejected instead of followed.
 *
 * The subtle part is the ENOENT branch of that check. A missing entry is a
 * legitimate absence the caller turns into a 404, but it is also what a dangling
 * symlink looks like, and a writer that follows one creates the target wherever
 * the link points. So on ENOENT the guard reads the link itself and then climbs
 * to the nearest existing ancestor, checking each level, since a symlinked
 * parent escapes just as well as a symlinked leaf. That climb stops at the
 * declared root, so a root whose directories have not been created yet (a
 * worktree before checkout) is not treated as an escape.
 *
 * The guard proves containment and nothing more: it never opens file contents,
 * it leaves "missing vs present" to the caller, and `isSecretLike` on the result
 * is a flag for the caller to act on rather than a refusal made here.
 */
import path from "node:path";
import fs from "node:fs/promises";
import { isPathInside } from "../utils/paths.js";
import { isSecretLikePath } from "./diff-service.js";

export type RootKind = "project" | "worktree" | "vibestrate";

export type AllowedRoot = {
  kind: RootKind;
  /** Absolute, normalised path to the root. */
  absolutePath: string;
  /** A short label used in error/UI messages. */
  label: string;
};

export class PathGuardError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "PathGuardError";
  }
}

export type ResolvedSafePath = {
  absolutePath: string;
  /** Forward-slash relative path inside the matching root. */
  relativePath: string;
  root: AllowedRoot;
  isSecretLike: boolean;
};

const ABS_MAC_LINUX = /^\//;
const ABS_WIN = /^[a-zA-Z]:[\\/]/;

function looksAbsolute(p: string): boolean {
  return ABS_MAC_LINUX.test(p) || ABS_WIN.test(p);
}

function normaliseRel(rel: string): string {
  // Strip leading "./", normalise separators to forward slashes, drop a trailing slash.
  let s = rel.replace(/\\/g, "/");
  while (s.startsWith("./")) s = s.slice(2);
  if (s.startsWith("/")) s = s.slice(1);
  if (s.endsWith("/") && s.length > 1) s = s.slice(0, -1);
  return s;
}

async function pathExistsOnDisk(abs: string): Promise<boolean> {
  try {
    await fs.stat(abs);
    return true;
  } catch {
    return false;
  }
}

/**
 * Strict UI-facing path guard. Resolves a user-supplied path against the
 * allowed roots and ensures:
 *  - no absolute paths sneak in unless they resolve inside an allowed root,
 *  - no traversal segments,
 *  - the realpath (after symlink resolution, when the file exists) still
 *    resolves inside the same root.
 *
 * Throws PathGuardError(400) on any violation. Does NOT enforce a 404 - the
 * caller decides whether the absence of a file is "not found" or normal.
 */
/** Hops shared by the two resolvers below, which call each other: a cycle must
 *  end the way the OS ends one, with a refusal rather than a hang. */
type HopBudget = { left: number };

/**
 * The real location a path would occupy, including when it does not exist yet.
 *
 * `fs.realpath` fails outright on a missing target, which is exactly the case a
 * containment guard must still judge: a link pointing at a file that has not
 * been created is only honest if the place it WOULD be created is inside the
 * root. So resolve the deepest ancestor that does exist and re-attach the
 * missing tail, rather than trusting the textual path.
 */
async function realLocationOf(target: string, budget: HopBudget): Promise<string | null> {
  const missingTail: string[] = [];
  let probe = target;
  for (let climb = 0; climb <= 64; climb++) {
    const real = await fs.realpath(probe).catch(() => null);
    if (real) return missingTail.length > 0 ? path.join(real, ...missingTail) : real;
    // realpath failing does NOT mean "missing". A DANGLING SYMLINK fails it too,
    // and climbing past one would re-attach the tail to a textual path - the
    // very mistake the leaf check exists to stop, made one level up. Hand a link
    // to the chain follower and rebuild the tail on whatever it really resolves
    // to.
    const entry = await fs.lstat(probe).catch(() => null);
    if (entry?.isSymbolicLink()) {
      const landed = await resolveThroughLinks(probe, budget);
      if (landed === null) return null;
      return missingTail.length > 0 ? path.join(landed, ...missingTail) : landed;
    }
    const parent = path.dirname(probe);
    if (parent === probe) return null;
    missingTail.unshift(path.basename(probe));
    probe = parent;
  }
  return null;
}

/**
 * Follow a symlink chain to where it really lands.
 *
 * The leaf check used to judge a dangling link by ONE textual hop: read the
 * target, resolve it against the link's own directory, and compare. That is
 * wrong in three ways that were reproduced against this function - a second hop
 * (a -> b -> outside), a symlinked DIRECTORY in the target (link -> dirlink/x
 * where dirlink leaves the root), and a relative target through such a
 * directory - each of which was declared contained while really pointing
 * outside. The ancestor walk below already had a realpath backstop; the leaf
 * branch did not, and that asymmetry was the bug.
 *
 * Each hop resolves against the link's REAL directory, so a symlinked parent is
 * followed rather than taken at face value. The hop bound is what the OS would
 * enforce with ELOOP: a cycle returns null, which the caller refuses.
 */
async function resolveThroughLinks(
  start: string,
  budget: HopBudget = { left: 32 },
): Promise<string | null> {
  let current = start;
  for (;;) {
    if (budget.left-- <= 0) return null;
    const entry = await fs.lstat(current).catch(() => null);
    if (!entry?.isSymbolicLink()) return realLocationOf(current, budget);
    const target = await fs.readlink(current).catch(() => null);
    if (target === null) return null;
    const realDir = await realLocationOf(path.dirname(current), budget);
    if (realDir === null) return null;
    // Walk the target COMPONENT BY COMPONENT rather than path.resolve'ing it.
    // `path.resolve` collapses `..` lexically; the kernel does not. It resolves
    // each component first, so a `..` placed AFTER a symlink goes up from where
    // that link landed. `dl/../x` with `dl` pointing out of the root is
    // therefore `<outside>/x` to the OS and `<root>/x` to path.resolve - the
    // guard approved it, and a write through the approved path landed outside
    // the root. That is the same one-textual-hop mistake this function was
    // written to remove, hiding in the `..` handling.
    const startAt = path.isAbsolute(target)
      ? path.parse(path.resolve(target)).root
      : realDir;
    let walked = startAt;
    for (const segment of target.split(/[\\/]+/)) {
      if (segment === "" || segment === ".") continue;
      if (segment === "..") {
        // Up from where the path so far REALLY lands, which is what the kernel
        // does and the only reason this walk exists.
        const real = await realLocationOf(walked, budget);
        if (real === null) return null;
        walked = path.dirname(real);
        continue;
      }
      walked = path.join(walked, segment);
    }
    current = walked;
  }
}

export async function resolveSafePath(
  userPath: string,
  roots: readonly AllowedRoot[],
  opts: {
    /** When the same relative path is contained by more than one root, prefer
     *  the first (declaration order) where the entry actually EXISTS on disk -
     *  falling back to the first containing root for an honest 404. Off by
     *  default (callers keep strict declaration-order). The run file viewer sets
     *  it (with worktree-first roots) so a file created/modified in the run's
     *  worktree resolves to the worktree copy, not a stale/absent project one. */
    preferExistingRoot?: boolean;
  } = {},
): Promise<ResolvedSafePath> {
  if (!userPath || !userPath.trim()) {
    throw new PathGuardError(400, "Path is required.");
  }
  if (roots.length === 0) {
    throw new PathGuardError(400, "No allowed roots configured for this request.");
  }
  const trimmed = userPath.trim();

  // Disallow NUL bytes and embedded newlines outright. A space is a LEGAL
  // filename character on POSIX + Windows, so it must not be in this class.
  if (/[\u0000\r\n]/.test(trimmed)) {
    throw new PathGuardError(400, "Path contains invalid characters.");
  }

  // Reject absolute paths unless the absolute path is inside one of the roots.
  let candidateAbs: string | null = null;
  if (looksAbsolute(trimmed)) {
    const norm = path.resolve(trimmed);
    const matched = roots.find((r) => isPathInside(r.absolutePath, norm));
    if (!matched) {
      throw new PathGuardError(
        400,
        "Absolute paths must resolve inside an allowed root.",
      );
    }
    candidateAbs = norm;
  }

  // Reject any traversal segment in the rel input.
  const rel = normaliseRel(trimmed);
  if (rel.split("/").some((s) => s === "..")) {
    throw new PathGuardError(400, "Path may not contain '..'.");
  }

  // Pick the matching root. For an absolute path, the first root that contains
  // it. For a relative path, every root geometrically contains it (join +
  // isPathInside), so by default the first declared root wins - but when a run
  // worktree nests under the project root, "first" would always be the project
  // and a file living only in the worktree would 404 (or, if modified, show the
  // stale project copy). `preferExistingRoot` fixes that: among containing
  // roots, prefer the first whose joined path actually EXISTS on disk.
  let chosen: { abs: string; root: AllowedRoot } | null = null;
  if (candidateAbs) {
    const matched = roots.find((r) => isPathInside(r.absolutePath, candidateAbs!));
    if (matched) chosen = { abs: candidateAbs, root: matched };
  } else {
    const containing: { abs: string; root: AllowedRoot }[] = [];
    for (const root of roots) {
      const joined = path.resolve(root.absolutePath, rel);
      if (isPathInside(root.absolutePath, joined)) {
        containing.push({ abs: joined, root });
      }
    }
    if (containing.length > 0) {
      if (opts.preferExistingRoot && containing.length > 1) {
        for (const cand of containing) {
          if (await pathExistsOnDisk(cand.abs)) {
            chosen = cand;
            break;
          }
        }
      }
      // No existing match (or feature off): the first containing root, so a
      // genuine 404 still resolves to a sensible (worktree-first) root.
      chosen ??= containing[0]!;
    }
  }
  if (!chosen) {
    throw new PathGuardError(400, "Path resolves outside every allowed root.");
  }

  // Symlink check: realpath must still be inside the same root. We compare
  // against the root's realpath so that platform quirks (macOS resolves
  // /var/folders → /private/var/folders) don't trip the guard. We only run
  // realpath when the entry exists; callers handle 404 separately.
  try {
    const realRoot = await fs.realpath(chosen.root.absolutePath).catch(() =>
      chosen.root.absolutePath,
    );
    const real = await fs.realpath(chosen.abs);
    if (!isPathInside(realRoot, real)) {
      throw new PathGuardError(
        400,
        "Path resolves through a symlink that escapes the allowed root.",
      );
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      // EACCES, ELOOP, etc. - treat as 400; we will not return contents we
      // cannot prove are inside the root.
      if (err instanceof PathGuardError) throw err;
      throw new PathGuardError(400, "Refusing to resolve this path safely.");
    }
    // ENOENT covers two very different cases: a genuinely missing entry, which
    // callers turn into a 404, and a DANGLING symlink, where the link exists and
    // realpath fails on its missing target. Letting the second through declares
    // the path contained, and a writer that follows it then creates the target
    // wherever the link points - outside the root.
    const realRoot = await fs
      .realpath(chosen.root.absolutePath)
      .catch(() => chosen.root.absolutePath);
    const leaf = await fs.lstat(chosen.abs).catch(() => null);
    if (leaf?.isSymbolicLink()) {
      // A dangling link is not automatically an escape. One pointing at a file
      // inside the root that has not been generated yet - a build output, a
      // placeholder - is an honest 404, and calling it an escape tells the owner
      // their file left the project when it did not. Resolve the target the way
      // the OS would and judge it on where it actually points.
      const resolved = await resolveThroughLinks(chosen.abs);
      if (resolved === null || !isPathInside(realRoot, resolved)) {
        throw new PathGuardError(
          400,
          "Path resolves through a symlink that escapes the allowed root.",
        );
      }
    }
    // A missing leaf is legitimate, but only if the directory it would be
    // created in is really inside the root. Walk up to the nearest ancestor that
    // exists, since a symlinked parent escapes just as well as a symlinked leaf.
    let probe = path.dirname(chosen.abs);
    for (;;) {
      // A directory link whose target is missing also fails realpath, so
      // climbing past it without looking would leave the same hole the leaf
      // check closes: the containment claim would be false even though nothing
      // can be written through it today.
      const probeLink = await fs.lstat(probe).catch(() => null);
      if (probeLink?.isSymbolicLink()) {
        // Through the chain follower, not one textual hop. This branch exists
        // for a DANGLING directory link, which realpath cannot resolve - so the
        // single-hop version here was the same defect the leaf check had, and
        // fixing only the leaf left it reachable one level up.
        const resolved = await resolveThroughLinks(probe);
        if (resolved === null || !isPathInside(realRoot, resolved)) {
          throw new PathGuardError(
            400,
            "Path resolves through a symlink that escapes the allowed root.",
          );
        }
      }
      const realProbe = await fs.realpath(probe).catch(() => null);
      if (realProbe) {
        if (realProbe !== realRoot && !isPathInside(realRoot, realProbe)) {
          throw new PathGuardError(
            400,
            "Path resolves through a symlink that escapes the allowed root.",
          );
        }
        break;
      }
      // Stop at the root. The resolved path was already proven to be inside it
      // textually, so a root whose own directories do not exist yet (a worktree
      // before it is created) is not an escape - climbing past it would find
      // some existing ancestor outside the root and reject a legitimate path.
      if (probe === chosen.root.absolutePath) break;
      const parent = path.dirname(probe);
      if (parent === probe) break;
      probe = parent;
    }
  }

  const finalRel = path
    .relative(chosen.root.absolutePath, chosen.abs)
    .replace(/\\/g, "/");
  return {
    absolutePath: chosen.abs,
    relativePath: finalRel,
    root: chosen.root,
    isSecretLike: isSecretLikePath(finalRel),
  };
}

/**
 * Convenience: build the canonical project + (optional) run-worktree allow-list.
 * Other Vibestrate data dirs are addressed via dedicated routes, not the file viewer.
 *
 * `worktreeFirst` puts the worktree root ahead of the project root. Combined
 * with `resolveSafePath({ preferExistingRoot: true })`, that makes the run file
 * viewer show the run's own copy of a file (a file modified in the worktree
 * resolves to the worktree, not the stale project copy).
 */
export function buildProjectRoots(input: {
  projectRoot: string;
  worktreePath?: string | null;
  worktreeLabel?: string;
  worktreeFirst?: boolean;
}): AllowedRoot[] {
  const project: AllowedRoot = {
    kind: "project",
    absolutePath: path.resolve(input.projectRoot),
    label: "project",
  };
  const worktree: AllowedRoot | null = input.worktreePath
    ? {
        kind: "worktree",
        absolutePath: path.resolve(input.worktreePath),
        label: input.worktreeLabel ?? "worktree",
      }
    : null;
  if (!worktree) return [project];
  return input.worktreeFirst ? [worktree, project] : [project, worktree];
}
