import type { MicroStep } from "../../lib/types.js";

const STAGE_LABEL: Record<MicroStep["stage"], string> = {
  planning: "plan",
  architecting: "architect",
  executing: "execute",
  validating: "validate",
  reviewing: "review",
  fixing: "fix",
  verifying: "verify",
};

const STATUS_COLOR: Record<MicroStep["status"], string> = {
  pending: "bg-amaco-fg-muted/40 text-amaco-fg-muted",
  running: "bg-amaco-accent text-amaco-accent",
  passed: "bg-amaco-success text-amaco-success",
  failed: "bg-amaco-fail text-amaco-fail",
  blocked: "bg-amaco-warn text-amaco-warn",
  skipped: "bg-amaco-fg-muted/40 text-amaco-fg-muted",
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
    <div className="rounded border border-amaco-border bg-amaco-panel p-3">
      <div className="flex items-center justify-between">
        <div className="text-[10.5px] uppercase tracking-[0.14em] text-amaco-fg-muted">
          micro-steps
        </div>
        <span className="amaco-mono text-[10.5px] text-amaco-fg-muted">
          run {runId}
        </span>
      </div>
      <ol className="mt-2 grid grid-cols-7 gap-2">
        {steps.map((step) => {
          const palette = STATUS_COLOR[step.status];
          const dotBg = palette.split(" ")[0]!;
          const text = palette.split(" ")[1]!;
          const isSelected = selectedStepId === step.id;
          return (
            <li key={step.id}>
              <button
                onClick={() => onSelectStep?.(step)}
                className={`flex w-full flex-col items-start gap-1 rounded px-2 py-1.5 text-left hover:bg-amaco-panel-2 ${
                  isSelected ? "bg-amaco-panel-2" : ""
                }`}
              >
                <span className="flex w-full items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${dotBg}`} />
                  <span className={`text-[12px] ${text}`}>
                    {STAGE_LABEL[step.stage]}
                  </span>
                </span>
                <span className="amaco-mono text-[10px] text-amaco-fg-muted">
                  {step.status}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
