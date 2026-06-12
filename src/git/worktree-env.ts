import path from "node:path";
import fs from "node:fs/promises";
import { execa } from "execa";
import { pathExists } from "../utils/fs.js";

// ── Worktree environment linking (P8c) ──────────────────────────────────────
// A fresh `git worktree add` checks out tracked files only - the gitignored
// environment (node_modules, virtualenvs) stays behind, so validation commands
// fail with "command not found" and a correct change gets blocked for an
// environmental reason (observed on the first real dashboard run). Linking the
// project's env dirs into the worktree makes it work the way the user expects:
// the worktree behaves like the project it came from.
//
// Symlinks, not copies: instant, and local supervised runs already share the
// machine. The JS guard: node_modules is only linked when the lockfile in the
// worktree is byte-identical to the project's - a run that lands on a branch
// with different deps must not validate against the wrong tree.
//
// HONEST BOUNDARY NOTE (documented exception to "writes are worktree-
// bounded"): a write-capable agent in the worktree can write THROUGH a linked
// dir into the project root's env dir (its own installed deps). git-apply
// refuses paths beyond a symlink, so the apply gateway stays bounded; direct
// writes by an acceptEdits seat are not. Blast radius = the host project's
// gitignored env dirs only - never tracked sources - and the diff the human
// reviews shows any package.json/script change that could exploit it.
// `git.linkEnvironment: off` restores fully bare worktrees.

const LOCKFILES = ["pnpm-lock.yaml", "package-lock.json", "yarn.lock", "bun.lockb"];

/** Env dirs linked when present at the project root. node_modules carries the
 *  lockfile guard; virtualenvs hold absolute paths back into the project, so a
 *  symlink keeps them working from the worktree. */
const ROOT_CANDIDATES = ["node_modules", ".venv", "venv"];

export type EnvLink = { dir: string; target: string };
export type EnvLinkSkip = { dir: string; reason: string };
export type EnvLinkResult = { linked: EnvLink[]; skipped: EnvLinkSkip[] };

async function filesIdentical(a: string, b: string): Promise<boolean> {
  try {
    const [ba, bb] = await Promise.all([fs.readFile(a), fs.readFile(b)]);
    return ba.equals(bb);
  } catch {
    return false;
  }
}

/** A linked dir must be gitignored in the worktree - otherwise the run's
 *  `git add -A` commit would stage the SYMLINK as a tracked entry and an
 *  out-of-tree link could ride a merge into main (adversarial review).
 *  Fail-closed: can't verify -> don't link. */
const EXCLUDE_MARKER = "# vibestrate:worktree-env (managed)";

function excludePattern(relDir: string): string {
  return `/${relDir.split(path.sep).join("/")}`;
}

async function resolveExcludePath(worktreePath: string): Promise<string | null> {
  try {
    const r = await execa("git", ["rev-parse", "--git-common-dir"], {
      cwd: worktreePath,
      reject: false,
    });
    if (r.exitCode !== 0) return null;
    const commonDir = path.resolve(worktreePath, r.stdout.trim());
    return path.join(commonDir, "info", "exclude");
  } catch {
    return null;
  }
}

/**
 * Make ONE about-to-be-linked path ignorable AS A SYMLINK (or undo it on
 * rollback). The usual `.gitignore` pattern is dir-only (`node_modules/`) and
 * a dir-only pattern does not match a symlink - a real run's reviewer caught
 * `git add -A` staging the link. Git's local exclude file
 * (`$GIT_COMMON_DIR/info/exclude`) exists exactly for clone-local ignores:
 * never committed, never in a diff, shared by every worktree of the repo.
 *
 * This file is USER-OWNED shared state in the MAIN repo, so the update is
 * deliberately careful (adversarial review): per-dir (a pattern is written
 * only at the moment its link is actually created, never for candidates that
 * end up skipped), serialized by a lockfile (concurrent runs share one
 * exclude), deduplicated, and atomic (temp file + rename). Removal on
 * rollback keeps the managed block from accumulating stale entries.
 */
