import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { api } from "../../lib/api.js";
import type { FlowRunState, RunStatus, RuntimeMetrics } from "../../lib/types.js";
import {
  activeSeatCard,
  deriveSeatBoard,
  type SeatCard,
  type SeatCardState,
} from "../../lib/seat-board.js";
import { fmtElapsed } from "../design/format.js";
import { LiveOutputPanel } from "./LiveOutputPanel.js";

// ── Live timeline (P8b) ──────────────────────────────────────────────────────
// THE run surface: one row per flow step - status, who's seated, ticking
// elapsed, and a live tail of what the model is doing right now. Expanding a
// row shows the seat's prompt, full live transcript, and response inline.
// Replaces the run graph + seat board pair (the same steps used to render
// four different ways on this page).

const DOT_TONE: Record<SeatCardState, string> = {
  waiting: "bg-fog-500/60",
  working: "bg-violet-soft",
  done: "bg-emerald-400",
  failed: "bg-rose-400",
  blocked: "bg-rose-400",
  skipped: "bg-fog-500/35",
};

const STATE_LABEL: Record<SeatCardState, string> = {
  waiting: "waiting",
  working: "working",
  done: "done",
  failed: "failed",
  blocked: "blocked",
  skipped: "skipped",
};

type TailLine = {
  stream: "stdout" | "stderr";
  chunk: string;
  kind?: "text" | "thinking" | "tool" | "subagent";
};

/** Last visible activity of a stream: the newest tool/subagent chip or the
 *  last non-empty text line. SSE with a poll fallback, active streams only. */
function useStreamTail(
  runId: string,
  streamName: string | null,
  active: boolean,
): string | null {
  const [tail, setTail] = useState<string | null>(null);

  useEffect(() => {
    if (!active || !streamName) {
      setTail(null);
      return;
    }
    const apply = (line: TailLine) => {
      if (line.stream !== "stdout") return;
      if (line.kind === "tool" || line.kind === "subagent") {
        const head = line.chunk.split("\n").find((l) => l.trim());
        if (head) setTail(`[${line.kind}] ${head.trim().slice(0, 160)}`);
        return;
      }
      const lines = line.chunk.split("\n").filter((l) => l.trim());
      const last = lines[lines.length - 1];
      if (last) setTail(last.trim().slice(0, 160));
    };
    let es: EventSource | null = null;
    let poll: number | null = null;
    const startPolling = () => {
      poll = window.setInterval(async () => {
        try {
          const r = await api.readRunStream(runId, streamName);
          const last = r.lines[r.lines.length - 1] as TailLine | undefined;
          if (last) apply(last);
        } catch {
          /* stream not started yet */
        }
      }, 2000);
    };
    try {
      es = new EventSource(
        `/api/runs/${encodeURIComponent(runId)}/streams/${encodeURIComponent(streamName)}/stream`,
      );
      es.addEventListener("chunk", (e: MessageEvent) => {
        try {
          apply(JSON.parse(e.data) as TailLine);
        } catch {
          /* skip malformed */
        }
      });
      es.onerror = () => {
        es?.close();
        es = null;
        if (poll === null) startPolling();
      };
    } catch {
      startPolling();
    }
    return () => {
      if (es) es.close();
      if (poll !== null) window.clearInterval(poll);
      setTail(null);
    };
  }, [runId, streamName, active]);

  return tail;
}

/** Ticking clock for working rows; frozen spans for finished ones. */
function useNowTick(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [enabled]);
  return now;
}

function stepElapsed(card: SeatCard, now: number): string | null {
  if (!card.startedAt) return null;
  const start = new Date(card.startedAt).getTime();
  const end = card.endedAt ? new Date(card.endedAt).getTime() : now;
  if (!Number.isFinite(start) || end < start) return null;
  return fmtElapsed(Math.floor((end - start) / 1000));
}

