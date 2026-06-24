// A compact top-down render of a Flow's dependency graph (Slice 4 DAG). Steps
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
  running: "bg-violet-400",
  blocked: "bg-amber-300",
  failed: "bg-rose-400",
  skipped: "bg-fog-600",
  pending: "bg-fog-600/50",
};

function LayerStack({ layers }: { layers: FlowGraphStep[][] }) {
  return (
    <div className="flex flex-col items-stretch gap-1">
      {layers.map((layerSteps, li) => (
        <div key={li}>
          {li > 0 ? (
            <div className="flex justify-center py-0.5">
              <span className="h-3 w-px bg-white/10" />
            </div>
          ) : null}
          <div
            className={
              layerSteps.length > 1
                ? "flex flex-wrap items-stretch gap-2 rounded-md border border-dashed border-white/10 p-1.5"
                : "flex flex-wrap items-stretch gap-2"
            }
          >
            {layerSteps.length > 1 ? (
              <span className="self-center px-1 text-[10px] uppercase tracking-wide text-fog-500">
                parallel ×{layerSteps.length}
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
    <div className="rounded-lg border border-white/[0.06] bg-ink-200/30 p-3">
      <div className="eyebrow mb-2">{title}</div>
      {checklistSegment ? (
        <div className="flex flex-col items-stretch gap-1">
          {zonedLayersOf(steps, checklistSegment).map((zone, zi) => (
            <div key={zi}>
              {zi > 0 ? (
                <div className="flex justify-center py-0.5">
                  <span className="h-3 w-px bg-white/10" />
                </div>
              ) : null}
              {zone.repeats ? (
                <div className="rounded-md border border-violet-400/30 bg-violet-400/[0.04] p-1.5">
                  <div className="mb-1 px-1 text-[10px] uppercase tracking-wide text-violet-300/80">
                    Per checklist item · repeats
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
  const dot = status ? STATUS_DOT[status] : "bg-fog-600/50";
  return (
    <div className="min-w-[132px] flex-1 rounded-md border border-white/[0.06] bg-ink-200/50 px-2.5 py-1.5">
      <div className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
        <span className="truncate text-[12px] text-fog-100">{step.label}</span>
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-fog-500">
        <span className="mono">{step.kind}</span>
        {step.seat ? (
          <>
            <span>·</span>
            <span className="mono">{step.seat}</span>
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
          className="mt-0.5 truncate text-[10.5px] text-fog-400"
          title={step.instructions}
        >
          {step.instructions}
        </div>
      ) : null}
    </div>
  );
}
