import path from "node:path";
import { fileURLToPath } from "node:url";
import { readText, pathExists } from "../utils/fs.js";
import type { BuiltinRoleId } from "./role-schema.js";
import { builtinRoleIds } from "./role-schema.js";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Relative locations of the prompts dir under a package root, newest first. */
const REL_CANDIDATES = [
  ["src", "roles", "default-prompts"], // source / shipped layout
  ["dist", "default-prompts"], // (future) copied-into-dist layout
];

/**
 * Resolve the bundled default-prompts directory starting from `startDir`.
 * Works for every layout: tsx dev (sibling of this module), the bundled
 * single-file `dist/index.js`, and an installed package - by trying the
 * sibling first, then walking up looking for `src/roles/default-prompts`
 * (or a copied `dist/default-prompts`). Returns null + the tried paths so the
 * caller can raise a useful error. Exported for tests (the bundle layout is
 * the one that historically broke).
 */
export async function resolvePromptsDir(
  startDir: string,
): Promise<{ dir: string | null; tried: string[] }> {
  const tried: string[] = [];
  const sibling = path.join(startDir, "default-prompts");
  tried.push(sibling);
  if (await pathExists(sibling)) return { dir: sibling, tried };

  let dir = startDir;
  for (let i = 0; i < 8; i += 1) {
    for (const rel of REL_CANDIDATES) {
      const candidate = path.join(dir, ...rel);
      tried.push(candidate);
      if (await pathExists(candidate)) return { dir: candidate, tried };
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return { dir: null, tried };
}

async function findPromptsDir(): Promise<string> {
  const { dir, tried } = await resolvePromptsDir(here);
  if (dir) return dir;
  throw new Error(
    `Could not locate default-prompts directory. Looked in:\n${tried.join("\n")}`,
  );
}

export async function readDefaultPrompt(roleId: BuiltinRoleId): Promise<string> {
  const dir = await findPromptsDir();
  return readText(path.join(dir, `${roleId}.md`));
}

export function getBuiltinRoleIds(): readonly BuiltinRoleId[] {
  return builtinRoleIds;
}
