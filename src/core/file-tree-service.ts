import path from "node:path";
import fs from "node:fs/promises";
import { isPathInside } from "../utils/paths.js";
import { isSecretLikePath } from "./diff-service.js";

export type FileTreeEntryKind = "file" | "directory";

export type FileTreeEntry = {
  name: string;
  /** Forward-slash relative path inside the tree's root. */
  path: string;
  kind: FileTreeEntryKind;
  size: number | null;
  isSecretLike: boolean;
  /** Whether this directory was truncated because of depth/maxEntries. */
  truncated?: boolean;
  /** Sorted entries (folders first, then files). Undefined for files. */
  children?: FileTreeEntry[];
};

export type FileTreeResult = {
  root: string;
  rootKind: "project" | "worktree";
  rootLabel: string;
  depth: number;
  maxEntries: number;
  truncated: boolean;
  totalCount: number;
  tree: FileTreeEntry;
};

const DEFAULT_EXCLUDES = new Set([
  ".git",
  "node_modules",
  ".DS_Store",
  ".next",
  ".turbo",
  ".cache",
  ".parcel-cache",
  ".vite",
  ".svelte-kit",
  "dist",
  "build",
  "out",
  "coverage",
  ".nyc_output",
  ".pytest_cache",
  ".mypy_cache",
  "__pycache__",
  ".tox",
  ".venv",
  "venv",
  "target",
  ".gradle",
  ".idea",
  ".vscode-test",
]);

export type BuildFileTreeInput = {
  rootPath: string;
  rootKind: "project" | "worktree";
  rootLabel: string;
  /** Default 4. */
  depth?: number;
  /** Default 2000. Caps total entries across the whole tree. */
  maxEntries?: number;
  /** Include dotfiles + dotted dirs (still excludes .git). Default false. */
  includeHidden?: boolean;
  /** Include the .vibestrate directory in the tree. Default false. */
  includeVibestrate?: boolean;
};

export async function buildFileTree(
  input: BuildFileTreeInput,
): Promise<FileTreeResult> {
  const depth = Math.max(1, Math.min(input.depth ?? 4, 12));
  const maxEntries = Math.max(50, Math.min(input.maxEntries ?? 2000, 20_000));
  const includeHidden = input.includeHidden === true;
  const includeVibestrate = input.includeVibestrate === true;
  const counter = { count: 0, truncated: false };

  const root: FileTreeEntry = {
    name: path.basename(input.rootPath) || input.rootLabel,
    path: "",
    kind: "directory",
    size: null,
    isSecretLike: false,
    children: [],
  };
  await walk(
    input.rootPath,
    "",
    root,
    1,
    depth,
    maxEntries,
    includeHidden,
    includeVibestrate,
    counter,
  );

  return {
    root: input.rootPath,
    rootKind: input.rootKind,
    rootLabel: input.rootLabel,
    depth,
    maxEntries,
    truncated: counter.truncated,
    totalCount: counter.count,
    tree: root,
  };
}

async function walk(
  baseAbs: string,
  baseRel: string,
  node: FileTreeEntry,
  level: number,
  depth: number,
  maxEntries: number,
  includeHidden: boolean,
  includeVibestrate: boolean,
  counter: { count: number; truncated: boolean },
): Promise<void> {
  const abs = path.join(baseAbs, baseRel);
  let dirEntries: import("node:fs").Dirent[];
  try {
    dirEntries = await fs.readdir(abs, { withFileTypes: true });
  } catch {
    return;
  }

  const filtered = dirEntries.filter((e) => {
    if (DEFAULT_EXCLUDES.has(e.name)) return false;
    if (!includeVibestrate && e.name === ".vibestrate") return false;
    if (!includeHidden && e.name.startsWith(".") && e.name !== ".vibestrate") {
      return false;
    }
    return true;
  });

  // Sort folders first, then files. Stable, locale-aware.
  filtered.sort((a, b) => {
    const aDir = a.isDirectory() ? 0 : 1;
    const bDir = b.isDirectory() ? 0 : 1;
    if (aDir !== bDir) return aDir - bDir;
    return a.name.localeCompare(b.name, "en");
  });

  for (const e of filtered) {
    if (counter.count >= maxEntries) {
      counter.truncated = true;
      node.truncated = true;
      return;
    }
    const rel = baseRel ? `${baseRel}/${e.name}` : e.name;
    const entryAbs = path.join(baseAbs, rel);
    const safeStill = isPathInside(baseAbs, entryAbs);
    if (!safeStill) continue;
    counter.count += 1;

    if (e.isSymbolicLink()) {
      // Show symlinks but don't follow them.
      let target: import("node:fs").Stats | null = null;
      try {
        target = await fs.lstat(entryAbs);
      } catch {
        target = null;
      }
      node.children!.push({
        name: e.name,
        path: rel,
        kind: target?.isDirectory() ? "directory" : "file",
        size: target?.isFile() ? target.size : null,
        isSecretLike: isSecretLikePath(rel),
      });
      continue;
    }

    if (e.isDirectory()) {
      const child: FileTreeEntry = {
        name: e.name,
        path: rel,
        kind: "directory",
        size: null,
        isSecretLike: isSecretLikePath(rel),
        children: [],
      };
      node.children!.push(child);
      if (level < depth) {
        await walk(
          baseAbs,
          rel,
          child,
          level + 1,
          depth,
          maxEntries,
          includeHidden,
          includeVibestrate,
          counter,
        );
      } else {
        child.truncated = true;
      }
    } else if (e.isFile()) {
      let size: number | null = null;
      try {
        size = (await fs.stat(entryAbs)).size;
      } catch {
        size = null;
      }
      node.children!.push({
        name: e.name,
        path: rel,
        kind: "file",
        size,
        isSecretLike: isSecretLikePath(rel),
      });
    }
  }
}
