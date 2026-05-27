// Per-run control stream. Append-only NDJSON under the run folder.
// Lets the dashboard queue directives (notes, compaction, abort hint)
// that the orchestrator reads between stages and incorporates into the
// next agent's prompt.
//
// One-shot providers (Claude Code -p, etc.) cannot accept interactive
// commands mid-flight. These directives are deferred and surface in the
// *next* agent's prompt — the UI labels them as such so the user
// doesn't expect a live REPL.

import path from "node:path";
import { z } from "zod";
import { appendLine, pathExists, readText, writeText } from "../utils/fs.js";
import { runDir } from "../utils/paths.js";
import { nowIso } from "../utils/time.js";

export const runControlDirectiveSchema = z.discriminatedUnion("kind", [
  z.object({
    id: z.string().min(1),
    createdAt: z.string(),
    consumedAt: z.string().nullable().default(null),
    consumedByRole: z.string().nullable().default(null),
    kind: z.literal("inject-note"),
    body: z.string().min(1).max(8000),
  }),
  z.object({
    id: z.string().min(1),
    createdAt: z.string(),
    consumedAt: z.string().nullable().default(null),
    consumedByRole: z.string().nullable().default(null),
    kind: z.literal("compact"),
    /** Optional rationale for the compact request. */
    note: z.string().max(2000).optional(),
  }),
]);

export type RunControlDirective = z.infer<typeof runControlDirectiveSchema>;

function controlPath(projectRoot: string, runId: string): string {
  return path.join(runDir(projectRoot, runId), "control.ndjson");
}

function makeId(): string {
  return `ctl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function appendControl(
  projectRoot: string,
  runId: string,
  input:
    | { kind: "inject-note"; body: string }
    | { kind: "compact"; note?: string },
): Promise<RunControlDirective> {
  const base = {
    id: makeId(),
    createdAt: nowIso(),
    consumedAt: null,
    consumedByRole: null,
  };
  const directive: RunControlDirective =
    input.kind === "inject-note"
      ? { ...base, kind: "inject-note", body: input.body }
      : { ...base, kind: "compact", ...(input.note ? { note: input.note } : {}) };
  await appendLine(
    controlPath(projectRoot, runId),
    JSON.stringify(directive),
  );
  return directive;
}

export async function listControls(
  projectRoot: string,
  runId: string,
): Promise<RunControlDirective[]> {
  const file = controlPath(projectRoot, runId);
  if (!(await pathExists(file))) return [];
  const text = await readText(file);
  const out: RunControlDirective[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(runControlDirectiveSchema.parse(JSON.parse(line)));
    } catch {
      // skip malformed rows — the stream is best-effort
    }
  }
  return out;
}

/** Mark every pending directive as consumed by `roleId`. Rewrites the
 *  whole file once — append-only would leave us re-reading "pending"
 *  rows forever. Safe because writes are serialized per-run by the
 *  orchestrator. */
export async function markPendingConsumed(
  projectRoot: string,
  runId: string,
  roleId: string,
): Promise<RunControlDirective[]> {
  const all = await listControls(projectRoot, runId);
  const now = nowIso();
  const consumed: RunControlDirective[] = [];
  const updated = all.map((d) => {
    if (d.consumedAt) return d;
    consumed.push(d);
    return { ...d, consumedAt: now, consumedByRole: roleId };
  });
  if (consumed.length === 0) return [];
  const file = controlPath(projectRoot, runId);
  await writeText(file, updated.map((d) => JSON.stringify(d)).join("\n") + "\n");
  return consumed;
}

export function pendingControls(
  all: RunControlDirective[],
): RunControlDirective[] {
  return all.filter((d) => !d.consumedAt);
}

/** Pure: render the deferred controls as a markdown block that can be
 *  passed to `buildRolePrompt` via `additionalNotes`. Returns "" when
 *  no notes apply. */
export function renderControlNotes(
  pending: RunControlDirective[],
): string {
  if (pending.length === 0) return "";
  const lines: string[] = [
    "The user queued these controls from the dashboard between the previous stage and yours.",
    "Honor them where they apply to your role.",
    "",
  ];
  for (const d of pending) {
    if (d.kind === "inject-note") {
      lines.push("## Note from the user", "", d.body.trim(), "");
    } else if (d.kind === "compact") {
      lines.push(
        "## Context compaction requested",
        "",
        "The user asked you to re-state your understanding of the task in your own words",
        "(one or two paragraphs) before continuing, so the working context stays focused.",
        ...(d.note ? ["", `Rationale: ${d.note.trim()}`] : []),
        "",
      );
    }
  }
  return lines.join("\n").trim();
}
