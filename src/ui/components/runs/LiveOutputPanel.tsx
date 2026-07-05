import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Radio, TerminalSquare } from "lucide-react";
import { api } from "../../lib/api.js";
import { ApiError } from "../../lib/api.js";
import type { RunStatus } from "../../lib/types.js";
import { Select } from "../design/Select.js";

type Line = {
  stream: "stdout" | "stderr";
  chunk: string;
  at: string;
  /** Transcript kind. Absent on old lines / verbatim providers = text. */
  kind?: "text" | "thinking" | "tool" | "subagent";
};
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
 * invocation in this run. Backed by .vibestrate/runs/<runId>/streams/*.ndjson
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
  focusStream,
}: {
  runId: string;
  status: RunStatus;
  /** Pin the panel to one stream (seat board) instead of following latest. */
  focusStream?: string | null;
}) {
  const [streams, setStreams] = useState<StreamMeta[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [followLatest, setFollowLatest] = useState(true);
  const [routeMissing, setRouteMissing] = useState(false);
  const [view, setView] = useState<"transcript" | "raw">("transcript");
  const [showThinking, setShowThinking] = useState(false);
  const isTerminal = TERMINAL_STATUSES.has(status);
  const hasKinds = useMemo(
    () => lines.some((l) => l.kind && l.kind !== "text"),
    [lines],
  );

  // Poll the list every 3s so newly spawned agents show up - but stop
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
          // Pinned mode (seat board): always the focused stream when present.
          if (focusStream) {
            return r.streams.some((s) => s.promptName === focusStream)
              ? focusStream
              : null;
          }
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
  }, [runId, isTerminal, followLatest, focusStream]);

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
    // onerror can fire AFTER unmount (closing the source triggers it); the
    // flag keeps it from starting a poll the executed cleanup can't clear.
    let disposed = false;
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
        if (disposed || poll !== null) return;
        // Polling fallback - slow but reliable.
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
      // EventSource unsupported - same polling fallback.
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
      disposed = true;
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
      className="overflow-hidden rounded-[14px] border border-[color:var(--line)] bg-coal-600"
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-[color:var(--line-soft)] px-3 py-2 text-[11.5px]">
        <TerminalSquare
          className="h-3.5 w-3.5 text-violet-soft"
          strokeWidth={1.9}
          aria-hidden
        />
        <span className="mono text-[11px] text-chalk-400">active CLI</span>
        <span className="mono rounded-[8px] border border-[color:var(--line)] bg-coal-500 px-1.5 py-0.5 text-[10.5px] text-chalk-400">
          read-only attach
        </span>
        {streams.length > 0 ? (
          <Select
            value={active ?? ""}
            ariaLabel="Pick provider stream"
            className="min-w-[150px]"
            onChange={(v) => {
              setActive(v || null);
              setFollowLatest(false);
            }}
            options={streams.map((s) => ({
              value: s.promptName,
              label: s.promptName,
              hint: `${s.bytes.toLocaleString()} B`,
            }))}
          />
        ) : null}
        {streams.length > 1 ? (
          <button
            type="button"
            onClick={() => {
              setFollowLatest(true);
              setActive(streams[0]?.promptName ?? null);
            }}
            className={`mono inline-flex items-center gap-1 rounded-[10px] px-2 py-1 text-[11px] font-medium transition ${
              followLatest
                ? "bg-emerald-500/15 text-emerald-400"
                : "text-chalk-400 hover:bg-coal-500 hover:text-chalk-100"
            }`}
            title="Follow the newest provider CLI stream"
          >
            <Radio className="h-3.5 w-3.5" strokeWidth={1.9} />
            follow latest
          </button>
        ) : null}
        {hasKinds ? (
          <span className="flex items-center gap-1 rounded-[10px] bg-coal-800 p-0.5">
            {(["transcript", "raw"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`mono rounded-[8px] px-2 py-0.5 text-[11px] font-medium transition ${
                  view === v
                    ? "bg-coal-500 text-chalk-100"
                    : "text-chalk-400 hover:text-chalk-100"
                }`}
              >
                {v}
              </button>
            ))}
          </span>
        ) : null}
        <span className="mono ml-auto text-[11px] text-chalk-400">
          {lines.length} chunk{lines.length === 1 ? "" : "s"} ·{" "}
          {totalChars.toLocaleString()} char
          {totalChars === 1 ? "" : "s"}
          {lastAt ? ` · last ${formatCliTime(lastAt)}` : ""}
        </span>
      </header>
      {routeMissing ? (
        <p className="border-t border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[11.5px] text-rose-300">
          The streams endpoint returned 404. Your{" "}
          <code className="mono rounded-[4px] bg-coal-800 px-1">vibe ui</code>{" "}
          server bundle predates live streaming. Restart it after a
          rebuild to enable. Polling stopped to keep the dev console
          clean.
        </p>
      ) : streams.length === 0 ? (
        <div className="border-t border-[color:var(--line-soft)] bg-coal-900 px-3 py-3 text-[11.5px] text-chalk-400">
          {isTerminal
            ? "This run finished without recording any provider CLI output."
            : "No provider CLI output recorded yet for this run."}{" "}
          Streams are captured per agent invocation under{" "}
          <code className="mono rounded-[4px] bg-coal-800 px-1 text-chalk-300">
            .vibestrate/runs/&lt;runId&gt;/streams/*.ndjson
          </code>
          .
        </div>
      ) : lines.length === 0 || !active ? (
        <div className="min-h-[220px] border-t border-[color:var(--line-soft)] bg-coal-900 px-3 py-3 text-[11.5px] text-chalk-400">
          Waiting for provider stdout/stderr…
        </div>
      ) : (
        <div className="bg-coal-900">
          <div className="flex items-center gap-2 border-t border-[color:var(--line-soft)] px-3 py-1.5 text-[11px] text-chalk-400">
            <span className="mono truncate text-chalk-300">
              {activeStream?.promptName ?? active}
            </span>
            {hasKinds && view === "transcript" ? (
              <button
                type="button"
                onClick={() => setShowThinking((v) => !v)}
                className="mono rounded-[8px] bg-coal-500 px-2 py-0.5 text-[11px] font-medium text-chalk-300 transition hover:bg-coal-400 hover:text-chalk-100"
              >
                {showThinking ? "hide thinking" : "show thinking"}
              </button>
            ) : null}
            <span className="mono ml-auto shrink-0 text-chalk-400">
              {hasKinds && view === "transcript" ? "transcript" : "stdout/stderr"}
            </span>
          </div>
          {hasKinds && view === "transcript" ? (
            <TranscriptView lines={lines} showThinking={showThinking} />
          ) : (
            <Suspense
              fallback={
                <div className="min-h-[220px] border-t border-[color:var(--line-soft)] px-3 py-3 text-[11.5px] text-chalk-400">
                  Opening terminal view…
                </div>
              }
            >
              <ProviderCliTerminal lines={lines} streamName={active} />
            </Suspense>
          )}
        </div>
      )}
    </section>
  );
}

/** Transcript rendering: consecutive text chunks merge into prose
 *  blocks; tool/sub-agent chunks render as one-line activity rows; thinking
 *  is folded behind the header toggle. Pure display over the same lines the
 *  raw view shows. */
function TranscriptView({
  lines,
  showThinking,
}: {
  lines: Line[];
  showThinking: boolean;
}) {
  type Block =
    | { kind: "text" | "thinking"; text: string }
    | { kind: "tool" | "subagent"; text: string };
  const blocks = useMemo(() => {
    const out: Block[] = [];
    for (const l of lines) {
      if (l.stream === "stderr") continue; // raw view owns stderr
      const kind = l.kind ?? "text";
      const last = out[out.length - 1];
      if ((kind === "text" || kind === "thinking") && last?.kind === kind) {
        last.text += l.chunk;
      } else if (kind === "text" || kind === "thinking") {
        out.push({ kind, text: l.chunk });
      } else {
        out.push({ kind, text: l.chunk });
      }
    }
    return out;
  }, [lines]);
  const thinkingChars = useMemo(
    () =>
      blocks.reduce(
        (n, b) => n + (b.kind === "thinking" ? b.text.length : 0),
        0,
      ),
    [blocks],
  );
  return (
    <div className="max-h-[420px] min-h-[220px] overflow-auto border-t border-[color:var(--line-soft)] px-3 py-2">
      {blocks.map((b, i) =>
        b.kind === "tool" || b.kind === "subagent" ? (
          <div
            key={i}
            className="mono my-0.5 flex items-center gap-1.5 text-[11px] text-chalk-400"
          >
            <span
              className={`rounded-[6px] px-1.5 py-px text-[10px] font-medium ${
                b.kind === "subagent"
                  ? "bg-violet-soft/10 text-violet-soft"
                  : "bg-coal-500 text-chalk-300"
              }`}
            >
              {b.kind === "subagent" ? "agent" : "tool"}
            </span>
            <span className="truncate">{b.text}</span>
          </div>
        ) : b.kind === "thinking" ? (
          showThinking ? (
            <pre
              key={i}
              className="mono my-1 whitespace-pre-wrap border-l-2 border-[color:var(--line)] pl-2 text-[11px] italic leading-relaxed text-chalk-400"
            >
              {b.text}
            </pre>
          ) : null
        ) : (
          <pre
            key={i}
            className="mono my-1 whitespace-pre-wrap text-[11.5px] leading-relaxed text-chalk-100"
          >
            {b.text}
          </pre>
        ),
      )}
      {!showThinking && thinkingChars > 0 ? (
        <p className="mono mt-1 text-[11px] text-chalk-400">
          {thinkingChars.toLocaleString()} chars of thinking hidden - use
          "show thinking" above.
        </p>
      ) : null}
    </div>
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