async function updateLocalExclude(
  worktreePath: string,
  change: { add?: string; remove?: string },
): Promise<boolean> {
  const excludePath = await resolveExcludePath(worktreePath);
  if (!excludePath) return false;
  const lockPath = `${excludePath}.vibestrate-lock`;
  const deadline = Date.now() + 2_000;
  let locked = false;
  try {
    while (!locked) {
      try {
        const fh = await fs.open(lockPath, "wx");
        await fh.close();
        locked = true;
      } catch {
        // Steal a stale lock (a crashed run must not disable linking forever).
        try {
          const st = await fs.stat(lockPath);
          if (Date.now() - st.mtimeMs > 30_000) {
            await fs.unlink(lockPath).catch(() => undefined);
            continue;
          }
        } catch {
          continue; // lock vanished - retry acquisition
        }
        if (Date.now() > deadline) return false;
        await new Promise((r) => setTimeout(r, 50));
      }
    }
    let existing = "";
    try {
      existing = await fs.readFile(excludePath, "utf8");
    } catch {
      /* no exclude file yet */
    }
    // Only the marker-delimited block is ours; every user line (even one that
    // happens to equal a pattern we'd write) passes through untouched.
    const lines = existing.split("\n");
    const managed = new Set<string>();
    const userLines: string[] = [];
    let inBlock = false;
    for (const line of lines) {
      const t = line.trim();
      if (t === EXCLUDE_MARKER) {
        inBlock = true; // duplicate markers from older versions collapse
        continue;
      }
      if (inBlock) {
        if (t === "" || t.startsWith("#")) {
          inBlock = false;
          if (t !== "") userLines.push(line);
          continue;
        }
        managed.add(t);
        continue;
      }
      userLines.push(line);
    }
    if (change.add) managed.add(change.add);
    if (change.remove) managed.delete(change.remove);
    while (userLines.length > 0 && userLines[userLines.length - 1]!.trim() === "") {
      userLines.pop();
    }
    const next = [
      ...userLines,
      ...(managed.size > 0 ? ["", EXCLUDE_MARKER, ...[...managed].sort()] : []),
      "",
    ].join("\n");
    await fs.mkdir(path.dirname(excludePath), { recursive: true });
    const tmp = `${excludePath}.vibestrate-tmp-${process.pid}`;
    await fs.writeFile(tmp, next);
    await fs.rename(tmp, excludePath);
    return true;
  } catch {
    return false;
  } finally {
    if (locked) await fs.unlink(lockPath).catch(() => undefined);
  }
}

/** Ignore check against the path AS IT EXISTS on disk (run AFTER creating
 *  the link) - asking about a hypothetical `dir/` was how a dir-only pattern
 *  fooled the old guard into linking something `git add -A` would stage. */
async function isGitIgnored(worktreePath: string, relDir: string): Promise<boolean> {
  try {
    const r = await execa("git", ["check-ignore", "-q", relDir], {
      cwd: worktreePath,
      reject: false,
    });
    return r.exitCode === 0;
  } catch {
    return false;
  }
}

/** Workspace packages with their own node_modules (pnpm/yarn workspaces),
 *  found shallowly - never descending into env dirs or VCS internals. */
async function nestedNodeModulesDirs(
  root: string,
  maxDepth: number,
): Promise<string[]> {
  const found: string[] = [];
  const walk = async (rel: string, depth: number): Promise<void> => {
    if (depth > maxDepth) return;
    const abs = path.join(root, rel);
    let entries: { name: string; isDirectory(): boolean; isSymbolicLink(): boolean }[];
    try {
      entries = await fs.readdir(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory() || e.isSymbolicLink()) continue;
      if (e.name.startsWith(".") || e.name === "node_modules") {
        if (e.name === "node_modules" && rel !== "") {
          found.push(path.join(rel, "node_modules"));
        }
        continue;
      }
      await walk(path.join(rel, e.name), depth + 1);
    }
  };
  await walk("", 0);
  return found;
}

