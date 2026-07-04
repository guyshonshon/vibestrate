import { useEffect, useState } from "react";
import { Pause, Play, StopCircle } from "lucide-react";
import { PhaseRail } from "../../design/PhaseRail.js";
import { HeroCard, type HeroMetric, type HeroTone } from "../../design/HeroCard.js";
import { fmtElapsed } from "../../design/format.js";
import { isSpecUpRun, isTerminalStatus } from "../../../lib/run-outcome.js";
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

// Run status → the hero's tonal anchor: a live/in-flight run reads sky,
// merge_ready is the success emerald, blocked/failed/aborted are rose,
// waiting_for_approval is amber, and paused / not-yet-started sit neutral.
function statusTone(status: RunStatus): HeroTone {
  switch (status) {
    case "merge_ready":
      return "emerald";
    case "blocked":
    case "failed":
    case "aborted":
      return "rose";
    case "waiting_for_approval":
      return "amber";
    case "paused":
    case "created":
      return "default";
    default:
      // planning / planned / architecting / … / verifying - the run is live.
      return "sky";
  }
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

  const specUp = isSpecUpRun(run);
  const tone = statusTone(run.status);
  // A short live cue under the status word: ticking while live, "your input"
  // for a spec-up intake, "on hold" while paused.
  const statusSub = paused
    ? "on hold"
    : specUp
      ? "your input"
      : running
        ? "live now"
        : null;

  const elapsedSecs = terminal
    ? Math.floor(
        (new Date(run.updatedAt).getTime() - new Date(run.startedAt).getTime()) /
          1000,
      )
    : elapsed;

  const metrics: HeroMetric[] = [
    {
      value: run.profileOverride ?? run.crewId ?? "auto",
      label: "provider",
    },
    { value: fmtElapsed(elapsedSecs), label: "elapsed" },
    ...(diff
      ? [
          {
            value: (
              <span className="mono">
                <span className="text-emerald-400">+{diff.insertions}</span>{" "}
                <span className="text-rose-300">-{diff.deletions}</span>
              </span>
            ),
            label: `diff · ${diff.files} files`,
          } satisfies HeroMetric,
        ]
      : []),
    ...(skillsCount > 0
      ? [{ value: skillsCount, label: "skills" } satisfies HeroMetric]
      : []),
    ...(run.reviewLoopCount > 0
      ? [
          {
            value: `${run.reviewLoopCount}/${run.maxReviewLoops}`,
            label: "review loop",
          } satisfies HeroMetric,
        ]
      : []),
  ];

  return (
    <div data-screen-label="01 Status">
      <HeroCard
        size="lg"
        tone={tone}
        overline={specUp ? "Spec-up" : "Run"}
        status={run.status.replace(/_/g, " ")}
        statusSub={statusSub}
        title={run.task}
        actions={
          terminal ? null : (
            <>
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
            </>
          )
        }
        metrics={metrics}
      >
        {/* The flow map + the "Now" cue - the run's live where-are-we section. */}
        <div className="border-b border-[color:var(--line-soft)] px-5 py-3">
          <div className="mb-1.5 flex items-baseline gap-2">
            <span className="mono text-[11px] text-violet-soft">Flow</span>
            <span className="text-[11.5px] text-chalk-300">
              {run.flow ? run.flow.label : "stage pipeline"}
            </span>
          </div>
          <PhaseRail steps={rail.steps} active={rail.active} />
          {running && nowLabel ? (
            <div className="mt-2.5 flex items-center gap-2 text-[12.5px]">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-soft" />
              <span className="text-chalk-300">Now</span>
              <span className="font-medium text-chalk-100">{nowLabel}</span>
              {nowRole ? (
                <span className="mono text-[11.5px] text-violet-soft">{nowRole}</span>
              ) : null}
            </div>
          ) : null}
        </div>
      </HeroCard>
    </div>
  );
}
