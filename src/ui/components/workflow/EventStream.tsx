import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api.js";
import { streamRunEvents } from "../../lib/events.js";
import { Skeleton, SkeletonBlock } from "../design/Skeleton.js";
import type { VibestrateEvent } from "../../lib/types.js";

export function EventStream({
  runId,
  onSelect,
}: {
  runId: string;
  onSelect?: (event: VibestrateEvent) => void;
}) {
  const [events, setEvents] = useState<VibestrateEvent[]>([]);
  // The backlog request has to land before an empty list means "no events".
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setEvents([]);
    setLoaded(false);
    setError(null);
    const initial = async () => {
      try {
        const list = await api.listEvents(runId);
        if (!cancelled) {
          setEvents(list);
          setLoaded(true);
        }
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
    <div className="rounded-[18px] border border-[color:var(--line)] bg-coal-600">
      <header className="flex items-center justify-between border-b border-[color:var(--line)] px-4 py-2.5">
        <span className="text-[12.5px] font-semibold text-chalk-300">Events</span>
        <span className="font-mono text-meta text-chalk-400">
          {events.length}
        </span>
      </header>
      {error ? (
        <div className="m-3 rounded-[10px] border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-meta text-rose-300">
          {error} - the stream will retry automatically.
        </div>
      ) : !loaded ? (
        <Skeleton label="Loading events">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="grid grid-cols-[120px_140px_1fr] items-center gap-3 border-b border-[color:var(--line-soft)] px-4 py-1.5"
            >
              <SkeletonBlock tone="text" h={11} w={62} />
              <SkeletonBlock tone="text" h={11} w={`${[86, 62, 74, 58, 80][i]}%`} />
              <SkeletonBlock tone="text" h={12} w={`${[72, 54, 84, 46, 66][i]}%`} />
            </div>
          ))}
        </Skeleton>
      ) : events.length === 0 ? (
        <div className="px-4 py-3 text-[12.5px] text-chalk-300">
          No events yet - they'll stream in as the run progresses.
        </div>
      ) : (
        <ol className="max-h-72 overflow-y-auto">
          {events.map((event, i) => (
            <li
              key={`${event.timestamp}-${i}`}
              onClick={() => onSelect?.(event)}
              className="grid cursor-pointer grid-cols-[120px_140px_1fr] gap-3 border-b border-[color:var(--line-soft)] px-4 py-1.5 transition hover:bg-coal-500/60"
            >
              <span className="font-mono text-meta text-chalk-400">
                {new Date(event.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
              <span className="font-mono text-meta text-chalk-300">
                {event.type}
              </span>
              <span className="text-[12.5px] text-chalk-100">
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
