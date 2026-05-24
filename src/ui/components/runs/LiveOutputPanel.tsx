import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Radio, TerminalSquare } from "lucide-react";
import { api } from "../../lib/api.js";
import { ApiError } from "../../lib/api.js";
import type { RunStatus } from "../../lib/types.js";

type Line = { stream: "stdout" | "stderr"; chunk: string; at: string };
type StreamMeta = {
  promptName: string;
  bytes: number;
  updatedAt: string;
};

const ProviderCliTerminal = lazy(() =>
  import("./ProviderCliTerminal.js").then((m) => ({
    default: m.ProviderCliTerminal,
  })),
);

const TERMINAL_STATUSES = new Set<RunStatus>([
  "merge_ready",
  "failed",
  "aborted",
  "blocked",
]);

/**
 * Live tail of the provider CLI's stdout/stderr for each agent
 * invocation in this run. Backed by .amaco/runs/<runId>/streams/*.ndjson
 * + a per-stream SSE endpoint. By default it follows the newest stream,
 * so the view tracks the currently active agent instead of staying on
 * an older planner transcript.
 *
 * Honest empty state when no stream has been recorded yet (run hasn't
 * spawned a provider, or this is an older run that predates streaming).
 *
 * Self-stopping behavior:
 *   - terminal runs poll once for the final tail, then stop
 *   - the route 404'ing 3 times in a row (e.g. the server bundle
 *     predates streaming) stops the poll + shows an actionable hint
 *     instead of looping forever
 */
export function LiveOutputPanel({
  runId,
  status,
}: {
  runId: string;
  status: RunStatus;
}) {
  const [streams, setStreams] = useState<StreamMeta[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [followLatest, setFollowLatest] = useState(true);
  const [routeMissing, setRouteMissing] = useState(false);
  const isTerminal = TERMINAL_STATUSES.has(status);

  // Poll the list every 3s so newly spawned agents show up — but stop
  // for terminal runs (no new streams), and back off entirely if the
  // streams endpoint 404s consistently (server hasn't been rebuilt).
  useEffect(() => {
    let cancelled = false;
    let consecutive404 = 0;
    const load = async () => {
      try {
        const r = await api.listRunStreams(runId);
        if (cancelled) return;
        consecutive404 = 0;
        setStreams(r.streams);
        setRouteMissing(false);
        setActive((cur) => {
          const latest = r.streams[0]?.promptName ?? null;
          if (followLatest) return latest;
          if (!cur) return latest;
          return r.streams.some((s) => s.promptName === cur) ? cur : latest;
        });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          consecutive404 += 1;
          if (consecutive404 >= 3) {
            setRouteMissing(true);
            window.clearInterval(timer);
          }
        }
      }
    };
    void load();
    if (isTerminal) return () => undefined; // one-shot for terminal
    const timer = window.setInterval(load, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [runId, isTerminal, followLatest]);

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

  const totalChars = useMemo(
    () => lines.reduce((n, l) => n + l.chunk.length, 0),
    [lines],
  );
  const lastLine = lines.length > 0 ? lines[lines.length - 1] : undefined;
  const lastAt = lastLine?.at ?? streams[0]?.updatedAt ?? null;
  const activeStream = streams.find((s) => s.promptName === active) ?? null;

  return (
    <section
      aria-label="Active provider CLI"
      className="overflow-hidden rounded border border-amaco-border bg-amaco-panel"
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-amaco-border-soft px-3 py-2 text-[11px]">
        <TerminalSquare
          className="h-3.5 w-3.5 text-amaco-accent"
          strokeWidth={1.5}
          aria-hidden
        />
        <span className="amaco-mono uppercase tracking-[0.12em] text-amaco-fg-muted">
          active CLI
        </span>
        <span className="amaco-mono rounded border border-amaco-border bg-amaco-panel-2 px-1.5 py-0.5 text-[10px] text-amaco-fg-muted">
          read-only attach
        </span>
        {streams.length > 0 ? (
          <select
            value={active ?? ""}
            onChange={(e) => {
              setActive(e.target.value || null);
              setFollowLatest(false);
            }}
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
        {streams.length > 1 ? (
          <button
            type="button"
            onClick={() => {
              setFollowLatest(true);
              setActive(streams[0]?.promptName ?? null);
            }}
            className={`amaco-mono inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] ${
              followLatest
                ? "border-amaco-success/40 text-amaco-success"
                : "border-amaco-border text-amaco-fg-muted hover:bg-amaco-panel-2"
            }`}
            title="Follow the newest provider CLI stream"
          >
            <Radio className="h-3 w-3" strokeWidth={1.5} />
            follow latest
          </button>
        ) : null}
        <span className="amaco-mono ml-auto text-[10.5px] text-amaco-fg-muted">
          {lines.length} chunk{lines.length === 1 ? "" : "s"} ·{" "}
          {totalChars.toLocaleString()} char
          {totalChars === 1 ? "" : "s"}
          {lastAt ? ` · last ${formatCliTime(lastAt)}` : ""}
        </span>
      </header>
      {routeMissing ? (
        <p className="px-3 py-2 text-[11.5px] text-amaco-warn">
          The streams endpoint returned 404. Your{" "}
          <code className="amaco-mono rounded bg-amaco-panel-2 px-1">
            amaco ui
          </code>{" "}
          server bundle predates live streaming. Restart it after a
          rebuild to enable. Polling stopped to keep the dev console
          clean.
        </p>
      ) : streams.length === 0 ? (
        <div className="border-t border-amaco-border-soft bg-[#0b0e13] px-3 py-3 text-[11.5px] text-amaco-fg-muted">
          {isTerminal
            ? "This run finished without recording any provider CLI output."
            : "No provider CLI output recorded yet for this run."}{" "}
          Streams are captured per agent invocation under{" "}
          <code className="amaco-mono rounded bg-amaco-panel-2 px-1">
            .amaco/runs/&lt;runId&gt;/streams/*.ndjson
          </code>
          .
        </div>
      ) : lines.length === 0 || !active ? (
        <div className="min-h-[220px] border-t border-amaco-border-soft bg-[#0b0e13] px-3 py-3 text-[11.5px] text-amaco-fg-muted">
          Waiting for provider stdout/stderr…
        </div>
      ) : (
        <div className="bg-[#0b0e13]">
          <div className="flex items-center gap-2 border-t border-amaco-border-soft px-3 py-1.5 text-[10.5px] text-amaco-fg-muted">
            <span className="amaco-mono truncate">
              {activeStream?.promptName ?? active}
            </span>
            <span className="amaco-mono ml-auto shrink-0">
              stdout/stderr
            </span>
          </div>
          <Suspense
            fallback={
              <div className="min-h-[220px] border-t border-amaco-border-soft px-3 py-3 text-[11.5px] text-amaco-fg-muted">
                Opening terminal view…
              </div>
            }
          >
            <ProviderCliTerminal lines={lines} streamName={active} />
          </Suspense>
        </div>
      )}
    </section>
  );
}

function formatCliTime(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
