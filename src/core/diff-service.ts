import path from "node:path";
import { execa } from "execa";
import { pathExists } from "../utils/fs.js";

export type ChangedFileStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "untracked"
  | "unknown";

export type ChangedFile = {
  path: string;
  status: ChangedFileStatus;
  insertions: number;
  deletions: number;
  isSecretLike: boolean;
  diffRedacted: boolean;
};

export type DiffSnapshot = {
  worktreePath: string;
  baseRef: string;
  files: ChangedFile[];
  totals: {
    files: number;
    insertions: number;
    deletions: number;
    redactedFiles: number;
  };
  generatedAt: string;
};

export type FileDiff = {
  path: string;
  status: ChangedFileStatus;
  body: string;
  redacted: boolean;
  redactionReason?: string;
};

const SECRET_FILE_PATTERNS: RegExp[] = [
  /(^|\/)\.env(\..*)?$/i,
  /(^|\/)secrets?\.(json|ya?ml|toml)$/i,
  /(^|\/)id_rsa(\.pub)?$/,
  /(^|\/)id_ed25519(\.pub)?$/,
  /(^|\/).*\.pem$/i,
  /(^|\/).*\.key$/i,
  /(^|\/).*\.p12$/i,
  /(^|\/).*\.pfx$/i,
];

export function isSecretLikePath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return SECRET_FILE_PATTERNS.some((re) => re.test(normalized));
}

/**
 * High-precision secret patterns. Tuned for low false-positive rate: each
 * pattern matches a vendor-published token *shape* (length + alphabet +
 * prefix), not generic high-entropy strings. The cost of a false positive
 * is blocking a real patch from being applied, so prefer underfitting.
 *
 * If you add a pattern, ensure (a) it includes a vendor-specific prefix
 * and (b) the entropy budget after the prefix is large enough that random
 * source code is unlikely to collide.
 */
const SECRET_CONTENT_PATTERNS: { name: string; re: RegExp }[] = [
  { name: "AWS access key id", re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: "GitHub fine-grained PAT", re: /\bgithub_pat_[A-Za-z0-9_]{82}\b/g },
  { name: "GitHub classic token", re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g },
  { name: "Slack token", re: /\bxox[bapsr]-[A-Za-z0-9-]{10,}\b/g },
  { name: "Stripe live secret key", re: /\b[rs]k_live_[A-Za-z0-9]{20,}\b/g },
  { name: "Google API key", re: /\bAIza[0-9A-Za-z\-_]{35}\b/g },
  { name: "Anthropic API key", re: /\bsk-ant-[A-Za-z0-9_-]{40,}\b/g },
  {
    name: "PEM private key block",
    re: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/g,
  },
];

export type SecretContentMatch = {
  /** Human-readable pattern name. */
  pattern: string;
  /** 0-based line offset within the patch text. */
  line: number;
  /** Path of the patched file the match occurred in (best-effort; may be null
   *  for matches inside the first file's header lines). */
  filePath: string | null;
  /** Redacted snippet showing the first 4 chars of the match + length, so the
   *  full token never lands in error messages, logs, or UI surfaces. */
  redactedSnippet: string;
};

/**
 * Scan only the **added** content of a unified diff (lines starting with `+`,
 * excluding the `+++` file header) for high-precision secret patterns. Used
 * by `checkPatchSafety` so that an LLM-generated patch that pastes a literal
 * AWS key into a regular .ts file gets blocked, not just patches that touch
 * .env-style paths.
 */
export function scanPatchContentForSecrets(
  patch: string,
): SecretContentMatch[] {
  const matches: SecretContentMatch[] = [];
  const lines = patch.split(/\r?\n/);
  let currentFile: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const fileHeader = /^\+\+\+ (?:b\/)?(.+)$/.exec(line);
    if (fileHeader) {
      const target = fileHeader[1]!.trim();
      currentFile = target === "/dev/null" ? null : target;
      continue;
    }
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (!line.startsWith("+")) continue;
    // Strip the leading "+" so the patterns see the actual added content.
    const added = line.slice(1);
    for (const { name, re } of SECRET_CONTENT_PATTERNS) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(added))) {
        const token = m[0];
        matches.push({
          pattern: name,
          line: i,
          filePath: currentFile,
          redactedSnippet: redactSecret(token),
        });
      }
    }
  }
  return matches;
}

function redactSecret(token: string): string {
  if (token.length <= 8) return `${token.slice(0, 2)}…(${token.length})`;
  return `${token.slice(0, 4)}…(${token.length} chars)`;
}

function parseStatusCode(code: string): ChangedFileStatus {
  if (code.startsWith("A")) return "added";
  if (code.startsWith("M")) return "modified";
  if (code.startsWith("D")) return "deleted";
  if (code.startsWith("R")) return "renamed";
  if (code.startsWith("?")) return "untracked";
  return "unknown";
}

