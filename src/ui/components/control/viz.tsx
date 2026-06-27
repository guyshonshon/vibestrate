import { Activity, AlertTriangle, Check, GitMerge, X } from "lucide-react";
import type { RunStatus, VibestrateEvent } from "../../lib/types.js";

/**
 * Shared visual components for the control surface. No status dot-pills (the
 * owner hates them); status is an icon + colored label. Muted text rides the
 * global violet-tinted --color-chalk-400, never neutral grey.
 */

const PHASES = ["Plan", "Architect", "Execute", "Review", "Verify", "Merge"];
const PHASE_OF: Partial<Record<RunStatus, number>> = {
  planning: 0,
  architecting: 1,
  executing: 2,
  validating: 2,
  reviewing: 3,
  fixing: 3,
  verifying: 4,
  merge_ready: 5,
};

function clock(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function StatusLabel({ status }: { status: RunStatus }) {
  const m =
    status === "merge_ready"
      ? { Icon: GitMerge, c: "#34d399", t: "Merge ready" }
      : status === "failed"
        ? { Icon: AlertTriangle, c: "#fb7185", t: "Failed" }
        : status === "aborted"
          ? { Icon: X, c: "#9a86c9", t: "Aborted" }
          : { Icon: Activity, c: "#a78bfa", t: status.replace(/_/g, " ") };
  const Icon = m.Icon;
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-bold capitalize" style={{ color: m.c }}>
      <Icon className="h-4 w-4" strokeWidth={2.2} />
      {m.t}
    </span>
  );
}

export function StageTimeline({ status }: { status: RunStatus }) {
  const cur = PHASE_OF[status] ?? -1;
  const allDone = status === "merge_ready";
  return (
    <div className="flex items-center">
      {PHASES.map((p, i) => {
        const done = allDone || cur > i;
        const here = cur === i && !allDone;
        return (
          <div key={p} className={`flex items-center ${i < PHASES.length - 1 ? "flex-1" : ""}`}>
            <div className="flex flex-col items-center gap-2">
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-bold"
                style={{
                  background: done ? "#8b5cf6" : here ? "rgba(139,92,246,0.18)" : "rgba(255,255,255,0.05)",
                  color: done ? "#fff" : here ? "#c4b5fd" : "#6f6786",
                  boxShadow: here ? "0 0 0 2px rgba(139,92,246,0.55)" : undefined,
                }}
              >
                {done ? <Check className="h-3.5 w-3.5" strokeWidth={2.6} /> : i + 1}
              </span>
              <span
                className="text-[11px]"
                style={{ color: done || here ? "#9a86c9" : "rgba(255,255,255,0.28)" }}
              >
                {p}
              </span>
            </div>
            {i < PHASES.length - 1 ? (
              <div
                className="mx-1.5 mb-5 h-[2px] flex-1 rounded-full"
                style={{ background: done ? "rgba(139,92,246,0.45)" : "rgba(255,255,255,0.07)" }}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function DiffBar({ diff }: { diff: { insertions: number; deletions: number; files: number } | null }) {
  const ins = diff?.insertions ?? 0;
  const del = diff?.deletions ?? 0;
  const tot = Math.max(1, ins + del);
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div style={{ width: `${(ins / tot) * 100}%`, background: "#34d399" }} />
        <div style={{ width: `${(del / tot) * 100}%`, background: "#fb7185" }} />
      </div>
      <div className="mt-2.5 flex items-center gap-3 text-[14px] font-extrabold">
        <span style={{ color: "#34d399" }}>+{ins}</span>
        <span style={{ color: "#fb7185" }}>&minus;{del}</span>
        <span className="text-[12px] font-medium text-chalk-400">{diff?.files ?? 0} files</span>
      </div>
    </div>
  );
}

export function RadialStat({ value, center, label }: { value: number; center: string; label: string }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="flex items-center gap-4">
      <div className="relative h-[58px] w-[92px] shrink-0">
        <svg viewBox="0 0 92 58" width="92" height="58" fill="none" aria-hidden>
          <path d="M9 51 A 37 37 0 0 1 83 51" stroke="rgba(255,255,255,0.08)" strokeWidth="8" strokeLinecap="round" />
          <path
            d="M9 51 A 37 37 0 0 1 83 51"
            stroke="#a78bfa"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${v * 116} 200`}
          />
        </svg>
        <div className="absolute inset-x-0 bottom-1 text-center text-[16px] font-extrabold text-white">{center}</div>
      </div>
      <div className="text-[12.5px] text-chalk-400">{label}</div>
    </div>
  );
}

export function ActivityList({ events, max = 6 }: { events: VibestrateEvent[]; max?: number }) {
  const evs = events.slice(-max).reverse();
  if (evs.length === 0) return <div className="py-6 text-center text-[13px] text-chalk-400">No events yet.</div>;
  return (
    <div className="flex flex-col gap-1.5">
      {evs.map((e, i) => (
        <div key={i} className="flex items-center gap-3 rounded-[12px] bg-coal-500/40 px-3.5 py-2.5">
          <span className="shrink-0 font-mono text-[10.5px] text-chalk-400">{clock(e.timestamp)}</span>
          <span className="shrink-0 rounded-md bg-violet-soft/15 px-1.5 py-px text-[10.5px] font-semibold text-violet-soft">
            {e.type}
          </span>
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-chalk-300">{e.message}</span>
        </div>
      ))}
    </div>
  );
}
