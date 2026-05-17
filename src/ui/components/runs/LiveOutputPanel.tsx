import { useEffect, useMemo, useRef, useState } from "react";
import { TerminalSquare } from "lucide-react";
import { api } from "../../lib/api.js";

type Line = { stream: "stdout" | "stderr"; chunk: string; at: string };
type StreamMeta = {
  promptName: string;
  bytes: number;
  updatedAt: string;
};

/**
 * Live tail of the provider CLI's stdout/stderr for each agent
 * invocation in this run. Backed by .amaco/runs/<runId>/streams/*.ndjson
 * + a per-stream SSE endpoint. The dropdown shows newest-first; the
 * selected stream auto-scrolls as new chunks arrive.
 *
 * Honest empty state when no stream has been recorded yet (run hasn't
 * spawned a provider, or this is an older run that predates streaming).
 */
export function LiveOutputPanel({ runId }: { runId: string }) {
  const [streams, setStreams] = useState<StreamMeta[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [autoscroll, setAutoscroll] = useState(true);
  const scrollerRef = useRef<HTMLPreElement | null>(null);

  // Poll the list every 3s so newly spawned agents show up.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await api.listRunStreams(runId);
        if (cancelled) return;
        setStreams(r.streams);
        if (active === null && r.streams[0]) {
          setActive(r.streams[0].promptName);
        }
      } catch {
        /* ignore — old run, network blip */
      }
    };
    void load();
    const i = window.setInterval(load, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(i);
    };
  }, [runId, active]);

  // Open SSE for the selected stream. Falls back to a periodic poll
  // when SSE is blocked or the route 404s.
  useEffect(() => {
    if (!active) return;
    setLines([]);
    const url = `/api/runs/${encodeURIComponent(runId)}/streams/${encodeURIComponent(
      active,
    )}/stream`;
    let es: EventSource | null = null;
    let poll: number | null = null;
    try {
      es = new EventSource(url);
      es.addEventListener("chunk", (e: MessageEvent) => {
        try {
          const line = JSON.parse(e.data) as Line;
          setLines((cur) => [...cur, line].slice(-1500));
        } catch {
          /* skip malformed */
        }
      });
      es.addEventListener("raw", (e: MessageEvent) => {
        const fallback: Line = {
          stream: "stdout",
          chunk: String(e.data),
          at: new Date().toISOString(),
        };
        setLines((cur) => [...cur, fallback].slice(-1500));
      });
      es.onerror = () => {
        es?.close();
        es = null;
        // Polling fallback — slow but reliable.
        poll = window.setInterval(async () => {
          try {
            const r = await api.readRunStream(runId, active);
            setLines(r.lines.slice(-1500));
          } catch {
            /* ignore */
          }
        }, 2000);
      };
    } catch {
      // EventSource unsupported — same polling fallback.
      poll = window.setInterval(async () => {
        try {
          const r = await api.readRunStream(runId, active);
          setLines(r.lines.slice(-1500));
        } catch {
          /* ignore */
        }
      }, 2000);
    }
    return () => {
      if (es) es.close();
      if (poll !== null) window.clearInterval(poll);
    };
  }, [runId, active]);

  // Auto-scroll on new chunks unless the user has scrolled away.
  useEffect(() => {
    if (!autoscroll || !scrollerRef.current) return;
    scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
  }, [lines, autoscroll]);

  const totalChars = useMemo(
    () => lines.reduce((n, l) => n + l.chunk.length, 0),
    [lines],
  );

  return (
    <section
      aria-label="Live provider output"
      className="rounded border border-amaco-border bg-amaco-panel"
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-amaco-border-soft px-3 py-2 text-[11px]">
        <TerminalSquare
          className="h-3.5 w-3.5 text-amaco-accent"
          strokeWidth={1.5}
          aria-hidden
        />
        <span className="amaco-mono uppercase tracking-[0.12em] text-amaco-fg-muted">
          live output
        </span>
        {streams.length > 0 ? (
          <select
            value={active ?? ""}
            onChange={(e) => setActive(e.target.value || null)}
            aria-label="Pick provider stream"
            className="amaco-mono rounded border border-amaco-border bg-amaco-panel-2 px-1.5 py-0.5 text-[11px] text-amaco-fg focus:outline-none focus:ring-1 focus:ring-amaco-accent"
          >
            {streams.map((s) => (
              <option key={s.promptName} value={s.promptName}>
                {s.promptName} ({s.bytes.toLocaleString()} B)
              </option>
            ))}
          </select>
        ) : null}
        <span className="amaco-mono ml-auto text-[10.5px] text-amaco-fg-muted">
          {lines.length} chunk{lines.length === 1 ? "" : "s"} ·{" "}
          {totalChars.toLocaleString()} char
          {totalChars === 1 ? "" : "s"}
        </span>
        <label className="amaco-mono inline-flex items-center gap-1 text-[10.5px] text-amaco-fg-muted">
          <input
            type="checkbox"
            checked={autoscroll}
            onChange={(e) => setAutoscroll(e.target.checked)}
            className="h-3 w-3 accent-amaco-accent"
          />
          autoscroll
        </label>
      </header>
      {streams.length === 0 ? (
        <p className="px-3 py-2 text-[11.5px] text-amaco-fg-muted">
          No provider output recorded yet for this run. Streams are
          captured per agent invocation under{" "}
          <code className="amaco-mono rounded bg-amaco-panel-2 px-1">
            .amaco/runs/&lt;runId&gt;/streams/*.ndjson
          </code>
          .
        </p>
      ) : (
        <pre
          ref={scrollerRef}
          onScroll={(e) => {
            // Disable auto-scroll if the user scrolls up by more
            // than half a viewport; re-enable when they go back
            // to the bottom.
            const el = e.currentTarget;
            const atBottom =
              el.scrollHeight - el.scrollTop - el.clientHeight < 24;
            if (atBottom !== autoscroll) setAutoscroll(atBottom);
          }}
          className="amaco-mono max-h-[60vh] overflow-y-auto whitespace-pre-wrap px-3 py-2 text-[11.5px]"
        >
          {lines.length === 0 ? (
            <span className="text-amaco-fg-muted">
              Waiting for output…
            </span>
          ) : (
            lines.map((l, i) => (
              <span
                key={i}
                className={
                  l.stream === "stderr"
                    ? "text-amaco-warn"
                    : "text-amaco-fg"
                }
              >
                {l.chunk}
              </span>
            ))
          )}
        </pre>
      )}
    </section>
  );
}
