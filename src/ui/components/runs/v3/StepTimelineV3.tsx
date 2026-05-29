import { Chip } from "../../design/Chip.js";
import { cn } from "../../design/cn.js";
import type {
  FlowRunState,
  FlowRunStepStatus,
} from "../../../lib/types.js";

function statusTone(s: FlowRunStepStatus) {
  if (s === "passed") return "emerald" as const;
  if (s === "running") return "violet" as const;
  if (s === "failed" || s === "blocked") return "rose" as const;
  if (s === "skipped") return "neutral" as const;
  return "neutral" as const;
}

export function StepTimelineV3({
  flow,
}: {
  flow: FlowRunState | null | undefined;
}) {
  if (!flow || flow.steps.length === 0) return null;
  return (
    <section>
      <div className="flex items-baseline justify-between mb-2.5">
        <span className="eyebrow">
          4 · Step timeline · {flow.steps.length} steps
        </span>
        <span className="text-[11.5px] text-fog-400 mono whitespace-nowrap">
          {flow.label}
        </span>
      </div>
      <div className="glass p-4">
        <ol className="relative pl-5">
          <span className="absolute left-[7px] top-1.5 bottom-1.5 w-px bg-white/[0.08]" />
          {flow.steps.map((step) => {
            const tone = statusTone(step.status);
            return (
              <li key={step.id} className="relative pb-3.5 last:pb-0">
                <span
                  className={cn(
                    "absolute -left-[20px] top-[5px] w-3.5 h-3.5 rounded-full ring-2",
                    step.status === "passed" &&
                      "bg-emerald-400 ring-emerald-400/30",
                    step.status === "running" &&
                      "bg-violet-soft ring-violet-soft/30",
                    (step.status === "failed" || step.status === "blocked") &&
                      "bg-rose-400 ring-rose-400/30",
                    (step.status === "pending" || step.status === "skipped") &&
                      "bg-white/10 ring-white/[0.1]",
                  )}
                >
                  {step.status === "running" && (
                    <span className="absolute inset-0 rounded-full animate-ping bg-violet-soft/40" />
                  )}
                </span>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] text-fog-100 font-medium">
                        {step.label}
                      </span>
                      <Chip tone={tone}>
                        {step.status === "running" ? (
                          <span className="pulse-dot" />
                        ) : null}
                        {step.status}
                      </Chip>
                      {step.resolvedRoleId ? (
                        <span className="text-[11.5px] text-fog-400 whitespace-nowrap">
                          by{" "}
                          <span className="text-fog-200">{step.resolvedRoleId}</span>
                        </span>
                      ) : null}
                    </div>
                    {step.error ? (
                      <div className="text-[12px] text-rose-300/80 mt-0.5 truncate">
                        {step.error}
                      </div>
                    ) : null}
                  </div>
                  <StepDuration step={step} />
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function StepDuration({
  step,
}: {
  step: FlowRunState["steps"][number];
}) {
  if (!step.startedAt) return <span className="mono text-[11.5px] text-fog-500">—</span>;
  const end = step.endedAt ? new Date(step.endedAt).getTime() : Date.now();
  const ms = Math.max(0, end - new Date(step.startedAt).getTime());
  const s = Math.round(ms / 1000);
  return (
    <span className="text-[11.5px] mono text-fog-400 num-tabular whitespace-nowrap">
      {s}s
    </span>
  );
}
