// Server-sent-events plumbing for the dashboard. `createSseClient` is the
// shared transport (event-stream headers, `event:`/`data:` framing, a close
// that only fires once); the other SSE routes build on it too.
//
// The two tailers here are the same machine over two different NDJSON files -
// a run's event log, and one provider's raw stdout/stderr stream. Both send
// everything already in the file, then re-read from the last byte offset on
// each `fs.watch` notification, forwarding a parsed line as `event` (run log)
// or `chunk` (provider stream) and an unparseable one as `raw` in both. A line
// split across two reads therefore arrives as two `raw` events, and a file that
// shrank resets the offset to 0 and replays from the start - nothing here
// dedupes, so a client must tolerate a repeat.
//
// Things that bite:
//   - These write to `reply.raw` directly, so the call sites hijack the reply
//     first. A hijacked reply can no longer carry an error response, which is
//     why the route validates before calling in.
//   - Neither function checks `runId` or `promptName`: the route matches them
//     against a pattern beforehand, and the stream-path helper re-guards
//     containment when it resolves the file. That guard is lexical, so each
//     tick also proves the file really lives in the run dir before reading it.
//   - `heartbeat` and `watcher` are `let`-declared above `cleanup` on purpose.
//     A client that disconnects before they are assigned runs `cleanup`, and
//     `const` bindings would put that in the temporal dead zone.
//   - When `fs.watch` throws (the file does not exist yet) the fallback is a
//     1s poll whose interval is cleared by its own request-close listener,
//     not by `cleanup`.

import fs, { constants as fsConstants, type Stats } from "node:fs";
import { promises as fsp } from "node:fs";
import { runDir, runEventsPath } from "../utils/paths.js";
import { streamFilePath, streamsDir } from "../core/stores/provider-stream-store.js";
import { verifyRealLeaf, verifyRealRoot } from "../utils/real-path-guard.js";
import { relativizeRoot } from "../utils/redact-paths.js";
import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * Stat a file about to be tailed, having proven it is really inside the run
 * directory it claims to be in. Null means "nothing to send this tick" - the
 * file usually does not exist yet when a tail starts, and a refusal is the
 * same non-event to the client as an empty file.
 *
 * Re-proven on every tick rather than once at subscribe, because the party
 * writing these files is the run itself: an agent can replace one with a link
 * at any point during the tail. An unparseable line is forwarded verbatim as a
 * `raw` event, so following a link here streams its target to the browser.
 */
async function verifiedTailStat(
  file: string,
  root: string,
  opts: { projectRoot: string },
): Promise<Stats | null> {
  const verified = await verifyRealRoot(root, opts.projectRoot);
  if (!verified.ok) return null;
  const leaf = await verifyRealLeaf(file, verified.realRoot);
  return leaf.ok && leaf.entry.isFile() ? leaf.entry : null;
}

/** O_NOFOLLOW closes the re-link race the stat above cannot; O_NONBLOCK keeps
 *  a leaf swapped for a FIFO from parking the open in the threadpool. */
async function openTail(file: string): Promise<fsp.FileHandle> {
  return fsp.open(file, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK);
}

export type SseClient = {
  send: (event: string, data: unknown) => void;
  close: () => void;
};

export function createSseClient(reply: FastifyReply): SseClient {
  reply.raw.setHeader("Content-Type", "text/event-stream");
  reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
  reply.raw.setHeader("Connection", "keep-alive");
  reply.raw.setHeader("X-Accel-Buffering", "no");
  reply.raw.flushHeaders?.();

  let closed = false;
  const send = (event: string, data: unknown) => {
    if (closed) return;
    const text = typeof data === "string" ? data : JSON.stringify(data);
    reply.raw.write(`event: ${event}\n`);
    reply.raw.write(`data: ${text}\n\n`);
  };
  const close = () => {
    if (closed) return;
    closed = true;
    try {
      reply.raw.end();
    } catch {
      // ignore
    }
  };
  return { send, close };
}

export type StreamEventsOptions = {
  projectRoot: string;
  runId: string;
  reply: FastifyReply;
  request: FastifyRequest;
};

/**
 * Tail .vibestrate/runs/<runId>/events.ndjson and forward each line to the SSE
 * client. Sends an initial backlog of every existing line, then watches the
 * file for new content.
 */
