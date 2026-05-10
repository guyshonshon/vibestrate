import type {
  ReviewSuggestion,
  SuggestionSource,
} from "./review-suggestion-types.js";

export type ParsedSuggestion = {
  title: string;
  body: string;
  file: string | null;
  lineStart: number | null;
  lineEnd: number | null;
  proposedPatch: string | null;
};

/**
 * Parse explicit AMACO_SUGGESTION marker blocks out of a reviewer/verifier
 * artifact. We never invent suggestions from prose — only blocks that begin
 * with an `AMACO_SUGGESTION:` marker line are recognised.
 *
 * Block grammar (case-sensitive header keys, body collected verbatim):
 *
 *   AMACO_SUGGESTION:
 *   TITLE: <one line>
 *   FILE: src/foo.ts                 (optional)
 *   LINES: 10-20                      (optional, "10" or "10-20")
 *   BODY:
 *     <multi-line body until PROPOSED_PATCH or AMACO_SUGGESTION_END / EOF>
 *   PROPOSED_PATCH:                   (optional)
 *     <unified diff body verbatim until AMACO_SUGGESTION_END / EOF / next marker>
 *   AMACO_SUGGESTION_END               (optional explicit terminator)
 */
export function parseSuggestionBlocks(text: string): ParsedSuggestion[] {
  if (!text || text.indexOf("AMACO_SUGGESTION:") === -1) return [];
  const lines = text.split(/\r?\n/);
  const out: ParsedSuggestion[] = [];

  let i = 0;
  while (i < lines.length) {
    if (lines[i]!.trim() !== "AMACO_SUGGESTION:") {
      i++;
      continue;
    }
    const block: string[] = [];
    let j = i + 1;
    while (j < lines.length) {
      const line = lines[j]!;
      if (line.trim() === "AMACO_SUGGESTION:") break;
      if (line.trim() === "AMACO_SUGGESTION_END") {
        j++;
        break;
      }
      block.push(line);
      j++;
    }
    const parsed = parseBlock(block);
    if (parsed) out.push(parsed);
    i = j;
  }
  return out;
}

function parseBlock(block: string[]): ParsedSuggestion | null {
  let title = "";
  let file: string | null = null;
  let lineStart: number | null = null;
  let lineEnd: number | null = null;
  const bodyLines: string[] = [];
  const patchLines: string[] = [];

  type Section = "header" | "body" | "patch";
  let section: Section = "header";

  for (const raw of block) {
    if (section === "header") {
      const m = /^([A-Z_]+):\s*(.*)$/.exec(raw);
      if (m) {
        const key = m[1]!;
        const value = m[2] ?? "";
        if (key === "TITLE") title = value.trim();
        else if (key === "FILE") {
          if (value.trim()) file = value.trim();
        } else if (key === "LINES") {
          const r = /^(\d+)(?:-(\d+))?$/.exec(value.trim());
          if (r) {
            lineStart = Number(r[1]);
            lineEnd = r[2] ? Number(r[2]) : null;
          }
        } else if (key === "BODY") {
          // Inline single-line BODY allowed: "BODY: short text".
          if (value.trim()) bodyLines.push(value);
          section = "body";
        } else if (key === "PROPOSED_PATCH") {
          section = "patch";
        }
        // Unknown headers are ignored.
        continue;
      }
      // Non-header line before a body marker: skip.
      continue;
    }
    if (section === "body") {
      if (/^PROPOSED_PATCH:\s*$/.test(raw)) {
        section = "patch";
        continue;
      }
      bodyLines.push(raw);
      continue;
    }
    if (section === "patch") {
      patchLines.push(raw);
      continue;
    }
  }

  if (!title) return null;
  return {
    title,
    body: bodyLines.join("\n").trimEnd(),
    file,
    lineStart,
    lineEnd,
    proposedPatch:
      patchLines.length > 0 ? patchLines.join("\n").replace(/\s+$/, "") : null,
  };
}

/**
 * Promote a ParsedSuggestion to a fully-typed ReviewSuggestion record.
 * Caller supplies id, runId, createdAt/updatedAt timestamps, source, and an
 * optional source artifact path. Suggestions default to requiresApproval=true.
 */
export function makeSuggestionRecord(input: {
  id: string;
  runId: string;
  createdAt: string;
  source: SuggestionSource;
  sourceArtifactPath?: string | null;
  parsed: ParsedSuggestion;
}): ReviewSuggestion {
  return {
    id: input.id,
    runId: input.runId,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    source: input.source,
    sourceArtifactPath: input.sourceArtifactPath ?? null,
    file: input.parsed.file,
    lineStart: input.parsed.lineStart,
    lineEnd: input.parsed.lineEnd,
    title: input.parsed.title,
    body: input.parsed.body,
    status: "open",
    proposedPatch: input.parsed.proposedPatch,
    requiresApproval: true,
    approvalId: null,
    decisionNote: null,
    errorMessage: null,
    bundleId: null,
    appliedPatchPath: null,
    reversePatchPath: null,
    validationResultPath: null,
  };
}
