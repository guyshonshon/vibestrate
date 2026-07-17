// Append-only per-agent stream of raw provider stdout/stderr chunks.
// Lives under `.vibestrate/runs/<runId>/streams/<promptName>.ndjson`.
// Lets the dashboard tail what the provider's CLI is actually saying
// in real time - bridges the gap between "I spawned the model" and
// "here's the final artifact 30 seconds later".
//
// Each line is JSON: `{ stream: "stdout"|"stderr", chunk: "...", at: "ISO" }`.
// Best-effort: failures to write a chunk never bubble - the run keeps
// going even if the live tail breaks.

import path from "node:path";
import { promises as fs } from "node:fs";
import { appendLine, pathExists, readText } from "../../utils/fs.js";
import { runDir, isPathInside } from "../../utils/paths.js";
import { redactSecretsInText } from "../diff-service.js";

export type ProviderStreamLine = {
  stream: "stdout" | "stderr";
  chunk: string;
  at: string;
  /** Transcript kind. Absent on older lines / verbatim providers ⇒ text. */
  kind?: "text" | "thinking" | "tool" | "subagent";
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
  // (e.g. "flows/implement/prompt.md" → "flows/implement/prompt.ndjson").
  const base = promptName.replace(/\.[^./]+$/, "");
  const dir = streamsDir(projectRoot, runId);
  const target = path.resolve(dir, `${base}.ndjson`);
  // Names carry slashes now (nested flow streams) - keep every read/write
  // pinned inside the run's streams dir, whatever the caller passed.
  if (!isPathInside(dir, target)) {
    throw new Error(`Stream name escapes the streams directory: "${promptName}".`);
  }
  return target;
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
    // Redaction at the capture seam: streams were
    // unredacted, and the transcript view makes their content far more
    // readable - so high-precision token shapes are scrubbed before anything
    // is persisted. Raw view, transcript, and the SSE tail all inherit this.
    const { redacted } = redactSecretsInText(line.chunk);
    await appendLine(
      streamFilePath(projectRoot, runId, promptName),
      JSON.stringify({ ...line, chunk: redacted }),
    );
  } catch {
    /* best-effort */
  }
}

/** List the stream files recorded for a run, newest first. Each entry
 *  carries enough to render a tab without reading the body.
 *
 *  Recursive (root-cause fix): flow runs write their streams NESTED
 *  (`streams/flows/<step>/prompt.ndjson` - the stream name mirrors the
 *  prompt artifact path), and the old flat readdir missed every one of
 *  them - so the live panel showed "no output" for every flow run, i.e.
 *  for every run. promptName is the relative path without the extension
 *  (e.g. `flows/implement/prompt`). */
export async function listStreams(
  projectRoot: string,
  runId: string,
): Promise<{ promptName: string; bytes: number; updatedAt: string }[]> {
  const dir = streamsDir(projectRoot, runId);
  if (!(await pathExists(dir))) return [];
  const out: { promptName: string; bytes: number; updatedAt: string }[] = [];
  async function walk(current: string, rel: string): Promise<void> {
    const entries = await fs
      .readdir(current, { withFileTypes: true })
      .catch(() => [] as import("node:fs").Dirent[]);
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      const next = rel ? path.posix.join(rel, entry.name) : entry.name;
      if (entry.isDirectory()) {
        await walk(full, next);
        continue;
      }
      if (!entry.name.endsWith(".ndjson")) continue;
      try {
        const stat = await fs.stat(full);
        out.push({
          promptName: next.replace(/\.ndjson$/, ""),
          bytes: stat.size,
          updatedAt: stat.mtime.toISOString(),
        });
      } catch {
        /* skip */
      }
    }
  }
  await walk(dir, "");
  out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return out;
}

/** Read every chunk recorded so far for a single agent's invocation. */
export async function readStream(
  projectRoot: string,
  runId: string,
  promptName: string,
): Promise<ProviderStreamLine[]> {
  let file: string;
  try {
    file = streamFilePath(projectRoot, runId, promptName);
  } catch {
    return []; // escaping name -> nothing to read
  }
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