export async function streamRunEvents(opts: StreamEventsOptions): Promise<void> {
  const file = runEventsPath(opts.projectRoot, opts.runId);
  const client = createSseClient(opts.reply);

  // Declared up front so the cleanup closure can reference them before
  // the heartbeat/watcher are actually started. Without this, a client
  // that disconnects between SSE-headers-sent and setInterval/setup
  // hit the TDZ ("Cannot access 'heartbeat' before initialization")
  // because `const` bindings aren't hoisted.
  let heartbeat: NodeJS.Timeout | null = null;
  let watcher: fs.FSWatcher | null = null;

  const cleanup = () => {
    if (watcher) {
      try {
        watcher.close();
      } catch {
        // ignore
      }
    }
    if (heartbeat) clearInterval(heartbeat);
    client.close();
  };

  opts.request.raw.on("close", cleanup);
  opts.request.raw.on("error", cleanup);

  let position = 0;

  const readNew = async () => {
    try {
      const stat = await verifiedTailStat(file, runDir(opts.projectRoot, opts.runId), opts);
      if (!stat) return;
      if (stat.size < position) position = 0;
      if (stat.size === position) return;
      const fd = await openTail(file);
      try {
        const buf = Buffer.alloc(stat.size - position);
        await fd.read(buf, 0, buf.length, position);
        position = stat.size;
        const chunk = buf.toString("utf8");
        const lines = chunk.split("\n").filter((l) => l.trim().length > 0);
        for (const line of lines) {
          try {
            const obj = JSON.parse(line);
            client.send("event", obj);
          } catch {
            client.send("raw", line);
          }
        }
      } finally {
        await fd.close();
      }
    } catch (err) {
      // File may not exist yet.
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      client.send("error", relativizeRoot(String(err), opts.projectRoot));
    }
  };

  try {
    await fsp.mkdir(file.replace(/\/[^/]+$/, ""), { recursive: true });
  } catch {
    // ignore
  }
  await readNew();
  try {
    watcher = fs.watch(file, { persistent: false }, () => {
      void readNew();
    });
  } catch {
    // File may not exist yet - fall back to polling once a second.
    const interval = setInterval(readNew, 1000);
    opts.request.raw.on("close", () => clearInterval(interval));
  }

  // Send heartbeats so proxies do not drop the connection.
  heartbeat = setInterval(() => {
    try {
      opts.reply.raw.write(`: heartbeat\n\n`);
    } catch {
      cleanup();
    }
  }, 15_000);
}

export type StreamProviderOutputOptions = {
  projectRoot: string;
  runId: string;
  promptName: string;
  reply: FastifyReply;
  request: FastifyRequest;
};

/**
 * Tail .vibestrate/runs/<runId>/streams/<promptName>.ndjson and forward each
 * line as an SSE `chunk` event. Mirrors `streamRunEvents` but for the
 * raw provider stdout/stderr stream - used by the run-detail Live
 * Output panel to show what the model's CLI is currently saying.
 */
export async function streamProviderOutput(
  opts: StreamProviderOutputOptions,
): Promise<void> {
  const file = streamFilePath(opts.projectRoot, opts.runId, opts.promptName);
  const client = createSseClient(opts.reply);

  // See streamRunEvents - same TDZ-avoidance pattern. A request that
  // disconnects between SSE-headers-sent and the heartbeat setInterval
  // would otherwise crash `cleanup` with "Cannot access 'heartbeat'
  // before initialization".
  let heartbeat: NodeJS.Timeout | null = null;
  let watcher: fs.FSWatcher | null = null;

  const cleanup = () => {
    if (watcher) {
      try {
        watcher.close();
      } catch {
        /* ignore */
      }
    }
    if (heartbeat) clearInterval(heartbeat);
    client.close();
  };

  opts.request.raw.on("close", cleanup);
  opts.request.raw.on("error", cleanup);

  let position = 0;

  const readNew = async () => {
    try {
      const stat = await verifiedTailStat(
        file,
        streamsDir(opts.projectRoot, opts.runId),
        opts,
      );
      if (!stat) return;
      if (stat.size < position) position = 0;
      if (stat.size === position) return;
      const fd = await openTail(file);
      try {
        const buf = Buffer.alloc(stat.size - position);
        await fd.read(buf, 0, buf.length, position);
        position = stat.size;
        const text = buf.toString("utf8");
        for (const line of text.split("\n")) {
          if (!line.trim()) continue;
          try {
            client.send("chunk", JSON.parse(line));
          } catch {
            client.send("raw", line);
          }
        }
      } finally {
        await fd.close();
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      client.send("error", relativizeRoot(String(err), opts.projectRoot));
    }
  };

  try {
    await fsp.mkdir(file.replace(/\/[^/]+$/, ""), { recursive: true });
  } catch {
    /* ignore */
  }
  await readNew();
  try {
    watcher = fs.watch(file, { persistent: false }, () => {
      void readNew();
    });
  } catch {
    const interval = setInterval(readNew, 1000);
    opts.request.raw.on("close", () => clearInterval(interval));
  }

  heartbeat = setInterval(() => {
    try {
      opts.reply.raw.write(`: heartbeat\n\n`);
    } catch {
      cleanup();
    }
  }, 15_000);
}
