// ── Auto-detected model catalog cache (.vibestrate/providers-detected.json) ──
//
// Machine-managed: written by the run-start "Preparing models" stage
// (provider-model-autodetect.ts) from codex `debug models --bundled` (instant,
// offline). Merged BELOW the hand-authored providers-catalog.yml overlay and
// ABOVE the built-in curated catalog, so:
//
//   built-in (curated, stale) < detected cache (auto) < user overlay (explicit)
//
// Detection refreshes only WHICH models exist + their effort levels; the apply
// mechanics (--model, -c model_reasoning_effort=) stay single-sourced from the
// built-in spec. Delete the file to clear; a hand overlay always wins.

import fs from "node:fs/promises";
import { z } from "zod";
import { readText, pathExists, ensureDir } from "../utils/fs.js";
import path from "node:path";
import { providersDetectedPath } from "../utils/paths.js";
import {
  BUILTIN_CATALOG,
  type ResolvedCatalog,
  type ProviderApplySpec,
} from "./provider-apply.js";

const detectedEntrySchema = z.object({
  models: z.array(z.string()),
  efforts: z.array(z.string()),
  detectedAt: z.string(),
  binaryVersion: z.string().nullable().default(null),
  source: z.string(),
});
export type DetectedCacheEntry = z.infer<typeof detectedEntrySchema>;

const detectedCacheSchema = z.object({
  schemaVersion: z.literal(1),
  providers: z.record(z.string(), detectedEntrySchema),
});
export type DetectedCache = z.infer<typeof detectedCacheSchema>;

export function emptyCache(): DetectedCache {
  return { schemaVersion: 1, providers: {} };
}

/** Read the cache. Returns an empty cache when absent or unreadable - a corrupt
 *  cache must never break catalog resolution (the lower layers stand). */
export async function loadDetectedCache(projectRoot: string): Promise<DetectedCache> {
  const file = providersDetectedPath(projectRoot);
  if (!(await pathExists(file))) return emptyCache();
  try {
    const parsed = detectedCacheSchema.safeParse(JSON.parse(await readText(file)));
    return parsed.success ? parsed.data : emptyCache();
  } catch {
    return emptyCache();
  }
}

export async function writeDetectedCache(
  projectRoot: string,
  cache: DetectedCache,
): Promise<void> {
  // Atomic write (temp + rename) so a concurrent run starting at the same time
  // can never read a torn JSON file - the rename is atomic on POSIX, and a
  // reader either sees the old file or the new one, never a partial.
  const file = providersDetectedPath(projectRoot);
  await ensureDir(path.dirname(file));
  const tmp = `${file}.tmp-${process.pid}`;
  await fs.writeFile(tmp, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
  await fs.rename(tmp, file);
}

/**
 * Merge detected entries over a base catalog. Refreshes only `models` and
 * effort `levels`; the apply mechanics stay from the base spec (verified by
 * hand). A detected provider with no base spec gets models only (effort needs a
 * declared apply). Returns a new catalog; never mutates the base.
 */
export function mergeDetected(
  cache: DetectedCache,
  base: ResolvedCatalog = BUILTIN_CATALOG,
): ResolvedCatalog {
  const cli: Record<string, ProviderApplySpec> = { ...base.cli };
  for (const [id, entry] of Object.entries(cache.providers)) {
    const prev = base.cli[id] ?? { models: [], model: null, effort: null };
    const effort =
      prev.effort && entry.efforts.length > 0
        ? { levels: entry.efforts, apply: prev.effort.apply }
        : prev.effort;
    cli[id] = { models: entry.models, model: prev.model, effort };
  }
  return { cli, http: { ...base.http } };
}
