// Shared low-level helpers for the suggestion and bundle patch-apply flows.
// ReviewSuggestionService and SuggestionBundleService persist captured patch
// text under the run dir and store run-relative paths in their records; these
// helpers keep the on-disk layout and path normalization identical across the
// two services.

import path from "node:path";
import { runDir } from "../utils/paths.js";

/** Timeout for a forward or reverse `git apply` against the worktree. */
export const FORWARD_TIMEOUT_MS = 15_000;
/** Timeout for a `git apply --check` probe. */
export const CHECK_TIMEOUT_MS = 10_000;

/** Where per-suggestion captured forward/reverse patches live in the run dir. */
export function suggestionPatchesDir(
  projectRoot: string,
  runId: string,
): string {
  return path.join(runDir(projectRoot, runId), "suggestion-patches");
}

/** Where bundle-level combined patches and smart-apply results live. */
export function bundlePatchesDir(
  projectRoot: string,
  runId: string,
): string {
  return path.join(runDir(projectRoot, runId), "suggestion-bundles");
}

/**
 * Normalize a patch-artifact path to run-relative, forward-slash form - the
 * shape persisted in suggestion/bundle records so run dirs stay relocatable.
 */
export function relToRun(projectRoot: string, runId: string, abs: string): string {
  const root = runDir(projectRoot, runId);
  if (path.isAbsolute(abs)) {
    const rel = path.relative(root, abs);
    return rel.split(path.sep).join("/");
  }
  return abs.replace(/\\/g, "/");
}

export function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}
