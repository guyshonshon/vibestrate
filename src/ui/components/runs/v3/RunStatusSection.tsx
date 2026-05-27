import { useEffect, useState } from "react";
import {
  Bolt,
  Check,
  Clock,
  Cpu,
  Pause,
  Play,
  StopCircle,
  X,
} from "lucide-react";
import { PhaseRail } from "../../design/PhaseRail.js";
import { fmtElapsed } from "../../design/format.js";
import type { RunState, RunStatus } from "../../../lib/types.js";

const PHASES = [
  { label: "Plan", statuses: ["planning", "planned"] },
  { label: "Arch", statuses: ["architecting", "architected"] },
  { label: "Exec", statuses: ["executing"] },
  { label: "Val", statuses: ["validating"] },
  { label: "Review", statuses: ["reviewing"] },
  { label: "Fix", statuses: ["fixing"] },
  { label: "Verify", statuses: ["verifying"] },
  { label: "Ready", statuses: ["merge_ready"] },
] as const;

function phaseIndex(status: RunStatus): number {
  for (let i = 0; i < PHASES.length; i += 1) {
    if ((PHASES[i]!.statuses as readonly string[]).includes(status)) return i;
  }
  return 0;
}

/**
 * For a Guide run, the legacy plan→verify rail is meaningless (and contradicts
 * the crew strip — e.g. a "challenger" step while the rail says "Review"). Use
 * the Guide's actual ordered steps so the rail matches what's running.
 */
function railFor(run: RunState): { steps: string[]; active: number } {
  const guide = run.guide;
  if (!guide || guide.steps.length === 0) {
    return { steps: PHASES.map((p) => p.label), active: phaseIndex(run.status) };
  }
  const steps = guide.steps.map((s) => s.label);
  let active = guide.steps.findIndex((s) => s.id === guide.currentStepId);
  if (active < 0) active = guide.steps.findIndex((s) => s.status === "running");
  if (active < 0) {
    // No active step (between turns / done): point at the last finished one.
    for (let i = guide.steps.length - 1; i >= 0; i -= 1) {
      if (guide.steps[i]!.status !== "pending") {
        active = i;
        break;
      }
    }
  }
  return { steps, active: active < 0 ? 0 : active };
}

