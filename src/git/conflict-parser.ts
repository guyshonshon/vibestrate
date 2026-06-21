// ── Conflict marker parser ───────────────────────────────────────────────────
//
// Git records merge conflicts as WHOLE-FILE text markers, not hunks (there is no
// structured per-hunk format). This parses a conflicted file's content into the
// conflict regions between `<<<<<<<` / `=======` / `>>>>>>>` (with an optional
// `|||||||` diff3 base section), so each region can be sent to the supervisor
// for a proposed resolution.
//
// Deliberately STRICT and conservative: anything structurally ambiguous
// (nested/unbalanced markers, EOF mid-conflict) returns `{ ok: false }` so the
// caller falls back to manual resolution rather than guessing. Marker-shaped
// lines OUTSIDE a conflict region are treated as ordinary content (ignored), so
// a stray `=======` in prose doesn't reject an otherwise-clean parse.

/** Exactly the 7-char git conflict markers at line start (default marker size). */
const RE_START = /^<{7}(?:\s|$)/;
const RE_BASE = /^\|{7}(?:\s|$)/;
const RE_SEP = /^={7}(?:\s|$)/;
const RE_END = /^>{7}(?:\s|$)/;

export type ConflictHunk = {
  /** 0-based position among the conflict regions in the file. */
  index: number;
  /** Lines from `<<<<<<<` to the base/separator marker (our side). */
  ours: string;
  /** Lines from `=======` to `>>>>>>>` (their side). */
  theirs: string;
  /** The diff3 base section (between `|||||||` and `=======`) when present. */
  base: string | null;
};

export type ParsedConflict =
  | { ok: true; hunks: ConflictHunk[] }
  | { ok: false; reason: string };

/** True if any line looks like a git conflict marker (incl. the diff3 base). */
export function hasConflictMarkers(content: string): boolean {
  return content
    .split(/\r?\n/)
    .some(
      (l) =>
        RE_START.test(l) ||
        RE_BASE.test(l) ||
        RE_SEP.test(l) ||
        RE_END.test(l),
    );
}

/** Heuristic: a NUL byte means we should treat the file as binary and skip it. */
export function isLikelyBinary(content: string): boolean {
  return content.indexOf(String.fromCharCode(0)) !== -1;
}

export function parseConflictHunks(content: string): ParsedConflict {
  const lines = content.split(/\r?\n/);
  const hunks: ConflictHunk[] = [];
  let phase: "outside" | "ours" | "base" | "theirs" = "outside";
  let ours: string[] = [];
  let base: string[] = [];
  let theirs: string[] = [];
  let hasBase = false;
  let index = 0;

  for (let n = 0; n < lines.length; n++) {
    const line = lines[n]!;
    if (RE_START.test(line)) {
      if (phase !== "outside") {
        return { ok: false, reason: `nested "<<<<<<<" at line ${n + 1}` };
      }
      phase = "ours";
      ours = [];
      base = [];
      theirs = [];
      hasBase = false;
      continue;
    }
    // Outside a conflict, marker-shaped lines are ordinary content.
    if (phase === "outside") continue;
    if (RE_BASE.test(line)) {
      if (phase !== "ours") {
        return { ok: false, reason: `unexpected "|||||||" at line ${n + 1}` };
      }
      phase = "base";
      hasBase = true;
      continue;
    }
    if (RE_SEP.test(line)) {
      if (phase !== "ours" && phase !== "base") {
        return { ok: false, reason: `unexpected "=======" at line ${n + 1}` };
      }
      phase = "theirs";
      continue;
    }
    if (RE_END.test(line)) {
      if (phase !== "theirs") {
        return { ok: false, reason: `unexpected ">>>>>>>" at line ${n + 1}` };
      }
      hunks.push({
        index: index++,
        ours: ours.join("\n"),
        theirs: theirs.join("\n"),
        base: hasBase ? base.join("\n") : null,
      });
      phase = "outside";
      continue;
    }
    if (phase === "ours") ours.push(line);
    else if (phase === "base") base.push(line);
    else theirs.push(line);
  }

  if (phase !== "outside") {
    return { ok: false, reason: "unterminated conflict (EOF inside a region)" };
  }
  if (hunks.length === 0) {
    return { ok: false, reason: "no conflict regions found" };
  }
  return { ok: true, hunks };
}

export type RebuiltFile =
  | { ok: true; file: string }
  | { ok: false; reason: string };

/**
 * Reconstruct the FULL resolved file by replacing each conflict region (the
 * whole `<<<<<<< … >>>>>>>` block) with the supplied `regionTexts[i]`, while
 * preserving every line OUTSIDE the conflict regions verbatim. This is what
 * makes a resolution whole-file-correct: per-hunk proposals alone drop all
 * shared context, so writing them as the file would delete unconflicted lines.
 * `regionTexts` must have one entry per conflict region, in order.
 */
export function rebuildResolvedFile(
  content: string,
  regionTexts: string[],
): RebuiltFile {
  const lines = content.split(/\r?\n/);
  const out: string[] = [];
  let phase: "outside" | "ours" | "base" | "theirs" = "outside";
  let regionIdx = 0;

  for (let n = 0; n < lines.length; n++) {
    const line = lines[n]!;
    if (RE_START.test(line)) {
      if (phase !== "outside") {
        return { ok: false, reason: `nested "<<<<<<<" at line ${n + 1}` };
      }
      phase = "ours";
      continue;
    }
    if (phase === "outside") {
      out.push(line);
      continue;
    }
    if (RE_BASE.test(line)) {
      if (phase !== "ours") {
        return { ok: false, reason: `unexpected "|||||||" at line ${n + 1}` };
      }
      phase = "base";
      continue;
    }
    if (RE_SEP.test(line)) {
      if (phase !== "ours" && phase !== "base") {
        return { ok: false, reason: `unexpected "=======" at line ${n + 1}` };
      }
      phase = "theirs";
      continue;
    }
    if (RE_END.test(line)) {
      if (phase !== "theirs") {
        return { ok: false, reason: `unexpected ">>>>>>>" at line ${n + 1}` };
      }
      if (regionIdx >= regionTexts.length) {
        return { ok: false, reason: "more conflict regions than resolutions" };
      }
      const rep = regionTexts[regionIdx]!;
      // Empty resolution removes the region entirely; otherwise splice its lines.
      if (rep.length > 0) out.push(...rep.split("\n"));
      regionIdx++;
      phase = "outside";
      continue;
    }
    // Inside ours/base/theirs: dropped, replaced by the resolution text.
  }

  if (phase !== "outside") {
    return { ok: false, reason: "unterminated conflict (EOF inside a region)" };
  }
  if (regionIdx !== regionTexts.length) {
    return {
      ok: false,
      reason: `expected ${regionIdx} resolution(s), got ${regionTexts.length}`,
    };
  }
  return { ok: true, file: out.join("\n") };
}