async function runGit(
  worktreePath: string,
  args: string[],
  opts: { timeoutMs?: number } = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const result = await execa("git", args, {
    cwd: worktreePath,
    reject: false,
    timeout: opts.timeoutMs ?? 10_000,
    stdin: "ignore",
  });
  return {
    exitCode: result.exitCode ?? -1,
    stdout: result.stdout?.toString() ?? "",
    stderr: result.stderr?.toString() ?? "",
  };
}

export async function getDiffSnapshot(input: {
  worktreePath: string;
  baseRef?: string;
}): Promise<DiffSnapshot> {
  const worktreePath = input.worktreePath;
  const baseRef = input.baseRef ?? "HEAD";
  const exists = await pathExists(worktreePath);
  if (!exists) {
    return {
      worktreePath,
      baseRef,
      files: [],
      totals: { files: 0, insertions: 0, deletions: 0, redactedFiles: 0 },
      generatedAt: new Date().toISOString(),
    };
  }

  const status = await runGit(worktreePath, ["status", "--porcelain"]);
  const numstat = await runGit(worktreePath, [
    "diff",
    "--no-ext-diff",
    "--numstat",
    baseRef,
  ]);

  const statusByPath = new Map<string, ChangedFileStatus>();
  for (const line of status.stdout.split("\n")) {
    if (!line.trim()) continue;
    const code = line.slice(0, 2);
    const filePath = line.slice(3).trim();
    statusByPath.set(filePath, parseStatusCode(code));
  }

  const numstatByPath = new Map<string, { insertions: number; deletions: number }>();
  for (const line of numstat.stdout.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split(/\t+/);
    if (parts.length < 3) continue;
    const ins = parts[0] === "-" ? 0 : Number(parts[0]) || 0;
    const del = parts[1] === "-" ? 0 : Number(parts[1]) || 0;
    const filePath = parts.slice(2).join("\t");
    numstatByPath.set(filePath, { insertions: ins, deletions: del });
  }

  const allPaths = new Set<string>([
    ...statusByPath.keys(),
    ...numstatByPath.keys(),
  ]);

  let totalIns = 0;
  let totalDel = 0;
  let redacted = 0;
  const files: ChangedFile[] = [];
  for (const filePath of [...allPaths].sort()) {
    const fileStatus =
      statusByPath.get(filePath) ?? (numstatByPath.has(filePath) ? "modified" : "unknown");
    const stat = numstatByPath.get(filePath) ?? { insertions: 0, deletions: 0 };
    const secretLike = isSecretLikePath(filePath);
    if (secretLike) redacted += 1;
    totalIns += stat.insertions;
    totalDel += stat.deletions;
    files.push({
      path: filePath,
      status: fileStatus,
      insertions: stat.insertions,
      deletions: stat.deletions,
      isSecretLike: secretLike,
      diffRedacted: secretLike,
    });
  }

  return {
    worktreePath,
    baseRef,
    files,
    totals: {
      files: files.length,
      insertions: totalIns,
      deletions: totalDel,
      redactedFiles: redacted,
    },
    generatedAt: new Date().toISOString(),
  };
}

export async function getFileDiff(input: {
  worktreePath: string;
  filePath: string;
  baseRef?: string;
}): Promise<FileDiff> {
  const baseRef = input.baseRef ?? "HEAD";
  const normalized = input.filePath.replace(/\\/g, "/");
  if (normalized.startsWith("/") || normalized.includes("..")) {
    return {
      path: input.filePath,
      status: "unknown",
      body: "",
      redacted: true,
      redactionReason: "Refusing to diff a path that escapes the worktree.",
    };
  }
  if (isSecretLikePath(normalized)) {
    return {
      path: normalized,
      status: "unknown",
      body: "",
      redacted: true,
      redactionReason:
        "This file looks like a secret (env file, key, credential). Diff body suppressed by Amaco.",
    };
  }

  // Resolve absolute path inside the worktree to ensure no traversal.
  const resolved = path.resolve(input.worktreePath, normalized);
  const insideWorktree =
    resolved === input.worktreePath ||
    resolved.startsWith(input.worktreePath + path.sep);
  if (!insideWorktree) {
    return {
      path: normalized,
      status: "unknown",
      body: "",
      redacted: true,
      redactionReason: "Refusing to diff a path outside the worktree.",
    };
  }

  const status = await runGit(input.worktreePath, [
    "status",
    "--porcelain",
    "--",
    normalized,
  ]);
  const code = status.stdout.trim().slice(0, 2);
  const fileStatus = parseStatusCode(code || "MM");

  // Use --no-color to keep output readable in the UI.
  const diff = await runGit(input.worktreePath, [
    "diff",
    "--no-ext-diff",
    "--no-color",
    baseRef,
    "--",
    normalized,
  ]);

  let body = diff.stdout;
  if (!body.trim()) {
    // For untracked files, fall back to showing the file as added against /dev/null.
    const untracked = await runGit(input.worktreePath, [
      "diff",
      "--no-ext-diff",
      "--no-color",
      "--no-index",
      "/dev/null",
      normalized,
    ]);
    if (untracked.stdout.trim()) body = untracked.stdout;
  }

  return {
    path: normalized,
    status: fileStatus,
    body,
    redacted: false,
  };
}
