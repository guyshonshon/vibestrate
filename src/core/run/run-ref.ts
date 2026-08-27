// Resolve what someone typed into the run they meant.
//
// Run ids are timestamped and task-derived - `20260614-125024-go-through-all-…`
// - which is unambiguous and unusable: too long to read back, too long to select
// out of a TUI pane, and awkward to paste into `vibe assurance`. Three fixes
// were on the table: renumber to a short unique id, name runs the way
// `docker run --name` does, or accept a prefix.
//
// Prefix, for the reasons git chose it. It is purely additive - every id ever
// printed still resolves - it needs no migration and no second identifier to
// keep unique, and the convention is one people already have. The other two
// change what a run IS; this only changes what you are allowed to type.
//
// Ambiguity is an error, never a guess. Picking the newest match would be
// convenient exactly until it aborted the wrong run.
import { readDirSafe, pathExists } from "../../utils/fs.js";
import { projectRunsDir, runStatePath } from "../../utils/paths.js";

export class RunRefError extends Error {
  constructor(
    readonly code: "not-found" | "ambiguous",
    message: string,
    /** The candidates, when the reference matched more than one. */
    readonly matches: string[] = [],
  ) {
    super(message);
    this.name = "RunRefError";
  }
}

/** A run directory that actually holds a run, not a stray folder. */
async function isRun(projectRoot: string, id: string): Promise<boolean> {
  return await pathExists(runStatePath(projectRoot, id));
}

/**
 * Turn a user-typed reference into a real run id.
 *
 * An EXACT id always wins outright and is never treated as a prefix of
 * something longer: a run whose id is a prefix of a newer one must stay
 * addressable, or it would become unreachable the moment the newer one appeared.
 *
 * Anything else is matched as a prefix. Exactly one match resolves; several
 * raise `ambiguous` carrying the candidates, so the caller can print them
 * instead of choosing.
 */
export async function resolveRunRef(projectRoot: string, ref: string): Promise<string> {
  const given = ref.trim();
  if (!given) throw new RunRefError("not-found", "No run id given.");

  // Exact first, and without listing the directory: the common case is a full
  // id copied from output, and it should not depend on what else is on disk.
  if (await isRun(projectRoot, given)) return given;

  const ids = await readDirSafe(projectRunsDir(projectRoot));
  const candidates: string[] = [];
  for (const id of ids) {
    if (id.startsWith(given) && (await isRun(projectRoot, id))) candidates.push(id);
  }

  if (candidates.length === 1) return candidates[0]!;
  if (candidates.length === 0) {
    throw new RunRefError("not-found", `Run "${given}" not found.`);
  }
  candidates.sort();
  throw new RunRefError(
    "ambiguous",
    `"${given}" matches ${candidates.length} runs. Use more of the id:\n` +
      candidates.map((c) => `  ${c}`).join("\n"),
    candidates,
  );
}

/**
 * Resolve a reference, or print why it could not be and give back `null`.
 *
 * The reporting lives here so every command says the same thing about the same
 * failure - an ambiguous prefix in particular has to LIST the candidates, or
 * "be more specific" is advice the reader cannot act on.
 */
export async function resolveRunRefOrReport(
  projectRoot: string,
  ref: string,
  write: (text: string) => void = (t) => process.stderr.write(t),
): Promise<string | null> {
  try {
    return await resolveRunRef(projectRoot, ref);
  } catch (err) {
    if (!(err instanceof RunRefError)) throw err;
    write(`${err.message}\n`);
    return null;
  }
}
