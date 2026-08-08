import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function writeText(filePath: string, contents: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, contents, "utf8");
}

/**
 * Atomically replace `filePath` with `contents`: write a sibling temp file in the
 * SAME directory (so `rename` stays on one filesystem and is atomic), then rename
 * it onto the target. A crash/kill mid-write can only leave a stray `.tmp` file,
 * never a truncated target. Mirrors the temp+rename technique in
 * `src/project/project-params.ts` (`writeAtomic`). The temp file is cleaned up on
 * a rename failure.
 */
export async function writeTextAtomic(filePath: string, contents: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  // The suffix must be unique per CALL, not per process. Two concurrent writes
  // to the same file from one process - which the review-panel fan-out really
  // does produce - would otherwise share a temp path, interleave into it, and
  // rename the mixture over the target.
  const tmp = `${filePath}.tmp.${process.pid}.${randomUUID()}`;
  await fs.writeFile(tmp, contents, "utf8");
  try {
    // rename brings the temp file's own mode with it, so replacing a file the
    // owner had tightened (a 0600 state.json) would silently widen it to the
    // default 0644. Carry the existing mode across; a file that does not exist
    // yet keeps the default.
    const existing = await fs.stat(filePath).catch(() => null);
    if (existing) await fs.chmod(tmp, existing.mode & 0o777);
    await fs.rename(tmp, filePath);
  } catch (err) {
    await fs.unlink(tmp).catch(() => undefined);
    throw err;
  }
}

export async function readText(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf8");
}

export async function appendLine(filePath: string, line: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const out = line.endsWith("\n") ? line : `${line}\n`;
  await fs.appendFile(filePath, out, "utf8");
}

export function pathExistsSync(filePath: string): boolean {
  return existsSync(filePath);
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readDirSafe(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir);
  } catch {
    return [];
  }
}
