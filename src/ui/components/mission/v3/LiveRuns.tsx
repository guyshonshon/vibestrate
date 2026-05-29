import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Cpu,
  GitBranch,
  Pause,
} from "lucide-react";
import { Chip } from "../../design/Chip.js";
import { PhaseRail } from "../../design/PhaseRail.js";
import { cn } from "../../design/cn.js";
import { fmtElapsed, relTime } from "../../design/format.js";
import { MiniTerminal, type TerminalLine } from "../../design/Terminal.js";
import type { VibestrateEvent, RunState, RunStatus } from "../../../lib/types.js";

const PHASES = [
  { key: "plan", label: "Plan", statuses: ["planning", "planned"] },
  { key: "arch", label: "Arch", statuses: ["architecting", "architected"] },
  { key: "exec", label: "Exec", statuses: ["executing"] },
  { key: "val", label: "Val", statuses: ["validating"] },
  { key: "review", label: "Review", statuses: ["reviewing"] },
  { key: "fix", label: "Fix", statuses: ["fixing"] },
  { key: "verify", label: "Verify", statuses: ["verifying"] },
  { key: "ready", label: "Ready", statuses: ["merge_ready"] },
] as const;

function phaseIndex(status: RunStatus): number {
  for (let i = 0; i < PHASES.length; i += 1) {
    if ((PHASES[i]!.statuses as readonly string[]).includes(status)) return i;
  }
  return 0;
}

function statusTone(
  status: RunStatus,
): "violet" | "sky" | "amber" | "emerald" | "rose" | "neutral" {
  if (status === "waiting_for_approval" || status === "paused") return "amber";
  if (status === "reviewing" || status === "verifying" || status === "validating")
    return "sky";
  if (status === "merge_ready") return "emerald";
  if (status === "failed" || status === "aborted" || status === "blocked")
    return "rose";
  return "violet";
}

function prettyStatus(s: RunStatus): string {
  return (
    ({
      planning: "Planning",
      planned: "Planned",
      architecting: "Architecting",
      architected: "Architected",
      executing: "Executing",
      validating: "Validating",
      reviewing: "Reviewing",
      fixing: "Fixing",
      verifying: "Verifying",
      waiting_for_approval: "Needs approval",
      paused: "Paused",
      merge_ready: "Merge ready",
      blocked: "Blocked",
      failed: "Failed",
      aborted: "Aborted",
      created: "Created",
    } as Record<RunStatus, string>)[s] ?? s
  );
}

function eventsToLines(events: VibestrateEvent[]): TerminalLine[] {
  return events.slice(-8).map((e) => {
    const tag = (e.type ?? "event").split(".").pop() ?? "event";
    const text =
      e.message ??
      (e.data && typeof (e.data as { summary?: unknown }).summary === "string"
        ? ((e.data as { summary: string }).summary)
        : e.type);
    const color: TerminalLine["color"] = e.type?.startsWith("diff")
      ? "emerald"
      : e.type?.startsWith("tool")
        ? "sky"
        : e.type?.startsWith("validate") || e.type?.startsWith("validation")
          ? "amber"
          : e.type?.startsWith("agent")
            ? "violet"
            : "fog";
    return { tag, text: String(text).slice(0, 200), color };
  });
}

