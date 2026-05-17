import fs from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  projectRunsDir,
  runEventsPath,
} from "../utils/paths.js";
import { createSseClient } from "./sse.js";

export type AggregateStreamOptions = {
  projectRoot: string;
  reply: FastifyReply;
  request: FastifyRequest;
};

type Tail = {
  position: number;
  watcher: fs.FSWatcher | null;
};

/**
 * SSE endpoint that fans every run's events.ndjson into a single
 * stream, with each event tagged by `runId`. The Mission Control
 * page uses this so the entire page updates from one connection
 * instead of polling.
 *
 * Each emitted SSE frame is `event: event\ndata: {"runId":…,"event":{…}}`,
 * so the client can route the payload back to per-run state.
 *
 * When a new run directory appears (the orchestrator just created
 * one), we start tailing its events.ndjson on the next watcher
 * tick.
 */
export async function streamAggregateRunEvents(
  opts: AggregateStreamOptions,
): Promise<void> {
  const client = createSseClient(opts.reply);
  const runsDir = projectRunsDir(opts.projectRoot);
  const tails = new Map<string, Tail>();
  let dirWatcher: fs.FSWatcher | null = null;
  let heartbeat: NodeJS.Timeout | null = null;

  const cleanup = () => {
    for (const tail of tails.values()) {
      try {
        tail.watcher?.close();
      } catch {
        // ignore
      }
    }
    tails.clear();
    try {
      dirWatcher?.close();
    } catch {
      // ignore
    }
    if (heartbeat) clearInterval(heartbeat);
    client.close();
  };
  opts.request.raw.on("close", cleanup);
  opts.request.raw.on("error", cleanup);

  const readNew = async (runId: string): Promise<void> => {
    const tail = tails.get(runId);
    if (!tail) return;
    const file = runEventsPath(opts.projectRoot, runId);
    try {
      const stat = await fsp.stat(file);
      if (stat.size < tail.position) tail.position = 0;
      if (stat.size === tail.position) return;
      const fd = await fsp.open(file, "r");
      try {
        const buf = Buffer.alloc(stat.size - tail.position);
        await fd.read(buf, 0, buf.length, tail.position);
        tail.position = stat.size;
        const lines = buf
          .toString("utf8")
          .split("\n")
          .filter((l) => l.trim().length > 0);
        for (const line of lines) {
          try {
            const obj = JSON.parse(line);
            client.send("event", { runId, event: obj });
          } catch {
            client.send("raw", { runId, line });
          }
        }
      } finally {
        await fd.close();
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      client.send("error", { runId, error: String(err) });
    }
  };

  const ensureTail = (runId: string): void => {
    if (tails.has(runId)) return;
    const tail: Tail = { position: 0, watcher: null };
    tails.set(runId, tail);
    const file = runEventsPath(opts.projectRoot, runId);
    void readNew(runId);
    try {
      tail.watcher = fs.watch(file, { persistent: false }, () => {
        void readNew(runId);
      });
    } catch {
      // File doesn't exist yet — the dir watcher will retry on its
      // next tick.
    }
  };

  // Walk the existing runs once on connect.
  try {
    const ids = await fsp.readdir(runsDir).catch(() => []);
    for (const id of ids) {
      const full = path.join(runsDir, id);
      const stat = await fsp.stat(full).catch(() => null);
      if (stat?.isDirectory()) ensureTail(id);
    }
  } catch {
    // ignore
  }

  // Watch the runs dir for new run dirs.
  try {
    dirWatcher = fs.watch(runsDir, { persistent: false }, async () => {
      const ids = await fsp.readdir(runsDir).catch(() => []);
      for (const id of ids) {
        ensureTail(id);
      }
    });
  } catch {
    // runs dir may not exist yet — retry every 2s.
    const interval = setInterval(async () => {
      const ids = await fsp.readdir(runsDir).catch(() => []);
      for (const id of ids) ensureTail(id);
    }, 2000);
    opts.request.raw.on("close", () => clearInterval(interval));
  }

  // Tell the client we're open for business.
  client.send("ready", { ok: true, tailing: tails.size });

  // Heartbeats so proxies don't drop us.
  heartbeat = setInterval(() => {
    try {
      opts.reply.raw.write(`: heartbeat\n\n`);
    } catch {
      cleanup();
    }
  }, 15_000);
}