export function RunStatusSection({
  run,
  diff,
  skillsCount,
  paused,
  onPauseToggle,
  onAbort,
  isApproval,
  onApprove,
  onReject,
}: {
  run: RunState;
  diff: { insertions: number; deletions: number; files: number } | null;
  skillsCount: number;
  paused: boolean;
  onPauseToggle: () => void;
  onAbort: () => void;
  isApproval: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const [elapsed, setElapsed] = useState(() =>
    Math.max(
      0,
      Math.floor((Date.now() - new Date(run.startedAt).getTime()) / 1000),
    ),
  );
  useEffect(() => {
    if (paused || isApproval) return;
    const id = window.setInterval(
      () =>
        setElapsed(
          Math.max(
            0,
            Math.floor(
              (Date.now() - new Date(run.startedAt).getTime()) / 1000,
            ),
          ),
        ),
      1000,
    );
    return () => window.clearInterval(id);
  }, [paused, isApproval, run.startedAt]);

  const rail = railFor(run);
  const running = ![
    "merge_ready",
    "failed",
    "aborted",
    "waiting_for_approval",
  ].includes(run.status);
  const currentStep =
    run.guide?.steps.find((s) => s.id === run.guide?.currentStepId) ?? null;
  const nowLabel = currentStep?.label ?? rail.steps[rail.active] ?? null;
  const nowAgent =
    currentStep?.providerId ??
    run.resolvedProviderId ??
    run.providerOverride ??
    null;
  return (
    <section className="bevel-violet p-[1px] fade-up" data-screen-label="01 Status">
      <div className="rounded-[13px] surface-ink-100-70 backdrop-blur-2xl">
        {/* Eyebrow + controls */}
        <div className="px-5 pt-4 pb-3 flex items-baseline justify-between gap-4 flex-wrap">
          <span className="eyebrow">
            {run.guide ? `${run.guide.label} · ${run.status}` : `Status · ${run.status}`}
          </span>
          <div className="flex items-center gap-2">
            {isApproval ? (
              <>
                <button
                  type="button"
                  onClick={onApprove}
                  className="h-8 px-3 rounded-lg bg-gradient-to-b from-violet-mid to-violet-deep text-white text-[12.5px] flex items-center gap-1.5 ring-1 ring-violet-soft/35"
                >
                  <Check className="h-3 w-3" strokeWidth={1.7} /> Approve
                </button>
                <button
                  type="button"
                  onClick={onReject}
                  className="h-8 px-3 rounded-lg border border-rose-400/30 bg-rose-500/10 text-rose-300 text-[12.5px] flex items-center gap-1.5"
                >
                  <X className="h-3 w-3" strokeWidth={1.7} /> Reject
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onPauseToggle}
                  className="h-8 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-fog-100 text-[12.5px] border border-white/10 flex items-center gap-1.5"
                >
                  {paused ? (
                    <Play className="h-3 w-3" strokeWidth={1.7} />
                  ) : (
                    <Pause className="h-3 w-3" strokeWidth={1.7} />
                  )}
                  {paused ? "Resume" : "Pause"}
                </button>
                <button
                  type="button"
                  onClick={onAbort}
                  className="h-8 px-3 rounded-lg border border-rose-400/25 bg-rose-500/[0.06] text-rose-300/90 hover:text-rose-300 text-[12.5px] flex items-center gap-1.5"
                >
                  <StopCircle className="h-3 w-3" strokeWidth={1.7} /> Abort
                </button>
              </>
            )}
          </div>
        </div>

        <div className="px-5 pb-3">
          <h1 className="text-[22px] font-medium tracking-tight text-fog-100 leading-snug">
            {run.task}
          </h1>
          {running && nowLabel ? (
            <div className="mt-2 flex items-center gap-2 text-[12.5px]">
              <span className="pulse-dot" />
              <span className="text-fog-400">Now</span>
              <span className="text-fog-100 font-medium">{nowLabel}</span>
              {nowAgent ? (
                <span className="mono text-[11.5px] text-violet-soft">{nowAgent}</span>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="px-5 pb-3">
          <PhaseRail steps={rail.steps} active={rail.active} />
        </div>

        <div className="px-5 py-3 border-t border-white/[0.06] flex items-center flex-wrap gap-x-4 gap-y-2 text-[12px] text-fog-300">
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <Cpu className="h-3 w-3 text-violet-soft" strokeWidth={1.7} />
            <span className="text-fog-100">
              {run.resolvedProviderId ??
                run.providerOverride ??
                "auto"}
            </span>
          </span>
          <span className="text-fog-500">·</span>
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <Clock className="h-3 w-3 text-fog-400" strokeWidth={1.7} />
            <span className="mono num-tabular">{fmtElapsed(elapsed)}</span>{" "}
            elapsed
          </span>
          {diff ? (
            <>
              <span className="text-fog-500">·</span>
              <span className="flex items-center gap-1.5 mono whitespace-nowrap">
                <span className="text-emerald-300/90">+{diff.insertions}</span>
                <span className="text-rose-300/90">−{diff.deletions}</span>
                <span className="text-fog-400">{diff.files} files</span>
              </span>
            </>
          ) : null}
          <span className="text-fog-500">·</span>
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <Bolt className="h-3 w-3 text-amber-300" strokeWidth={1.7} />
            <span>
              {skillsCount} skill{skillsCount === 1 ? "" : "s"}
            </span>
          </span>
          {run.reviewLoopCount > 0 ? (
            <>
              <span className="text-fog-500">·</span>
              <span className="whitespace-nowrap">
                review loop {run.reviewLoopCount}/{run.maxReviewLoops}
              </span>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
