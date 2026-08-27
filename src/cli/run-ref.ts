import { pathExists, readDirSafe } from "../utils/fs.js";
import { projectRunsDir, runStatePath } from "../utils/paths.js";
import { readJson } from "../utils/json.js";
import { runStateSchema } from "../core/state-machine.js";

export type RunRefResult =
  | { ok: true; runId: string }
  | { ok: false; reason: string; matches?: string[] };

/** A run directory that actually holds a run, rather than a stray folder. */
async function isRun(projectRoot: string, id: string): Promise<boolean> {
  return await pathExists(runStatePath(projectRoot, id));
}

/**
 * Resolve what someone typed into the run they meant.
 *
 * Run ids are timestamped and task-derived -
 * `20260614-125024-go-through-all-the-things` - which is unambiguous and
 * unusable: too long to read back, too long to select out of a TUI pane,
 * awkward to paste. Three references resolve, in this order:
 *
 *   1. the literal run id,
 *   2. a `displayName` set by `vibe rename` (exactly, then case-insensitively),
 *   3. a unique PREFIX of a run id, the way a short SHA works for git.
 *
 * Order matters in both directions. An exact id wins outright and is never read
 * as a prefix of something longer, or a run would become unreachable the moment
 * a later id started with it. And a prefix is tried LAST, so a name someone
 * deliberately set is never beaten by an accidental character match.
 *
 * Ambiguity is refused with the candidates, never resolved by picking the
 * newest: convenient exactly until it aborts the wrong run.
 *
 * Read-only: it reads run state files, nothing else.
 */
export async function resolveRunRef(
  projectRoot: string,
  ref: string,
): Promise<RunRefResult> {
  const given = ref.trim();
  if (!given) return { ok: false, reason: "No run id given." };

  // 1. The ref is already a real run id. Checked without listing the directory:
  //    the common case is a full id copied from output, and it should not
  //    depend on what else happens to be on disk.
  if (await isRun(projectRoot, given)) return { ok: true, runId: given };

  const ids = (await readDirSafe(projectRunsDir(projectRoot))).sort();

  // 2. A displayName, exactly then case-insensitively.
  const exact: string[] = [];
  const ci: string[] = [];
  const refLower = given.toLowerCase();
  for (const id of ids) {
    const raw = await readJson<unknown>(runStatePath(projectRoot, id)).catch(() => null);
    if (!raw) continue;
    const parsed = runStateSchema.safeParse(raw);
    const displayName = parsed.success ? parsed.data.displayName : null;
    if (!displayName) continue;
    if (displayName === given) exact.push(id);
    else if (displayName.toLowerCase() === refLower) ci.push(id);
  }
  const named = exact.length > 0 ? exact : ci;
  if (named.length === 1) return { ok: true, runId: named[0]! };
  if (named.length > 1) {
    return {
      ok: false,
      reason:
        `Run name "${given}" is ambiguous - matches ${named.length} runs: ` +
        `${named.join(", ")}. Use the run id instead.`,
      matches: named,
    };
  }

  // 3. A prefix of an id.
  const prefixed: string[] = [];
  for (const id of ids) {
    if (id.startsWith(given) && (await isRun(projectRoot, id))) prefixed.push(id);
  }
  if (prefixed.length === 1) return { ok: true, runId: prefixed[0]! };
  if (prefixed.length > 1) {
    return {
      ok: false,
      reason:
        `"${given}" matches ${prefixed.length} runs. Use more of the id:\n` +
        prefixed.map((c) => `  ${c}`).join("\n"),
      matches: prefixed,
    };
  }

  return { ok: false, reason: `Run ${given} not found.` };
}

/**
 * Resolve a reference, or print why it could not be and give back `null`.
 *
 * The reporting lives here so every command says the same thing about the same
 * failure - an ambiguous reference in particular has to LIST the candidates, or
 * "use the run id instead" is advice the reader cannot act on.
 */
export async function resolveRunRefOrReport(
  projectRoot: string,
  ref: string,
  write: (text: string) => void = (t) => process.stderr.write(t),
): Promise<string | null> {
  const res = await resolveRunRef(projectRoot, ref);
  if (res.ok) return res.runId;
  write(`${res.reason}\n`);
  return null;
}
