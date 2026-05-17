// Visibility layer for the (auto-)spawned scheduler. Captures stderr
// and stdout from the detached `amaco queue run` child into a tail-
// readable file under `.amaco/scheduler/`, plus a tiny ndjson stream
// of spawn / exit events so the dashboard can show "what happened
// the last time we tried to start the scheduler".
//
// Append-only and best-effort: every helper swallows its own errors —
// the scheduler must keep running even if we can't write a log line.

import path from "node:path";
import { openSync, writeSync, closeSync, mkdirSync } from "node:fs";
import { promises as fs } from "node:fs";
import {
  appendLine,
  pathExists,
  readText,
  writeText,
} from "../utils/fs.js";
import { schedulerDir } from "../utils/paths.js";
import { nowIso } from "../utils/time.js";

const LOG_FILE = "scheduler.log";
const EVENTS_FILE = "scheduler-spawns.ndjson";
const MAX_LOG_BYTES = 256 * 1024; // 256 KiB tail cap
const MAX_EVENTS_LINES = 100;

export function schedulerLogPath(projectRoot: string): string {
  return path.join(schedulerDir(projectRoot), LOG_FILE);
}

export function schedulerEventsPath(projectRoot: string): string {
  return path.join(schedulerDir(projectRoot), EVENTS_FILE);
}

/** Open the log file for append and return its raw file descriptor.
 *  Uses the synchronous low-level open() so node's FileHandle GC
 *  doesn't race with the child stdio holding the fd. Caller passes
 *  the int to `spawn`'s stdio array and is responsible for
 *  `closeSync(fd)` in the parent once spawn returns — the OS
 *  kernel-dups the fd into the child, so closing in the parent
 *  doesn't affect the child. */
export function openLogForAppend(projectRoot: string): number {
  mkdirSync(schedulerDir(projectRoot), { recursive: true });
  const fd = openSync(schedulerLogPath(projectRoot), "a");
  // Annotate the boundary so successive runs are easy to scan.
  writeSync(fd, `\n──── ${nowIso()} ────\n`);
  return fd;
}

export type SpawnRecord = {
  at: string;
  pid: number | null;
  source: string;
  /** When non-null, the child exited fast enough that we could
   *  observe it. null means "still running / outlived our watcher". */
  exitedAt: string | null;
  exitCode: number | null;
  exitError: string | null;
};

export async function recordSpawn(
  projectRoot: string,
  partial: Pick<SpawnRecord, "pid" | "source">,
): Promise<SpawnRecord> {
  const rec: SpawnRecord = {
    at: nowIso(),
    pid: partial.pid,
    source: partial.source,
    exitedAt: null,
    exitCode: null,
    exitError: null,
  };
  await appendLine(schedulerEventsPath(projectRoot), JSON.stringify(rec)).catch(
    () => {},
  );
  await trimEvents(projectRoot).catch(() => {});
  return rec;
}

export async function recordExit(
  projectRoot: string,
  pid: number | null,
  exitCode: number | null,
  exitError: string | null,
): Promise<void> {
  // Rewrite the events file with the matching pid's row updated.
  // Cheap because we cap to MAX_EVENTS_LINES.
  const all = await listSpawnRecords(projectRoot);
  const idx = [...all]
    .reverse()
    .findIndex((r) => r.pid === pid && r.exitedAt === null);
  if (idx === -1) {
    // No matching open record — append a standalone exit row so we
    // never silently drop the signal.
    const orphan: SpawnRecord = {
      at: nowIso(),
      pid,
      source: "orphan",
      exitedAt: nowIso(),
      exitCode,
      exitError,
    };
    await appendLine(
      schedulerEventsPath(projectRoot),
      JSON.stringify(orphan),
    ).catch(() => {});
    return;
  }
  const realIdx = all.length - 1 - idx;
  const updated = [...all];
  updated[realIdx] = {
    ...updated[realIdx]!,
    exitedAt: nowIso(),
    exitCode,
    exitError,
  };
  await writeText(
    schedulerEventsPath(projectRoot),
    updated.map((r) => JSON.stringify(r)).join("\n") + "\n",
  ).catch(() => {});
}

export async function listSpawnRecords(
  projectRoot: string,
): Promise<SpawnRecord[]> {
  const file = schedulerEventsPath(projectRoot);
  if (!(await pathExists(file))) return [];
  const text = await readText(file).catch(() => "");
  const out: SpawnRecord[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as SpawnRecord);
    } catch {
      // skip
    }
  }
  return out;
}

async function trimEvents(projectRoot: string): Promise<void> {
  const all = await listSpawnRecords(projectRoot);
  if (all.length <= MAX_EVENTS_LINES) return;
  const keep = all.slice(-MAX_EVENTS_LINES);
  await writeText(
    schedulerEventsPath(projectRoot),
    keep.map((r) => JSON.stringify(r)).join("\n") + "\n",
  );
}

/** Read the tail of the scheduler log. Pure-ish — no truncation side
 *  effect; returns last `bytes` of the file (default = MAX_LOG_BYTES). */
export async function readLogTail(
  projectRoot: string,
  bytes: number = MAX_LOG_BYTES,
): Promise<{ bytes: number; truncated: boolean; text: string }> {
  const file = schedulerLogPath(projectRoot);
  if (!(await pathExists(file))) {
    return { bytes: 0, truncated: false, text: "" };
  }
  const stat = await fs.stat(file);
  if (stat.size <= bytes) {
    const text = await readText(file);
    return { bytes: stat.size, truncated: false, text };
  }
  const handle = await fs.open(file, "r");
  try {
    const buf = Buffer.alloc(bytes);
    const start = stat.size - bytes;
    const { bytesRead } = await handle.read(buf, 0, bytes, start);
    return {
      bytes: stat.size,
      truncated: true,
      text: buf.subarray(0, bytesRead).toString("utf8"),
    };
  } finally {
    await handle.close();
  }
}
