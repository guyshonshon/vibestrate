import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api.js";
import { streamRunEvents } from "../../lib/events.js";
import type { VibestrateEvent } from "../../lib/types.js";

export function EventStream({
  runId,
  onSelect,
}: {
  runId: string;
  onSelect?: (event: VibestrateEvent) => void;
}) {
  const [events, setEvents] = useState<VibestrateEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setEvents([]);
    setError(null);
    const initial = async () => {
      try {
        const list = await api.listEvents(runId);
        if (!cancelled) setEvents(list);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      }
    };
    void initial();

    const handle = streamRunEvents(
      runId,
      (event) => {
        setEvents((prev) => [...prev, event]);
      },
      (err) => setError(err instanceof Error ? err.message : "stream error"),
    );
    return () => {
      cancelled = true;
      handle.close();
    };
  }, [runId]);

  useEffect(() => {
    sentinelRef.current?.scrollIntoView({ block: "end" });
  }, [events]);

  return (
    <div className="rounded border border-vibestrate-border bg-vibestrate-panel">
      <header className="flex items-center justify-between border-b border-vibestrate-border px-3 py-2 text-[10.5px] uppercase tracking-[0.14em] text-vibestrate-fg-muted">
        <span>events</span>
        <span className="vibestrate-mono normal-case tracking-normal">
          {events.length}
        </span>
      </header>
      {error ? (
        <div className="px-3 py-2 text-[12px] text-vibestrate-fail">{error}</div>
      ) : events.length === 0 ? (
        <div className="px-3 py-2 text-[12px] text-vibestrate-fg-muted">
          No events yet.
        </div>
      ) : (
        <ol className="max-h-72 overflow-y-auto">
          {events.map((event, i) => (
            <li
              key={`${event.timestamp}-${i}`}
              onClick={() => onSelect?.(event)}
              className="grid cursor-pointer grid-cols-[120px_140px_1fr] gap-3 border-b border-vibestrate-border-soft px-3 py-1.5 hover:bg-vibestrate-panel-2"
            >
              <span className="vibestrate-mono text-[11px] text-vibestrate-fg-muted">
                {new Date(event.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
              <span className="vibestrate-mono text-[11.5px] text-vibestrate-fg-dim">
                {event.type}
              </span>
              <span className="text-[12.5px] text-vibestrate-fg">
                {event.message}
              </span>
            </li>
          ))}
          <li ref={sentinelRef} />
        </ol>
      )}
    </div>
  );
}