async function linkDir(
  projectRoot: string,
  worktreePath: string,
  relDir: string,
): Promise<EnvLink | EnvLinkSkip> {
  const target = path.join(projectRoot, relDir);
  const linkPath = path.join(worktreePath, relDir);
  if (!(await pathExists(target))) {
    return { dir: relDir, reason: "not present in project root" };
  }
  if (await pathExists(linkPath)) {
    return { dir: relDir, reason: "already exists in worktree" };
  }
  // The exclude pattern is written ONLY here, at the moment this dir is
  // actually linked - never for skipped candidates (a vendored-node_modules
  // repo must not get a main-checkout ignore for a dir we never touched).
  const pattern = excludePattern(relDir);
  await updateLocalExclude(worktreePath, { add: pattern });
  try {
    await fs.mkdir(path.dirname(linkPath), { recursive: true });
    await fs.symlink(target, linkPath, "dir");
  } catch (err) {
    await updateLocalExclude(worktreePath, { remove: pattern });
    return {
      dir: relDir,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
  // VERIFY against the link that now exists (not a hypothetical path shape):
  // if git would still see it - e.g. a `!node_modules` negation overriding
  // the exclude - remove both the link and the pattern. A link the run could
  // commit is worse than no link; validation's `environment` status stays
  // the honest fallback.
  if (!(await isGitIgnored(worktreePath, relDir))) {
    await fs.unlink(linkPath).catch(() => undefined);
    await updateLocalExclude(worktreePath, { remove: pattern });
    return {
      dir: relDir,
      reason:
        "git does not ignore the created link even with the local exclude - removed it (a committable link is worse than no link)",
    };
  }
  return { dir: relDir, target };
}

/**
 * Link the project's environment dirs into a freshly created worktree.
 * Best-effort by design: a skip is reported, never thrown - the run proceeds
 * and validation's environment detection (validation-runner) stays the honest
 * fallback when nothing could be linked.
 */
export async function linkWorktreeEnvironment(input: {
  projectRoot: string;
  worktreePath: string;
}): Promise<EnvLinkResult> {
  const { projectRoot, worktreePath } = input;
  const linked: EnvLink[] = [];
  const skipped: EnvLinkSkip[] = [];

  // JS lockfile guard: linked deps must describe the checked-out tree.
  let jsGuardOk = true;
  let jsGuardReason = "no lockfile in project root";
  for (const lf of LOCKFILES) {
    const rootLock = path.join(projectRoot, lf);
    if (!(await pathExists(rootLock))) continue;
    const wtLock = path.join(worktreePath, lf);
    if (!(await pathExists(wtLock))) {
      jsGuardOk = false;
      jsGuardReason = `${lf} missing in worktree checkout`;
      break;
    }
    if (!(await filesIdentical(rootLock, wtLock))) {
      jsGuardOk = false;
      jsGuardReason = `${lf} differs between project root and worktree`;
      break;
    }
    jsGuardOk = true;
    jsGuardReason = "";
    break;
  }

  // Everything we may link, decided up front so the local exclude can be
  // written once for exactly these paths.
  const candidates: string[] = [];
  for (const dir of ROOT_CANDIDATES) {
    const isJs = dir === "node_modules";
    if (isJs && !jsGuardOk) {
      if (await pathExists(path.join(projectRoot, dir))) {
        skipped.push({ dir, reason: jsGuardReason });
      }
      continue;
    }
    if (await pathExists(path.join(projectRoot, dir))) candidates.push(dir);
  }
  if (jsGuardOk && (await pathExists(path.join(projectRoot, "node_modules")))) {
    candidates.push(...(await nestedNodeModulesDirs(projectRoot, 3)));
  }
  if (candidates.length === 0) return { linked, skipped };

  for (const rel of candidates) {
    const r = await linkDir(projectRoot, worktreePath, rel);
    if ("target" in r) linked.push(r);
    else if (r.reason !== "not present in project root") skipped.push(r);
  }

  return { linked, skipped };
}
