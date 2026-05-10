import path from "node:path";
import fs from "node:fs/promises";
import type { ResolvedSafePath } from "./path-guard.js";
import { isSecretLikePath } from "./diff-service.js";

export type FileViewLine = { number: number; text: string };

export type FileView = {
  path: string;
  rootKind: "project" | "worktree";
  rootLabel: string;
  /** Best-effort guess from the file extension; "text" when nothing matched. */
  language: string;
  size: number;
  isBinary: boolean;
  isSecretLike: boolean;
  isTruncated: boolean;
  totalLines: number | null;
  lineStart: number | null;
  lineEnd: number | null;
  notice?: string;
  lines: FileViewLine[];
};

export const DEFAULT_FILE_VIEW_LIMITS = {
  /** Bail out after this many bytes without trying to render text. */
  MAX_BYTES: 512 * 1024,
  /** Per-window limit to keep responses under ~256KB of text. */
  MAX_LINES_PER_RESPONSE: 4_000,
  /** Largest line range a caller can ask for in one shot. */
  MAX_RANGE: 4_000,
};

const LANGUAGE_BY_EXT: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "tsx",
  ".js": "javascript",
  ".jsx": "jsx",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".json": "json",
  ".md": "markdown",
  ".mdx": "mdx",
  ".yml": "yaml",
  ".yaml": "yaml",
  ".toml": "toml",
  ".css": "css",
  ".scss": "scss",
  ".html": "html",
  ".sh": "bash",
  ".bash": "bash",
  ".zsh": "bash",
  ".py": "python",
  ".rb": "ruby",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  ".c": "c",
  ".h": "c",
  ".cpp": "cpp",
  ".hpp": "cpp",
  ".kt": "kotlin",
  ".swift": "swift",
  ".sql": "sql",
  ".gql": "graphql",
  ".graphql": "graphql",
};

export type ViewFileInput = {
  resolved: ResolvedSafePath;
  /** 1-based, inclusive. */
  lineStart?: number | null;
  /** 1-based, inclusive. Defaults to lineStart + DEFAULT_RANGE. */
  lineEnd?: number | null;
};

export class FileViewError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "FileViewError";
  }
}

export async function viewFile(input: ViewFileInput): Promise<FileView> {
  const { resolved } = input;
  let stat: import("node:fs").Stats;
  try {
    stat = await fs.stat(resolved.absolutePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new FileViewError(404, "File not found.");
    }
    throw err;
  }
  if (!stat.isFile()) {
    throw new FileViewError(400, "Path is not a regular file.");
  }

  const language = guessLanguage(resolved.relativePath);
  const isSecret = resolved.isSecretLike || isSecretLikePath(resolved.relativePath);
  const baseView: FileView = {
    path: resolved.relativePath,
    rootKind: resolved.root.kind === "worktree" ? "worktree" : "project",
    rootLabel: resolved.root.label,
    language,
    size: stat.size,
    isBinary: false,
    isSecretLike: isSecret,
    isTruncated: false,
    totalLines: null,
    lineStart: null,
    lineEnd: null,
    lines: [],
  };

  if (isSecret) {
    return {
      ...baseView,
      notice:
        "This file looks like a secret (env file, key, credential). Amaco does not load its contents.",
    };
  }

  if (stat.size > DEFAULT_FILE_VIEW_LIMITS.MAX_BYTES) {
    return {
      ...baseView,
      isTruncated: true,
      notice: `File is ${(stat.size / 1024).toFixed(1)} KB — larger than the ${(
        DEFAULT_FILE_VIEW_LIMITS.MAX_BYTES / 1024
      ).toFixed(0)} KB inline preview limit. Use the editor or open it from the CLI.`,
    };
  }

  const buf = await fs.readFile(resolved.absolutePath);
  if (looksBinary(buf)) {
    return {
      ...baseView,
      isBinary: true,
      notice: "Binary or unpreviewable file.",
    };
  }

  const text = buf.toString("utf8");
  const allLines = text.split(/\r?\n/);
  // If the file ends with a newline, split() leaves a trailing empty element —
  // keep it so totals reflect the file as the user sees it on disk, but trim
  // it from the response window for nicer rendering.
  const totalLines = allLines.length;
  const start = clampStart(input.lineStart, totalLines);
  const end = clampEnd(input.lineEnd, start, totalLines);
  const window = allLines.slice(start - 1, end);
  const lines: FileViewLine[] = window.map((textLine, idx) => ({
    number: start + idx,
    text: textLine,
  }));
  const isTruncated = start > 1 || end < totalLines;

  return {
    ...baseView,
    totalLines,
    lineStart: start,
    lineEnd: end,
    isTruncated,
    lines,
  };
}

function clampStart(value: number | null | undefined, total: number): number {
  if (!Number.isFinite(value as number) || value === null || value === undefined) {
    return 1;
  }
  const v = Math.floor(value);
  if (v < 1) return 1;
  if (v > total) return total;
  return v;
}

function clampEnd(
  value: number | null | undefined,
  start: number,
  total: number,
): number {
  const max = Math.min(
    total,
    start + DEFAULT_FILE_VIEW_LIMITS.MAX_LINES_PER_RESPONSE - 1,
  );
  if (!Number.isFinite(value as number) || value === null || value === undefined) {
    return max;
  }
  const v = Math.floor(value);
  if (v < start) return start;
  if (v > max) return max;
  return v;
}

function looksBinary(buf: Buffer): boolean {
  // Quick heuristic: any NUL byte in the first 8 KB → binary; or >30 % non-text
  // bytes in the same window.
  const window = buf.subarray(0, Math.min(buf.length, 8192));
  if (window.length === 0) return false;
  let nonText = 0;
  for (let i = 0; i < window.length; i++) {
    const b = window[i]!;
    if (b === 0) return true;
    if (b < 9) nonText++;
    else if (b > 13 && b < 32) nonText++;
    else if (b > 126) nonText++;
  }
  return nonText / window.length > 0.3;
}

function guessLanguage(relPath: string): string {
  const ext = path.extname(relPath).toLowerCase();
  return LANGUAGE_BY_EXT[ext] ?? "text";
}
