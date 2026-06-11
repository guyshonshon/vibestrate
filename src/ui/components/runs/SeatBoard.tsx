import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Users } from "lucide-react";
import { api } from "../../lib/api.js";
import type { FlowRunState, RuntimeMetrics } from "../../lib/types.js";
import {
  activeSeatCard,
  deriveSeatBoard,
  type SeatCard,
  type SeatCardState,
} from "../../lib/seat-board.js";
import { LiveOutputPanel } from "./LiveOutputPanel.js";
import type { RunStatus } from "../../lib/types.js";

const STATE_TONE: Record<SeatCardState, string> = {
  waiting: "border-white/10 text-fog-400",
  working: "border-violet-soft/50 text-violet-200 shadow-[0_0_18px_-6px_rgba(139,124,255,0.45)]",
  done: "border-emerald-500/35 text-emerald-200",
  failed: "border-rose-500/40 text-rose-300",
  blocked: "border-rose-500/40 text-rose-300",
  skipped: "border-white/10 text-fog-500",
};

const STATE_LABEL: Record<SeatCardState, string> = {
  waiting: "waiting",
  working: "working",
  done: "done",
  failed: "failed",
  blocked: "blocked",
  skipped: "skipped",
};

/**
 * The Control Center's seat board (P5): one card per flow step showing the
 * seated role, profile/provider, and live state - the working seat pulses.
 * Selecting a card binds the detail pane below: the prompt it received
 * (collapsible, fetched mid-run from the artifacts route), its live
 * transcript while working, and its response artifact when done. Selection
 * follows the active seat until the user explicitly picks one.
 */
export function SeatBoard({
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
  const selected =
    (pinned ? cards.find((c) => c.stepId === pinned) : null) ?? auto;

  if (cards.length === 0) {
    return (
      <div className="text-[12.5px] text-fog-400">
        No flow steps recorded for this run yet.
      </div>
    );
  }

  // Group parallel fan-out members so a panel-review wave reads as one row.
  const groups: SeatCard[][] = [];
  for (const c of cards) {
    const last = groups[groups.length - 1];
    if (last && last[0]!.groupKey === c.groupKey && !c.groupKey.startsWith("lin-") && !c.groupKey.startsWith("solo-")) {
      last.push(c);
    } else {
      groups.push([c]);
    }
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto">
      <div className="flex flex-wrap items-center gap-2">
        {groups.map((group, gi) => (
          <div key={gi} className="flex items-stretch gap-1.5">
            {group.map((c) => (
              <button
                key={c.stepId}
                type="button"
                onClick={() =>
                  setPinned((cur) => (cur === c.stepId ? null : c.stepId))
                }
                className={`min-w-[120px] rounded-lg border bg-white/[0.02] px-2.5 py-1.5 text-left text-[11px] transition-colors hover:bg-white/[0.05] ${
                  STATE_TONE[c.state]
                } ${selected?.stepId === c.stepId ? "ring-1 ring-violet-soft/50" : ""}`}
              >
                <div className="flex items-center gap-1.5">
                  {c.state === "working" ? <span className="pulse-dot" /> : null}
                  <span className="truncate font-medium text-fog-100">
                    {c.label}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-[10.5px] opacity-80">
                  {c.roleLabel ?? c.seat ?? c.kind}
                  {c.profileId ? ` · ${c.profileId}` : ""}
                </div>
                <div className="mt-0.5 text-[10px] opacity-60">
                  {STATE_LABEL[c.state]}
                  {c.tokens ? ` · ${fmtTokens(c.tokens)} tok` : c.state === "working" ? " · counting…" : ""}
                </div>
              </button>
            ))}
          </div>
        ))}
      </div>

      {selected ? (
        <SeatDetail
          key={selected.stepId}
          runId={runId}
          status={status}
          card={selected}
          pinned={pinned === selected.stepId}
        />
      ) : null}
    </div>
  );
}

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
      <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-fog-300">
        <Users className="h-3.5 w-3.5 text-fog-400" strokeWidth={1.7} />
        <span className="font-medium text-fog-100">{card.label}</span>
        <span className="text-fog-500">
          {card.roleLabel ?? card.seat ?? card.kind}
          {card.providerId ? ` · ${card.providerId}` : ""}
        </span>
        <span className="text-fog-500">{STATE_LABEL[card.state]}</span>
        {pinned ? (
          <span className="text-[10px] text-fog-500">(pinned - click the card to follow the run again)</span>
        ) : null}
        {card.error ? (
          <span className="text-rose-300">{card.error}</span>
        ) : null}
      </div>

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
