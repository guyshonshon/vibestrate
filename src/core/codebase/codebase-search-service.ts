import { execa } from "execa";
import { pathExists } from "../../utils/fs.js";
import { findGitRoot } from "../../git/git.js";
import { isSecretLikePath, redactSecretsInText } from "../diff-service.js";

/**
 * Read-only content + filename search over a project, backed by `git grep` /
 * `git ls-files` (git is already a hard dependency; ripgrep is not). Everything
 * here is bounded (timeout + result caps) and secret-safe by construction:
 * secret-like PATHS are dropped from results (a match there is never returned),
 * and every returned snippet is run through the content-pattern redactor so a
 * live key inside an ordinarily-named file cannot leak into a response.
 */

export type CodeSearchMatch = { line: number; text: string };

export type CodeSearchFileResult = {
  path: string;
  matches: CodeSearchMatch[];
  /** Total matches in the file (may exceed matches.length when capped). */
  matchCount: number;
  matchesTruncated: boolean;
};

export type CodeSearchResult = {
  available: boolean;
  /** Non-null when unavailable (e.g. not a git repo) or the search errored. */
  error: string | null;
  query: string;
  regex: boolean;
  files: CodeSearchFileResult[];
  totalMatches: number;
  totalFiles: number;
  /** True when the file/match caps were hit (more results exist). */
  truncated: boolean;
  /** How many secret token shapes were redacted out of the returned snippets. */
  redactedCount: number;
};

export type FileListResult = {
  available: boolean;
  error: string | null;
  paths: string[];
  truncated: boolean;
};

/**
 * Display-only redaction, composed ON TOP of the strict content redactor. The
 * strict set (SECRET_CONTENT_PATTERNS) is tuned for patch-apply, where a false
 * positive would block a real merge, so it deliberately skips lower-precision
 * shapes. A search snippet is only a preview - a false positive just muddies one
 * line, while a leaked credential is the worse error - so here we also catch
 * connection-string credentials, JWTs, Stripe test keys, and `secret = "..."`
 * style assignments. (Reviewer SHOULD-FIX: broaden redaction for the snippet
 * surface.)
 */
