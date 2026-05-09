import type { AmacoEvent } from "./types.js";

export type EventStreamHandle = {
  close: () => void;
};

export function streamRunEvents(
  runId: string,
  onEvent: (event: AmacoEvent) => void,
  onError?: (err: unknown) => void,
): EventStreamHandle {
  const url = `/api/runs/${runId}/events/stream`;
  const source = new EventSource(url);
  source.addEventListener("event", (msg) => {
    try {
      const parsed = JSON.parse((msg as MessageEvent).data) as AmacoEvent;
      onEvent(parsed);
    } catch {
      // ignore malformed
    }
  });
  source.addEventListener("error", (err) => {
    onError?.(err);
  });
  return {
    close: () => source.close(),
  };
}
