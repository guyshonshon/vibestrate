// Does a review finding point at something that exists?
//
// The backlog asked for RAG grounding, gated on "measure hallucination first,
// then decide". This is the measurement, and it turns out to answer the
// question rather than motivate the build: the most checkable hallucination a
// reviewer commits is citing a file that is not there, and that needs no
// retrieval, no index and no embeddings to catch - just a stat call against the
// worktree the review was about.
//
// Deterministic on purpose. An embedding-backed relevance score would be a
// second, fuzzier answer to a question the filesystem already answers exactly,
// and this project has no shadow retrieval path for the same reason.
//
// ADVISORY, NOT A GATE. An ungrounded finding is a strong signal and not proof:
// a reviewer may name a file the change should create, or refer to one by a
// path relative to a subdirectory. Blocking a run on it would turn a useful
// warning into a reason to distrust reviews. It is counted, reported, and left
// to the reader.
import path from "node:path";
import { pathExists } from "../../utils/fs.js";

export type GroundedFinding = {
  /** The path the finding cited, as written. */
  file: string;
  /** Whether that path resolves inside the worktree. */
  grounded: boolean;
};

export type GroundingReport = {
  /** Findings that cited a file at all - the only ones that can be checked. */
  checked: number;
  /** Of those, how many cited something that is not there. */
  ungrounded: number;
  /** The paths that did not resolve, in the order they appeared. */
  missing: string[];
};

/** A finding cites nothing checkable - a general remark, not a claim about a file. */
function citesAFile(f: { file: string | null }): f is { file: string } {
  return typeof f.file === "string" && f.file.trim().length > 0;
}

/**
 * Check each finding's cited path against the worktree the review read.
 *
 * A path is tried as given and then with a leading `./` or `/` stripped,
 * because a model writing `/src/index.ts` means the repo-relative one often
 * enough that counting it as a hallucination would inflate the number this
 * exists to measure.
 *
 * Anything that escapes the worktree is ungrounded by definition rather than
 * followed: a review is about the copy it read, and resolving `../..` would
 * both give a wrong answer and read outside the boundary.
 */
export async function groundFindings(
  worktreePath: string,
  findings: readonly { file: string | null }[],
): Promise<GroundingReport> {
  const cited = findings.filter(citesAFile);
  const missing: string[] = [];
  for (const f of cited) {
    const raw = f.file.trim();
    const candidates = [raw, raw.replace(/^\.?\//, "")];
    let found = false;
    for (const c of candidates) {
      const abs = path.resolve(worktreePath, c);
      // Outside the worktree is not grounded - see above.
      if (!abs.startsWith(path.resolve(worktreePath) + path.sep)) continue;
      if (await pathExists(abs)) {
        found = true;
        break;
      }
    }
    if (!found) missing.push(raw);
  }
  return { checked: cited.length, ungrounded: missing.length, missing };
}

/**
 * One line for the run report, or null when there is nothing to say.
 *
 * Silent when every citation resolved: a report that says "0 ungrounded" on
 * every run trains people to skip the line, and then they skip it on the run
 * where it is not zero.
 */
export function describeGrounding(report: GroundingReport): string | null {
  if (report.checked === 0 || report.ungrounded === 0) return null;
  const list = report.missing.slice(0, 5).join(", ");
  const more = report.missing.length > 5 ? ` (+${report.missing.length - 5} more)` : "";
  return (
    `${report.ungrounded} of ${report.checked} review finding(s) cite a file that is not in the ` +
    `worktree: ${list}${more}. Read those findings closely - a citation that does not resolve is ` +
    `often a claim that was not checked.`
  );
}
