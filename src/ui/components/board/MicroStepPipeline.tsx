import type { MicroStep } from "../../lib/types.js";
import { cn } from "../design/cn.js";

const STAGE_LABEL: Record<MicroStep["stage"], string> = {
  planning: "plan",
  architecting: "architect",
  executing: "execute",
  validating: "validate",
  reviewing: "review",
  fixing: "fix",
  verifying: "verify",
};

// dot fill + label text, on the Mission Control palette.
const STATUS_COLOR: Record<MicroStep["status"], string> = {
  pending: "bg-chalk-400/40 text-chalk-400",
  running: "bg-violet-soft text-violet-soft",
  passed: "bg-emerald-400 text-emerald-400",
  failed: "bg-rose-400 text-rose-300",
  blocked: "bg-amber-soft text-amber-soft",
  skipped: "bg-chalk-400/40 text-chalk-400",
};

export function MicroStepPipeline({
  runId,
  steps,
  onSelectStep,
  selectedStepId,
}: {
  runId: string;
  steps: MicroStep[];
  onSelectStep?: (s: MicroStep) => void;
  selectedStepId?: string | null;
}) {
  return (
    <section>
      <h2 className="mb-3 flex items-baseline gap-2 text-[18px] font-bold text-violet-vivid">
        Micro-steps
        <span className="font-mono text-[12px] font-medium text-chalk-400">run {runId}</span>
      </h2>
      <div className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4">
        <ol className="grid grid-cols-7 gap-2">
          {steps.map((step) => {
            const palette = STATUS_COLOR[step.status];
            const dotBg = palette.split(" ")[0]!;
            const text = palette.split(" ")[1]!;
            const isSelected = selectedStepId === step.id;
            return (
              <li key={step.id}>
                <button
                  onClick={() => onSelectStep?.(step)}
                  className={cn(
                    "flex w-full flex-col items-start gap-1 rounded-[10px] px-2 py-1.5 text-left transition hover:bg-coal-500",
                    isSelected ? "bg-coal-500" : "",
                  )}
                >
                  <span className="flex w-full items-center gap-1.5">
                    <span className={cn("h-1.5 w-1.5 rounded-full", dotBg)} />
                    <span className={cn("text-[12px] font-medium", text)}>
                      {STAGE_LABEL[step.stage]}
                    </span>
                  </span>
                  <span className="font-mono text-[10px] text-chalk-400">{step.status}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
