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
async function isGitIgnored(worktreePath: string, relDir: string): Promise<boolean> {
  try {
    // Trailing slash matters: `node_modules/` in .gitignore is a dir-only
    // pattern, and the dir does not exist in the fresh worktree yet, so a
    // bare-name query never matches it (found live in the E2E run).
    const r = await execa("git", ["check-ignore", "-q", `${relDir}/`], {
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
  if (!(await isGitIgnored(worktreePath, relDir))) {
    return {
      dir: relDir,
      reason: "not gitignored in the worktree - linking would risk committing the symlink",
    };
  }
  try {
    await fs.mkdir(path.dirname(linkPath), { recursive: true });
    await fs.symlink(target, linkPath, "dir");
    return { dir: relDir, target };
  } catch (err) {
    return {
      dir: relDir,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
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

  for (const dir of ROOT_CANDIDATES) {
    const isJs = dir === "node_modules";
    if (isJs && !jsGuardOk) {
      if (await pathExists(path.join(projectRoot, dir))) {
        skipped.push({ dir, reason: jsGuardReason });
      }
      continue;
    }
    const r = await linkDir(projectRoot, worktreePath, dir);
    if ("target" in r) linked.push(r);
    else if (r.reason !== "not present in project root") skipped.push(r);
  }

  // Workspace packages (monorepos): nested node_modules under the same guard.
  if (jsGuardOk && (await pathExists(path.join(projectRoot, "node_modules")))) {
    for (const rel of await nestedNodeModulesDirs(projectRoot, 3)) {
      const r = await linkDir(projectRoot, worktreePath, rel);
      if ("target" in r) linked.push(r);
      else if (r.reason !== "not present in project root") skipped.push(r);
    }
  }

  return { linked, skipped };
}
