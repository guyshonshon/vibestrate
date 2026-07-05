// A compact top-down render of a Flow's dependency graph (DAG). Steps
// are placed in topological layers (longest-path); steps that share a layer ran
// (or can run) concurrently and are drawn side by side - so a review panel's
// fan-out and its arbiter join are legible at a glance. Reused for both the
// static flow definition (no status) and a live run (per-step status tint).
//
// The layering itself (`layersOf` / `isGraphSteps`) lives in a dependency-free
// module so the CLI and Ink TUI share the exact same layout. Re-exported here
// so existing dashboard imports (and the unit test) keep their path.
import {
  isGraphSteps,
  layersOf,
  zonedLayersOf,
} from "../../../flows/runtime/flow-graph-layout.js";

export { isGraphSteps, layersOf, zonedLayersOf };

export type FlowGraphStepStatus =
  | "pending"
  | "running"
  | "passed"
  | "blocked"
  | "failed"
  | "skipped";

export type FlowGraphStep = {
  id: string;
  label: string;
  kind: string;
  seat?: string | null;
  needs?: string[];
  instructions?: string | null;
  status?: FlowGraphStepStatus | null;
};

const STATUS_DOT: Record<FlowGraphStepStatus, string> = {
  passed: "bg-emerald-400",
  running: "bg-violet-soft",
  blocked: "bg-amber-soft",
  failed: "bg-rose-400",
  skipped: "bg-chalk-400",
  pending: "bg-chalk-400/50",
};

function LayerStack({ layers }: { layers: FlowGraphStep[][] }) {
  return (
    <div className="flex flex-col items-stretch gap-1">
      {layers.map((layerSteps, li) => (
        <div key={li}>
          {li > 0 ? (
            <div className="flex justify-center py-0.5">
              <span className="h-3 w-px bg-[color:var(--line-strong)]" />
            </div>
          ) : null}
          <div
            className={
              layerSteps.length > 1
                ? "flex flex-wrap items-stretch gap-2 rounded-[12px] border border-dashed border-[color:var(--line)] p-1.5"
                : "flex flex-wrap items-stretch gap-2"
            }
          >
            {layerSteps.length > 1 ? (
              <span className="self-center px-1 text-[10px] font-medium text-chalk-400">
                parallel x{layerSteps.length}
              </span>
            ) : null}
            {layerSteps.map((s) => (
              <Node key={s.id} step={s} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function FlowGraph({
  steps,
  title = "Graph",
  checklistSegment = null,
}: {
  steps: FlowGraphStep[];
  title?: string;
  // Phase D: when set, the flow is zoned into prelude / per-item band / postlude
  // so the graph shows the band boundary AND that it repeats per checklist item
  // (a flat layout would hide both). Omit it for whole-flow graphs (unchanged).
  checklistSegment?: { from: string; to: string } | null;
}) {
  return (
    <div className="rounded-[18px] border border-[color:var(--line)] bg-coal-600 p-4">
      <div className="mb-3 text-[12.5px] font-semibold text-chalk-300">{title}</div>
      {checklistSegment ? (
        <div className="flex flex-col items-stretch gap-1">
          {zonedLayersOf(steps, checklistSegment).map((zone, zi) => (
            <div key={zi}>
              {zi > 0 ? (
                <div className="flex justify-center py-0.5">
                  <span className="h-3 w-px bg-[color:var(--line-strong)]" />
                </div>
              ) : null}
              {zone.repeats ? (
                <div className="rounded-[12px] border border-violet-soft/30 bg-violet-soft/[0.06] p-1.5">
                  <div className="mb-1 px-1 text-[10px] font-medium text-violet-soft">
                    Per checklist item - repeats
                  </div>
                  <LayerStack layers={zone.layers} />
                </div>
              ) : (
                <LayerStack layers={zone.layers} />
              )}
            </div>
          ))}
        </div>
      ) : (
        <LayerStack layers={layersOf(steps)} />
      )}
    </div>
  );
}

function Node({ step }: { step: FlowGraphStep }) {
  const status = step.status ?? null;
  const dot = status ? STATUS_DOT[status] : "bg-chalk-400/50";
  return (
    <div className="min-w-[132px] flex-1 rounded-[14px] border border-[color:var(--line)] bg-coal-500/60 px-2.5 py-1.5">
      <div className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
        <span className="truncate text-[12px] text-chalk-100">{step.label}</span>
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-chalk-400">
        <span className="font-mono">{step.kind}</span>
        {step.seat ? (
          <>
            <span>·</span>
            <span className="font-mono">{step.seat}</span>
          </>
        ) : null}
        {status ? (
          <>
            <span>·</span>
            <span>{status}</span>
          </>
        ) : null}
      </div>
      {step.instructions ? (
        <div
          className="mt-0.5 truncate text-[10.5px] text-chalk-300"
          title={step.instructions}
        >
          {step.instructions}
        </div>
      ) : null}
    </div>
  );
}
