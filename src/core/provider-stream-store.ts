// Append-only per-agent stream of raw provider stdout/stderr chunks.
// Lives under `.amaco/runs/<runId>/streams/<promptName>.ndjson`.
// Lets the dashboard tail what the provider's CLI is actually saying
// in real time — bridges the gap between "I spawned the model" and
// "here's the final artifact 30 seconds later".
//
// Each line is JSON: `{ stream: "stdout"|"stderr", chunk: "...", at: "ISO" }`.
// Best-effort: failures to write a chunk never bubble — the run keeps
// going even if the live tail breaks.

import path from "node:path";
import { promises as fs } from "node:fs";
import { appendLine, pathExists, readText } from "../utils/fs.js";
import { runDir } from "../utils/paths.js";

export type ProviderStreamLine = {
  stream: "stdout" | "stderr";
  chunk: string;
  at: string;
};

function streamsDir(projectRoot: string, runId: string): string {
  return path.join(runDir(projectRoot, runId), "streams");
}

export function streamFilePath(
  projectRoot: string,
  runId: string,
  promptName: string,
): string {
  // Strip extension so the on-disk name matches the prompt artifact
  // (e.g. "1_planner-prompt.md" → "1_planner-prompt.ndjson").
  const base = promptName.replace(/\.[^./]+$/, "");
  return path.join(streamsDir(projectRoot, runId), `${base}.ndjson`);
}

export async function ensureStreamsDir(
  projectRoot: string,
  runId: string,
): Promise<void> {
  await fs.mkdir(streamsDir(projectRoot, runId), { recursive: true });
}

export async function appendStreamLine(
  projectRoot: string,
  runId: string,
  promptName: string,
  line: ProviderStreamLine,
): Promise<void> {
  try {
    await appendLine(
      streamFilePath(projectRoot, runId, promptName),
      JSON.stringify(line),
    );
  } catch {
    /* best-effort */
  }
}

/** List the stream files recorded for a run, newest first. Each entry
 *  carries enough to render a tab without reading the body. */
export async function listStreams(
  projectRoot: string,
  runId: string,
): Promise<{ promptName: string; bytes: number; updatedAt: string }[]> {
  const dir = streamsDir(projectRoot, runId);
  if (!(await pathExists(dir))) return [];
  const names = await fs.readdir(dir).catch(() => []);
  const out: { promptName: string; bytes: number; updatedAt: string }[] = [];
  for (const n of names) {
    if (!n.endsWith(".ndjson")) continue;
    const full = path.join(dir, n);
    try {
      const stat = await fs.stat(full);
      out.push({
        promptName: n.replace(/\.ndjson$/, ""),
        bytes: stat.size,
        updatedAt: stat.mtime.toISOString(),
      });
    } catch {
      /* skip */
    }
  }
  out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return out;
}

/** Read every chunk recorded so far for a single agent's invocation. */
export async function readStream(
  projectRoot: string,
  runId: string,
  promptName: string,
): Promise<ProviderStreamLine[]> {
  const file = streamFilePath(projectRoot, runId, promptName);
  if (!(await pathExists(file))) return [];
  const text = await readText(file).catch(() => "");
  const out: ProviderStreamLine[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as ProviderStreamLine);
    } catch {
      /* skip malformed */
    }
  }
  return out;
}