export function LiveTimeline({
  runId,
  status,
  flow,
  metrics,
}: {
  runId: string;
  status: RunStatus;
  flow: FlowRunState | null | undefined;
  metrics: RuntimeMetrics | null;
}) {
  const cards = useMemo(() => deriveSeatBoard(flow, metrics), [flow, metrics]);
  const [pinned, setPinned] = useState<string | null>(null);
  const auto = useMemo(() => activeSeatCard(cards), [cards]);
  const expanded =
    (pinned ? cards.find((c) => c.stepId === pinned) : null) ?? auto;
  const anyWorking = cards.some((c) => c.state === "working");
  const now = useNowTick(anyWorking);

  if (cards.length === 0) {
    return (
      <div className="text-[12.5px] text-fog-400">
        No flow steps recorded for this run yet.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-1 overflow-auto">
      {cards.map((card, i) => {
        const isExpanded = expanded?.stepId === card.stepId;
        const parallelWithPrev =
          i > 0 &&
          cards[i - 1]!.groupKey === card.groupKey &&
          !card.groupKey.startsWith("lin-") &&
          !card.groupKey.startsWith("solo-");
        return (
          <TimelineRow
            key={card.stepId}
            runId={runId}
            status={status}
            card={card}
            now={now}
            parallelWithPrev={parallelWithPrev}
            expanded={isExpanded}
            pinned={pinned === card.stepId}
            onToggle={() =>
              setPinned((cur) => (cur === card.stepId ? null : card.stepId))
            }
          />
        );
      })}
    </div>
  );
}

function TimelineRow({
  runId,
  status,
  card,
  now,
  parallelWithPrev,
  expanded,
  pinned,
  onToggle,
}: {
  runId: string;
  status: RunStatus;
  card: SeatCard;
  now: number;
  parallelWithPrev: boolean;
  expanded: boolean;
  pinned: boolean;
  onToggle: () => void;
}) {
  const working = card.state === "working";
  // Live tail only for a working, non-expanded row - the expanded pane shows
  // the full transcript, so a tail there would just duplicate its last line.
  const tail = useStreamTail(runId, card.streamName, working && !expanded);
  const elapsed = stepElapsed(card, now);

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className={`group flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/[0.03] ${
          expanded ? "bg-white/[0.03]" : ""
        }`}
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-fog-500" strokeWidth={1.7} />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-fog-500" strokeWidth={1.7} />
        )}
        <span className="relative flex h-2 w-2 shrink-0">
          {working ? (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-soft/50" />
          ) : null}
          <span
            className={`relative inline-flex h-2 w-2 rounded-full ${DOT_TONE[card.state]}`}
          />
        </span>
        <span className="min-w-0 flex items-baseline gap-2">
          <span
            className={`truncate text-[12.5px] font-medium ${
              card.state === "skipped" ? "text-fog-500" : "text-fog-100"
            }`}
          >
            {card.label}
          </span>
          {parallelWithPrev ? (
            <span className="mono shrink-0 text-[9.5px] uppercase tracking-[0.12em] text-fog-500">
              parallel
            </span>
          ) : null}
          <span className="truncate text-[11px] text-fog-400">
            {card.roleLabel ?? card.seat ?? card.kind}
            {card.profileId ? ` · ${card.profileId}` : ""}
          </span>
        </span>
        <span className="ml-auto flex shrink-0 items-baseline gap-3 mono text-[11px] num-tabular">
          {card.tokens ? (
            <span className="text-fog-400">{fmtTokens(card.tokens)} tok</span>
          ) : null}
          {elapsed ? (
            <span className={working ? "text-violet-200" : "text-fog-300"}>
              {elapsed}
            </span>
          ) : null}
          <span
            className={
              card.state === "failed" || card.state === "blocked"
                ? "text-rose-300"
                : card.state === "done"
                  ? "text-emerald-300/90"
                  : working
                    ? "text-violet-soft"
                    : "text-fog-500"
            }
          >
            {STATE_LABEL[card.state]}
          </span>
        </span>
      </button>
      {tail ? (
        <div className="ml-[34px] truncate border-l border-white/[0.06] pl-3 mono text-[11px] leading-relaxed text-fog-400">
          {tail}
        </div>
      ) : null}
      {card.error && !expanded ? (
        <div className="ml-[34px] truncate pl-3 text-[11px] text-rose-300">
          {card.error}
        </div>
      ) : null}
      {expanded ? (
        <div className="ml-[34px] mt-1 mb-2">
          <SeatDetail
            runId={runId}
            status={status}
            card={card}
            pinned={pinned}
          />
        </div>
      ) : null}
    </div>
  );
}

