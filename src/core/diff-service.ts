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
  // Widened per the P7a adversarial review (the common first-commit misses).
  /(^|\/)id_dsa(\.pub)?$/,
  /(^|\/)id_ecdsa(\.pub)?$/,
  /(^|\/)credentials(\.(json|ya?ml|toml))?$/i,
  /(^|\/)\.npmrc$/i,
  /(^|\/)\.netrc$/i,
  /(^|\/)\.pgpass$/i,
  /(^|\/)\.aws\/credentials$/i,
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

/**
 * Scan raw text (not a diff) for the same high-precision secret patterns. Used
 * by the codebase-annotations service so a user can't paste a literal vendor
 * token into a note that then gets injected into agent prompts.
 */
export function scanTextForSecrets(text: string): SecretContentMatch[] {
  const matches: SecretContentMatch[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const { name, re } of SECRET_CONTENT_PATTERNS) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line))) {
        matches.push({
          pattern: name,
          line: i,
          filePath: null,
          redactedSnippet: redactSecret(m[0]),
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

/**
 * Replace every high-precision secret token in raw text with a `[REDACTED:…]`
 * marker. Used to scrub external content (fetched URLs, referenced files)
 * before it enters an agent prompt. Returns the scrubbed text + a match count.
 */
// Generic secret-ASSIGNMENT shape, to catch novel-shaped secrets the vendor
// token patterns miss (e.g. `DB_PASS=hunter2longstring`, `client_secret: "abc..."`).
// Deliberately conservative - this redactor runs on diffs/text the model must
// still read, so a false positive corrupts context. It fires only when a
// secret-ish KEY name is assigned a contiguous, non-placeholder VALUE, and it
// preserves the key + separator so "a secret was set here" context survives.
// Groups: 1=key, 2=sep, 3=opening quote (if any), 4=value.
// ONE bounded key capture (no nested/adjacent unbounded stars) so a keyword-ish
// run like `token_token_...` can't be partitioned exponentially - this closes the
// catastrophic-backtracking ReDoS. The key is length-bounded, the value is a
// bounded secret-charset token (so it stops at `;`/`,`/comments instead of eating
// them). Whether the KEY names a secret is decided in JS (keyLooksSecret), which
// requires the secret word to be the TRAILING segment - so `access_key` matches
// but `access_key_header`, `tokenizer`, `password_hint`, `privateKeyPath` do not.
// Groups: 1=key, 2=sep, 3=opening quote (if any), 4=value.
const SECRET_ASSIGNMENT_RE =
  /(?<![A-Za-z0-9_.-])([A-Za-z0-9_.-]{1,64})(\s*[=:]\s*)(["'`]?)([A-Za-z0-9+/=_.-]{8,64})\3/g;

// Secret "type" words that, when they are the LAST segment of a key, mark it a
// secret (e.g. DB_PASS, client_secret, auth_token, MY_APIKEY, credential).
const SECRET_KEY_SEGMENTS = new Set([
  "password",
  "passwd",
  "pass",
  "secret",
  "token",
  "apikey",
  "credential",
  "credentials",
]);
// Two-segment secret suffixes (the word is split by a separator or camelCase).
const SECRET_KEY_PAIRS = new Set([
  "api key",
  "access key",
  "secret key",
  "private key",
  "signing key",
  "client secret",
  "auth token",
  "access token",
  "refresh token",
]);

/** Does the assignment KEY name a secret? True only when a secret "type" word is
 *  the trailing segment (or trailing pair) of the key - so `DB_PASS`/`api_key`
 *  match but `tokenizer`/`access_key_header`/`password_hint` do not. */
function keyLooksSecret(key: string): boolean {
  const segs = key
    .split(/[_.\-]|(?<=[a-z0-9])(?=[A-Z])/)
    .filter(Boolean)
    .map((s) => s.toLowerCase());
  if (segs.length === 0) return false;
  const last = segs[segs.length - 1]!;
  if (SECRET_KEY_SEGMENTS.has(last)) return true;
  if (segs.length >= 2 && SECRET_KEY_PAIRS.has(`${segs[segs.length - 2]} ${last}`)) {
    return true;
  }
  return false;
}

/** A captured assignment value that is clearly NOT a literal secret - an env
 *  reference, a variable interpolation, a path, a number, or a placeholder -
 *  so it should be left untouched (redacting it would only corrupt context). */
function isNonSecretValue(value: string): boolean {
  return (
    /^env:/i.test(value) || // the app's own `env:NAME` secret-ref shape
    /^\$/.test(value) || // ${VAR} / $VAR interpolation
    /^process\.env/i.test(value) ||
    /^import\.meta/i.test(value) ||
    /^</.test(value) || // <your-key-here>
    /^[./~]/.test(value) || // paths: ./x /x ~/x
    /^-?\d+(?:\.\d+)?$/.test(value) || // pure numbers
    /^(?:changeme|placeholder|example|redacted|todo|tbd|none|null|undefined|true|false|xxx+|\*+|\.+|-+)$/i.test(
      value,
    ) ||
    /^your[_-]/i.test(value) // your_key_here style
  );
}

export function redactSecretsInText(text: string): {
  redacted: string;
  count: number;
} {
  let count = 0;
  let out = text;
  for (const { name, re } of SECRET_CONTENT_PATTERNS) {
    const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
    out = out.replace(new RegExp(re.source, flags), () => {
      count += 1;
      return `[REDACTED:${name}]`;
    });
  }
  // Second pass: generic `SECRET_KEY = value` assignments the vendor patterns miss.
  out = out.replace(
    SECRET_ASSIGNMENT_RE,
    (full, key: string, sep: string, quote: string, value: string) => {
      if (!keyLooksSecret(key)) return full;
      if (isNonSecretValue(value)) return full;
      count += 1;
      return `${key}${sep}${quote}[REDACTED:secret assignment]${quote}`;
    },
  );
  return { redacted: out, count };
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

  // `git diff --numstat HEAD` omits untracked files entirely, so a brand-new
  // file (status `??`) would show +0 in the summary even though it's all new
  // lines. Count its added lines the same way getFileDiff renders it - diff
  // the file against /dev/null with --no-index - so the changed-files list is
  // honest. (Untracked directory entries end in "/" and are skipped.)
  for (const [filePath, fileStatus] of statusByPath) {
    if (fileStatus !== "untracked") continue;
    if (numstatByPath.has(filePath)) continue;
    if (filePath.endsWith("/")) continue;
    const added = await runGit(worktreePath, [
      "diff",
      "--no-ext-diff",
      "--numstat",
      "--no-index",
      "/dev/null",
      filePath,
    ]);
    for (const line of added.stdout.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      const parts = t.split(/\t+/);
      if (parts.length < 3) continue;
      const ins = parts[0] === "-" ? 0 : Number(parts[0]) || 0;
      numstatByPath.set(filePath, { insertions: ins, deletions: 0 });
      break;
    }
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

/**
 * The full unified diff TEXT of a worktree vs a base ref (default HEAD), including
 * untracked files (each diffed against /dev/null so a brand-new file's added lines
 * are present). Secret-like files are skipped entirely. Used by the preference
 * block gate (preference-block-gate.ts) to scan added lines at run completion.
 */
export async function getWorktreeDiffText(input: {
  worktreePath: string;
  /** The branch the worktree forked from (e.g. "main"). The diff is taken from the
   *  fork point (merge-base) to the working tree, so a run that COMMITS mid-run
   *  (checklist/roadmap) is still fully scanned - `git diff HEAD` would miss its
   *  committed lines. Null/absent falls back to HEAD (uncommitted tail only). */
  baseBranch?: string | null;
}): Promise<string> {
  const worktreePath = input.worktreePath;
  if (!(await pathExists(worktreePath))) return "";
  // Resolve the fork point against the base branch; diff from there to the working
  // tree captures both committed-mid-run and uncommitted changes. Fall back to HEAD.
  let base = "HEAD";
  if (input.baseBranch) {
    const mb = await runGit(worktreePath, ["merge-base", input.baseBranch, "HEAD"]);
    const sha = mb.exitCode === 0 ? mb.stdout.trim().split("\n")[0] : null;
    if (sha) base = sha;
  }
  const tracked = await runGit(worktreePath, ["diff", "--no-ext-diff", base]);
  const parts: string[] = [tracked.stdout];
  // Untracked files: `git diff <ref>` omits them, so diff each new file against
  // /dev/null to capture its all-added content. Skip secret-like paths.
  const status = await runGit(worktreePath, ["status", "--porcelain"]);
  for (const line of status.stdout.split("\n")) {
    if (!line.trim()) continue;
    const code = line.slice(0, 2);
    const filePath = line.slice(3).trim();
    if (parseStatusCode(code) !== "untracked") continue;
    if (filePath.endsWith("/")) continue;
    if (isSecretLikePath(filePath)) continue;
    const fileDiff = await runGit(worktreePath, [
      "diff",
      "--no-ext-diff",
      "--no-index",
      "/dev/null",
      filePath,
    ]);
    if (fileDiff.stdout.trim()) parts.push(fileDiff.stdout);
  }
  return parts.join("\n");
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
        "This file looks like a secret (env file, key, credential). Diff body suppressed by Vibestrate.",
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