export function LiveRunsSection({
  runs,
  eventsByRun,
  diffByRun,
  onOpen,
  onPause,
  onResume,
  onAbort,
}: {
  runs: RunState[];
  eventsByRun: Record<string, VibestrateEvent[]>;
  diffByRun: Record<string, { insertions: number; deletions: number; files: number }>;
  onOpen: (runId: string) => void;
  onPause: (runId: string) => void;
  onResume: (runId: string) => void;
  onAbort: (runId: string) => void;
}) {
  return (
    <section>
      <div className="flex items-end justify-between mb-3">
        <div>
          <div className="eyebrow mb-1.5">
            Active processes · {runs.length} live
          </div>
          <h2 className="text-[20px] font-semibold tracking-tight">
            Live execution
          </h2>
        </div>
      </div>
      {runs.length === 0 ? (
        <div className="glass p-8 text-center">
          <div className="text-[14px] text-fog-200 font-medium">
            Nothing is running.
          </div>
          <div className="text-[12.5px] text-fog-400 mt-1">
            Write a brief above and send it to a crew to start a run.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {runs.map((r, i) => (
            <RunCard
              key={r.runId}
              run={r}
              events={eventsByRun[r.runId] ?? []}
              diff={diffByRun[r.runId]}
              delayIdx={i}
              onOpen={onOpen}
              onPause={onPause}
              onResume={onResume}
              onAbort={onAbort}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function RunCard({
  run,
  events,
  diff,
  delayIdx,
  onOpen,
  onPause,
  onResume,
}: {
  run: RunState;
  events: VibestrateEvent[];
  diff?: { insertions: number; deletions: number; files: number };
  delayIdx: number;
  onOpen: (runId: string) => void;
  onPause: (runId: string) => void;
  onResume: (runId: string) => void;
  onAbort: (runId: string) => void;
}) {
  const needsApproval = run.status === "waiting_for_approval";
  const tone = statusTone(run.status);
  const idx = phaseIndex(run.status);
  const phases = PHASES.map((p) => p.label);
  const lines = useMemo(() => eventsToLines(events), [events]);
  const lastEvent = events.length > 0 ? events[events.length - 1] : null;
  const lastEventLabel = lastEvent
    ? `${lastEvent.type} · ${lastEvent.message ?? ""}`.slice(0, 120)
    : "";
  const [elapsed, setElapsed] = useState(() =>
    Math.max(0, Math.floor((Date.now() - new Date(run.startedAt).getTime()) / 1000)),
  );
  useEffect(() => {
    const id = window.setInterval(
      () =>
        setElapsed(
          Math.max(
            0,
            Math.floor((Date.now() - new Date(run.startedAt).getTime()) / 1000),
          ),
        ),
      1000,
    );
    return () => window.clearInterval(id);
  }, [run.startedAt]);

  return (
    <article
      onClick={() => onOpen(run.runId)}
      className={cn(
        "group relative rounded-2xl border surface-ink-100-55 backdrop-blur-xl card-hover cursor-pointer overflow-hidden fade-up",
        needsApproval
          ? "border-amber-400/30 ring-1 ring-amber-400/15"
          : "border-white/[0.08]",
      )}
      style={{ animationDelay: `${delayIdx * 80}ms` }}
    >
      <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="absolute -top-32 -left-20 w-72 h-72 rounded-full bg-violet-soft/[0.08] blur-3xl" />
      </div>
      <div className="relative p-4 space-y-3.5">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Chip tone={tone}>
                <span className="pulse-dot" /> {prettyStatus(run.status)}
              </Chip>
              <span className="mono text-[11px] text-fog-500 whitespace-nowrap">
                {run.runId}
              </span>
              <span className="text-[11px] text-fog-500">·</span>
              <span className="text-[11px] text-fog-400 whitespace-nowrap">
                started {relTime(run.startedAt)}
              </span>
            </div>
            <h3 className="text-[14.5px] text-fog-100 font-medium leading-snug line-clamp-2">
              {run.task}
            </h3>
          </div>
          <div className="text-right shrink-0 whitespace-nowrap">
            <div className="mono text-[15px] text-fog-100 num-tabular">
              {fmtElapsed(elapsed)}
            </div>
            <div className="mono text-[10px] text-fog-500 uppercase tracking-[0.14em]">
              elapsed
            </div>
          </div>
        </div>

        <PhaseRail steps={phases} active={idx} />

        <MiniTerminal lines={lines} paused={needsApproval} />

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-5 h-5 rounded-md bg-violet-500/15 ring-1 ring-violet-soft/30 flex items-center justify-center text-violet-soft shrink-0">
                <Cpu className="h-3 w-3" strokeWidth={1.7} />
              </span>
              <span className="text-[12px] text-fog-200 truncate">
                {run.profileOverride ?? run.crewId ?? "auto"}
              </span>
            </div>
            {run.branchName ? (
              <>
                <span className="text-fog-500">·</span>
                <span className="flex items-center gap-1.5 text-[12px] text-fog-300">
                  <GitBranch className="h-3 w-3 text-fog-400" strokeWidth={1.7} />
                  <span className="mono text-[11.5px] truncate max-w-[180px]">
                    {run.branchName}
                  </span>
                </span>
              </>
            ) : null}
          </div>
          {diff ? (
            <div className="flex items-center gap-2.5 text-[11.5px] mono">
              <span className="text-emerald-300/90">+{diff.insertions}</span>
              <span className="text-rose-300/90">−{diff.deletions}</span>
              <span className="text-fog-500">·</span>
              <span className="text-fog-300">{diff.files} files</span>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between pt-1">
          <div className="text-[11.5px] text-fog-400 truncate">
            {lastEventLabel}
          </div>
          <div
            className="flex items-center gap-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            {needsApproval ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen(run.runId);
                }}
                className="h-7 px-2.5 rounded-lg bg-gradient-to-b from-violet-mid to-violet-deep text-white text-[12px] flex items-center gap-1.5 ring-1 ring-violet-soft/35"
              >
                <Check className="h-3 w-3" strokeWidth={1.7} /> Open approval
              </button>
            ) : run.status === "paused" ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onResume(run.runId);
                }}
                className="h-7 px-2.5 rounded-lg border border-white/10 bg-white/[0.04] text-fog-100 text-[12px] flex items-center gap-1.5"
              >
                Resume
              </button>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onPause(run.runId);
                }}
                className="h-7 px-2.5 rounded-lg border border-white/10 bg-white/[0.04] text-fog-200 text-[12px] flex items-center gap-1.5 hover:text-fog-100"
              >
                <Pause className="h-3 w-3" strokeWidth={1.7} /> Pause
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpen(run.runId);
              }}
              className="h-7 px-2.5 rounded-lg text-[12px] text-fog-300 hover:text-fog-100 flex items-center gap-1.5"
            >
              Open <ArrowUpRight className="h-3 w-3" strokeWidth={1.7} />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
