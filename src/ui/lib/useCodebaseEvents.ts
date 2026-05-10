import { useEffect, useState } from "react";
import type { CodebaseEvent } from "./types.js";

export type CodebaseFreshness = {
  /** ISO timestamp of the most recent event (or last successful poll). */
  lastUpdatedAt: string | null;
  /** True while the SSE channel is open. */
  connected: boolean;
  /** True after we lose the channel; stays true until reconnect succeeds. */
  reconnecting: boolean;
  /** Latest event observed, useful for triggering refetches. */
  lastEvent: CodebaseEvent | null;
};

/**
 * Subscribe to a codebase SSE channel. Auto-reconnects with backoff up to ~30 s
 * and exposes lastUpdatedAt + reconnecting flags so the UI can show a clear
 * "live"/"stale" indicator.
 */
export function useCodebaseEvents(url: string | null): CodebaseFreshness {
  const [state, setState] = useState<CodebaseFreshness>({
    lastUpdatedAt: null,
    connected: false,
    reconnecting: false,
    lastEvent: null,
  });

  useEffect(() => {
    if (!url) {
      setState((s) => ({ ...s, connected: false }));
      return;
    }
    let stopped = false;
    let attempt = 0;
    let es: EventSource | null = null;
    let reconnectTimer: number | null = null;

    function open() {
      if (stopped) return;
      try {
        es = new EventSource(url!);
      } catch {
        scheduleReconnect();
        return;
      }
      es.onopen = () => {
        attempt = 0;
        setState((s) => ({
          ...s,
          connected: true,
          reconnecting: false,
        }));
      };
      es.onerror = () => {
        es?.close();
        es = null;
        setState((s) => ({ ...s, connected: false, reconnecting: true }));
        scheduleReconnect();
      };
      es.addEventListener("codebase", (ev) => {
        try {
          const data = JSON.parse((ev as MessageEvent).data) as CodebaseEvent;
          setState((s) => ({
            ...s,
            lastEvent: data,
            lastUpdatedAt: data.timestamp,
            connected: true,
            reconnecting: false,
          }));
        } catch {
          // ignore malformed payloads
        }
      });
    }

    function scheduleReconnect() {
      if (stopped) return;
      attempt++;
      const delay = Math.min(1_000 * 2 ** Math.min(attempt, 5), 30_000);
      reconnectTimer = window.setTimeout(open, delay);
    }

    open();
    return () => {
      stopped = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      es?.close();
    };
  }, [url]);

  return state;
}