const DISPLAY_SECRET_PATTERNS: Array<{ name: string; re: RegExp }> = [
  // scheme://user:pass@host  ->  keep the scheme + host, redact the credential
  { name: "credential", re: /\b([a-z][a-z0-9+.-]*:\/\/)[^\s:/@]+:[^\s/@]+@/gi },
  // JWT (three base64url segments)
  { name: "jwt", re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{6,}\b/g },
  { name: "stripe-test", re: /\bsk_test_[A-Za-z0-9]{10,}\b/g },
  // password/secret/token/api-key = "value"  (quoted, >=6 chars)
  {
    name: "secret",
    re: /((?:password|passwd|pwd|secret|token|api[_-]?key|apikey|access[_-]?key|auth)["']?\s*[:=]\s*["'])([^"'\s]{6,})(["'])/gi,
  },
];

/** Strict redactor + the display-tier shapes above. */
function redactForDisplay(text: string): { redacted: string; count: number } {
  const base = redactSecretsInText(text);
  let out = base.redacted;
  let count = base.count;
  for (const { name, re } of DISPLAY_SECRET_PATTERNS) {
    out = out.replace(new RegExp(re.source, re.flags), (_m, ...groups) => {
      count += 1;
      if (name === "credential") return `${groups[0]}[REDACTED:credential]@`;
      if (name === "secret") return `${groups[0]}[REDACTED:secret]${groups[2]}`;
      return `[REDACTED:${name}]`;
    });
  }
  return { redacted: out, count };
}

/** True when a path itself carries a secret token shape - such a file is dropped
 *  from results entirely (redacting the path would break click-to-open). */
function pathLooksSecret(p: string): boolean {
  return isSecretLikePath(p) || redactForDisplay(p).count > 0;
}

const TIMEOUT_MS = 8_000; // grep can touch every tracked file - looser than metadata calls
const MAX_FILES = 100;
const MAX_MATCHES_PER_FILE = 20;
const MAX_TOTAL_MATCHES = 800;
const MAX_LINE_LEN = 400; // truncate very long lines before redaction/return
const MAX_QUERY_LEN = 500;

async function git(
  cwd: string,
  args: string[],
): Promise<{ exitCode: number; stdout: string; stderr: string; maxBufferHit: boolean }> {
  const r = await execa("git", args, {
    cwd,
    reject: false,
    timeout: TIMEOUT_MS,
    stdin: "ignore",
    // grep on a big tree can produce a lot before we cap; give it room but
    // never unbounded. On overflow execa returns non-zero + isMaxBuffer, so we
    // fail closed (no truncated results) with a clear message.
    maxBuffer: 16 * 1024 * 1024,
  });
  return {
    exitCode: r.exitCode ?? -1,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
    maxBufferHit: Boolean((r as { isMaxBuffer?: boolean }).isMaxBuffer),
  };
}

/** Split a comma-separated glob field into trimmed, non-empty entries. */
function globs(field: string | null | undefined): string[] {
  return (field ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Build the pathspec list that scopes a search. Include globs are passed as-is
 * (plain git pathspecs, matching prefixes + `**`); exclude globs become
 * `:(exclude)` pathspecs. Everything is positioned AFTER `--` by the caller, so
 * a leading `-`/`:` can never be read as a git option - it is always a pathspec
 * bounded to the repo.
 */
function pathspecs(include?: string | null, exclude?: string | null): string[] {
  const specs: string[] = [];
  for (const g of globs(include)) specs.push(g);
  for (const g of globs(exclude)) specs.push(`:(exclude)${g}`);
  return specs;
}

export async function searchCodebaseContent(input: {
  projectRoot: string;
  query: string;
  regex?: boolean;
  caseSensitive?: boolean;
  include?: string | null;
  exclude?: string | null;
}): Promise<CodeSearchResult> {
  const query = (input.query ?? "").trim();
  const regex = Boolean(input.regex);
  const empty: CodeSearchResult = {
    available: true,
    error: null,
    query,
    regex,
    files: [],
    totalMatches: 0,
    totalFiles: 0,
    truncated: false,
    redactedCount: 0,
  };
  if (!query) return empty;
  if (query.length > MAX_QUERY_LEN) {
    return { ...empty, error: "Search query is too long." };
  }
  if (!(await pathExists(input.projectRoot))) {
    return { ...empty, available: false, error: "Project path is unavailable." };
  }
  const gitRoot = await findGitRoot(input.projectRoot);
  if (!gitRoot) {
    return {
      ...empty,
      available: false,
      error: "Content search needs a git repository in this project.",
    };
  }

  // -I skip binary, -n line numbers, --untracked so newly-created (not-yet-
  // committed) files in the working tree are searched too - ignored files
  // (node_modules, dist, .env in .gitignore) stay excluded. -e treats the query
  // as a pattern (never a flag), -i unless case-sensitive. Regex engine: -F
  // fixed string, else -P (PCRE) so \d \w \b behave as developers expect, with
  // a fallback to -E (POSIX ERE) for git builds compiled without PCRE.
  const specs = pathspecs(input.include, input.exclude);
  const base = ["grep", "--no-color", "-I", "-n", "--untracked"];
  if (!input.caseSensitive) base.push("-i");
  const buildArgs = (engine: "-F" | "-P" | "-E") => [
    ...base,
    engine,
    "-e",
    query,
    "--",
    ...specs,
  ];

  let r = await git(input.projectRoot, buildArgs(regex ? "-P" : "-F"));
  // git grep exits 2+ with a PCRE message when built without PCRE; retry -E.
  if (regex && r.exitCode > 1 && /pcre|not compiled|-P/i.test(r.stderr)) {
    r = await git(input.projectRoot, buildArgs("-E"));
  }
  if (r.maxBufferHit) {
    return {
      ...empty,
      truncated: true,
      error: "Too many matches to show - narrow the query, or add an Include/Exclude glob.",
    };
  }
  // git grep: exit 0 = matches, 1 = no matches (not an error), >1 = real error.
  if (r.exitCode === 1) return empty;
  if (r.exitCode !== 0) {
    const msg = r.stderr.split("\n")[0]?.trim() || "Search failed.";
    return { ...empty, error: msg };
  }

  const byFile = new Map<string, CodeSearchFileResult>();
  let totalMatches = 0;
  let redactedCount = 0;
  let truncated = false;

  for (const raw of r.stdout.split("\n")) {
    if (!raw) continue;
    // path:line:text - path taken non-greedily up to the first :<digits>:.
    const m = /^(.+?):(\d+):(.*)$/.exec(raw);
    if (!m) continue;
    const path = m[1]!;
    const line = Number(m[2]);
    // Never surface a match whose file PATH is secret-named or itself carries a
    // token shape (redacting the path would break click-to-open, so we drop it).
    if (pathLooksSecret(path)) continue;

    if (!byFile.has(path)) {
      if (byFile.size >= MAX_FILES) {
        truncated = true;
        continue;
      }
      byFile.set(path, {
        path,
        matches: [],
        matchCount: 0,
        matchesTruncated: false,
      });
    }
    const file = byFile.get(path)!;
    file.matchCount += 1;
    totalMatches += 1;
    if (totalMatches >= MAX_TOTAL_MATCHES) truncated = true;

    if (file.matches.length >= MAX_MATCHES_PER_FILE) {
      file.matchesTruncated = true;
      continue;
    }
    if (totalMatches > MAX_TOTAL_MATCHES) continue;

    let text = m[3]!;
    if (text.length > MAX_LINE_LEN) text = text.slice(0, MAX_LINE_LEN) + "…";
    // Redact any secret token shape in the snippet before it leaves the server
    // (strict content patterns + the broader display-tier shapes).
    const red = redactForDisplay(text);
    redactedCount += red.count;
    file.matches.push({ line, text: red.redacted });
  }

  const files = [...byFile.values()];
  return {
    available: true,
    error: null,
    query,
    regex,
    files,
    totalMatches,
    totalFiles: files.length,
    truncated,
    redactedCount,
  };
}

/**
 * Tracked file paths (optionally scoped by include/exclude globs), bounded. Used
 * as the candidate set for supervisor search and for whole-repo filename filter.
 */
export async function listCodebaseFiles(input: {
  projectRoot: string;
  include?: string | null;
  exclude?: string | null;
  max?: number;
}): Promise<FileListResult> {
  const max = Math.max(1, Math.min(input.max ?? 2000, 20000));
  const empty: FileListResult = {
    available: true,
    error: null,
    paths: [],
    truncated: false,
  };
  if (!(await pathExists(input.projectRoot))) {
    return { ...empty, available: false, error: "Project path is unavailable." };
  }
  const gitRoot = await findGitRoot(input.projectRoot);
  if (!gitRoot) {
    return { ...empty, available: false, error: "Needs a git repository." };
  }
  // Tracked + new (untracked, non-ignored) files, matching what content search
  // sees and what the user sees in their working tree.
  const r = await git(input.projectRoot, [
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "--",
    ...pathspecs(input.include, input.exclude),
  ]);
  if (r.exitCode !== 0) {
    return { ...empty, error: r.stderr.split("\n")[0]?.trim() || "List failed." };
  }
  const all = r.stdout
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((p) => !pathLooksSecret(p));
  const truncated = all.length > max;
  return { ...empty, paths: all.slice(0, max), truncated };
}
