// Move a backlog in and out as CSV.
//
// WHY CSV AND NOT THE JIRA/TRELLO/LINEAR APIs
//
// The pain is real: a team already running its roadmap somewhere else has to
// maintain a second backlog here. But every API route to those trackers is a
// hosted SaaS endpoint needing stored credentials, which cuts straight across
// this project's local-first, no-cloud, no-stored-secrets posture. That
// exemption is a decision to make deliberately, not one to assume by shipping
// a connector - and it is still open.
//
// CSV needs none of it. Jira, Trello, Monday, Asana and Linear all import and
// export it, so one file moves a backlog either direction with no credential,
// no egress and no account. It is the unglamorous 80% that costs nothing, and
// it works offline, which the APIs never will.
//
// Two-way sync is deliberately NOT here. It needs an identity map and conflict
// resolution, and a half-built one silently picking a winner is worse than no
// sync at all.
import { taskStatusSchema, type Priority, type Task, type TaskStatus } from "./roadmap-types.js";

/** One row as the trackers understand it. */
export type BoardRow = {
  title: string;
  description: string;
  status: string;
  priority: string;
  stage: string;
  id: string;
};

export const CSV_HEADERS = [
  "id",
  "title",
  "description",
  "status",
  "priority",
  "stage",
] as const;

/**
 * RFC4180 quoting: a field is quoted when it contains a comma, a quote or a
 * newline, and inner quotes are doubled.
 *
 * Hand-rolled rather than a dependency because the whole grammar is these six
 * lines, and a parser is the sort of thing that gets pulled in for one call
 * site and then carries a supply chain forever.
 */
function quote(field: string): string {
  return /[",\r\n]/.test(field) ? `"${field.replaceAll('"', '""')}"` : field;
}

export function toCsv(tasks: readonly Task[]): string {
  const lines = [CSV_HEADERS.join(",")];
  for (const t of tasks) {
    lines.push(
      [
        t.id,
        t.title,
        t.description ?? "",
        t.status,
        t.priority ?? "",
        t.stage ?? "",
      ]
        .map((v) => quote(String(v)))
        .join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

/**
 * Split one CSV line, honouring quotes.
 *
 * A description pasted out of a tracker routinely contains commas and newlines,
 * so a naive `split(",")` corrupts exactly the rows a human wrote by hand.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim()));
}

export type ImportRow = {
  title: string;
  description: string;
  status: TaskStatus | null;
  priority: Priority | null;
  stage: string | null;
  /** The exporter's own id, kept only to report duplicates - never adopted. */
  foreignId: string | null;
};

export type ImportParse = {
  rows: ImportRow[];
  /** Rows that could not be read, with the reason and the 1-based line. */
  skipped: { line: number; reason: string }[];
};

const PRIORITIES = new Set(["low", "medium", "high", "critical"]);

/**
 * Read an exported board.
 *
 * Column ORDER is not assumed - trackers each emit their own - so the header is
 * matched by name, case-insensitively, and `title` is the only one required.
 * A row that cannot be read is skipped WITH its line number rather than
 * dropping the whole file: a hand-edited export usually has one bad row, and
 * refusing all two hundred because of it helps nobody.
 *
 * A foreign id is never adopted as the task id. Ids here are generated and
 * meaningful (they name a run's branch); taking a Jira key would let an
 * external system name things inside `.vibestrate/`.
 */
export function parseBoardCsv(text: string): ImportParse {
  const rows = parseCsv(text);
  const skipped: ImportParse["skipped"] = [];
  if (rows.length === 0) return { rows: [], skipped };
  const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
  const col = (name: string): number => header.indexOf(name);
  const iTitle = col("title") !== -1 ? col("title") : col("summary"); // Jira says summary
  const iDesc = col("description");
  const iStatus = col("status");
  const iPriority = col("priority");
  const iStage = col("stage");
  const iId = col("id") !== -1 ? col("id") : col("key"); // Jira says key

  if (iTitle === -1) {
    return {
      rows: [],
      skipped: [{ line: 1, reason: 'no "title" (or "summary") column - nothing to import' }],
    };
  }

  const out: ImportRow[] = [];
  for (let r = 1; r < rows.length; r += 1) {
    const cells = rows[r]!;
    const at = (i: number): string => (i === -1 ? "" : (cells[i] ?? "")).trim();
    const title = at(iTitle);
    if (!title) {
      skipped.push({ line: r + 1, reason: "no title" });
      continue;
    }
    const rawStatus = at(iStatus).toLowerCase().replace(/[\s-]+/g, "_");
    const status = taskStatusSchema.safeParse(rawStatus);
    const rawPriority = at(iPriority).toLowerCase();
    out.push({
      title,
      description: at(iDesc),
      // An unrecognised status is not a failure: a tracker's "In Review" has no
      // counterpart here, and the card still belongs in the backlog.
      status: status.success ? status.data : null,
      priority: PRIORITIES.has(rawPriority) ? (rawPriority as Priority) : null,
      // Their column name becomes a STAGE, which is exactly the axis for it -
      // human-owned, free-labelled, and it starts nothing.
      stage: at(iStage) || (status.success ? null : at(iStatus) || null),
      foreignId: at(iId) || null,
    });
  }
  return { rows: out, skipped };
}
