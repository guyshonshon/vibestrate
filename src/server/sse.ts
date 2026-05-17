import fs from "node:fs";
import { promises as fsp } from "node:fs";
import { runEventsPath } from "../utils/paths.js";
import { streamFilePath } from "../core/provider-stream-store.js";
import type { FastifyReply, FastifyRequest } from "fastify";

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
 * Tail .amaco/runs/<runId>/events.ndjson and forward each line to the SSE
 * client. Sends an initial backlog of every existing line, then watches the
 * file for new content.
 */
export async function streamRunEvents(opts: StreamEventsOptions): Promise<void> {
  const file = runEventsPath(opts.projectRoot, opts.runId);
  const client = createSseClient(opts.reply);

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
      const stat = await fsp.stat(file);
      if (stat.size < position) position = 0;
      if (stat.size === position) return;
      const fd = await fsp.open(file, "r");
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
      client.send("error", String(err));
    }
  };

  let watcher: fs.FSWatcher | null = null;
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
    // File may not exist yet — fall back to polling once a second.
    const interval = setInterval(readNew, 1000);
    opts.request.raw.on("close", () => clearInterval(interval));
  }

  // Send heartbeats so proxies do not drop the connection.
  const heartbeat = setInterval(() => {
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
 * Tail .amaco/runs/<runId>/streams/<promptName>.ndjson and forward each
 * line as an SSE `chunk` event. Mirrors `streamRunEvents` but for the
 * raw provider stdout/stderr stream — used by the run-detail Live
 * Output panel to show what the model's CLI is currently saying.
 */
export async function streamProviderOutput(
  opts: StreamProviderOutputOptions,
): Promise<void> {
  const file = streamFilePath(opts.projectRoot, opts.runId, opts.promptName);
  const client = createSseClient(opts.reply);

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
      const stat = await fsp.stat(file);
      if (stat.size < position) position = 0;
      if (stat.size === position) return;
      const fd = await fsp.open(file, "r");
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
      client.send("error", String(err));
    }
  };

  let watcher: fs.FSWatcher | null = null;
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

  const heartbeat = setInterval(() => {
    try {
      opts.reply.raw.write(`: heartbeat\n\n`);
    } catch {
      cleanup();
    }
  }, 15_000);
}
