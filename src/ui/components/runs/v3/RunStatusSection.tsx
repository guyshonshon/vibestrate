import { useEffect, useState } from "react";
import { Bolt, Clock, Cpu, Pause, Play, StopCircle } from "lucide-react";
import { PhaseRail } from "../../design/PhaseRail.js";
import { fmtElapsed } from "../../design/format.js";
import { isTerminalStatus } from "../../../lib/run-outcome.js";
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
 * Every run is a flow run, so the rail follows the flow's actual ordered steps
 * (the fixed phase rail would contradict the crew strip - e.g. a "challenger"
 * step while the rail says "Review"). The phase fallback only applies to a run
 * whose flow state hasn't been written yet.
 */
function railFor(run: RunState): { steps: string[]; active: number } {
  const flow = run.flow;
  if (!flow || flow.steps.length === 0) {
    return { steps: PHASES.map((p) => p.label), active: phaseIndex(run.status) };
  }
  const steps = flow.steps.map((s) => s.label);
  let active = flow.steps.findIndex((s) => s.id === flow.currentStepId);
  if (active < 0) active = flow.steps.findIndex((s) => s.status === "running");
  if (active < 0) {
    // No active step (between turns / done): point at the last finished one.
    for (let i = flow.steps.length - 1; i >= 0; i -= 1) {
      if (flow.steps[i]!.status !== "pending") {
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
}: {
  run: RunState;
  diff: { insertions: number; deletions: number; files: number } | null;
  skillsCount: number;
  paused: boolean;
  onPauseToggle: () => void;
  onAbort: () => void;
}) {
  const [elapsed, setElapsed] = useState(() =>
    Math.max(
      0,
      Math.floor((Date.now() - new Date(run.startedAt).getTime()) / 1000),
    ),
  );
  const terminal = isTerminalStatus(run.status);
  const waitingForApproval = run.status === "waiting_for_approval";
  useEffect(() => {
    if (paused || waitingForApproval || terminal) return;
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
  }, [paused, waitingForApproval, terminal, run.startedAt]);

  const rail = railFor(run);
  const running = !terminal && run.status !== "waiting_for_approval";
  const currentStep =
    run.flow?.steps.find((s) => s.id === run.flow?.currentStepId) ?? null;
  const nowLabel = currentStep?.label ?? rail.steps[rail.active] ?? null;
  const nowRole = currentStep?.providerId ?? run.profileOverride ?? run.crewId ?? null;
  return (
    <section
      className="rounded-[20px] border border-[color:var(--line)] bg-coal-600"
      data-screen-label="01 Status"
    >
      {/* The BRIEF (what you asked for). The flow is named at the rail below;
       * status lives in the header breadcrumb - nothing here repeats either,
       * so no redundant section label sits above the task. */}
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 pt-4 pb-3">
        <h1 className="min-w-0 flex-1 text-[18px] font-semibold leading-snug tracking-tight text-chalk-100">
          {run.task}
        </h1>
        {terminal ? null : (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onPauseToggle}
              className="flex h-8 items-center gap-1.5 rounded-[10px] bg-coal-500 px-3 text-[12.5px] font-semibold text-chalk-100 transition hover:bg-coal-400"
            >
              {paused ? (
                <Play className="h-3.5 w-3.5" strokeWidth={1.9} />
              ) : (
                <Pause className="h-3.5 w-3.5" strokeWidth={1.9} />
              )}
              {paused ? "Resume" : "Pause"}
            </button>
            <button
              type="button"
              onClick={onAbort}
              className="flex h-8 items-center gap-1.5 rounded-[10px] border border-rose-400/30 bg-rose-500/10 px-3 text-[12.5px] font-semibold text-rose-300 transition hover:bg-rose-500/20"
            >
              <StopCircle className="h-3.5 w-3.5" strokeWidth={1.9} /> Abort
            </button>
          </div>
        )}
      </div>

      {running && nowLabel ? (
        <div className="flex items-center gap-2 px-5 pb-3 text-[12.5px]">
          <span className="h-1.5 w-1.5 rounded-full bg-violet-soft" />
          <span className="text-chalk-400">Now</span>
          <span className="font-medium text-chalk-100">{nowLabel}</span>
          {nowRole ? <span className="mono text-[11.5px] text-violet-soft">{nowRole}</span> : null}
        </div>
      ) : null}

      <div className="px-5 pb-3">
        <div className="mb-1.5 flex items-baseline gap-2">
          <span className="mono text-[11px] text-chalk-400">Flow</span>
          <span className="text-[11.5px] text-chalk-300">
            {run.flow ? run.flow.label : "stage pipeline"}
          </span>
        </div>
        <PhaseRail steps={rail.steps} active={rail.active} />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[color:var(--line-soft)] px-5 py-3 text-[12px] text-chalk-300">
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <Cpu className="h-3.5 w-3.5 text-violet-soft" strokeWidth={1.9} />
          <span className="text-chalk-100">
            {run.profileOverride ?? run.crewId ?? "auto"}
          </span>
        </span>
        <span className="text-chalk-400">·</span>
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <Clock className="h-3.5 w-3.5 text-chalk-400" strokeWidth={1.9} />
          {/* A finished run reports its actual duration; only a live run
           * counts wall-clock time since start. */}
          <span className="mono num-tabular">
            {fmtElapsed(
              terminal
                ? Math.floor(
                    (new Date(run.updatedAt).getTime() -
                      new Date(run.startedAt).getTime()) /
                      1000,
                  )
                : elapsed,
            )}
          </span>{" "}
          elapsed
        </span>
        {diff ? (
          <>
            <span className="text-chalk-400">·</span>
            <span className="mono flex items-center gap-1.5 whitespace-nowrap">
              <span className="text-emerald-400">+{diff.insertions}</span>
              <span className="text-rose-300">−{diff.deletions}</span>
              <span className="text-chalk-400">{diff.files} files</span>
            </span>
          </>
        ) : null}
        {skillsCount > 0 ? (
          <>
            <span className="text-chalk-400">·</span>
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <Bolt className="h-3.5 w-3.5 text-amber-soft" strokeWidth={1.9} />
              <span>
                {skillsCount} skill{skillsCount === 1 ? "" : "s"}
              </span>
            </span>
          </>
        ) : null}
        {run.reviewLoopCount > 0 ? (
          <>
            <span className="text-chalk-400">·</span>
            <span className="whitespace-nowrap">
              review loop {run.reviewLoopCount}/{run.maxReviewLoops}
            </span>
          </>
        ) : null}
      </div>
    </section>
  );
}
