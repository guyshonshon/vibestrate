import path from "node:path";
import fs from "node:fs/promises";
import { isPathInside } from "../utils/paths.js";

export type CodeReference = {
  /** The exact text matched in the source. Useful for replacements in the UI. */
  raw: string;
  /** Forward-slash relative path inside the project (or worktree). */
  file: string;
  lineStart: number | null;
  lineEnd: number | null;
  /** True when the file resolves under the supplied projectRoot. */
  existsInProject?: boolean;
  /** True when the file resolves under the supplied worktreePath. */
  existsInWorktree?: boolean;
  /** The recommended SPA hash route for this reference. */
  targetUrl: string;
  /** Character offsets in the input string. */
  startIndex: number;
  endIndex: number;
};

export type ParseInput = {
  text: string;
  /** Optional run id. When set, the SPA route hops via run worktree. */
  runId?: string | null;
};

// Allowed extensions — keep this list strict so prose words like "src" or
// "components" don't get matched as bare files. Add to this list rather than
// loosening the regex.
const FILE_EXT = [
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "json",
  "md",
  "mdx",
  "yml",
  "yaml",
  "toml",
  "css",
  "scss",
  "html",
  "sh",
  "py",
  "rb",
  "go",
  "rs",
  "java",
  "c",
  "h",
  "cpp",
  "hpp",
  "sql",
  "graphql",
  "gql",
];

const FILE_PATH_FRAGMENT = `(?:[A-Za-z0-9_.@-]+\\/)*[A-Za-z0-9_.@-]+\\.(?:${FILE_EXT.join("|")})`;

// Order matters: more-specific patterns first.
const PATTERNS: Array<{
  re: RegExp;
  build: (m: RegExpExecArray) => Omit<
    CodeReference,
    "existsInProject" | "existsInWorktree" | "targetUrl"
  >;
}> = [
  // src/foo.ts#L42-L57
  {
    re: new RegExp(`(${FILE_PATH_FRAGMENT})#L(\\d+)-L(\\d+)`, "g"),
    build: (m) => ({
      raw: m[0],
      file: m[1]!,
      lineStart: Number(m[2]),
      lineEnd: Number(m[3]),
      startIndex: m.index,
      endIndex: m.index + m[0].length,
    }),
  },
  // src/foo.ts#L42
  {
    re: new RegExp(`(${FILE_PATH_FRAGMENT})#L(\\d+)`, "g"),
    build: (m) => ({
      raw: m[0],
      file: m[1]!,
      lineStart: Number(m[2]),
      lineEnd: null,
      startIndex: m.index,
      endIndex: m.index + m[0].length,
    }),
  },
  // src/foo.ts:42-57
  {
    re: new RegExp(`(${FILE_PATH_FRAGMENT}):(\\d+)-(\\d+)`, "g"),
    build: (m) => ({
      raw: m[0],
      file: m[1]!,
      lineStart: Number(m[2]),
      lineEnd: Number(m[3]),
      startIndex: m.index,
      endIndex: m.index + m[0].length,
    }),
  },
  // src/foo.ts:42
  {
    re: new RegExp(`(${FILE_PATH_FRAGMENT}):(\\d+)`, "g"),
    build: (m) => ({
      raw: m[0],
      file: m[1]!,
      lineStart: Number(m[2]),
      lineEnd: null,
      startIndex: m.index,
      endIndex: m.index + m[0].length,
    }),
  },
  // src/foo.ts line 42 / src/foo.ts (line 42)
  {
    re: new RegExp(
      `(${FILE_PATH_FRAGMENT})\\s+\\(?line\\s+(\\d+)\\)?`,
      "gi",
    ),
    build: (m) => ({
      raw: m[0],
      file: m[1]!,
      lineStart: Number(m[2]),
      lineEnd: null,
      startIndex: m.index,
      endIndex: m.index + m[0].length,
    }),
  },
  // bare path (lowest priority — only after specific forms)
  {
    re: new RegExp(`(?<![:/])(${FILE_PATH_FRAGMENT})`, "g"),
    build: (m) => ({
      raw: m[0],
      file: m[1]!,
      lineStart: null,
      lineEnd: null,
      startIndex: m.index,
      endIndex: m.index + m[0].length,
    }),
  },
];

/**
 * Parse code references from arbitrary text.
 *
 * Overlapping matches are resolved greedily: more-specific patterns claim
 * their bytes first, so the bare-path fallback never re-matches a position
 * that already participated in a path:line reference.
 */
export function parseCodeReferences(input: ParseInput): CodeReference[] {
  if (!input.text) return [];
  const claimed: Array<{ start: number; end: number }> = [];
  const results: CodeReference[] = [];

  for (const { re, build } of PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(input.text)) !== null) {
      const start = m.index;
      const end = m.index + m[0].length;
      if (claimed.some((c) => overlaps(c.start, c.end, start, end))) continue;
      const partial = build(m);
      claimed.push({ start, end });
      results.push({
        ...partial,
        targetUrl: routeFor(partial.file, partial.lineStart, input.runId ?? null),
      });
    }
  }

  // Stable order by appearance.
  return results.sort((a, b) => a.startIndex - b.startIndex);
}

function overlaps(a1: number, a2: number, b1: number, b2: number): boolean {
  return a1 < b2 && b1 < a2;
}

function routeFor(file: string, line: number | null, runId: string | null): string {
  const params = new URLSearchParams();
  params.set("path", file);
  if (line !== null) params.set("line", String(line));
  if (runId) params.set("runId", runId);
  return `#/codebase?${params.toString()}`;
}

/**
 * Annotate references with existence flags by checking the filesystem under
 * each provided root. Path traversal is rejected: the resolved path must be
 * inside the root.
 */
export async function annotateExistence(
  refs: CodeReference[],
  roots: { projectRoot?: string | null; worktreePath?: string | null },
): Promise<CodeReference[]> {
  return Promise.all(
    refs.map(async (r) => {
      const out: CodeReference = { ...r };
      if (roots.projectRoot) {
        out.existsInProject = await safeExistsUnder(roots.projectRoot, r.file);
      }
      if (roots.worktreePath) {
        out.existsInWorktree = await safeExistsUnder(roots.worktreePath, r.file);
      }
      return out;
    }),
  );
}

async function safeExistsUnder(rootAbs: string, rel: string): Promise<boolean> {
  if (rel.includes("..") || path.isAbsolute(rel)) return false;
  const abs = path.resolve(rootAbs, rel);
  if (!isPathInside(rootAbs, abs)) return false;
  try {
    const stat = await fs.stat(abs);
    return stat.isFile();
  } catch {
    return false;
  }
}
