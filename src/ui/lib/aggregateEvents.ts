import type { AmacoEvent } from "./types.js";

export type AggregateFrame = {
  runId: string;
  event: AmacoEvent;
};

export type AggregateHandlers = {
  onEvent: (frame: AggregateFrame) => void;
  onReady?: (info: { tailing: number }) => void;
  onError?: (err: string) => void;
};

/**
 * Subscribe to `/api/events/stream` — the aggregate SSE that fans
 * every run's events.ndjson into one connection. Returns a
 * disconnect function the caller invokes on unmount.
 *
 * Each `event` SSE frame carries `{ runId, event }` so consumers
 * route the payload back into per-run state.
 */
export function streamAllEvents(handlers: AggregateHandlers): () => void {
  const es = new EventSource("/api/events/stream");
  es.addEventListener("event", (msg) => {
    try {
      const parsed = JSON.parse(
        (msg as MessageEvent<string>).data,
      ) as AggregateFrame;
      handlers.onEvent(parsed);
    } catch {
      // ignore malformed frames
    }
  });
  es.addEventListener("ready", (msg) => {
    if (!handlers.onReady) return;
    try {
      const parsed = JSON.parse((msg as MessageEvent<string>).data) as {
        tailing: number;
      };
      handlers.onReady(parsed);
    } catch {
      handlers.onReady({ tailing: 0 });
    }
  });
  es.addEventListener("error", () => {
    handlers.onError?.("connection error");
  });
  return () => {
    try {
      es.close();
    } catch {
      // ignore
    }
  };
}
