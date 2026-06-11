// ── Review-output parsing (P1, run-experience batch) ────────────────────────
//
// One dependency-free parser for a review turn's output, shared by the web
// dashboard, the shell TUI, and the CLI (same pattern as flow-graph-layout.ts:
// no node/zod imports so the browser bundle can use it directly).
//
// A review turn speaks one of two dialects:
//   1. The default flow's prose contract - a `DECISION: <verdict>` line
//      (parsed at run time by core/review-parser.ts, which imports the regex
//      from here so the two can't drift).
//   2. The structured findings contract - a JSON block between
//      VIBESTRATE_FLOW_OUTPUT: ... VIBESTRATE_FLOW_OUTPUT_END markers (or a
//      ```json fence), used by panel-review / quality-arbitration arbiters.
//
// This module parses both, leniently, and NEVER throws - a malformed artifact
// degrades to "no structured findings" and the caller falls back to showing
// the raw markdown.

/** Markers for the structured Flow JSON block. Single source of truth -
 *  flow-arbitration.ts re-exports these for the runtime side. */
export const FLOW_OUTPUT_MARKER = "VIBESTRATE_FLOW_OUTPUT:";
export const FLOW_OUTPUT_END_MARKER = "VIBESTRATE_FLOW_OUTPUT_END";

/** The prose decision line. Single source of truth - core/review-parser.ts
 *  imports this for run-time enforcement. */
export const REVIEW_DECISION_RE =
  /^\s*DECISION\s*:\s*(APPROVED|CHANGES_REQUESTED|BLOCKED)\s*$/m;

export type ReviewDecisionWord = "APPROVED" | "CHANGES_REQUESTED" | "BLOCKED";

export type ReviewFindingView = {
  title: string;
  severity: string | null;
  category: string | null;
  /** First evidence file path, when the finding carries one. */
  file: string | null;
  detail: string | null;
};

export type ParsedReviewOutput = {
  /** The verdict, from the DECISION line or the structured block. */
  decision: ReviewDecisionWord | null;
  /** Structured findings when the output carried a parseable block. */
  findings: ReviewFindingView[];
  /** True when a structured JSON block was found AND yielded findings. */
  structured: boolean;
};

const MAX_FINDINGS = 50;
const MAX_TEXT = 500;

function asTrimmedString(v: unknown, max = MAX_TEXT): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** Extract + JSON.parse the structured Flow output block. Marker block wins;
 *  falls back to the last ```json fence. Returns null instead of throwing. */
export function extractFlowOutputJson(text: string): unknown {
  if (!text) return null;
  const start = text.lastIndexOf(FLOW_OUTPUT_MARKER);
  if (start >= 0) {
    const afterMarker = start + FLOW_OUTPUT_MARKER.length;
    const end = text.indexOf(FLOW_OUTPUT_END_MARKER, afterMarker);
    const body = end >= 0 ? text.slice(afterMarker, end) : text.slice(afterMarker);
    try {
      return JSON.parse(body.trim());
    } catch {
      return null;
    }
  }
  // Last fenced json block (the contract allows a fence instead of markers).
  const fences = [...text.matchAll(/```json\s*\n([\s\S]*?)```/g)];
  const last = fences[fences.length - 1];
  if (last?.[1]) {
    try {
      return JSON.parse(last[1].trim());
    } catch {
      return null;
    }
  }
  return null;
}

function mapFinding(raw: unknown): ReviewFindingView | null {
  if (typeof raw !== "object" || raw === null) return null;
  const f = raw as Record<string, unknown>;
  const title =
    asTrimmedString(f.title) ?? asTrimmedString(f.summary) ?? asTrimmedString(f.id);
  if (!title) return null;
  const evidence = Array.isArray(f.evidence) ? f.evidence[0] : null;
  const evidenceFile =
    typeof evidence === "object" && evidence !== null
      ? asTrimmedString((evidence as Record<string, unknown>).file)
      : null;
  return {
    title,
    severity: asTrimmedString(f.severity, 40),
    category: asTrimmedString(f.category, 60),
    file: asTrimmedString(f.file) ?? evidenceFile,
    detail: asTrimmedString(f.detail) ?? asTrimmedString(f.description),
  };
}

/** Parse a review turn's output text. Lenient, total - never throws. */
export function parseReviewOutput(text: string): ParsedReviewOutput {
  const source = text ?? "";
  let decision: ReviewDecisionWord | null = null;
  const line = source.match(REVIEW_DECISION_RE);
  if (line) decision = line[1] as ReviewDecisionWord;

  const findings: ReviewFindingView[] = [];
  const block = extractFlowOutputJson(source);
  if (typeof block === "object" && block !== null) {
    const b = block as Record<string, unknown>;
    const rawFindings = Array.isArray(b.findings) ? b.findings : [];
    for (const raw of rawFindings.slice(0, MAX_FINDINGS)) {
      const mapped = mapFinding(raw);
      if (mapped) findings.push(mapped);
    }
    // A decision-summary block can carry the verdict when no prose line did.
    if (!decision) {
      const rec = asTrimmedString(b.recommendation, 40)?.toUpperCase() ?? "";
      if (rec === "APPROVE" || rec === "APPROVED") decision = "APPROVED";
      else if (rec === "CHANGES_REQUESTED" || rec === "REQUEST_CHANGES")
        decision = "CHANGES_REQUESTED";
      else if (rec === "BLOCK" || rec === "BLOCKED") decision = "BLOCKED";
    }
  }

  return { decision, findings, structured: findings.length > 0 };
}
