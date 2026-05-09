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