/** The expanded seat pane: prompt received, live transcript while working,
 *  response artifact when done (carried over from the P5 seat board). */
function SeatDetail({
  runId,
  status,
  card,
  pinned,
}: {
  runId: string;
  status: RunStatus;
  card: SeatCard;
  pinned: boolean;
}) {
  const [promptOpen, setPromptOpen] = useState(false);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [output, setOutput] = useState<string | null>(null);

  // The prompt artifact is written BEFORE the provider call, so it's
  // fetchable while the seat is still working. Lazy: only when expanded.
  useEffect(() => {
    if (!promptOpen || prompt !== null || !card.promptArtifactPath) return;
    let cancelled = false;
    api
      .readArtifact(runId, card.promptArtifactPath)
      .then((t) => {
        if (!cancelled) setPrompt(t);
      })
      .catch(() => {
        if (!cancelled) setPrompt("(prompt artifact not readable yet)");
      });
    return () => {
      cancelled = true;
    };
  }, [promptOpen, prompt, runId, card.promptArtifactPath]);

  // Finished seats show their response artifact; working ones the live stream.
  useEffect(() => {
    if (card.state === "working" || !card.outputArtifactPath) return;
    let cancelled = false;
    api
      .readArtifact(runId, card.outputArtifactPath)
      .then((t) => {
        if (!cancelled) setOutput(t);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [runId, card.state, card.outputArtifactPath]);

  return (
    <div className="rounded-xl border border-white/[0.08] bg-black/30 p-3">
      {/* The timeline row right above already names the step, role, and
       * state - the pane only adds what the row can't: pin status + error. */}
      {pinned || card.error ? (
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          {pinned ? (
            <span className="text-fog-500">
              pinned - click the row to follow the run again
            </span>
          ) : null}
          {card.error ? (
            <span className="text-rose-300">{card.error}</span>
          ) : null}
        </div>
      ) : null}

      {card.promptArtifactPath ? (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setPromptOpen((v) => !v)}
            className="flex items-center gap-1 text-[11.5px] text-fog-400 hover:text-fog-200"
          >
            {promptOpen ? (
              <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.7} />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.7} />
            )}
            prompt this seat received
          </button>
          {promptOpen ? (
            <pre className="mt-1 max-h-[240px] overflow-auto whitespace-pre-wrap rounded-lg border border-white/[0.06] bg-black/40 p-2.5 text-[11px] leading-relaxed text-fog-300">
              {prompt ?? "Loading prompt…"}
            </pre>
          ) : null}
        </div>
      ) : null}

      <div className="mt-2">
        {card.state === "working" ? (
          <LiveOutputPanel
            runId={runId}
            status={status}
            focusStream={card.streamName}
          />
        ) : output !== null ? (
          <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap rounded-lg border border-white/[0.06] bg-black/40 p-2.5 text-[11.5px] leading-relaxed text-fog-200">
            {output}
          </pre>
        ) : (
          <p className="text-[11.5px] text-fog-500">
            {card.state === "waiting"
              ? "This seat hasn't started yet."
              : card.state === "skipped"
                ? "This step was skipped (see the run events for the recorded reason)."
                : "No response artifact recorded."}
          </p>
        )}
      </div>
    </div>
  );
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
