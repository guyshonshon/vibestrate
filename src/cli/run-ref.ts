import { pathExists, readDirSafe } from "../utils/fs.js";
import { projectRunsDir, runStatePath } from "../utils/paths.js";
import { readJson } from "../utils/json.js";
import { runStateSchema } from "../core/state-machine.js";

export type RunRefResult =
  | { ok: true; runId: string }
  | { ok: false; reason: string };

/**
 * Resolve a user-supplied run reference to a real run id. Accepts either the
 * run id itself (a directory under runs/) or a run's `displayName` (the human
 * label set by `vibe rename`). The literal id is tried first; the displayName
 * fallback only runs when that misses, matching exactly first and then
 * case-insensitively. An ambiguous displayName is refused with the candidate
 * ids so the caller can disambiguate with the id - never a silent wrong pick.
 *
 * Read-only: it reads run state files, nothing else.
 */
export async function resolveRunRef(
  projectRoot: string,
  ref: string,
): Promise<RunRefResult> {
  // Fast path: the ref is already a real run id.
  if (await pathExists(runStatePath(projectRoot, ref))) {
    return { ok: true, runId: ref };
  }
  // Fall back to a displayName match across runs.
  const ids = (await readDirSafe(projectRunsDir(projectRoot))).sort();
  const exact: string[] = [];
  const ci: string[] = [];
  const refLower = ref.toLowerCase();
  for (const id of ids) {
    const raw = await readJson<unknown>(runStatePath(projectRoot, id)).catch(
      () => null,
    );
    if (!raw) continue;
    const parsed = runStateSchema.safeParse(raw);
    const displayName = parsed.success ? parsed.data.displayName : null;
    if (!displayName) continue;
    if (displayName === ref) exact.push(id);
    else if (displayName.toLowerCase() === refLower) ci.push(id);
  }
  const matches = exact.length > 0 ? exact : ci;
  const [first] = matches;
  if (matches.length === 1 && first) return { ok: true, runId: first };
  if (matches.length > 1) {
    return {
      ok: false,
      reason: `Run name "${ref}" is ambiguous - matches ${matches.length} runs: ${matches.join(
        ", ",
      )}. Use the run id instead.`,
    };
  }
  return { ok: false, reason: `Run ${ref} not found.` };
}
