// Append-only failure stream. Anything in the project that hits an
// unexpected error path can call `recordIssue` and it lands in
// `.amaco/issues.ndjson`. The dashboard + panel both read this so
// failures are visible from anywhere — never silent.

import path from "node:path";
import { z } from "zod";
import { appendLine, pathExists, readText, writeText } from "../utils/fs.js";
import { amacoRoot } from "../utils/paths.js";
import { nowIso } from "../utils/time.js";

export const issueSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string(),
  /**
   * Coarse origin: panel-action, server-route, scheduler-loop,
   * spawn-failure, agent-failure, etc. Keep stable so consumers
   * can filter.
   */
  kind: z.string().min(1),
  /** One-line headline, shown in the badge / row. */
  message: z.string().min(1),
  /** Optional longer detail (stack trace, raw stderr, etc). */
  detail: z.string().optional(),
  /** Suggested fix the user can copy-paste or follow. */
  fix: z.string().optional(),
  /** Free-form context (route, runId, taskId, argv, body, …). */
  context: z.record(z.string(), z.unknown()).optional(),
  /** Resolved=true means the user explicitly dismissed it. */
  resolved: z.boolean().default(false),
});
export type Issue = z.infer<typeof issueSchema>;

function issuesPath(projectRoot: string): string {
  return path.join(amacoRoot(projectRoot), "issues.ndjson");
}

/** Append one issue. Best-effort — never throws to the caller. */
export async function recordIssue(
  projectRoot: string,
  input: {
    kind: string;
    message: string;
    detail?: string;
    fix?: string;
    context?: Record<string, unknown>;
  },
): Promise<Issue> {
  const issue: Issue = {
    id: `iss-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: nowIso(),
    kind: input.kind,
    message: input.message,
    ...(input.detail !== undefined ? { detail: input.detail } : {}),
    ...(input.fix !== undefined ? { fix: input.fix } : {}),
    ...(input.context !== undefined ? { context: input.context } : {}),
    resolved: false,
  };
  try {
    await appendLine(issuesPath(projectRoot), JSON.stringify(issue));
  } catch {
    // never throw — recording an issue must not raise another one
  }
  return issue;
}

/**
 * Read all issues (newest first). Capped at `limit` to keep the
 * panel render lean.
 */
export async function listIssues(
  projectRoot: string,
  limit = 200,
): Promise<Issue[]> {
  const file = issuesPath(projectRoot);
  if (!(await pathExists(file))) return [];
  let text: string;
  try {
    text = await readText(file);
  } catch {
    return [];
  }
  const out: Issue[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0 && out.length < limit; i -= 1) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    try {
      const parsed = issueSchema.safeParse(JSON.parse(line));
      if (parsed.success) out.push(parsed.data);
    } catch {
      // skip malformed lines
    }
  }
  return out;
}

/**
 * Mark an issue resolved. We rewrite the whole file because the
 * file is small (capped at hundreds of rows in practice) and the
 * alternative (lookup index) would add complexity not justified yet.
 */
export async function resolveIssue(
  projectRoot: string,
  id: string,
): Promise<{ ok: boolean }> {
  const file = issuesPath(projectRoot);
  if (!(await pathExists(file))) return { ok: false };
  const text = await readText(file);
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const out: string[] = [];
  let touched = false;
  for (const line of lines) {
    try {
      const parsed = issueSchema.safeParse(JSON.parse(line));
      if (!parsed.success) {
        out.push(line);
        continue;
      }
      if (parsed.data.id === id) {
        out.push(JSON.stringify({ ...parsed.data, resolved: true }));
        touched = true;
      } else {
        out.push(line);
      }
    } catch {
      out.push(line);
    }
  }
  if (touched) await writeText(file, out.join("\n") + "\n");
  return { ok: touched };
}
