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
  pending: "bg-vibestrate-fg-muted/40 text-vibestrate-fg-muted",
  running: "bg-vibestrate-accent text-vibestrate-accent",
  passed: "bg-vibestrate-success text-vibestrate-success",
  failed: "bg-vibestrate-fail text-vibestrate-fail",
  blocked: "bg-vibestrate-warn text-vibestrate-warn",
  skipped: "bg-vibestrate-fg-muted/40 text-vibestrate-fg-muted",
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
    <div className="rounded border border-vibestrate-border bg-vibestrate-panel p-3">
      <div className="flex items-center justify-between">
        <div className="text-[10.5px] uppercase tracking-[0.14em] text-vibestrate-fg-muted">
          micro-steps
        </div>
        <span className="vibestrate-mono text-[10.5px] text-vibestrate-fg-muted">
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
                className={`flex w-full flex-col items-start gap-1 rounded px-2 py-1.5 text-left hover:bg-vibestrate-panel-2 ${
                  isSelected ? "bg-vibestrate-panel-2" : ""
                }`}
              >
                <span className="flex w-full items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${dotBg}`} />
                  <span className={`text-[12px] ${text}`}>
                    {STAGE_LABEL[step.stage]}
                  </span>
                </span>
                <span className="vibestrate-mono text-[10px] text-vibestrate-fg-muted">
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
